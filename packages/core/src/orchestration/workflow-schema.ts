/**
 * @module orchestration/workflow-schema
 *
 * Comprehensive Zod schemas for visual workflow builder definitions.
 * Defines step types, connections, gates, execution state, and
 * full workflow definitions for the visual DAG editor.
 */

import { z } from "zod";

// ---- Step Types ----

export const WorkflowStepType = z.enum([
  "investigate",
  "generate",
  "debate",
  "gate",
  "export",
  "filter",
  "score",
  "transform",
  "branch",
  "merge",
]);

export type WorkflowStepType = z.infer<typeof WorkflowStepType>;

// ---- Per-Type Config Schemas ----

const InvestigateConfigSchema = z.object({
  depth: z.enum(["shallow", "standard", "deep"]).default("standard"),
  focus: z.string().max(500).optional(),
}).optional();

const GenerateConfigSchema = z.object({
  angles: z.array(z.string().max(100)).max(20).optional(),
  model: z.string().max(100).optional(),
  maxIdeas: z.number().int().min(1).max(100).optional(),
}).optional();

const DebateConfigSchema = z.object({
  rounds: z.number().int().min(1).max(10).default(3),
  perspectives: z.array(z.string().max(100)).max(10).optional(),
}).optional();

const GateConfigSchema = z.object({
  minQualityScore: z.number().min(0).max(10).optional(),
  requiredApprovals: z.number().int().min(0).max(10).optional(),
  autoPassConditions: z.array(z.string().max(500)).max(10).optional(),
}).optional();

const ExportConfigSchema = z.object({
  format: z.enum(["json", "markdown", "html", "csv", "prd", "patent-brief", "comparison-matrix"]).default("markdown"),
  template: z.string().max(5000).optional(),
}).optional();

const FilterConfigSchema = z.object({
  minScore: z.number().min(0).max(100).optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
  criteria: z.string().max(500).optional(),
}).optional();

const ScoreConfigSchema = z.object({
  dimensions: z.array(z.string().max(100)).max(20).optional(),
  rubric: z.string().max(2000).optional(),
}).optional();

const TransformConfigSchema = z.object({
  operation: z.enum(["map", "reduce", "flatten", "group", "sort", "deduplicate"]).optional(),
  expression: z.string().max(1000).optional(),
}).optional();

const BranchConfigSchema = z.object({
  condition: z.string().max(1000),
  trueBranch: z.array(z.string().max(100)).max(20).optional(),
  falseBranch: z.array(z.string().max(100)).max(20).optional(),
}).optional();

const MergeConfigSchema = z.object({
  strategy: z.enum(["concat", "union", "intersection", "best-of"]).default("concat"),
}).optional();

const StepConfigSchema = z.union([
  z.object({ investigate: InvestigateConfigSchema }).partial(),
  z.object({ generate: GenerateConfigSchema }).partial(),
  z.object({ debate: DebateConfigSchema }).partial(),
  z.object({ gate: GateConfigSchema }).partial(),
  z.object({ export: ExportConfigSchema }).partial(),
  z.object({ filter: FilterConfigSchema }).partial(),
  z.object({ score: ScoreConfigSchema }).partial(),
  z.object({ transform: TransformConfigSchema }).partial(),
  z.object({ branch: BranchConfigSchema }).partial(),
  z.object({ merge: MergeConfigSchema }).partial(),
  z.record(z.string().max(100), z.unknown()),
]);

// ---- Workflow Step ----

export const WorkflowStepSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  type: WorkflowStepType,
  config: StepConfigSchema.optional(),
  inputs: z.array(z.string().max(100)).max(20).default([]),
  outputs: z.array(z.string().max(100)).max(20).default([]),
  timeout: z.number().int().min(0).max(3600).optional(),
  retries: z.number().int().min(0).max(5).default(0),
  continueOnError: z.boolean().default(false),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// ---- Workflow Connection ----

export const WorkflowConnectionSchema = z.object({
  from: z.string().max(100),
  to: z.string().max(100),
  condition: z.string().max(1000).optional().describe("Optional expression for conditional connections"),
});

export type WorkflowConnection = z.infer<typeof WorkflowConnectionSchema>;

// ---- Workflow Gate ----

export const WorkflowGateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200).optional(),
  criteria: z.object({
    minQualityScore: z.number().min(0).max(10).optional(),
    requiredApprovals: z.number().int().min(0).max(10).optional(),
    autoPassConditions: z.array(z.string().max(500)).max(10).optional(),
  }),
});

export type WorkflowGate = z.infer<typeof WorkflowGateSchema>;

// ---- Workflow Definition ----

export const WorkflowTriggerSchema = z.object({
  type: z.enum(["manual", "schedule", "webhook", "event"]),
  config: z.record(z.string().max(100), z.unknown()).optional(),
});

export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

export const WorkflowDefinitionSchema = z.object({
  name: z.string().max(300),
  version: z.string().max(50).default("1.0.0"),
  description: z.string().max(2000).optional(),
  steps: z.array(WorkflowStepSchema).min(1).max(50),
  connections: z.array(WorkflowConnectionSchema).max(200),
  gates: z.array(WorkflowGateSchema).max(20).optional(),
  variables: z.record(z.string().max(100), z.unknown()).optional(),
  triggers: z.array(WorkflowTriggerSchema).max(10).optional(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ---- Execution State ----

export const WorkflowExecutionState = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
]);

export type WorkflowExecutionState = z.infer<typeof WorkflowExecutionState>;

// ---- Step Result ----

export const WorkflowStepResultSchema = z.object({
  stepId: z.string().max(100),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  output: z.unknown().optional(),
  error: z.string().max(2000).optional(),
});

export type WorkflowStepResult = z.infer<typeof WorkflowStepResultSchema>;

// ---- Workflow Execution ----

export const WorkflowExecutionSchema = z.object({
  id: z.string().max(100),
  workflowId: z.string().max(100),
  state: WorkflowExecutionState,
  currentStep: z.string().max(100).optional(),
  stepResults: z.array(WorkflowStepResultSchema).max(50),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  variables: z.record(z.string().max(100), z.unknown()).optional(),
});

export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

// ---- Validation Helpers ----

/** Validate a workflow definition for structural correctness. */
export function validateWorkflowDefinition(def: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const parsed = WorkflowDefinitionSchema.parse(def);
    const stepIds = new Set(parsed.steps.map((s) => s.id));

    // Validate connections reference existing steps
    for (const conn of parsed.connections) {
      if (!stepIds.has(conn.from)) {
        errors.push(`Connection references unknown source step '${conn.from}'`);
      }
      if (!stepIds.has(conn.to)) {
        errors.push(`Connection references unknown target step '${conn.to}'`);
      }
    }

    // Check for cycles via DFS
    const adjList = new Map<string, string[]>();
    for (const step of parsed.steps) {
      adjList.set(step.id, []);
    }
    for (const conn of parsed.connections) {
      adjList.get(conn.from)?.push(conn.to);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();

    function hasCycle(id: string): boolean {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const next of adjList.get(id) ?? []) {
        if (hasCycle(next)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    }

    for (const step of parsed.steps) {
      if (hasCycle(step.id)) {
        errors.push(`Circular dependency detected involving step '${step.id}'`);
        break;
      }
    }

    // Validate gate references
    const gateIds = new Set((parsed.gates ?? []).map((g) => g.id));
    for (const step of parsed.steps) {
      if (step.type === "gate") {
        const gateConfig = step.config as Record<string, unknown> | undefined;
        const gateRef = gateConfig?.gate as Record<string, unknown> | undefined;
        if (gateRef?.id && !gateIds.has(gateRef.id as string)) {
          warnings.push(`Step '${step.id}' references gate not in gates array`);
        }
      }
    }

    // Root node check
    const targetSteps = new Set(parsed.connections.map((c) => c.to));
    const roots = parsed.steps.filter((s) => !targetSteps.has(s.id));
    if (roots.length === 0 && parsed.steps.length > 1) {
      warnings.push("No root steps found — every step is a target of a connection");
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (e) {
    if (e instanceof z.ZodError) {
      errors.push(...e.errors.map((err) => `${err.path.join(".")}: ${err.message}`));
    } else {
      errors.push(`Schema validation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { valid: false, errors, warnings };
  }
}
