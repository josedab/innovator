/**
 * @module orchestration/dag-engine
 *
 * DAG-based execution engine for multi-stage innovation pipelines.
 * Supports conditional branches, loops, human-in-the-loop gates,
 * parallel execution of independent stages, and topological ordering.
 */

import { z } from "zod";

// ---- DAG Node Types ----

export const DAGConditionSchema = z.object({
  field: z.string().max(200),
  operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists"]),
  value: z.unknown(),
});

export type DAGCondition = z.infer<typeof DAGConditionSchema>;

export const DAGNodeSchema = z.object({
  id: z.string().max(100),
  type: z.enum([
    "investigate",
    "generate",
    "score",
    "filter",
    "synthesize",
    "artifact",
    "redteam",
    "debate",
    "export",
    "gate",
    "condition",
    "loop",
    "human-review",
    "custom",
  ]),
  name: z.string().max(200),
  description: z.string().max(1000).optional(),
  dependsOn: z.array(z.string().max(100)).max(20).default([]),
  config: z.record(z.string().max(100), z.unknown()).optional(),
  // Conditional branching
  condition: DAGConditionSchema.optional(),
  branches: z
    .object({
      trueBranch: z.array(z.string().max(100)).max(10).optional(),
      falseBranch: z.array(z.string().max(100)).max(10).optional(),
    })
    .optional(),
  // Loop configuration
  loop: z
    .object({
      maxIterations: z.number().int().min(1).max(10).default(3),
      exitCondition: DAGConditionSchema.optional(),
      loopBody: z.array(z.string().max(100)).max(10),
    })
    .optional(),
  // Human-in-the-loop gate
  gate: z
    .object({
      prompt: z.string().max(1000),
      timeout: z.number().int().min(0).max(86400).default(3600),
      autoApprove: z.boolean().default(false),
      requiredApprovers: z.number().int().min(1).max(10).default(1),
    })
    .optional(),
  // Execution config
  timeout: z.number().int().min(0).max(3600).default(300),
  retries: z.number().int().min(0).max(3).default(0),
  continueOnError: z.boolean().default(false),
});

export type DAGNode = z.infer<typeof DAGNodeSchema>;

export const DAGWorkflowSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(2000).optional(),
  version: z.string().max(50).default("1.0.0"),
  nodes: z.array(DAGNodeSchema).min(1).max(100),
  variables: z.record(z.string().max(100), z.unknown()).optional(),
  metadata: z
    .object({
      author: z.string().max(200).optional(),
      tags: z.array(z.string().max(50)).max(20).optional(),
      category: z.string().max(100).optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    })
    .optional(),
});

export type DAGWorkflow = z.infer<typeof DAGWorkflowSchema>;

// ---- Execution State ----

export type DAGNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting-approval"
  | "cancelled";

export interface DAGNodeResult {
  nodeId: string;
  status: DAGNodeStatus;
  startedAt?: string;
  completedAt?: string;
  output?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  duration?: number;
}

export interface DAGExecutionState {
  workflowId: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "paused" | "cancelled";
  startedAt: string;
  completedAt?: string;
  nodeResults: Map<string, DAGNodeResult>;
  context: Record<string, unknown>;
  currentNodes: string[];
  pendingApprovals: string[];
}

export type DAGProgressCallback = (state: DAGExecutionState, nodeResult: DAGNodeResult) => void;

export type DAGGateHandler = (
  nodeId: string,
  prompt: string,
  context: Record<string, unknown>
) => Promise<{ approved: boolean; feedback?: string }>;

export type DAGNodeExecutor = (
  node: DAGNode,
  context: Record<string, unknown>,
  signal?: AbortSignal
) => Promise<Record<string, unknown>>;

// ---- Topological Sort ----

function topologicalSort(nodes: DAGNode[]): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular dependency detected involving node '${id}'`);
    }
    visiting.add(id);
    const node = nodeMap.get(id);
    if (node) {
      for (const dep of node.dependsOn) {
        if (!nodeMap.has(dep)) {
          throw new Error(`Node '${id}' depends on unknown node '${dep}'`);
        }
        visit(dep);
      }
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(id);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return sorted;
}

/** Get nodes that can execute in parallel (all deps completed). */
function getReadyNodes(nodes: DAGNode[], results: Map<string, DAGNodeResult>): DAGNode[] {
  return nodes.filter((node) => {
    const result = results.get(node.id);
    if (result && result.status !== "pending") return false;
    return node.dependsOn.every((dep) => {
      const depResult = results.get(dep);
      return depResult?.status === "completed";
    });
  });
}

// ---- Condition Evaluation ----

function evaluateCondition(condition: DAGCondition, context: Record<string, unknown>): boolean {
  const value = getNestedValue(context, condition.field);

  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "gt":
      return typeof value === "number" && value > (condition.value as number);
    case "lt":
      return typeof value === "number" && value < (condition.value as number);
    case "gte":
      return typeof value === "number" && value >= (condition.value as number);
    case "lte":
      return typeof value === "number" && value <= (condition.value as number);
    case "contains":
      return (
        typeof value === "string" &&
        typeof condition.value === "string" &&
        value.includes(condition.value)
      );
    case "exists":
      return value !== undefined && value !== null;
    default:
      return false;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ---- DAG Execution Engine ----

/**
 * Execute a DAG workflow with parallel stage execution,
 * conditional branching, loops, and human-in-the-loop gates.
 */
export async function executeDAG(
  workflow: DAGWorkflow,
  options?: {
    context?: Record<string, unknown>;
    signal?: AbortSignal;
    onProgress?: DAGProgressCallback;
    onGate?: DAGGateHandler;
    executor?: DAGNodeExecutor;
    maxConcurrency?: number;
  }
): Promise<DAGExecutionState> {
  const validated = DAGWorkflowSchema.parse(workflow);
  const maxConcurrency = options?.maxConcurrency ?? 3;

  // Validate DAG structure
  topologicalSort(validated.nodes);

  const state: DAGExecutionState = {
    workflowId: validated.id,
    workflowName: validated.name,
    status: "running",
    startedAt: new Date().toISOString(),
    nodeResults: new Map(),
    context: { ...(validated.variables ?? {}), ...(options?.context ?? {}) },
    currentNodes: [],
    pendingApprovals: [],
  };

  // Initialize all nodes as pending
  for (const node of validated.nodes) {
    state.nodeResults.set(node.id, {
      nodeId: node.id,
      status: "pending",
      retryCount: 0,
    });
  }

  const nodeMap = new Map(validated.nodes.map((n) => [n.id, n]));
  const executor = options?.executor ?? defaultNodeExecutor;

  // Process nodes until all are complete or cancelled
  while (state.status === "running") {
    if (options?.signal?.aborted) {
      state.status = "cancelled";
      break;
    }

    const readyNodes = getReadyNodes(validated.nodes, state.nodeResults);
    if (readyNodes.length === 0) {
      // Check if any nodes are still running
      const hasRunning = Array.from(state.nodeResults.values()).some(
        (r) => r.status === "running" || r.status === "waiting-approval"
      );
      if (!hasRunning) {
        // All done
        const hasFailed = Array.from(state.nodeResults.values()).some((r) => r.status === "failed");
        state.status = hasFailed ? "failed" : "completed";
        break;
      }
      // Wait for running nodes
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    // Execute ready nodes with concurrency limit
    const batch = readyNodes.slice(0, maxConcurrency);
    state.currentNodes = batch.map((n) => n.id);

    await Promise.all(batch.map((node) => executeNode(node, state, nodeMap, executor, options)));
  }

  state.completedAt = new Date().toISOString();
  return state;
}

async function executeNode(
  node: DAGNode,
  state: DAGExecutionState,
  nodeMap: Map<string, DAGNode>,
  executor: DAGNodeExecutor,
  options?: {
    signal?: AbortSignal;
    onProgress?: DAGProgressCallback;
    onGate?: DAGGateHandler;
  }
): Promise<void> {
  const result = state.nodeResults.get(node.id)!;
  result.status = "running";
  result.startedAt = new Date().toISOString();
  options?.onProgress?.(state, result);

  try {
    // Handle conditional nodes
    if (node.type === "condition" && node.condition) {
      const conditionResult = evaluateCondition(node.condition, state.context);
      state.context[`${node.id}.result`] = conditionResult;

      const branchNodes = conditionResult
        ? (node.branches?.trueBranch ?? [])
        : (node.branches?.falseBranch ?? []);

      // Skip nodes not in the chosen branch
      const skipNodes = conditionResult
        ? (node.branches?.falseBranch ?? [])
        : (node.branches?.trueBranch ?? []);

      for (const skipId of skipNodes) {
        const skipResult = state.nodeResults.get(skipId);
        if (skipResult) {
          skipResult.status = "skipped";
          options?.onProgress?.(state, skipResult);
        }
      }

      // Mark branch nodes as ready by ensuring they can proceed
      for (const branchId of branchNodes) {
        const branchResult = state.nodeResults.get(branchId);
        if (branchResult && branchResult.status === "pending") {
          branchResult.status = "pending"; // Will be picked up by getReadyNodes
        }
      }

      result.status = "completed";
      result.output = { conditionResult, branch: conditionResult ? "true" : "false" };
      result.completedAt = new Date().toISOString();
      result.duration = Date.now() - new Date(result.startedAt!).getTime();
      options?.onProgress?.(state, result);
      return;
    }

    // Handle human-in-the-loop gate
    if (node.type === "human-review" && node.gate) {
      if (node.gate.autoApprove) {
        result.status = "completed";
        result.output = { approved: true, auto: true };
      } else if (options?.onGate) {
        result.status = "waiting-approval";
        state.pendingApprovals.push(node.id);
        options?.onProgress?.(state, result);

        const gateResult = await options.onGate(node.id, node.gate.prompt, state.context);

        state.pendingApprovals = state.pendingApprovals.filter((id) => id !== node.id);

        if (gateResult.approved) {
          result.status = "completed";
          result.output = { approved: true, feedback: gateResult.feedback };
        } else {
          result.status = "failed";
          result.error = gateResult.feedback ?? "Gate rejected";
        }
      } else {
        // No gate handler, auto-approve
        result.status = "completed";
        result.output = { approved: true, auto: true, reason: "no-handler" };
      }

      result.completedAt = new Date().toISOString();
      result.duration = Date.now() - new Date(result.startedAt!).getTime();
      options?.onProgress?.(state, result);
      return;
    }

    // Handle loop nodes
    if (node.type === "loop" && node.loop) {
      let iteration = 0;
      const maxIter = node.loop.maxIterations;

      while (iteration < maxIter) {
        if (options?.signal?.aborted) break;

        state.context[`${node.id}.iteration`] = iteration;

        // Execute loop body nodes in sequence
        for (const bodyNodeId of node.loop.loopBody) {
          const bodyNode = nodeMap.get(bodyNodeId);
          if (bodyNode) {
            const bodyResult: DAGNodeResult = {
              nodeId: bodyNodeId,
              status: "running",
              startedAt: new Date().toISOString(),
              retryCount: 0,
            };
            try {
              const output = await executor(bodyNode, state.context, options?.signal);
              Object.assign(state.context, output);
              bodyResult.status = "completed";
              bodyResult.output = output;
            } catch (error) {
              bodyResult.status = "failed";
              bodyResult.error = error instanceof Error ? error.message : String(error);
              if (!bodyNode.continueOnError) break;
            }
            bodyResult.completedAt = new Date().toISOString();
          }
        }

        // Check exit condition
        if (node.loop.exitCondition && evaluateCondition(node.loop.exitCondition, state.context)) {
          break;
        }

        iteration++;
      }

      result.status = "completed";
      result.output = { iterations: iteration + 1 };
      result.completedAt = new Date().toISOString();
      result.duration = Date.now() - new Date(result.startedAt!).getTime();
      options?.onProgress?.(state, result);
      return;
    }

    // Standard node execution with retry
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= node.retries; attempt++) {
      try {
        result.retryCount = attempt;
        const output = await executor(node, state.context, options?.signal);
        state.context[`${node.id}.output`] = output;
        Object.assign(state.context, output);
        result.status = "completed";
        result.output = output;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < node.retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (lastError) {
      if (node.continueOnError) {
        result.status = "completed";
        result.output = { error: lastError.message, continued: true };
      } else {
        result.status = "failed";
        result.error = lastError.message;
      }
    }
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
  }

  result.completedAt = new Date().toISOString();
  result.duration = result.startedAt ? Date.now() - new Date(result.startedAt).getTime() : 0;
  options?.onProgress?.(state, result);
}

async function defaultNodeExecutor(
  node: DAGNode,
  _context: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new Error("Aborted");
  // Default executor returns empty output; callers provide real executors
  return { stage: node.type, nodeId: node.id, executedAt: new Date().toISOString() };
}

// ---- Validation ----

/** Validate a DAG workflow for structural correctness. */
export function validateDAG(workflow: DAGWorkflow): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    DAGWorkflowSchema.parse(workflow);
  } catch (e) {
    if (e instanceof z.ZodError) {
      errors.push(...e.errors.map((err) => `${err.path.join(".")}: ${err.message}`));
    }
    return { valid: false, errors, warnings };
  }

  // Validate references
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));

  for (const node of workflow.nodes) {
    for (const dep of node.dependsOn) {
      if (!nodeIds.has(dep)) {
        errors.push(`Node '${node.id}' depends on unknown node '${dep}'`);
      }
    }

    if (node.branches) {
      for (const branchId of [
        ...(node.branches.trueBranch ?? []),
        ...(node.branches.falseBranch ?? []),
      ]) {
        if (!nodeIds.has(branchId)) {
          errors.push(`Node '${node.id}' branch references unknown node '${branchId}'`);
        }
      }
    }

    if (node.loop) {
      for (const bodyId of node.loop.loopBody) {
        if (!nodeIds.has(bodyId)) {
          errors.push(`Node '${node.id}' loop body references unknown node '${bodyId}'`);
        }
      }
    }

    if (node.type === "condition" && !node.condition) {
      warnings.push(`Condition node '${node.id}' has no condition defined`);
    }
    if (node.type === "human-review" && !node.gate) {
      warnings.push(`Human-review node '${node.id}' has no gate configuration`);
    }
  }

  // Check for cycles
  try {
    topologicalSort(workflow.nodes);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Cycle detection failed");
  }

  // Check for unreachable nodes (no dependencies and not a root)
  const rootNodes = workflow.nodes.filter((n) => n.dependsOn.length === 0);
  if (rootNodes.length === 0) {
    errors.push("No root nodes found (all nodes have dependencies)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Serialize DAG execution state to a JSON-safe object. */
export function serializeDAGState(state: DAGExecutionState): Record<string, unknown> {
  return {
    workflowId: state.workflowId,
    workflowName: state.workflowName,
    status: state.status,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    nodeResults: Object.fromEntries(state.nodeResults),
    currentNodes: state.currentNodes,
    pendingApprovals: state.pendingApprovals,
  };
}
