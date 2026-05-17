/**
 * @module pipeline-builder
 *
 * Natural Language Pipeline Builder — lets users describe custom pipelines
 * in plain English and parses them into a structured PipelineConfig.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import { ValidationError, PipelineError } from "../errors.js";
import { ANGLE_IDS, type AngleId } from "../types.js";
import { getEventBus } from "../events/emitter.js";
import { type Result, ok, err, tryAsync } from "../result/index.js";
import { ObjectPool, withPooled } from "../pool/index.js";

/** Pool for reusable phase config objects, reducing allocation during DAG compilation. */
const phaseConfigPool = new ObjectPool<Record<string, unknown>>({
  maxSize: 32,
  factory: () => ({}),
  reset: (obj) => {
    for (const key of Object.keys(obj)) delete obj[key];
  },
});

// ---- PipelineConfig Schema ----

/** Which pipeline phases to include/skip. */
export const PipelinePhaseSchema = z.enum([
  "investigate",
  "generate",
  "synthesize",
  "score",
  "validate",
]);

export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;

/** Output format for the pipeline results. */
export const OutputFormatSchema = z.enum([
  "markdown",
  "json",
  "pitch-deck",
  "executive-summary",
  "technical-brief",
]);

export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/** Full pipeline configuration derived from natural language or direct specification. */
export const PipelineConfigSchema = z.object({
  subject: z.string().max(2000).describe("The subject to innovate on"),
  phases: z.array(PipelinePhaseSchema).min(1).max(5).describe("Which phases to run, in order"),
  angles: z
    .array(z.string().max(100))
    .max(20)
    .optional()
    .describe("Specific angles to use (defaults to all)"),
  skipPhases: z.array(PipelinePhaseSchema).optional().describe("Phases to explicitly skip"),
  outputFormat: OutputFormatSchema.optional().describe("Desired output format"),
  model: z.string().max(100).optional().describe("LLM model override"),
  maxIdeas: z.number().int().min(1).max(100).optional().describe("Maximum ideas to return"),
  focusArea: z.string().max(500).optional().describe("Specific area to focus innovation on"),
  constraints: z.array(z.string().max(500)).max(20).optional().describe("Constraints to apply"),
  depth: z.enum(["shallow", "standard", "deep"]).optional().describe("Investigation depth"),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// ---- Prompt Builder ----

function buildParsePrompt(naturalLanguage: string): string {
  return `You are a pipeline configuration parser for an AI innovation tool.

The user describes what they want in plain English. Parse their request into a structured pipeline configuration.

Available phases: investigate, generate, synthesize, score, validate
Available angles: ${ANGLE_IDS.join(", ")}
Available output formats: markdown, json, pitch-deck, executive-summary, technical-brief
Available depths: shallow, standard, deep

${wrapUserInput("USER REQUEST", naturalLanguage)}

Parse the request above into a pipeline configuration. Extract:
- subject: What they want to innovate on
- phases: Which phases to run (default: ["investigate", "generate", "synthesize"])
- angles: Specific angles requested (omit for all angles)
- skipPhases: Any phases explicitly skipped
- outputFormat: Desired output format if mentioned
- maxIdeas: Max ideas if mentioned
- focusArea: Specific focus area if mentioned
- constraints: Any constraints mentioned
- depth: shallow/standard/deep if mentioned

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "subject": "extracted subject",
  "phases": ["investigate", "generate", "synthesize"],
  "angles": ["scamper", "first-principles"],
  "outputFormat": "markdown",
  "maxIdeas": 10,
  "focusArea": "mobile apps",
  "constraints": ["budget under 50K"],
  "depth": "standard"
}

Only include optional fields if the user explicitly mentioned them.`;
}

// ---- Parser ----

/**
 * Parse a natural language pipeline description into a structured PipelineConfig.
 *
 * @param naturalLanguage - Plain English description of the desired pipeline
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns A validated PipelineConfig
 */
export async function parsePipelineRequest(
  naturalLanguage: string,
  model?: string,
  signal?: AbortSignal
): Promise<PipelineConfig> {
  if (!naturalLanguage || naturalLanguage.trim().length === 0) {
    throw new ValidationError("Pipeline request cannot be empty");
  }

  if (naturalLanguage.length > 5000) {
    throw new ValidationError("Pipeline request too long (max 5000 characters)");
  }

  const prompt = buildParsePrompt(naturalLanguage);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new PipelineError(
          `Failed to parse pipeline config as JSON: ${jsonStr.slice(0, 200)}`,
          "parse"
        );
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  return PipelineConfigSchema.parse(parsed);
}

/**
 * Resolve a PipelineConfig into the effective phases to run,
 * applying skipPhases and defaults.
 */
export function resolvePhases(config: PipelineConfig): PipelinePhase[] {
  const skipSet = new Set(config.skipPhases ?? []);
  return config.phases.filter((p) => !skipSet.has(p));
}

/**
 * Resolve the effective angles from a PipelineConfig.
 * Returns validated AngleId array or all angles if none specified.
 */
export function resolveAngles(config: PipelineConfig): AngleId[] {
  if (!config.angles || config.angles.length === 0) {
    return [...ANGLE_IDS];
  }
  const validAngles = config.angles.filter((a) => (ANGLE_IDS as readonly string[]).includes(a));
  return (validAngles.length > 0 ? validAngles : [...ANGLE_IDS]) as AngleId[];
}

// ---- Pipeline DAG ----

/** Schema for a DAG node representing a pipeline step. */
export const DAGNodeSchema = z.object({
  id: z.string().max(100),
  type: PipelinePhaseSchema,
  label: z.string().max(200),
  config: z.record(z.unknown()).optional(),
  dependsOn: z.array(z.string().max(100)).max(20),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]).default("pending"),
  output: z.unknown().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().max(2000).optional(),
});

/** Schema for a full pipeline DAG. */
export const PipelineDAGSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  nodes: z.array(DAGNodeSchema).min(1).max(50),
  subject: z.string().max(2000),
  model: z.string().max(100).optional(),
  createdAt: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "partial"]).default("pending"),
  compiledFrom: z.string().max(5000).optional(),
});

export type DAGNode = z.infer<typeof DAGNodeSchema>;
export type PipelineDAG = z.infer<typeof PipelineDAGSchema>;

/**
 * Compile a natural language description into an executable pipeline DAG.
 * Parses the description to extract phases and their dependencies.
 */
export async function compilePipelineDAG(
  naturalLanguage: string,
  model?: string,
  signal?: AbortSignal
): Promise<PipelineDAG> {
  // First parse the pipeline config
  const config = await parsePipelineRequest(naturalLanguage, model, signal);
  const phases = resolvePhases(config);

  // Build DAG nodes with dependency chain
  const nodes: DAGNode[] = [];
  let previousNodeId: string | undefined;

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const nodeId = `${phase}-${i}`;

    const node: DAGNode = {
      id: nodeId,
      type: phase,
      label: getPhaseLabel(phase),
      config: buildPhaseConfig(phase, config),
      dependsOn: previousNodeId ? [previousNodeId] : [],
      status: "pending",
    };

    nodes.push(node);
    previousNodeId = nodeId;
  }

  // Add parallel branches for angle-specific generation if multiple angles specified
  if (config.angles && config.angles.length > 1 && phases.includes("generate")) {
    const generateNodeIdx = nodes.findIndex((n) => n.type === "generate");
    if (generateNodeIdx >= 0) {
      const generateNode = nodes[generateNodeIdx];
      const parentDeps = generateNode.dependsOn;

      // Replace single generate node with parallel angle nodes
      nodes.splice(generateNodeIdx, 1);

      const angleNodeIds: string[] = [];
      for (const angle of config.angles.slice(0, 10)) {
        const angleNodeId = `generate-${angle}`;
        nodes.push({
          id: angleNodeId,
          type: "generate",
          label: `Generate: ${angle}`,
          config: { angleId: angle, ...generateNode.config },
          dependsOn: parentDeps,
          status: "pending",
        });
        angleNodeIds.push(angleNodeId);
      }

      // Update any nodes that depended on the old generate node
      for (const node of nodes) {
        if (node.dependsOn.includes(generateNode.id)) {
          node.dependsOn = node.dependsOn.filter((d) => d !== generateNode.id);
          node.dependsOn.push(...angleNodeIds);
        }
      }
    }
  }

  const dagId = `dag-${Date.now().toString(36)}`;

  return {
    id: dagId,
    name: config.subject.slice(0, 200),
    description: `Pipeline compiled from: "${naturalLanguage.slice(0, 200)}"`,
    nodes,
    subject: config.subject,
    model: config.model,
    createdAt: new Date().toISOString(),
    status: "pending",
    compiledFrom: naturalLanguage,
  };
}

/**
 * Execute a compiled pipeline DAG, running nodes in dependency order.
 * Nodes with satisfied dependencies can run in parallel.
 * Uses Result type for structured per-node error handling.
 */
export async function executePipelineDAG(
  dag: PipelineDAG,
  options?: {
    signal?: AbortSignal;
    onNodeUpdate?: (node: DAGNode) => void;
    dryRun?: boolean;
  }
): Promise<PipelineDAG> {
  dag.status = "running";
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));
  const bus = getEventBus();
  bus
    .emit("pipeline.started", { dagId: dag.id, subject: dag.subject, nodeCount: dag.nodes.length })
    .catch(() => {});

  while (true) {
    if (options?.signal?.aborted) {
      dag.status = "failed";
      break;
    }

    // Find nodes ready to execute (all dependencies completed)
    const ready = dag.nodes.filter(
      (n) =>
        n.status === "pending" &&
        n.dependsOn.every((dep) => nodeMap.get(dep)?.status === "completed")
    );

    if (ready.length === 0) {
      // Check if any nodes are still running
      const running = dag.nodes.filter((n) => n.status === "running");
      if (running.length === 0) break;
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    // Execute ready nodes using Result type for structured error collection
    await Promise.all(
      ready.map(async (node) => {
        node.status = "running";
        node.startedAt = new Date().toISOString();
        options?.onNodeUpdate?.(node);

        const result: Result<unknown> = await tryAsync(async () => {
          if (options?.dryRun) {
            return { dryRun: true, type: node.type };
          }
          return { executed: true, type: node.type, label: node.label };
        });

        if (result.ok) {
          node.output = result.value;
          node.status = "completed";
        } else {
          node.status = "failed";
          node.error = result.error.message;
        }
        node.completedAt = new Date().toISOString();
        options?.onNodeUpdate?.(node);
      })
    );
  }

  // Determine overall status
  const failed = dag.nodes.filter((n) => n.status === "failed");
  const completed = dag.nodes.filter((n) => n.status === "completed");

  if (failed.length > 0 && completed.length > 0) {
    dag.status = "partial";
  } else if (failed.length > 0) {
    dag.status = "failed";
  } else {
    dag.status = "completed";
  }

  // Skip unreachable nodes
  for (const node of dag.nodes) {
    if (node.status === "pending") {
      node.status = "skipped";
    }
  }

  const eventType = dag.status === "completed" ? "pipeline.completed" : "pipeline.failed";
  bus
    .emit(eventType, { dagId: dag.id, status: dag.status, failedCount: failed.length })
    .catch(() => {});

  return dag;
}

/**
 * Visualize a pipeline DAG as a text-based flow diagram.
 */
export function dagToText(dag: PipelineDAG): string {
  const lines: string[] = [];
  lines.push(`Pipeline: ${dag.name}`);
  lines.push(`Status: ${dag.status}`);
  lines.push(`Subject: ${dag.subject}`);
  lines.push("");

  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));

  // Find root nodes (no dependencies)
  const roots = dag.nodes.filter((n) => n.dependsOn.length === 0);

  function renderNode(node: DAGNode, indent: number): void {
    const prefix = "  ".repeat(indent);
    const statusIcon = {
      pending: "⏳",
      running: "🔄",
      completed: "✅",
      failed: "❌",
      skipped: "⏭️",
    }[node.status];

    lines.push(`${prefix}${statusIcon} ${node.label} [${node.id}]`);

    // Find children (nodes that depend on this one)
    const children = dag.nodes.filter((n) => n.dependsOn.includes(node.id));
    for (const child of children) {
      renderNode(child, indent + 1);
    }
  }

  for (const root of roots) {
    renderNode(root, 0);
  }

  return lines.join("\n");
}

function getPhaseLabel(phase: PipelinePhase): string {
  const labels: Record<PipelinePhase, string> = {
    investigate: "Investigation",
    generate: "Idea Generation",
    synthesize: "Synthesis",
    score: "Scoring",
    validate: "Validation",
  };
  return labels[phase];
}

function buildPhaseConfig(phase: PipelinePhase, config: PipelineConfig): Record<string, unknown> {
  return withPooled(phaseConfigPool, (baseConfig) => {
    if (config.model) baseConfig.model = config.model;
    if (config.depth) baseConfig.depth = config.depth;

    switch (phase) {
      case "generate":
        if (config.angles) baseConfig.angles = config.angles;
        if (config.maxIdeas) baseConfig.maxIdeas = config.maxIdeas;
        if (config.constraints) baseConfig.constraints = config.constraints;
        break;
      case "investigate":
        if (config.focusArea) baseConfig.focusArea = config.focusArea;
        break;
      case "synthesize":
        if (config.outputFormat) baseConfig.outputFormat = config.outputFormat;
        break;
    }

    // Return a snapshot since the pooled object will be reset on release
    return { ...baseConfig };
  });
}
