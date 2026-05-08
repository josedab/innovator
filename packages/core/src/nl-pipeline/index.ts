/**
 * @module nl-pipeline
 *
 * Advanced Natural Language Pipeline Builder — conversational refinement,
 * dry-run cost estimation, iterative pipeline editing, and Markdown export.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import { ANGLE_IDS } from "../types.js";
import type {
  PipelineConfig,
  PipelineDAG,
  DAGNode,
  PipelinePhase,
} from "../pipeline-builder/index.js";
import { parsePipelineRequest, compilePipelineDAG } from "../pipeline-builder/index.js";

// ---- NL Intent Schema ----

/** Supported pipeline intent actions. */
export const NLIntentActionSchema = z.enum([
  "create",
  "modify",
  "delete",
  "reorder",
  "add-step",
  "remove-step",
  "set-param",
]);

export type NLIntentAction = z.infer<typeof NLIntentActionSchema>;

/** Structured intent parsed from natural language input. */
export const NLIntentSchema = z.object({
  action: NLIntentActionSchema,
  target: z.string().max(200).optional().describe("Node ID or phase type"),
  params: z.record(z.string()).optional().describe("Key-value parameters"),
  naturalLanguage: z.string().max(5000).describe("Original natural language input"),
});

export type NLIntent = z.infer<typeof NLIntentSchema>;

// ---- Refinement Schema ----

/** Result of a pipeline refinement operation. */
export const RefinementSchema = z.object({
  originalConfig: z.record(z.unknown()).describe("The config before modification"),
  modification: z.string().max(2000).describe("Description of what changed"),
  resultConfig: z.record(z.unknown()).describe("The config after modification"),
  explanation: z.string().max(2000).describe("Human-readable explanation of changes"),
});

export type Refinement = z.infer<typeof RefinementSchema>;

// ---- Dry-Run Result Schema ----

/** Per-node token estimate. */
export const NodeTokenEstimateSchema = z.object({
  nodeId: z.string().max(100),
  label: z.string().max(200),
  estimatedInputTokens: z.number().int().min(0),
  estimatedOutputTokens: z.number().int().min(0),
});

export type NodeTokenEstimate = z.infer<typeof NodeTokenEstimateSchema>;

/** Result of a dry-run pipeline analysis. */
export const DryRunResultSchema = z.object({
  dag: z.record(z.unknown()).describe("The analyzed DAG"),
  estimatedTokens: z.object({
    perNode: z.array(NodeTokenEstimateSchema),
    totalInput: z.number().int().min(0),
    totalOutput: z.number().int().min(0),
  }),
  estimatedCostUsd: z.number().min(0),
  estimatedDurationSeconds: z.number().min(0),
  warnings: z.array(z.string().max(500)),
});

export type DryRunResult = z.infer<typeof DryRunResultSchema>;

// ---- Validation Result ----

/** Result of pipeline config validation. */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string().max(500)),
  warnings: z.array(z.string().max(500)),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ---- Conversation Turn ----

/** A single turn in a conversational pipeline session. */
export const ConversationTurnSchema = z.object({
  role: z.enum(["user", "system"]),
  content: z.string().max(10000),
  timestamp: z.string(),
  intent: NLIntentSchema.optional(),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

// ---- Constants ----

const VALID_PHASES: PipelinePhase[] = [
  "investigate",
  "generate",
  "synthesize",
  "score",
  "validate",
];

/** Approximate cost per 1K tokens (blended average). */
const COST_PER_1K_INPUT_TOKENS = 0.01;
const COST_PER_1K_OUTPUT_TOKENS = 0.03;

/** Approximate tokens per second for latency estimation. */
const TOKENS_PER_SECOND = 50;

/** Token estimates per phase type. */
const PHASE_TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  investigate: { input: 800, output: 1500 },
  generate: { input: 1000, output: 2000 },
  synthesize: { input: 1200, output: 1800 },
  score: { input: 600, output: 800 },
  validate: { input: 500, output: 600 },
};

// ---- 1. NL Intent Parsing ----

function buildIntentPrompt(input: string): string {
  return `You are a pipeline intent classifier for an AI innovation tool.

Given a user's natural language input, classify their intent into a structured action.

Available actions:
- create: Build a new pipeline from scratch
- modify: Change an existing pipeline's configuration
- delete: Remove a pipeline entirely
- reorder: Change the order of phases
- add-step: Add a new phase/step to the pipeline
- remove-step: Remove a phase/step from the pipeline
- set-param: Set or update a pipeline parameter

Available phases: ${VALID_PHASES.join(", ")}
Available angles: ${ANGLE_IDS.join(", ")}

${wrapUserInput("USER INPUT", input)}

Respond with valid JSON only:
{
  "action": "create|modify|delete|reorder|add-step|remove-step|set-param",
  "target": "optional node ID or phase type",
  "params": {"key": "value"},
  "naturalLanguage": "the original input"
}`;
}

/**
 * Parse natural language into a structured pipeline intent.
 *
 * @param input - Natural language describing the desired action
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns A validated NLIntent
 */
export async function parseNLIntent(
  input: string,
  model?: string,
  signal?: AbortSignal
): Promise<NLIntent> {
  if (!input || input.trim().length === 0) {
    throw new Error("Intent input cannot be empty");
  }

  const prompt = buildIntentPrompt(input);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const cleaned = sanitizeLlmOutput(raw);
      const jsonStr = extractJson(cleaned);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse intent as JSON: ${jsonStr.slice(0, 200)}`);
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

  const result = NLIntentSchema.parse(parsed);
  // Ensure naturalLanguage always reflects the original input
  result.naturalLanguage = input;
  return result;
}

// ---- 2. Pipeline Refinement ----

function buildRefinementPrompt(currentConfig: PipelineConfig, naturalLanguage: string): string {
  return `You are a pipeline refinement engine for an AI innovation tool.

You have an existing pipeline configuration and the user wants to modify it.

Available phases: ${VALID_PHASES.join(", ")}
Available angles: ${ANGLE_IDS.join(", ")}
Available output formats: markdown, json, pitch-deck, executive-summary, technical-brief
Available depths: shallow, standard, deep

${wrapUserInput("CURRENT CONFIG", JSON.stringify(currentConfig, null, 2))}

${wrapUserInput("USER MODIFICATION REQUEST", naturalLanguage)}

Apply the requested modification to the current config and return the result.
Respond with valid JSON only:
{
  "originalConfig": <the current config as-is>,
  "modification": "brief description of what changed",
  "resultConfig": <the modified config>,
  "explanation": "human-readable explanation of the changes"
}

The resultConfig must be a valid pipeline config with at least a "subject" and "phases" array.`;
}

/**
 * Refine an existing pipeline config using natural language instructions.
 *
 * @param currentConfig - The current pipeline configuration
 * @param naturalLanguage - Natural language describing the modification
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns A Refinement with original and updated configs
 */
export async function refinePipeline(
  currentConfig: PipelineConfig,
  naturalLanguage: string,
  model?: string,
  signal?: AbortSignal
): Promise<Refinement> {
  if (!naturalLanguage || naturalLanguage.trim().length === 0) {
    throw new Error("Refinement request cannot be empty");
  }

  const prompt = buildRefinementPrompt(currentConfig, naturalLanguage);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const cleaned = sanitizeLlmOutput(raw);
      const jsonStr = extractJson(cleaned);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse refinement as JSON: ${jsonStr.slice(0, 200)}`);
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

  return RefinementSchema.parse(parsed);
}

// ---- 3. Conversational Session ----

/**
 * Conversational pipeline session for iterative, natural language-driven
 * pipeline building and refinement.
 */
export class NLPipelineSession {
  currentConfig: PipelineConfig | null = null;
  currentDAG: PipelineDAG | null = null;
  history: ConversationTurn[] = [];

  private model: string | undefined;

  constructor(model?: string) {
    this.model = model;
  }

  /**
   * Describe a new pipeline from natural language. Creates the initial config and DAG.
   */
  async describe(naturalLanguage: string, signal?: AbortSignal): Promise<PipelineDAG> {
    this.addTurn("user", naturalLanguage);

    const config = await parsePipelineRequest(naturalLanguage, this.model, signal);
    this.currentConfig = config;

    const dag = await compilePipelineDAG(naturalLanguage, this.model, signal);
    this.currentDAG = dag;

    this.addTurn(
      "system",
      `Pipeline created: "${config.subject}" with phases [${config.phases.join(", ")}].`
    );
    return dag;
  }

  /**
   * Refine the current pipeline with a natural language modification.
   */
  async refine(naturalLanguage: string, signal?: AbortSignal): Promise<Refinement> {
    if (!this.currentConfig) {
      throw new Error("No pipeline to refine. Call describe() first.");
    }

    this.addTurn("user", naturalLanguage);

    const refinement = await refinePipeline(
      this.currentConfig,
      naturalLanguage,
      this.model,
      signal
    );

    // Apply the refined config
    const newConfig = refinement.resultConfig as unknown;
    const { PipelineConfigSchema } = await import("../pipeline-builder/index.js");
    this.currentConfig = PipelineConfigSchema.parse(newConfig);

    // Recompile DAG from updated config
    const dag = await compilePipelineDAG(this.currentConfig.subject, this.model, signal);
    this.currentDAG = dag;

    this.addTurn("system", `Pipeline refined: ${refinement.explanation}`);
    return refinement;
  }

  /**
   * Preview the current pipeline DAG as a text diagram.
   */
  preview(): string {
    if (!this.currentDAG) {
      return "No pipeline configured yet. Call describe() first.";
    }
    return dagToText(this.currentDAG);
  }

  /**
   * Estimate token costs for the current pipeline.
   */
  estimateCost(): DryRunResult | null {
    if (!this.currentConfig || !this.currentDAG) {
      return null;
    }
    return dryRunPipeline(this.currentConfig, this.currentDAG);
  }

  /**
   * Reset the session, clearing config, DAG, and history.
   */
  reset(): void {
    this.currentConfig = null;
    this.currentDAG = null;
    this.history = [];
  }

  /**
   * Return the conversation history.
   */
  getHistory(): ConversationTurn[] {
    return [...this.history];
  }

  private addTurn(role: "user" | "system", content: string, intent?: NLIntent): void {
    this.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      intent,
    });
  }
}

// ---- DAG Text Helper (local re-implementation to avoid circular import) ----

function dagToText(dag: PipelineDAG): string {
  const lines: string[] = [];
  lines.push(`Pipeline: ${dag.name}`);
  lines.push(`Status: ${dag.status}`);
  lines.push(`Subject: ${dag.subject}`);
  lines.push("");

  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));
  const roots = dag.nodes.filter((n) => n.dependsOn.length === 0);
  const visited = new Set<string>();

  function renderNode(node: DAGNode, indent: number): void {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const prefix = "  ".repeat(indent);
    const statusIcon: Record<string, string> = {
      pending: "⏳",
      running: "🔄",
      completed: "✅",
      failed: "❌",
      skipped: "⏭️",
    };
    lines.push(`${prefix}${statusIcon[node.status] ?? "?"} ${node.label} [${node.id}]`);

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

// ---- 4. Dry-Run with Cost Estimation ----

/**
 * Analyze a pipeline config and DAG without executing, returning cost/time estimates.
 */
export function dryRunPipeline(config: PipelineConfig, dag?: PipelineDAG): DryRunResult {
  const effectiveDAG = dag ?? buildStubDAG(config);

  const perNode: NodeTokenEstimate[] = effectiveDAG.nodes.map((node) => {
    const estimate = PHASE_TOKEN_ESTIMATES[node.type] ?? { input: 500, output: 500 };
    return {
      nodeId: node.id,
      label: node.label,
      estimatedInputTokens: estimate.input,
      estimatedOutputTokens: estimate.output,
    };
  });

  const totalInput = perNode.reduce((sum, n) => sum + n.estimatedInputTokens, 0);
  const totalOutput = perNode.reduce((sum, n) => sum + n.estimatedOutputTokens, 0);

  const estimatedCostUsd =
    (totalInput / 1000) * COST_PER_1K_INPUT_TOKENS +
    (totalOutput / 1000) * COST_PER_1K_OUTPUT_TOKENS;

  const estimatedDurationSeconds = (totalInput + totalOutput) / TOKENS_PER_SECOND;

  const warnings: string[] = [];

  if (effectiveDAG.nodes.length > 20) {
    warnings.push("Large pipeline: more than 20 nodes may cause long execution times.");
  }

  if (config.depth === "deep") {
    warnings.push("Deep investigation depth increases token usage significantly.");
  }

  if (config.angles && config.angles.length > 5) {
    warnings.push(
      `${config.angles.length} angles selected — consider narrowing for cost efficiency.`
    );
  }

  const validation = validatePipelineConfig(config);
  if (!validation.valid) {
    warnings.push(...validation.errors.map((e) => `Validation error: ${e}`));
  }
  warnings.push(...validation.warnings);

  return DryRunResultSchema.parse({
    dag: effectiveDAG,
    estimatedTokens: { perNode, totalInput, totalOutput },
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    estimatedDurationSeconds: Math.round(estimatedDurationSeconds),
    warnings,
  });
}

function buildStubDAG(config: PipelineConfig): PipelineDAG {
  const nodes: DAGNode[] = config.phases.map((phase, i) => ({
    id: `${phase}-${i}`,
    type: phase,
    label: phase.charAt(0).toUpperCase() + phase.slice(1),
    dependsOn: i > 0 ? [`${config.phases[i - 1]}-${i - 1}`] : [],
    status: "pending" as const,
  }));

  return {
    id: `stub-${Date.now().toString(36)}`,
    name: config.subject.slice(0, 200),
    nodes,
    subject: config.subject,
    model: config.model,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
}

// ---- 5. Pipeline Validation ----

/**
 * Validate a pipeline config for structural correctness.
 * Checks for circular dependencies, missing required phases, invalid angles,
 * and parameter type errors.
 */
export function validatePipelineConfig(config: PipelineConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!config.subject || config.subject.trim().length === 0) {
    errors.push("Pipeline subject is required.");
  }

  if (!config.phases || config.phases.length === 0) {
    errors.push("Pipeline must have at least one phase.");
  }

  // Check for invalid phases
  for (const phase of config.phases) {
    if (!VALID_PHASES.includes(phase)) {
      errors.push(`Invalid phase: "${phase}". Valid phases: ${VALID_PHASES.join(", ")}`);
    }
  }

  // Check for duplicate phases
  const phaseSet = new Set<string>();
  for (const phase of config.phases) {
    if (phaseSet.has(phase)) {
      warnings.push(`Duplicate phase: "${phase}".`);
    }
    phaseSet.add(phase);
  }

  // Check skipPhases don't conflict with phases
  if (config.skipPhases) {
    for (const skip of config.skipPhases) {
      if (!config.phases.includes(skip)) {
        warnings.push(`Skip phase "${skip}" is not in the phases list — it has no effect.`);
      }
    }

    const remaining = config.phases.filter((p) => !config.skipPhases!.includes(p));
    if (remaining.length === 0) {
      errors.push("All phases are skipped — pipeline would have no steps.");
    }
  }

  // Check for invalid angles
  if (config.angles) {
    const validAngleIds = ANGLE_IDS as readonly string[];
    for (const angle of config.angles) {
      if (!validAngleIds.includes(angle)) {
        warnings.push(`Unknown angle: "${angle}". Known angles: ${ANGLE_IDS.join(", ")}`);
      }
    }
  }

  // Check invalid angle combinations
  if (config.angles && config.angles.length > 0 && !config.phases.includes("generate")) {
    warnings.push('Angles are specified but "generate" phase is not included.');
  }

  // Check parameter types
  if (config.maxIdeas !== undefined && config.maxIdeas < 1) {
    errors.push("maxIdeas must be at least 1.");
  }

  // Circular dependency check (for phases, the linear order prevents true cycles,
  // but synthesize before generate is a logical ordering issue)
  const phaseOrder = config.phases;
  const genIdx = phaseOrder.indexOf("generate");
  const synthIdx = phaseOrder.indexOf("synthesize");
  if (genIdx >= 0 && synthIdx >= 0 && synthIdx < genIdx) {
    warnings.push('"synthesize" is before "generate" — synthesis typically follows generation.');
  }

  const scoreIdx = phaseOrder.indexOf("score");
  if (scoreIdx >= 0 && genIdx >= 0 && scoreIdx < genIdx) {
    warnings.push('"score" is before "generate" — scoring typically follows generation.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---- 6. Pipeline Templates from NL ----

function buildGoalPrompt(goal: string): string {
  return `You are a pipeline architect for an AI innovation tool.

Given a high-level goal, suggest a fully configured pipeline with recommended phases, angles, and parameters.

Available phases: ${VALID_PHASES.join(", ")}
Available angles: ${ANGLE_IDS.join(", ")}
Available output formats: markdown, json, pitch-deck, executive-summary, technical-brief
Available depths: shallow, standard, deep

${wrapUserInput("USER GOAL", goal)}

Design an optimal pipeline configuration for this goal.
Respond with valid JSON only:
{
  "subject": "extracted subject for the pipeline",
  "phases": ["investigate", "generate", "synthesize"],
  "angles": ["scamper", "first-principles"],
  "outputFormat": "markdown",
  "maxIdeas": 10,
  "focusArea": "specific focus",
  "constraints": ["any relevant constraints"],
  "depth": "standard"
}

Choose phases, angles, and parameters that best match the user's goal. Only include optional fields when relevant.`;
}

/**
 * Suggest a fully configured pipeline from a high-level goal description.
 *
 * @param goal - High-level goal (e.g., "brainstorm mobile app ideas for healthcare")
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns A validated PipelineConfig
 */
export async function suggestPipelineFromGoal(
  goal: string,
  model?: string,
  signal?: AbortSignal
): Promise<PipelineConfig> {
  if (!goal || goal.trim().length === 0) {
    throw new Error("Goal cannot be empty");
  }

  const prompt = buildGoalPrompt(goal);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const cleaned = sanitizeLlmOutput(raw);
      const jsonStr = extractJson(cleaned);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse pipeline suggestion as JSON: ${jsonStr.slice(0, 200)}`);
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

  const { PipelineConfigSchema } = await import("../pipeline-builder/index.js");
  return PipelineConfigSchema.parse(parsed);
}

// ---- 7. Markdown Export ----

/**
 * Export a conversational pipeline session to Markdown.
 */
export function pipelineSessionToMarkdown(session: NLPipelineSession): string {
  const lines: string[] = [];

  lines.push("# Pipeline Session");
  lines.push("");

  if (session.currentConfig) {
    lines.push("## Configuration");
    lines.push("");
    lines.push(`- **Subject**: ${session.currentConfig.subject}`);
    lines.push(`- **Phases**: ${session.currentConfig.phases.join(", ")}`);

    if (session.currentConfig.angles?.length) {
      lines.push(`- **Angles**: ${session.currentConfig.angles.join(", ")}`);
    }
    if (session.currentConfig.outputFormat) {
      lines.push(`- **Output Format**: ${session.currentConfig.outputFormat}`);
    }
    if (session.currentConfig.depth) {
      lines.push(`- **Depth**: ${session.currentConfig.depth}`);
    }
    if (session.currentConfig.maxIdeas) {
      lines.push(`- **Max Ideas**: ${session.currentConfig.maxIdeas}`);
    }
    if (session.currentConfig.focusArea) {
      lines.push(`- **Focus Area**: ${session.currentConfig.focusArea}`);
    }
    if (session.currentConfig.constraints?.length) {
      lines.push(`- **Constraints**: ${session.currentConfig.constraints.join("; ")}`);
    }
    lines.push("");
  }

  if (session.currentDAG) {
    lines.push("## Pipeline DAG");
    lines.push("");
    lines.push("```");
    lines.push(dagToText(session.currentDAG));
    lines.push("```");
    lines.push("");
  }

  if (session.history.length > 0) {
    lines.push("## Conversation History");
    lines.push("");

    for (const turn of session.history) {
      const roleLabel = turn.role === "user" ? "**User**" : "**System**";
      const time = turn.timestamp.slice(0, 19).replace("T", " ");
      lines.push(`### ${roleLabel} — ${time}`);
      lines.push("");
      lines.push(turn.content);
      lines.push("");
    }
  }

  const estimate = session.estimateCost();
  if (estimate) {
    lines.push("## Cost Estimate");
    lines.push("");
    lines.push(`- **Total Input Tokens**: ${estimate.estimatedTokens.totalInput}`);
    lines.push(`- **Total Output Tokens**: ${estimate.estimatedTokens.totalOutput}`);
    lines.push(`- **Estimated Cost**: $${estimate.estimatedCostUsd.toFixed(4)}`);
    lines.push(`- **Estimated Duration**: ${estimate.estimatedDurationSeconds}s`);

    if (estimate.warnings.length > 0) {
      lines.push("");
      lines.push("### Warnings");
      lines.push("");
      for (const warning of estimate.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
