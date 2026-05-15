/**
 * @module nl-pipeline/composer
 *
 * Advanced conversational pipeline composer — parses multi-step NL instructions
 * with conditionals into executable DAGs with streaming results and pre-built templates.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import { ANGLE_IDS } from "../types.js";
import type { PipelineConfig, DAGNode, PipelineDAG } from "../pipeline-builder/index.js";

// ---- Multi-Step DAG Schemas ----

export const ConditionalOperatorSchema = z.enum([
  "score_above",
  "score_below",
  "has_ideas",
  "idea_count_above",
  "always",
  "gauntlet_survival",
]);

export const ConditionalSchema = z.object({
  operator: ConditionalOperatorSchema,
  threshold: z.number().optional(),
  field: z.string().max(200).optional(),
});

export const ComposerStepSchema = z.object({
  id: z.string().max(100),
  action: z.enum([
    "investigate",
    "generate",
    "synthesize",
    "score",
    "validate",
    "debate",
    "evolve",
    "filter",
    "compare",
    "branch",
  ]),
  label: z.string().max(300),
  params: z.record(z.unknown()).optional(),
  dependsOn: z.array(z.string().max(100)).default([]),
  conditional: ConditionalSchema.optional(),
  iterateCount: z.number().int().min(1).max(10).optional(),
});

export const ComposerDAGSchema = z.object({
  id: z.string().max(100),
  instruction: z.string().max(5000),
  subject: z.string().max(2000),
  steps: z.array(ComposerStepSchema).min(1).max(30),
  createdAt: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "partial"]).default("pending"),
});

export const StreamEventSchema = z.object({
  type: z.enum(["step_start", "step_progress", "step_complete", "step_error", "dag_complete"]),
  stepId: z.string().max(100).optional(),
  label: z.string().max(300).optional(),
  progress: z.number().min(0).max(100).optional(),
  data: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

export type ConditionalOperator = z.infer<typeof ConditionalOperatorSchema>;
export type Conditional = z.infer<typeof ConditionalSchema>;
export type ComposerStep = z.infer<typeof ComposerStepSchema>;
export type ComposerDAG = z.infer<typeof ComposerDAGSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;

// ---- Pre-Built Conversational Templates ----

export interface ConversationalTemplate {
  id: string;
  name: string;
  description: string;
  instruction: string;
  category: "discovery" | "validation" | "competitive" | "deep-dive" | "rapid";
  estimatedMinutes: number;
}

export const CONVERSATIONAL_TEMPLATES: ConversationalTemplate[] = [
  {
    id: "deep-discovery",
    name: "Deep Discovery Pipeline",
    description: "Thorough investigation with multi-angle generation and rigorous synthesis.",
    instruction:
      "investigate {subject} in depth, generate ideas using first-principles, biomimicry, and scamper angles, synthesize the top 5, then score and validate the best ones",
    category: "discovery",
    estimatedMinutes: 8,
  },
  {
    id: "rapid-brainstorm",
    name: "Rapid Brainstorm",
    description: "Quick investigation with fast idea generation across all angles.",
    instruction:
      "quickly investigate {subject}, generate ideas with all available angles, synthesize the top 10",
    category: "rapid",
    estimatedMinutes: 3,
  },
  {
    id: "competitive-analysis",
    name: "Competitive Analysis Pipeline",
    description: "Investigate competitive landscape, find gaps, generate differentiation ideas.",
    instruction:
      "investigate {subject} focusing on competitive landscape, generate ideas using constraint-removal and reverse-engineering angles, debate the top 3 ideas, evolve the winner",
    category: "competitive",
    estimatedMinutes: 10,
  },
  {
    id: "validation-funnel",
    name: "Validation Funnel",
    description: "Generate many ideas, progressively filter and validate the best.",
    instruction:
      "investigate {subject}, generate 20 ideas across all angles, score them all, filter to top 5 by score above 7, validate the survivors, synthesize into executive summary",
    category: "validation",
    estimatedMinutes: 12,
  },
  {
    id: "debate-and-evolve",
    name: "Debate & Evolve",
    description: "Generate ideas, debate the top candidates, evolve the winner iteratively.",
    instruction:
      "investigate {subject}, generate ideas using first-principles and biomimicry, debate the top 3, evolve the winner twice, then synthesize",
    category: "deep-dive",
    estimatedMinutes: 15,
  },
  {
    id: "market-gap-finder",
    name: "Market Gap Finder",
    description: "Identify underserved areas and generate ideas targeting those gaps.",
    instruction:
      "investigate {subject} market landscape, generate ideas using scamper and constraint-removal, filter ideas that address unmet needs, score for feasibility above 8, synthesize as pitch-deck",
    category: "discovery",
    estimatedMinutes: 10,
  },
  {
    id: "technology-scout",
    name: "Technology Scout",
    description: "Explore emerging technologies applicable to your domain.",
    instruction:
      "deeply investigate emerging technologies in {subject}, generate ideas using analogical-thinking and first-principles, compare top 5 approaches, validate feasibility, synthesize as technical-brief",
    category: "deep-dive",
    estimatedMinutes: 12,
  },
  {
    id: "pivot-explorer",
    name: "Pivot Explorer",
    description: "Generate alternative directions and evaluate pivot opportunities.",
    instruction:
      "investigate current state of {subject}, generate pivot ideas using reverse-engineering and scamper, debate top 3 pivot directions, score each for risk and opportunity, synthesize comparison",
    category: "competitive",
    estimatedMinutes: 10,
  },
  {
    id: "innovation-sprint",
    name: "Innovation Sprint",
    description: "Time-boxed innovation cycle mimicking a design sprint.",
    instruction:
      "investigate {subject} with shallow depth, generate 15 ideas with all angles, score them, filter to top 3 by score above 6, evolve each once, synthesize as executive-summary",
    category: "rapid",
    estimatedMinutes: 8,
  },
  {
    id: "moonshot-generator",
    name: "Moonshot Generator",
    description: "Push boundaries with ambitious, unconventional ideas.",
    instruction:
      "deeply investigate {subject} including impossible-seeming approaches, generate ideas using biomimicry first-principles and analogical-thinking with constraint 'no budget limits', debate the top 5, evolve the wildest idea 3 times, synthesize",
    category: "deep-dive",
    estimatedMinutes: 18,
  },
];

// ---- Multi-Step Instruction Parser ----

function buildMultiStepPrompt(instruction: string): string {
  return `You are an advanced pipeline compiler for an AI innovation tool.

Parse a conversational multi-step instruction into a structured DAG of steps.

Available actions: investigate, generate, synthesize, score, validate, debate, evolve, filter, compare, branch
Available angles: ${ANGLE_IDS.join(", ")}
Conditional operators: score_above, score_below, has_ideas, idea_count_above, always, gauntlet_survival

${wrapUserInput("INSTRUCTION", instruction)}

Parse into a DAG of steps. Each step has dependencies on previous steps.
Support conditionals like "if score > 7, then..." and iteration like "evolve twice".
Respond with valid JSON only:

{
  "subject": "extracted subject",
  "steps": [
    {
      "id": "step-1",
      "action": "investigate",
      "label": "Investigate the subject",
      "params": {},
      "dependsOn": [],
      "conditional": null,
      "iterateCount": null
    },
    {
      "id": "step-2",
      "action": "generate",
      "label": "Generate ideas with first-principles",
      "params": {"angles": ["first-principles"]},
      "dependsOn": ["step-1"],
      "conditional": null,
      "iterateCount": null
    },
    {
      "id": "step-3",
      "action": "debate",
      "label": "Debate top 3 ideas",
      "params": {"topN": 3},
      "dependsOn": ["step-2"],
      "conditional": null,
      "iterateCount": null
    },
    {
      "id": "step-4",
      "action": "evolve",
      "label": "Evolve the winner",
      "params": {},
      "dependsOn": ["step-3"],
      "conditional": null,
      "iterateCount": 2
    }
  ]
}

Rules:
- Extract the subject from the instruction
- Chain steps with proper dependencies
- "debate the top N" → debate action with topN param
- "evolve X times" → evolve action with iterateCount
- "filter by score above X" → filter action with conditional score_above
- "if score > X, then Y" → Y step with conditional score_above threshold X
- Parallel generation with different angles → multiple generate steps depending on same parent`;
}

/**
 * Parse a multi-step conversational instruction into a ComposerDAG.
 */
export async function parseMultiStepInstruction(
  instruction: string,
  model?: string,
  signal?: AbortSignal
): Promise<ComposerDAG> {
  if (!instruction || instruction.trim().length === 0) {
    throw new Error("Instruction cannot be empty");
  }

  if (instruction.length > 5000) {
    throw new Error("Instruction too long (max 5000 characters)");
  }

  const prompt = buildMultiStepPrompt(instruction);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const cleaned = sanitizeLlmOutput(raw);
      const jsonStr = extractJson(cleaned);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new Error(`Failed to parse multi-step DAG as JSON: ${jsonStr.slice(0, 200)}`);
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

  const dagId = `composer-${Date.now().toString(36)}`;
  const steps = (parsed.steps as unknown[]) ?? [];

  return ComposerDAGSchema.parse({
    id: dagId,
    instruction,
    subject: parsed.subject ?? instruction.slice(0, 200),
    steps,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
}

// ---- Conditional Evaluator ----

/**
 * Evaluate a conditional against step output data.
 */
export function evaluateConditional(
  conditional: Conditional,
  data: Record<string, unknown>
): boolean {
  switch (conditional.operator) {
    case "always":
      return true;

    case "score_above": {
      const score = Number(data["score"] ?? data["averageScore"] ?? 0);
      return score > (conditional.threshold ?? 0);
    }

    case "score_below": {
      const score = Number(data["score"] ?? data["averageScore"] ?? 0);
      return score < (conditional.threshold ?? Infinity);
    }

    case "has_ideas": {
      const ideas = data["ideas"] ?? data["topIdeas"];
      return Array.isArray(ideas) && ideas.length > 0;
    }

    case "idea_count_above": {
      const ideas = data["ideas"] ?? data["topIdeas"];
      return Array.isArray(ideas) && ideas.length > (conditional.threshold ?? 0);
    }

    case "gauntlet_survival": {
      const survivalRate = Number(data["survivalRate"] ?? 0);
      return survivalRate > (conditional.threshold ?? 0.7);
    }

    default:
      return true;
  }
}

// ---- Streaming Execution ----

/**
 * Execute a ComposerDAG with streaming step-by-step events.
 * Yields StreamEvents as each step starts, progresses, and completes.
 */
export async function* executeComposerDAG(
  dag: ComposerDAG,
  options?: {
    signal?: AbortSignal;
    dryRun?: boolean;
  }
): AsyncGenerator<StreamEvent> {
  dag.status = "running";
  const stepOutputs = new Map<string, Record<string, unknown>>();

  // Topological sort respecting dependencies
  const executed = new Set<string>();
  const stepMap = new Map(dag.steps.map((s) => [s.id, s]));

  while (executed.size < dag.steps.length) {
    if (options?.signal?.aborted) {
      dag.status = "failed";
      return;
    }

    // Find ready steps
    const ready = dag.steps.filter(
      (s) => !executed.has(s.id) && s.dependsOn.every((dep) => executed.has(dep))
    );

    if (ready.length === 0) break;

    for (const step of ready) {
      // Check conditional
      if (step.conditional) {
        const parentData =
          step.dependsOn.length > 0
            ? (stepOutputs.get(step.dependsOn[step.dependsOn.length - 1]) ?? {})
            : {};

        if (!evaluateConditional(step.conditional, parentData)) {
          executed.add(step.id);
          yield {
            type: "step_complete",
            stepId: step.id,
            label: step.label,
            data: { skipped: true, reason: "Conditional not met" },
            timestamp: new Date().toISOString(),
          };
          continue;
        }
      }

      const iterCount = step.iterateCount ?? 1;

      for (let iter = 0; iter < iterCount; iter++) {
        const iterLabel =
          iterCount > 1 ? `${step.label} (iteration ${iter + 1}/${iterCount})` : step.label;

        yield {
          type: "step_start",
          stepId: step.id,
          label: iterLabel,
          progress: 0,
          timestamp: new Date().toISOString(),
        };

        // Progress updates
        yield {
          type: "step_progress",
          stepId: step.id,
          label: iterLabel,
          progress: 50,
          timestamp: new Date().toISOString(),
        };

        // Execute step (or dry-run)
        const output: Record<string, unknown> = options?.dryRun
          ? { dryRun: true, action: step.action, iteration: iter + 1 }
          : {
              executed: true,
              action: step.action,
              label: step.label,
              iteration: iter + 1,
              params: step.params,
            };

        stepOutputs.set(step.id, output);

        yield {
          type: "step_complete",
          stepId: step.id,
          label: iterLabel,
          progress: 100,
          data: output,
          timestamp: new Date().toISOString(),
        };
      }

      executed.add(step.id);
    }
  }

  dag.status = executed.size === dag.steps.length ? "completed" : "partial";

  yield {
    type: "dag_complete",
    data: {
      status: dag.status,
      stepsCompleted: executed.size,
      totalSteps: dag.steps.length,
    },
    timestamp: new Date().toISOString(),
  };
}

// ---- Template Helpers ----

/** Get all conversational templates. */
export function getConversationalTemplates(): ConversationalTemplate[] {
  return [...CONVERSATIONAL_TEMPLATES];
}

/** Get a template by ID. */
export function getConversationalTemplate(id: string): ConversationalTemplate | undefined {
  return CONVERSATIONAL_TEMPLATES.find((t) => t.id === id);
}

/** Filter templates by category. */
export function filterTemplatesByCategory(
  category: ConversationalTemplate["category"]
): ConversationalTemplate[] {
  return CONVERSATIONAL_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Instantiate a template with a subject, producing a ready-to-parse instruction.
 */
export function instantiateTemplate(templateId: string, subject: string): string {
  const template = CONVERSATIONAL_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);
  return template.instruction.replace(/\{subject\}/g, subject);
}

/**
 * Convert a ComposerDAG to a visual text representation.
 */
export function composerDAGToText(dag: ComposerDAG): string {
  const lines: string[] = [];
  lines.push(`🔧 Composer Pipeline: ${dag.subject}`);
  lines.push(`   Status: ${dag.status}`);
  lines.push(`   Steps: ${dag.steps.length}`);
  lines.push("");

  for (const step of dag.steps) {
    const deps = step.dependsOn.length > 0 ? ` ← [${step.dependsOn.join(", ")}]` : " (root)";
    const cond = step.conditional
      ? ` [if ${step.conditional.operator}${step.conditional.threshold != null ? ` ${step.conditional.threshold}` : ""}]`
      : "";
    const iter = step.iterateCount && step.iterateCount > 1 ? ` ×${step.iterateCount}` : "";
    lines.push(`  [${step.id}] ${step.action}: ${step.label}${deps}${cond}${iter}`);
  }

  return lines.join("\n");
}
