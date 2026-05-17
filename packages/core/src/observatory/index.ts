/**
 * @module observatory
 *
 * Prompt Observatory — captures and analyzes all LLM calls.
 * Records prompt text, token counts, latency, model, and response quality.
 * Provides timeline, usage charts, prompt diffs, and A/B comparison workflows.
 */

import { z } from "zod";

// ---- Schemas ----

export const PromptCallSchema = z.object({
  id: z.string().max(100),
  timestamp: z.string(),
  promptText: z.string().max(50000),
  responseText: z.string().max(50000),
  model: z.string().max(100),
  inputTokens: z.number(),
  outputTokens: z.number(),
  latencyMs: z.number(),
  qualityScore: z.number().min(0).max(100).optional(),
  stage: z
    .string()
    .max(100)
    .optional()
    .describe("Pipeline stage: investigate, generate, synthesize"),
  metadata: z.record(z.string()).optional(),
});

export const PromptDiffSchema = z.object({
  callIdA: z.string(),
  callIdB: z.string(),
  promptDiff: z.array(
    z.object({
      type: z.enum(["added", "removed", "unchanged"]),
      text: z.string().max(10000),
    })
  ),
  tokenDiff: z.object({
    inputDelta: z.number(),
    outputDelta: z.number(),
  }),
  latencyDiff: z.number(),
  qualityDiff: z.number().optional(),
});

export const ObservatoryStatsSchema = z.object({
  totalCalls: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  averageLatencyMs: z.number(),
  averageQuality: z.number(),
  callsByModel: z.record(z.number()),
  callsByStage: z.record(z.number()),
  tokensByModel: z.record(z.number()),
  qualityDistribution: z.array(
    z.object({
      bucket: z.string(),
      count: z.number(),
    })
  ),
});

export const ABComparisonSchema = z.object({
  promptA: z.string().max(50000),
  promptB: z.string().max(50000),
  resultA: PromptCallSchema.optional(),
  resultB: PromptCallSchema.optional(),
  winner: z.enum(["A", "B", "tie"]).optional(),
});

export type PromptCall = z.infer<typeof PromptCallSchema>;
export type PromptDiff = z.infer<typeof PromptDiffSchema>;
export type ObservatoryStats = z.infer<typeof ObservatoryStatsSchema>;
export type ABComparison = z.infer<typeof ABComparisonSchema>;

// ---- In-Memory Store ----

const callLog: PromptCall[] = [];
let captureEnabled = true;
let idCounter = 0;

// ---- Capture Functions ----

/**
 * Enable or disable prompt capture.
 */
export function setObservatoryEnabled(enabled: boolean): void {
  captureEnabled = enabled;
}

/** Check if observatory capture is enabled. */
export function isObservatoryEnabled(): boolean {
  return captureEnabled;
}

/**
 * Record a prompt call. Use this as a wrapper around LLM calls.
 */
export function recordPromptCall(call: Omit<PromptCall, "id" | "timestamp">): PromptCall {
  const record: PromptCall = {
    ...call,
    id: `obs-${++idCounter}-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
  };

  if (captureEnabled) {
    callLog.push(record);
  }

  return record;
}

/**
 * Wrap a generateText call with observatory recording.
 */
export async function observeCall<T>(
  stage: string,
  model: string,
  promptText: string,
  execute: () => Promise<T>,
  scoreResponse?: (result: T) => number
): Promise<{ result: T; call: PromptCall }> {
  const start = Date.now();
  const result = await execute();
  const latencyMs = Date.now() - start;

  const responseText = typeof result === "string" ? result : JSON.stringify(result);
  const qualityScore = scoreResponse ? scoreResponse(result) : undefined;

  const call = recordPromptCall({
    promptText,
    responseText,
    model: model || "unknown",
    inputTokens: estimateTokens(promptText),
    outputTokens: estimateTokens(responseText),
    latencyMs,
    qualityScore,
    stage,
  });

  return { result, call };
}

/** Simple token count estimator (chars / 4). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---- Query Functions ----

/**
 * Get the call timeline, optionally filtered by time range.
 */
export function getCallTimeline(options?: {
  since?: string;
  limit?: number;
  stage?: string;
  model?: string;
}): PromptCall[] {
  let results = [...callLog];

  if (options?.since) {
    results = results.filter((c) => c.timestamp >= options.since!);
  }
  if (options?.stage) {
    results = results.filter((c) => c.stage === options.stage);
  }
  if (options?.model) {
    results = results.filter((c) => c.model === options.model);
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (options?.limit) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * Get a specific call by ID.
 */
export function getPromptCallById(id: string): PromptCall | undefined {
  return callLog.find((c) => c.id === id);
}

/**
 * Get aggregate observatory statistics.
 */
export function getObservatoryStats(): ObservatoryStats {
  const totalCalls = callLog.length;
  const totalInputTokens = callLog.reduce((s, c) => s + c.inputTokens, 0);
  const totalOutputTokens = callLog.reduce((s, c) => s + c.outputTokens, 0);
  const avgLatency = totalCalls > 0 ? callLog.reduce((s, c) => s + c.latencyMs, 0) / totalCalls : 0;

  const qualityScores = callLog
    .filter((c) => c.qualityScore !== undefined)
    .map((c) => c.qualityScore!);
  const avgQuality =
    qualityScores.length > 0 ? qualityScores.reduce((s, q) => s + q, 0) / qualityScores.length : 0;

  const callsByModel: Record<string, number> = {};
  const callsByStage: Record<string, number> = {};
  const tokensByModel: Record<string, number> = {};

  for (const call of callLog) {
    callsByModel[call.model] = (callsByModel[call.model] ?? 0) + 1;
    tokensByModel[call.model] =
      (tokensByModel[call.model] ?? 0) + call.inputTokens + call.outputTokens;
    if (call.stage) {
      callsByStage[call.stage] = (callsByStage[call.stage] ?? 0) + 1;
    }
  }

  const buckets = ["0-20", "21-40", "41-60", "61-80", "81-100"];
  const qualityDistribution = buckets.map((bucket) => {
    const [min, max] = bucket.split("-").map(Number);
    return {
      bucket,
      count: qualityScores.filter((q) => q >= min && q <= max).length,
    };
  });

  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    averageLatencyMs: Math.round(avgLatency),
    averageQuality: Math.round(avgQuality * 10) / 10,
    callsByModel,
    callsByStage,
    tokensByModel,
    qualityDistribution,
  };
}

// ---- Diff & Comparison ----

/**
 * Compare two prompt calls and produce a diff.
 */
export function diffPromptCalls(callIdA: string, callIdB: string): PromptDiff | null {
  const callA = callLog.find((c) => c.id === callIdA);
  const callB = callLog.find((c) => c.id === callIdB);
  if (!callA || !callB) return null;

  const linesA = callA.promptText.split("\n");
  const linesB = callB.promptText.split("\n");

  // Simple line-level diff
  const promptDiff: PromptDiff["promptDiff"] = [];
  const maxLen = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLen; i++) {
    const lineA = linesA[i];
    const lineB = linesB[i];

    if (lineA === lineB) {
      if (lineA !== undefined) promptDiff.push({ type: "unchanged", text: lineA });
    } else {
      if (lineA !== undefined) promptDiff.push({ type: "removed", text: lineA });
      if (lineB !== undefined) promptDiff.push({ type: "added", text: lineB });
    }
  }

  return {
    callIdA,
    callIdB,
    promptDiff,
    tokenDiff: {
      inputDelta: callB.inputTokens - callA.inputTokens,
      outputDelta: callB.outputTokens - callA.outputTokens,
    },
    latencyDiff: callB.latencyMs - callA.latencyMs,
    qualityDiff:
      callA.qualityScore !== undefined && callB.qualityScore !== undefined
        ? callB.qualityScore - callA.qualityScore
        : undefined,
  };
}

/**
 * Create an A/B comparison record for side-by-side prompt testing.
 */
export function createABComparison(promptA: string, promptB: string): ABComparison {
  return { promptA, promptB };
}

/** Clear all observatory data (for testing). */
export function clearObservatory(): void {
  callLog.length = 0;
  idCounter = 0;
}
