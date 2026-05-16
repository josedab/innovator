/**
 * @module replay/reasoning-debugger
 *
 * Step-by-step session replay debugger with LLM reasoning traces.
 * Records chain-of-thought reasoning at each pipeline step, enables
 * inspection of why the LLM made specific decisions, and supports
 * fork-and-explore from any reasoning step.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const ReasoningStepSchema = z.object({
  id: z.string().max(100),
  sessionId: z.string().max(200),
  stepIndex: z.number().int().min(0),
  stage: z.enum(["investigation", "generation", "synthesis", "validation", "refinement"]),
  angleId: z.string().max(100).optional(),
  /** The prompt sent to the LLM (truncated for storage). */
  promptSummary: z.string().max(2000),
  /** LLM's chain-of-thought reasoning extracted from response. */
  reasoning: z.string().max(5000),
  /** Key decisions made at this step. */
  decisions: z
    .array(
      z.object({
        question: z.string().max(500),
        answer: z.string().max(1000),
        confidence: z.number().min(0).max(1),
        alternatives: z.array(z.string().max(500)).max(5),
      })
    )
    .max(10),
  /** Inputs consumed at this step. */
  inputs: z.record(z.string().max(2000)).optional(),
  /** Outputs produced at this step. */
  outputs: z.record(z.string().max(2000)).optional(),
  /** Model and performance metadata. */
  metadata: z
    .object({
      model: z.string().max(100).optional(),
      durationMs: z.number().optional(),
      tokenCount: z.number().optional(),
      temperature: z.number().optional(),
    })
    .optional(),
  timestamp: z.string(),
});

export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

export const DebugSessionSchema = z.object({
  id: z.string().max(200),
  subject: z.string().max(1000),
  steps: z.array(ReasoningStepSchema),
  forks: z.array(
    z.object({
      id: z.string().max(100),
      fromStepIndex: z.number().int().min(0),
      altDecision: z.string().max(1000),
      childSessionId: z.string().max(200),
      result: z.string().max(5000).optional(),
      createdAt: z.string(),
    })
  ),
  status: z.enum(["recording", "completed", "paused"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});

export type DebugSession = z.infer<typeof DebugSessionSchema>;

// ---- In-memory stores ----

const debugSessions = new Map<string, DebugSession>();

// ---- Session Management ----

/** Start recording a new debug session. */
export function startDebugSession(subject: string, sessionId?: string): DebugSession {
  const session: DebugSession = {
    id: sessionId ?? `debug-${randomUUID().slice(0, 12)}`,
    subject,
    steps: [],
    forks: [],
    status: "recording",
    startedAt: new Date().toISOString(),
  };
  debugSessions.set(session.id, session);
  return session;
}

/** Record a reasoning step in the debug session. */
export function recordReasoningStep(
  sessionId: string,
  step: Omit<ReasoningStep, "id" | "sessionId" | "stepIndex" | "timestamp">
): ReasoningStep | undefined {
  const session = debugSessions.get(sessionId);
  if (!session || session.status !== "recording") return undefined;

  const recorded: ReasoningStep = {
    ...step,
    id: `rstep-${randomUUID().slice(0, 8)}`,
    sessionId,
    stepIndex: session.steps.length,
    timestamp: new Date().toISOString(),
  };

  session.steps.push(recorded);
  return recorded;
}

/** Complete a debug session. */
export function completeDebugSession(sessionId: string): DebugSession | undefined {
  const session = debugSessions.get(sessionId);
  if (!session) return undefined;
  session.status = "completed";
  session.completedAt = new Date().toISOString();
  return session;
}

/** Get a debug session by ID. */
export function getDebugSession(sessionId: string): DebugSession | undefined {
  return debugSessions.get(sessionId);
}

/** List all debug sessions. */
export function listDebugSessions(): Array<{
  id: string;
  subject: string;
  status: DebugSession["status"];
  stepCount: number;
  forkCount: number;
  startedAt: string;
}> {
  return Array.from(debugSessions.values()).map((s) => ({
    id: s.id,
    subject: s.subject,
    status: s.status,
    stepCount: s.steps.length,
    forkCount: s.forks.length,
    startedAt: s.startedAt,
  }));
}

/** Remove a debug session. */
export function removeDebugSession(sessionId: string): boolean {
  return debugSessions.delete(sessionId);
}

/** Clear all debug sessions. */
export function clearDebugSessions(): void {
  debugSessions.clear();
}

// ---- Reasoning Trace Analysis ----

/**
 * Use LLM to extract structured reasoning from a raw LLM response.
 * This analyzes why the LLM made specific choices at a pipeline step.
 */
export async function extractReasoningTrace(
  promptSummary: string,
  rawResponse: string,
  stage: ReasoningStep["stage"],
  model?: string,
  signal?: AbortSignal
): Promise<{
  reasoning: string;
  decisions: ReasoningStep["decisions"];
}> {
  const analysisPrompt = `Analyze this LLM interaction and extract the reasoning chain.

Stage: ${stage}
Prompt Summary: ${wrapUserInput("PROMPT", promptSummary.slice(0, 1000))}
Response: ${wrapUserInput("RESPONSE", sanitizeLlmOutput(rawResponse).slice(0, 2000))}

Extract:
1. The chain-of-thought reasoning (what was considered and why)
2. Key decisions made (what questions were implicitly answered)
3. Alternative paths that could have been taken

Respond in JSON:
{
  "reasoning": "Step-by-step reasoning explanation...",
  "decisions": [
    {
      "question": "What was being decided?",
      "answer": "What was chosen and why",
      "confidence": 0.0-1.0,
      "alternatives": ["other options considered"]
    }
  ]
}`;

  return withRetry(
    async () => {
      const raw = await generateText({ prompt: analysisPrompt, model, signal });
      const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
      return {
        reasoning: String(parsed.reasoning ?? "").slice(0, 5000),
        decisions: (parsed.decisions ?? [])
          .slice(0, 10)
          .map(
            (d: {
              question?: string;
              answer?: string;
              confidence?: number;
              alternatives?: string[];
            }) => ({
              question: String(d.question ?? "").slice(0, 500),
              answer: String(d.answer ?? "").slice(0, 1000),
              confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0.5)),
              alternatives: (d.alternatives ?? [])
                .slice(0, 5)
                .map((a: string) => String(a).slice(0, 500)),
            })
          ),
      };
    },
    { signal }
  );
}

// ---- Fork and Explore ----

/**
 * Fork from a specific reasoning step, exploring an alternative decision.
 * Creates a child session that simulates what would happen with a different choice.
 */
export async function forkFromStep(
  sessionId: string,
  stepIndex: number,
  altDecision: string,
  model?: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  const session = debugSessions.get(sessionId);
  if (!session) return undefined;

  const step = session.steps[stepIndex];
  if (!step) return undefined;

  const forkId = `fork-${randomUUID().slice(0, 8)}`;
  const childSessionId = `debug-fork-${randomUUID().slice(0, 8)}`;

  // Use LLM to simulate the alternative path
  const forkPrompt = `You are simulating an alternative path in an innovation pipeline.

Original session subject: ${wrapUserInput("SUBJECT", session.subject)}
Step that is being forked: ${step.stage} (step ${stepIndex})
Original reasoning: ${wrapUserInput("REASONING", step.reasoning.slice(0, 1000))}
Original decisions: ${step.decisions.map((d) => `${d.question}: ${d.answer}`).join("\n")}

Alternative decision to explore: ${wrapUserInput("ALT", altDecision)}

Simulate what would happen if the alternative decision was taken instead.
Consider downstream effects on subsequent pipeline stages.

Respond in JSON:
{
  "simulatedResult": "Detailed description of the likely outcome...",
  "impactAssessment": "How this changes the overall pipeline output...",
  "divergenceScore": 0.0-1.0,
  "newIdeas": ["any new ideas this path would surface"]
}`;

  let result = "Fork simulation unavailable";

  try {
    const raw = await withRetry(async () => generateText({ prompt: forkPrompt, model, signal }), {
      signal,
    });
    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    result = [
      `**Simulated Result:** ${parsed.simulatedResult ?? "N/A"}`,
      `**Impact:** ${parsed.impactAssessment ?? "N/A"}`,
      `**Divergence:** ${((parsed.divergenceScore ?? 0) * 100).toFixed(0)}%`,
      parsed.newIdeas?.length ? `**New Ideas:** ${parsed.newIdeas.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    // Fork simulation failed — record with placeholder
  }

  session.forks.push({
    id: forkId,
    fromStepIndex: stepIndex,
    altDecision,
    childSessionId,
    result,
    createdAt: new Date().toISOString(),
  });

  return forkId;
}

// ---- Step Navigator ----

export interface StepView {
  step: ReasoningStep;
  hasPrev: boolean;
  hasNext: boolean;
  forks: DebugSession["forks"];
  totalSteps: number;
}

/** Get a navigable view of a specific step. */
export function getStepView(sessionId: string, stepIndex: number): StepView | undefined {
  const session = debugSessions.get(sessionId);
  if (!session || stepIndex < 0 || stepIndex >= session.steps.length) return undefined;

  return {
    step: session.steps[stepIndex],
    hasPrev: stepIndex > 0,
    hasNext: stepIndex < session.steps.length - 1,
    forks: session.forks.filter((f) => f.fromStepIndex === stepIndex),
    totalSteps: session.steps.length,
  };
}

/** Format a debug session as markdown for terminal/export display. */
export function debugSessionToMarkdown(sessionId: string): string {
  const session = debugSessions.get(sessionId);
  if (!session) return "Debug session not found.";

  const lines: string[] = [
    `# 🔍 Innovation Replay Debugger`,
    "",
    `**Subject:** ${session.subject}`,
    `**Status:** ${session.status}`,
    `**Steps:** ${session.steps.length}`,
    `**Forks:** ${session.forks.length}`,
    `**Started:** ${session.startedAt}`,
    "",
  ];

  for (const step of session.steps) {
    lines.push(
      `## Step ${step.stepIndex}: ${step.stage}${step.angleId ? ` (${step.angleId})` : ""}`
    );
    lines.push("");
    lines.push(`**Reasoning:** ${step.reasoning.slice(0, 500)}`);
    lines.push("");

    if (step.decisions.length > 0) {
      lines.push("**Decisions:**");
      for (const d of step.decisions) {
        lines.push(`- ❓ ${d.question}`);
        lines.push(`  ✅ ${d.answer} (confidence: ${(d.confidence * 100).toFixed(0)}%)`);
        if (d.alternatives.length > 0) {
          lines.push(`  🔀 Alternatives: ${d.alternatives.join(", ")}`);
        }
      }
      lines.push("");
    }

    const stepForks = session.forks.filter((f) => f.fromStepIndex === step.stepIndex);
    if (stepForks.length > 0) {
      lines.push(`**Forks from this step:** ${stepForks.length}`);
      for (const fork of stepForks) {
        lines.push(`- 🔀 "${fork.altDecision}" → ${fork.result?.slice(0, 200) ?? "pending"}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
