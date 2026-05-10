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
import { wrapUserInput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/index.js";
import { generateForAngle } from "../innovation/index.js";
import { scoreIdeas } from "../scoring/index.js";
import { runDebate } from "../debate/index.js";
import { generateArtifact } from "../artifacts/index.js";
import type {
  Investigation,
  AngleResult,
  InnovationIdea,
  AngleId,
} from "../types.js";
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
  id: z.string(),
  type: z.enum([
    "investigate",
    "generate",
    "score",
    "debate",
    "artifact",
    "custom",
  ]),
  description: z.string(),
  params: z.record(z.unknown()).default({}),
  status: z
    .enum(["pending", "running", "completed", "failed", "skipped"])
    .default("pending"),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionPlanSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  steps: z.array(ExecutionStepSchema),
  createdAt: z.number(),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .default("pending"),
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
  explanation: z.string(),
});
export type PlanGenerationResult = z.infer<typeof PlanGenerationResultSchema>;

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

/* -------------------------------------------------------------------------- */
/*  Intent Parsing                                                            */
/* -------------------------------------------------------------------------- */

export async function parseInnovationIntent(
  prompt: string,
  model?: string,
): Promise<ExecutionPlan> {
  const result = await generateExecutionPlan(prompt, model);
  return result.plan;
}

/* -------------------------------------------------------------------------- */
/*  Plan Generation                                                           */
/* -------------------------------------------------------------------------- */

export async function generateExecutionPlan(
  prompt: string,
  model?: string,
): Promise<PlanGenerationResult> {
  const raw = await withRetry(() =>
    generateText({
      prompt: `${PLAN_GENERATION_PROMPT}\n\nUser request:\n${wrapUserInput("request", prompt)}`,
      model,
    }),
  );

  const json = JSON.parse(extractJson(raw));
  const steps: ExecutionStep[] = (json.steps ?? []).map(
    (s: Record<string, unknown>) => ({
      id: (s.id as string) ?? uid(),
      type: s.type as ExecutionStep["type"],
      description: (s.description as string) ?? "",
      params: (s.params as Record<string, unknown>) ?? {},
      status: "pending" as const,
    }),
  );

  const plan: ExecutionPlan = {
    id: uid(),
    prompt,
    steps,
    createdAt: now(),
    status: "pending",
  };

  return {
    plan,
    explanation: (json.explanation as string) ?? "",
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
  onEvent: (event: StreamEvent) => void,
): Promise<unknown> {
  const { type, params } = step;

  switch (type) {
    case "investigate": {
      const subject = (params.subject as string) ?? ctx.subject;
      ctx.subject = subject;
      const inv = await withRetry(
        () => investigate(subject, ctx.model, ctx.signal),
        { signal: ctx.signal },
      );
      ctx.investigation = inv;
      return inv;
    }

    case "generate": {
      const angleId = (params.angleId as string) ?? "scamper";
      if (!ctx.investigation) {
        onEvent({
          type: "step_progress",
          stepId: step.id,
          message: "Running investigation first…",
          timestamp: now(),
        });
        ctx.investigation = await withRetry(
          () => investigate(ctx.subject, ctx.model, ctx.signal),
          { signal: ctx.signal },
        );
      }
      const result = await withRetry(
        () =>
          generateForAngle(
            ctx.subject,
            ctx.investigation!,
            angleId as AngleId,
            ctx.model,
            ctx.signal,
          ),
        { signal: ctx.signal },
      );
      ctx.angleResults.push(result);
      return result;
    }

    case "score": {
      if (ctx.angleResults.length === 0) {
        throw new Error("No ideas to score — run a generate step first.");
      }
      const sr = await withRetry(
        () =>
          scoreIdeas(
            ctx.subject,
            ctx.angleResults,
            ctx.investigation,
            ctx.model,
            ctx.signal,
          ),
        { signal: ctx.signal },
      );
      ctx.scoringResult = sr;
      return sr;
    }

    case "debate": {
      const allIdeas = ctx.angleResults.flatMap((ar) => ar.ideas);
      if (allIdeas.length === 0) {
        throw new Error("No ideas to debate — run a generate step first.");
      }
      const topN = (params.topN as number) ?? 1;
      const ideaIndex = params.ideaIndex as number | undefined;
      const ideasToDebate: InnovationIdea[] = ideaIndex != null
        ? [allIdeas[ideaIndex]!]
        : allIdeas.slice(0, topN);

      const results: DebateResult[] = [];
      for (const idea of ideasToDebate) {
        onEvent({
          type: "step_progress",
          stepId: step.id,
          message: `Debating: ${idea.title}`,
          timestamp: now(),
        });
        const dr = await withRetry(
          () => runDebate(idea, ctx.investigation, { model: ctx.model }),
          { signal: ctx.signal },
        );
        results.push(dr);
      }
      ctx.debateResults.push(...results);
      return results;
    }

    case "artifact": {
      const artifactType = (params.artifactType as ArtifactType) ?? "prd";
      const allIdeas = ctx.angleResults.flatMap((ar) => ar.ideas);
      if (allIdeas.length === 0) {
        throw new Error("No ideas available — run a generate step first.");
      }
      const idea = allIdeas[0]!;
      const artifact = await withRetry(
        () =>
          generateArtifact(
            idea,
            artifactType,
            { subject: ctx.subject, investigation: ctx.investigation },
            ctx.model,
            ctx.signal,
          ),
        { signal: ctx.signal },
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
        { signal: ctx.signal },
      );
      return { instruction, response };
    }

    default:
      throw new Error(`Unknown step type: ${type as string}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Streaming Execution                                                       */
/* -------------------------------------------------------------------------- */

export async function executeWithStreaming(
  plan: ExecutionPlan,
  onEvent: (event: StreamEvent) => void,
  options?: { model?: string; signal?: AbortSignal },
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
  ctx.subject =
    (firstInvestigate?.params?.subject as string) ?? plan.prompt;

  plan.status = "running";

  onEvent({
    type: "plan_generated",
    plan: { ...plan },
    timestamp: now(),
  });

  const results: Record<string, unknown> = {};

  for (const step of plan.steps) {
    if (options?.signal?.aborted) {
      step.status = "skipped";
      continue;
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

  plan.status = plan.steps.every(
    (s) => s.status === "completed" || s.status === "skipped",
  )
    ? "completed"
    : "failed";

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
): Promise<ExecutionPlan> {
  const pendingSteps = plan.steps.filter((s) => s.status === "pending");
  const completedIds = plan.steps
    .filter((s) => s.status === "completed")
    .map((s) => s.id);

  const raw = await withRetry(() =>
    generateText({
      prompt: `${PLAN_GENERATION_PROMPT}

The user wants to modify an in-progress plan.

Already completed step IDs: ${JSON.stringify(completedIds)}
Remaining steps: ${JSON.stringify(pendingSteps)}

User correction:
${wrapUserInput("correction", correction)}

Return the FULL updated list of remaining steps (do NOT include already-completed steps).`,
      model,
    }),
  );

  const json = JSON.parse(extractJson(raw));
  const updatedSteps: ExecutionStep[] = (json.steps ?? []).map(
    (s: Record<string, unknown>) => ({
      id: (s.id as string) ?? uid(),
      type: s.type as ExecutionStep["type"],
      description: (s.description as string) ?? "",
      params: (s.params as Record<string, unknown>) ?? {},
      status: "pending" as const,
    }),
  );

  // Keep completed/running steps, replace pending ones
  plan.steps = [
    ...plan.steps.filter(
      (s) => s.status === "completed" || s.status === "running",
    ),
    ...updatedSteps,
  ];

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

  async processMessage(
    prompt: string,
    onEvent?: (event: StreamEvent) => void,
  ): Promise<string> {
    this.addMessage("user", prompt);

    // If a plan is currently running, treat the message as a correction
    if (
      this.currentPlan &&
      this.currentPlan.status === "running" &&
      this.currentPlan.steps.some((s) => s.status === "pending")
    ) {
      const updated = await applyCorrection(
        this.currentPlan,
        prompt,
        this.model,
      );
      this.currentPlan = updated;

      if (onEvent) {
        onEvent({
          type: "correction_applied",
          modification: prompt,
          updatedPlan: updated,
          timestamp: now(),
        });
      }

      const reply =
        "Plan updated. Remaining steps have been adjusted based on your correction.";
      this.addMessage("assistant", reply);
      return reply;
    }

    // Generate and execute a new plan
    const { plan, explanation } = await generateExecutionPlan(
      prompt,
      this.model,
    );
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
    const invStep = plan.steps.find(
      (s) => s.type === "investigate" && s.status === "completed",
    );
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
  lines.push(
    `**Created:** ${new Date(state.createdAt).toISOString()}`,
  );
  if (state.subject) {
    lines.push(`**Subject:** ${state.subject}`);
  }
  lines.push("");

  lines.push("## Conversation");
  lines.push("");

  for (const msg of state.messages) {
    const ts = new Date(msg.timestamp).toLocaleTimeString();
    const label =
      msg.role === "user"
        ? "🧑 User"
        : msg.role === "assistant"
          ? "🤖 Assistant"
          : "⚙️ System";
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
      lines.push(
        `| ${i + 1} | ${s.type} | ${s.description} | ${icon} ${s.status} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
