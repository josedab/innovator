/**
 * @module nl-innovation-api
 *
 * Natural Language Innovation API — conversational pipeline orchestration
 * with single-prompt execution plans, SSE streaming, mid-stream corrections,
 * and conversation memory across turns.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { LlmParseError, ValidationError, PipelineError } from "../errors.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/index.js";
import { generateForAngle } from "../innovation/index.js";
import { getCustomAngle } from "../innovation/custom-angles.js";
import { scoreIdeas } from "../scoring/index.js";
import { runDebate } from "../debate/index.js";
import { generateArtifact } from "../artifacts/index.js";
import { ANGLE_IDS } from "../types.js";
import type { Investigation, AngleResult, InnovationIdea } from "../types.js";
import type { ArtifactType } from "../artifacts/index.js";
import type { DebateResult } from "../debate/index.js";
import type { ScoringResult } from "../scoring/index.js";
import type { Artifact } from "../artifacts/index.js";

/* -------------------------------------------------------------------------- */
/*  Zod Schemas                                                               */
/* -------------------------------------------------------------------------- */

export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.number(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ExecutionStepSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["investigate", "generate", "score", "debate", "artifact", "custom"]),
  description: z.string().min(1).max(500),
  params: z.record(z.unknown()).default({}),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]).default("pending"),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionPlanSchema = z.object({
  id: z.string().min(1).max(100),
  prompt: z.string().min(1).max(5000),
  steps: z.array(ExecutionStepSchema).min(1).max(12),
  createdAt: z.number(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).default("pending"),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plan_generated"),
    plan: ExecutionPlanSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("step_started"),
    stepId: z.string(),
    description: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("step_progress"),
    stepId: z.string(),
    message: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("step_completed"),
    stepId: z.string(),
    result: z.unknown(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("step_failed"),
    stepId: z.string(),
    error: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("execution_completed"),
    results: z.record(z.unknown()),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("correction_applied"),
    modification: z.string(),
    updatedPlan: ExecutionPlanSchema,
    timestamp: z.number(),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const ConversationSessionSchema = z.object({
  id: z.string(),
  messages: z.array(ConversationMessageSchema),
  currentPlan: ExecutionPlanSchema.nullable(),
  subject: z.string().nullable(),
  investigation: z.unknown().nullable(),
  results: z.record(z.unknown()),
  createdAt: z.number(),
});
export type ConversationSessionState = z.infer<typeof ConversationSessionSchema>;

export const PlanGenerationResultSchema = z.object({
  plan: ExecutionPlanSchema,
  explanation: z.string().max(1000),
});
export type PlanGenerationResult = z.infer<typeof PlanGenerationResultSchema>;

const GeneratedStepBaseSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500),
});

const PlanAngleIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/)
  .refine(
    (angleId) =>
      (ANGLE_IDS as readonly string[]).includes(angleId) || getCustomAngle(angleId) !== undefined,
    "Unknown innovation angle"
  );

const GeneratedExecutionStepSchema = z.discriminatedUnion("type", [
  GeneratedStepBaseSchema.extend({
    type: z.literal("investigate"),
    params: z.object({ subject: z.string().min(1).max(500) }).strict(),
  }).strict(),
  GeneratedStepBaseSchema.extend({
    type: z.literal("generate"),
    params: z
      .object({
        angleId: PlanAngleIdSchema,
        count: z.number().int().min(1).max(20).optional(),
      })
      .strict(),
  }).strict(),
  GeneratedStepBaseSchema.extend({
    type: z.literal("score"),
    params: z.object({}).strict().default({}),
  }).strict(),
  GeneratedStepBaseSchema.extend({
    type: z.literal("debate"),
    params: z
      .object({
        ideaIndex: z.number().int().min(0).max(100).optional(),
        topN: z.number().int().min(1).max(10).optional(),
      })
      .strict(),
  }).strict(),
  GeneratedStepBaseSchema.extend({
    type: z.literal("artifact"),
    params: z
      .object({
        artifactType: z.enum(["prd", "user-story", "tech-spec", "pitch-outline", "okr"]),
      })
      .strict(),
  }).strict(),
  GeneratedStepBaseSchema.extend({
    type: z.literal("custom"),
    params: z.object({ instruction: z.string().min(1).max(2000) }).strict(),
  }).strict(),
]);

const GeneratedPlanSchema = z
  .object({
    steps: z.array(GeneratedExecutionStepSchema).min(1).max(12),
    explanation: z.string().max(1000).default(""),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): number {
  return Date.now();
}

const PLAN_GENERATION_PROMPT = `You are an innovation pipeline planner.
Given a user's natural-language request, break it into an ordered list of execution steps.

Available step types:
- "investigate" — research a subject (params: { subject: string })
- "generate"   — generate ideas for an angle (params: { angleId: string, count?: number })
- "score"      — score generated ideas (params: {})
- "debate"     — debate an idea (params: { ideaIndex?: number, topN?: number })
- "artifact"   — create a deliverable (params: { artifactType: "prd"|"user-story"|"tech-spec"|"pitch-outline"|"okr" })
- "custom"     — freeform step (params: { instruction: string })

Return ONLY a JSON object with this shape:
{
  "steps": [
    { "id": "<unique-id>", "type": "<step-type>", "description": "<what this step does>", "params": { ... } }
  ],
  "explanation": "<one-sentence summary of the plan>"
}`;

async function generateValidatedSteps(
  planningPrompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<{ steps: ExecutionStep[]; explanation: string }> {
  const generated = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: planningPrompt,
        model,
        signal,
      });

      const extracted = extractJson(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(extracted) as unknown;
      } catch {
        throw new LlmParseError("Failed to parse execution plan as JSON", extracted);
      }
      return GeneratedPlanSchema.parse(parsed);
    },
    { signal }
  );

  return {
    explanation: generated.explanation,
    steps: generated.steps.map((step) => ({
      id: step.id ?? uid(),
      type: step.type,
      description: step.description,
      params: step.params,
      status: "pending",
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Intent Parsing                                                            */
/* -------------------------------------------------------------------------- */

export async function parseInnovationIntent(
  prompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<ExecutionPlan> {
  const result = await generateExecutionPlan(prompt, model, signal);
  return result.plan;
}

/* -------------------------------------------------------------------------- */
/*  Plan Generation                                                           */
/* -------------------------------------------------------------------------- */

export async function generateExecutionPlan(
  prompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<PlanGenerationResult> {
  const generated = await generateValidatedSteps(
    `${PLAN_GENERATION_PROMPT}\n\nUser request:\n${wrapUserInput("request", prompt)}`,
    model,
    signal
  );

  const plan: ExecutionPlan = {
    id: uid(),
    prompt,
    steps: generated.steps,
    createdAt: now(),
    status: "pending",
  };

  return {
    plan,
    explanation: generated.explanation,
  };
}

/* -------------------------------------------------------------------------- */
/*  Step Execution                                                            */
/* -------------------------------------------------------------------------- */

interface ExecutionContext {
  subject: string;
  investigation?: Investigation;
  angleResults: AngleResult[];
  scoringResult?: ScoringResult;
  debateResults: DebateResult[];
  artifacts: Artifact[];
  model?: string;
  signal?: AbortSignal;
}

async function executeStep(
  step: ExecutionStep,
  ctx: ExecutionContext,
  onEvent: (event: StreamEvent) => void
): Promise<unknown> {
  const { type, params } = step;

  switch (type) {
    case "investigate": {
      const subject = (params.subject as string) ?? ctx.subject;
      ctx.subject = subject;
      const inv = await investigate(subject, ctx.model, ctx.signal);
      ctx.investigation = inv;
      return inv;
    }

    case "generate": {
      const angleId = PlanAngleIdSchema.parse(params.angleId ?? "scamper");
      if (!ctx.investigation) {
        onEvent({
          type: "step_progress",
          stepId: step.id,
          message: "Running investigation first…",
          timestamp: now(),
        });
        ctx.investigation = await investigate(ctx.subject, ctx.model, ctx.signal);
      }
      const result = await generateForAngle(
        ctx.subject,
        ctx.investigation!,
        angleId,
        ctx.model,
        ctx.signal
      );
      ctx.angleResults.push(result);
      return result;
    }

    case "score": {
      if (ctx.angleResults.length === 0) {
        throw new ValidationError("No ideas to score — run a generate step first.");
      }
      const sr = await scoreIdeas(
        ctx.subject,
        ctx.angleResults,
        ctx.investigation,
        ctx.model,
        ctx.signal
      );
      ctx.scoringResult = sr;
      return sr;
    }

    case "debate": {
      const allIdeas = ctx.angleResults.flatMap((ar) => ar.ideas);
      if (allIdeas.length === 0) {
        throw new ValidationError("No ideas to debate — run a generate step first.");
      }
      const topN = (params.topN as number) ?? 1;
      const ideaIndex = params.ideaIndex as number | undefined;
      const ideasToDebate: InnovationIdea[] =
        ideaIndex != null ? [allIdeas[ideaIndex]!] : allIdeas.slice(0, topN);

      const results: DebateResult[] = [];
      for (const idea of ideasToDebate) {
        onEvent({
          type: "step_progress",
          stepId: step.id,
          message: `Debating: ${idea.title}`,
          timestamp: now(),
        });
        const dr = await runDebate(idea, ctx.investigation, {
          model: ctx.model,
          signal: ctx.signal,
        });
        results.push(dr);
      }
      ctx.debateResults.push(...results);
      return results;
    }

    case "artifact": {
      const artifactType = (params.artifactType as ArtifactType) ?? "prd";
      const allIdeas = ctx.angleResults.flatMap((ar) => ar.ideas);
      if (allIdeas.length === 0) {
        throw new ValidationError("No ideas available — run a generate step first.");
      }
      const idea = allIdeas[0]!;
      const artifact = await generateArtifact(
        idea,
        artifactType,
        { subject: ctx.subject, investigation: ctx.investigation },
        ctx.model,
        ctx.signal
      );
      ctx.artifacts.push(artifact);
      return artifact;
    }

    case "custom": {
      const instruction = (params.instruction as string) ?? "";
      const response = await withRetry(
        () =>
          generateText({
            prompt: `You are an innovation assistant. Context subject: ${ctx.subject}\n\n${wrapUserInput("instruction", instruction)}`,
            model: ctx.model,
            signal: ctx.signal,
          }),
        { signal: ctx.signal }
      );
      return { instruction, response };
    }

    default:
      throw new PipelineError(`Unknown step type: ${type as string}`, String(type));
  }
}

/* -------------------------------------------------------------------------- */
/*  Streaming Execution                                                       */
/* -------------------------------------------------------------------------- */

export async function executeWithStreaming(
  plan: ExecutionPlan,
  onEvent: (event: StreamEvent) => void,
  options?: { model?: string; signal?: AbortSignal }
): Promise<void> {
  const ctx: ExecutionContext = {
    subject: "",
    angleResults: [],
    debateResults: [],
    artifacts: [],
    model: options?.model,
    signal: options?.signal,
  };

  // Infer subject from the first investigate step or the plan prompt
  const firstInvestigate = plan.steps.find((s) => s.type === "investigate");
  ctx.subject = (firstInvestigate?.params?.subject as string) ?? plan.prompt;

  plan.status = "running";

  onEvent({
    type: "plan_generated",
    plan: { ...plan },
    timestamp: now(),
  });

  const results: Record<string, unknown> = {};

  for (const step of plan.steps) {
    if (options?.signal?.aborted) {
      for (const pendingStep of plan.steps) {
        if (pendingStep.status === "pending") {
          pendingStep.status = "skipped";
        }
      }
      plan.status = "cancelled";
      break;
    }

    step.status = "running";
    onEvent({
      type: "step_started",
      stepId: step.id,
      description: step.description,
      timestamp: now(),
    });

    try {
      const result = await executeStep(step, ctx, onEvent);
      step.status = "completed";
      step.result = result;
      results[step.id] = result;

      onEvent({
        type: "step_completed",
        stepId: step.id,
        result,
        timestamp: now(),
      });
    } catch (err) {
      if (options?.signal?.aborted) {
        step.status = "skipped";
        for (const pendingStep of plan.steps) {
          if (pendingStep.status === "pending") {
            pendingStep.status = "skipped";
          }
        }
        plan.status = "cancelled";
        break;
      }

      const message = err instanceof Error ? err.message : String(err);
      step.status = "failed";
      step.error = message;

      onEvent({
        type: "step_failed",
        stepId: step.id,
        error: message,
        timestamp: now(),
      });
    }
  }

  if (plan.status !== "cancelled") {
    plan.status = plan.steps.every((s) => s.status === "completed" || s.status === "skipped")
      ? "completed"
      : "failed";
  }

  onEvent({
    type: "execution_completed",
    results,
    timestamp: now(),
  });
}

/* -------------------------------------------------------------------------- */
/*  Mid-Stream Correction                                                     */
/* -------------------------------------------------------------------------- */

export async function applyCorrection(
  plan: ExecutionPlan,
  correction: string,
  model?: string,
  signal?: AbortSignal
): Promise<ExecutionPlan> {
  const pendingSteps = plan.steps.filter((s) => s.status === "pending");
  const completedIds = plan.steps.filter((s) => s.status === "completed").map((s) => s.id);

  const generated = await generateValidatedSteps(
    `${PLAN_GENERATION_PROMPT}

The user wants to modify an in-progress plan.

Already completed step IDs: ${JSON.stringify(completedIds)}
Remaining steps: ${JSON.stringify(pendingSteps)}

User correction:
${wrapUserInput("correction", correction)}

Return the FULL updated list of remaining steps (do NOT include already-completed steps).`,
    model,
    signal
  );

  const retainedSteps = plan.steps.filter(
    (step) => step.status === "completed" || step.status === "running"
  );
  if (generated.steps.length > 12 - retainedSteps.length) {
    throw new ValidationError("Corrected execution plan exceeds the 12-step limit");
  }

  const validatedPlan = ExecutionPlanSchema.parse({
    ...plan,
    steps: [...retainedSteps, ...generated.steps],
  });
  plan.steps = validatedPlan.steps;

  return plan;
}

/* -------------------------------------------------------------------------- */
/*  Conversation Session                                                      */
/* -------------------------------------------------------------------------- */

export class ConversationSession {
  readonly id: string;
  private messages: ConversationMessage[] = [];
  private currentPlan: ExecutionPlan | null = null;
  private subject: string | null = null;
  private investigation: Investigation | null = null;
  private results: Record<string, unknown> = {};
  private model: string | undefined;
  readonly createdAt: number;

  constructor(model?: string) {
    this.id = uid();
    this.model = model;
    this.createdAt = now();
  }

  addMessage(role: ConversationMessage["role"], content: string): void {
    this.messages.push({ role, content, timestamp: now() });
  }

  getHistory(): ConversationMessage[] {
    return [...this.messages];
  }

  getCurrentPlan(): ExecutionPlan | null {
    return this.currentPlan;
  }

  getResults(): Record<string, unknown> {
    return { ...this.results };
  }

  async processMessage(prompt: string, onEvent?: (event: StreamEvent) => void): Promise<string> {
    this.addMessage("user", prompt);

    // If a plan is currently running, treat the message as a correction
    if (
      this.currentPlan &&
      this.currentPlan.status === "running" &&
      this.currentPlan.steps.some((s) => s.status === "pending")
    ) {
      const updated = await applyCorrection(this.currentPlan, prompt, this.model);
      this.currentPlan = updated;

      if (onEvent) {
        onEvent({
          type: "correction_applied",
          modification: prompt,
          updatedPlan: updated,
          timestamp: now(),
        });
      }

      const reply = "Plan updated. Remaining steps have been adjusted based on your correction.";
      this.addMessage("assistant", reply);
      return reply;
    }

    // Generate and execute a new plan
    const { plan, explanation } = await generateExecutionPlan(prompt, this.model);
    this.currentPlan = plan;

    // Infer subject
    const investigateStep = plan.steps.find((s) => s.type === "investigate");
    if (investigateStep?.params?.subject) {
      this.subject = investigateStep.params.subject as string;
    } else if (!this.subject) {
      this.subject = prompt;
    }

    const events: StreamEvent[] = [];
    const emit = (event: StreamEvent) => {
      events.push(event);
      onEvent?.(event);
    };

    await executeWithStreaming(plan, emit, { model: this.model });

    // Store results
    for (const step of plan.steps) {
      if (step.result !== undefined) {
        this.results[step.id] = step.result;
      }
    }

    // Keep investigation for future turns
    const invStep = plan.steps.find((s) => s.type === "investigate" && s.status === "completed");
    if (invStep?.result) {
      this.investigation = invStep.result as Investigation;
    }

    const reply = `${explanation}\n\nPlan completed with ${plan.steps.filter((s) => s.status === "completed").length}/${plan.steps.length} steps successful.`;
    this.addMessage("assistant", reply);
    return reply;
  }

  toState(): ConversationSessionState {
    return {
      id: this.id,
      messages: this.getHistory(),
      currentPlan: this.currentPlan,
      subject: this.subject,
      investigation: this.investigation,
      results: this.results,
      createdAt: this.createdAt,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Markdown Export                                                            */
/* -------------------------------------------------------------------------- */

export function conversationToMarkdown(session: ConversationSession): string {
  const state = session.toState();
  const lines: string[] = [];

  lines.push(`# Innovation Conversation`);
  lines.push("");
  lines.push(`**Session:** ${state.id}`);
  lines.push(`**Created:** ${new Date(state.createdAt).toISOString()}`);
  if (state.subject) {
    lines.push(`**Subject:** ${state.subject}`);
  }
  lines.push("");

  lines.push("## Conversation");
  lines.push("");

  for (const msg of state.messages) {
    const ts = new Date(msg.timestamp).toLocaleTimeString();
    const label =
      msg.role === "user" ? "🧑 User" : msg.role === "assistant" ? "🤖 Assistant" : "⚙️ System";
    lines.push(`### ${label} (${ts})`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
  }

  if (state.currentPlan) {
    lines.push("## Execution Plan");
    lines.push("");
    lines.push(`**Prompt:** ${state.currentPlan.prompt}`);
    lines.push(`**Status:** ${state.currentPlan.status}`);
    lines.push("");

    lines.push("| # | Type | Description | Status |");
    lines.push("|---|------|-------------|--------|");
    for (let i = 0; i < state.currentPlan.steps.length; i++) {
      const s = state.currentPlan.steps[i]!;
      const icon =
        s.status === "completed"
          ? "✅"
          : s.status === "failed"
            ? "❌"
            : s.status === "running"
              ? "🔄"
              : s.status === "skipped"
                ? "⏭️"
                : "⏳";
      lines.push(`| ${i + 1} | ${s.type} | ${s.description} | ${icon} ${s.status} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Smart Defaults — subject classification → pipeline config                 */
/* -------------------------------------------------------------------------- */

export interface SmartDefaults {
  suggestedAngles: string[];
  depth: "quick" | "standard" | "deep";
  suggestedArtifacts: string[];
  estimatedSteps: number;
  classification: string;
}

const DOMAIN_DEFAULTS: Record<string, Partial<SmartDefaults>> = {
  technology: {
    suggestedAngles: ["first-principles", "cross-domain", "trend-collision"],
    suggestedArtifacts: ["tech-spec", "prd"],
  },
  business: {
    suggestedAngles: ["scamper", "constraints", "perspectives"],
    suggestedArtifacts: ["prd", "pitch-outline", "okr"],
  },
  creative: {
    suggestedAngles: ["what-if", "inversion", "cross-domain"],
    suggestedArtifacts: ["pitch-outline"],
  },
  science: {
    suggestedAngles: ["first-principles", "constraints", "inversion"],
    suggestedArtifacts: ["tech-spec"],
  },
  social: {
    suggestedAngles: ["perspectives", "what-if", "trend-collision"],
    suggestedArtifacts: ["prd", "user-story"],
  },
};

/**
 * Classify a subject and generate smart pipeline defaults.
 */
export function getSmartDefaults(subject: string): SmartDefaults {
  const lower = subject.toLowerCase();

  const techKeywords = [
    "software",
    "api",
    "algorithm",
    "code",
    "platform",
    "app",
    "system",
    "database",
  ];
  const businessKeywords = [
    "market",
    "revenue",
    "customer",
    "strategy",
    "growth",
    "product",
    "startup",
  ];
  const creativeKeywords = ["design", "art", "brand", "story", "content", "media", "creative"];
  const scienceKeywords = ["research", "experiment", "data", "analysis", "hypothesis", "model"];
  const socialKeywords = ["community", "education", "health", "sustainability", "social", "impact"];

  const scores: Record<string, number> = {
    technology: techKeywords.filter((k) => lower.includes(k)).length,
    business: businessKeywords.filter((k) => lower.includes(k)).length,
    creative: creativeKeywords.filter((k) => lower.includes(k)).length,
    science: scienceKeywords.filter((k) => lower.includes(k)).length,
    social: socialKeywords.filter((k) => lower.includes(k)).length,
  };

  const classification = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "technology";
  const defaults = DOMAIN_DEFAULTS[classification] ?? DOMAIN_DEFAULTS.technology!;

  const wordCount = subject.split(/\s+/).length;
  const depth: SmartDefaults["depth"] =
    wordCount < 10 ? "quick" : wordCount < 50 ? "standard" : "deep";

  const angleCount = depth === "quick" ? 2 : depth === "standard" ? 3 : 5;

  return {
    suggestedAngles: defaults.suggestedAngles ?? ["scamper", "first-principles"],
    depth,
    suggestedArtifacts: defaults.suggestedArtifacts ?? ["prd"],
    estimatedSteps: angleCount + 2, // investigate + generate*N + synthesize
    classification,
  };
}

/* -------------------------------------------------------------------------- */
/*  Follow-up Suggestions                                                     */
/* -------------------------------------------------------------------------- */

export interface FollowUpSuggestion {
  prompt: string;
  description: string;
  type: "deepen" | "pivot" | "refine" | "artifact" | "compare";
}

/**
 * Generate contextual follow-up suggestions based on conversation state.
 */
export function generateFollowUps(session: ConversationSession): FollowUpSuggestion[] {
  const state = session.toState();
  const suggestions: FollowUpSuggestion[] = [];

  if (!state.currentPlan || state.currentPlan.status !== "completed") {
    return suggestions;
  }

  const hasInvestigation = state.currentPlan.steps.some(
    (s) => s.type === "investigate" && s.status === "completed"
  );
  const hasGeneration = state.currentPlan.steps.some(
    (s) => s.type === "generate" && s.status === "completed"
  );
  const hasArtifact = state.currentPlan.steps.some(
    (s) => s.type === "artifact" && s.status === "completed"
  );

  if (hasGeneration && !hasArtifact) {
    suggestions.push({
      prompt: "Create a PRD from the best idea",
      description: "Generate a Product Requirements Document",
      type: "artifact",
    });
    suggestions.push({
      prompt: "Create a technical specification for the top idea",
      description: "Generate a detailed tech spec",
      type: "artifact",
    });
  }

  if (hasInvestigation && hasGeneration) {
    suggestions.push({
      prompt: "Debate the top 3 ideas with pros and cons",
      description: "Run a structured debate on the strongest ideas",
      type: "deepen",
    });
    suggestions.push({
      prompt: "Explore this from a completely different angle using inversion thinking",
      description: "Re-approach with inverse assumptions",
      type: "pivot",
    });
  }

  if (state.subject) {
    suggestions.push({
      prompt: `What if we combined the top ideas into a single concept?`,
      description: "Synthesize ideas into a unified approach",
      type: "refine",
    });
  }

  return suggestions.slice(0, 4);
}

/* -------------------------------------------------------------------------- */
/*  Session Store                                                              */
/* -------------------------------------------------------------------------- */

const sessionStore = new Map<string, ConversationSession>();

/** Create and store a conversation session. */
export function createConversationSession(model?: string): ConversationSession {
  const session = new ConversationSession(model);
  sessionStore.set(session.id, session);
  return session;
}

/** Retrieve a stored conversation session. */
export function getConversationSession(id: string): ConversationSession | undefined {
  return sessionStore.get(id);
}

/** Clear all stored sessions (for testing). */
export function clearConversationSessions(): void {
  sessionStore.clear();
}
