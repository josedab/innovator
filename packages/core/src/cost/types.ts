import { z } from "zod";

/** Per-model pricing in USD per 1K tokens. */
export interface ModelPricing {
  modelId: string;
  inputPer1k: number;
  outputPer1k: number;
}

/** Schema for a single token usage record. */
export const TokenUsageSchema = z.object({
  id: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  stage: z.string(),
  timestamp: z.string(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** Aggregated cost summary for a session. */
export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  callCount: number;
  byModel: Record<
    string,
    { inputTokens: number; outputTokens: number; costUsd: number; calls: number }
  >;
  byStage: Record<
    string,
    { inputTokens: number; outputTokens: number; costUsd: number; calls: number }
  >;
}

/** Budget configuration. */
export interface BudgetConfig {
  /** Maximum cost in USD for the session. */
  maxCostUsd: number;
  /** Optional AbortController to signal when budget is exceeded. */
  abortController?: AbortController;
}
