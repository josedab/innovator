/**
 * @module autonomous-agent/convergence
 *
 * Convergence detection for autonomous innovation cycles.
 * Monitors idea novelty, score plateaus, and topic exhaustion
 * to determine when further exploration yields diminishing returns.
 * Also provides per-call cost estimation for budget enforcement.
 */

import { z } from "zod";
import type { InvestigationBranch, AutonomousRun } from "./types.js";

// ---- Convergence Schemas ----

export const ConvergenceMetricsSchema = z.object({
  /** Ratio of novel ideas vs. total in recent window (0-1). */
  noveltyRatio: z.number().min(0).max(1),
  /** Moving average of idea scores over the last N branches. */
  scoreTrend: z.number(),
  /** Whether scores are plateauing (no significant improvement). */
  isPlateauing: z.boolean(),
  /** Number of consecutive branches without score improvement. */
  stagnantBranches: z.number().int().min(0),
  /** Estimated topic exhaustion ratio (0 = fresh, 1 = fully exhausted). */
  topicExhaustion: z.number().min(0).max(1),
  /** Number of distinct themes found across all ideas. */
  themeCount: z.number().int().min(0),
  /** Whether convergence has been detected. */
  converged: z.boolean(),
  /** Reason for convergence (if detected). */
  reason: z.string().max(500).optional(),
});

export type ConvergenceMetrics = z.infer<typeof ConvergenceMetricsSchema>;

export const ConvergenceConfigSchema = z.object({
  /** Minimum novelty ratio before flagging convergence (default: 0.2). */
  minNoveltyRatio: z.number().min(0).max(1).default(0.2),
  /** Number of consecutive stagnant branches before convergence (default: 3). */
  maxStagnantBranches: z.number().int().min(1).default(3),
  /** Minimum score improvement % to count as progress (default: 5). */
  minScoreImprovement: z.number().min(0).default(5),
  /** Window size for rolling metrics (default: 5). */
  windowSize: z.number().int().min(2).default(5),
  /** Topic exhaustion threshold (default: 0.8). */
  topicExhaustionThreshold: z.number().min(0).max(1).default(0.8),
});

export type ConvergenceConfig = z.infer<typeof ConvergenceConfigSchema>;

// ---- Cost Estimation ----

export const CostEstimateSchema = z.object({
  /** Estimated cost per LLM call in USD. */
  perCallCost: z.number().min(0),
  /** Estimated remaining calls within budget. */
  remainingCalls: z.number().int().min(0),
  /** Projected total cost to complete current exploration. */
  projectedTotalCost: z.number().min(0),
  /** Current spend so far. */
  currentSpend: z.number().min(0),
  /** Budget remaining. */
  budgetRemaining: z.number().min(0),
  /** Whether the budget is likely to be exceeded. */
  willExceedBudget: z.boolean(),
});

export type CostEstimate = z.infer<typeof CostEstimateSchema>;

// ---- Model pricing estimates (rough USD per 1K tokens) ----

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 0.002, output: 0.008 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "o3-mini": { input: 0.0011, output: 0.0044 },
  default: { input: 0.002, output: 0.008 },
};

/** Estimate the cost of a single LLM call based on typical token usage. */
export function estimateCallCost(
  model?: string,
  estimatedInputTokens: number = 2000,
  estimatedOutputTokens: number = 1500
): number {
  const pricing = MODEL_COSTS[model ?? "default"] ?? MODEL_COSTS.default;
  return (
    (estimatedInputTokens / 1000) * pricing.input + (estimatedOutputTokens / 1000) * pricing.output
  );
}

/** Build a cost projection for an autonomous run. */
export function buildCostEstimate(
  run: AutonomousRun,
  currentSpend: number,
  maxBudget: number,
  _llmCallsSoFar: number
): CostEstimate {
  const model = run.config.model;
  const perCallCost = estimateCallCost(model);

  const pendingBranches = run.branches.filter((b) => b.status === "pending").length;
  // Estimate ~3 LLM calls per branch (investigation + 2 angles)
  const estimatedRemainingCalls = pendingBranches * 3 + 1; // +1 for synthesis
  const projectedAdditionalCost = estimatedRemainingCalls * perCallCost;
  const projectedTotalCost = currentSpend + projectedAdditionalCost;
  const budgetRemaining = Math.max(0, maxBudget - currentSpend);

  return {
    perCallCost,
    remainingCalls: Math.floor(budgetRemaining / Math.max(perCallCost, 0.001)),
    projectedTotalCost,
    currentSpend,
    budgetRemaining,
    willExceedBudget: projectedTotalCost > maxBudget,
  };
}

// ---- Novelty Detection ----

/**
 * Calculate similarity between two idea titles/descriptions using Jaccard index.
 * Returns 0 (completely different) to 1 (identical).
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  if (wordsA.size === 0 && wordsB.size === 0) return 1;

  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Determine what fraction of new ideas are novel (not similar to existing ones).
 * An idea is considered "novel" if its max similarity to any existing idea is below threshold.
 */
export function calculateNoveltyRatio(
  newIdeas: Array<{ title: string; description: string }>,
  existingIdeas: Array<{ title: string; description: string }>,
  similarityThreshold: number = 0.4
): number {
  if (newIdeas.length === 0) return 0;
  if (existingIdeas.length === 0) return 1;

  let novelCount = 0;
  for (const newIdea of newIdeas) {
    const newText = `${newIdea.title} ${newIdea.description}`;
    let isNovel = true;
    for (const existing of existingIdeas) {
      const existingText = `${existing.title} ${existing.description}`;
      if (jaccardSimilarity(newText, existingText) >= similarityThreshold) {
        isNovel = false;
        break;
      }
    }
    if (isNovel) novelCount++;
  }

  return novelCount / newIdeas.length;
}

// ---- Topic Exhaustion ----

/**
 * Estimate how exhausted the topic space is based on branch subjects.
 * High overlap between branch subjects indicates topic saturation.
 */
export function estimateTopicExhaustion(branches: InvestigationBranch[]): number {
  const completedBranches = branches.filter((b) => b.status === "completed");
  if (completedBranches.length < 2) return 0;

  const subjects = completedBranches.map((b) => b.subject);
  let totalSimilarity = 0;
  let pairs = 0;

  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      totalSimilarity += jaccardSimilarity(subjects[i], subjects[j]);
      pairs++;
    }
  }

  return pairs > 0 ? totalSimilarity / pairs : 0;
}

// ---- Score Trend Analysis ----

/**
 * Analyze the trend of idea scores across recent branches.
 * Returns the average score change per branch (positive = improving).
 */
export function analyzeScoreTrend(
  branches: InvestigationBranch[],
  windowSize: number = 5
): { trend: number; isPlateauing: boolean; stagnantCount: number } {
  const scored = branches
    .filter((b) => b.status === "completed" && b.ideas.some((i) => i.score !== undefined))
    .map((b) => {
      const scores = b.ideas.filter((i) => i.score !== undefined).map((i) => i.score!);
      return scores.length > 0 ? scores.reduce((a, c) => a + c, 0) / scores.length : 0;
    });

  if (scored.length < 2) {
    return { trend: 0, isPlateauing: false, stagnantCount: 0 };
  }

  const recent = scored.slice(-windowSize);
  let totalChange = 0;
  let stagnantCount = 0;
  const MIN_IMPROVEMENT = 2; // points

  for (let i = 1; i < recent.length; i++) {
    const change = recent[i] - recent[i - 1];
    totalChange += change;
    if (Math.abs(change) < MIN_IMPROVEMENT) {
      stagnantCount++;
    } else {
      stagnantCount = 0;
    }
  }

  const trend = totalChange / (recent.length - 1);
  const isPlateauing = stagnantCount >= Math.min(3, recent.length - 1);

  return { trend, isPlateauing, stagnantCount };
}

// ---- Main Convergence Check ----

/**
 * Run a full convergence analysis on an autonomous run.
 * Returns metrics indicating whether the exploration has converged.
 */
export function checkConvergence(
  run: AutonomousRun,
  config: Partial<ConvergenceConfig> = {}
): ConvergenceMetrics {
  const cfg = ConvergenceConfigSchema.parse(config);
  const completedBranches = run.branches.filter((b) => b.status === "completed");

  if (completedBranches.length < 2) {
    return {
      noveltyRatio: 1,
      scoreTrend: 0,
      isPlateauing: false,
      stagnantBranches: 0,
      topicExhaustion: 0,
      themeCount: 0,
      converged: false,
    };
  }

  // Calculate novelty
  const allIdeas = completedBranches.flatMap((b) => b.ideas);
  const recentBranch = completedBranches[completedBranches.length - 1];
  const previousIdeas = completedBranches.slice(0, -1).flatMap((b) => b.ideas);
  const noveltyRatio = calculateNoveltyRatio(recentBranch.ideas, previousIdeas);

  // Score trend
  const { trend, isPlateauing, stagnantCount } = analyzeScoreTrend(
    completedBranches,
    cfg.windowSize
  );

  // Topic exhaustion
  const topicExhaustion = estimateTopicExhaustion(run.branches);

  // Theme count (unique categories from ideas)
  const themes = new Set<string>();
  for (const idea of allIdeas) {
    const words = idea.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    for (const w of words.slice(0, 3)) themes.add(w);
  }
  const themeCount = themes.size;

  // Convergence decision
  let converged = false;
  let reason: string | undefined;

  if (noveltyRatio < cfg.minNoveltyRatio) {
    converged = true;
    reason = `Novelty ratio (${(noveltyRatio * 100).toFixed(0)}%) below threshold (${(cfg.minNoveltyRatio * 100).toFixed(0)}%)`;
  } else if (stagnantCount >= cfg.maxStagnantBranches) {
    converged = true;
    reason = `${stagnantCount} consecutive branches without score improvement`;
  } else if (topicExhaustion >= cfg.topicExhaustionThreshold) {
    converged = true;
    reason = `Topic exhaustion (${(topicExhaustion * 100).toFixed(0)}%) exceeds threshold`;
  }

  return {
    noveltyRatio,
    scoreTrend: trend,
    isPlateauing,
    stagnantBranches: stagnantCount,
    topicExhaustion,
    themeCount,
    converged,
    reason,
  };
}

/** Format convergence metrics as markdown. */
export function convergenceToMarkdown(metrics: ConvergenceMetrics): string {
  const status = metrics.converged ? "🔴 Converged" : "🟢 Exploring";
  return [
    `## Convergence Analysis`,
    "",
    `**Status:** ${status}`,
    metrics.reason ? `**Reason:** ${metrics.reason}` : "",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Novelty Ratio | ${(metrics.noveltyRatio * 100).toFixed(1)}% |`,
    `| Score Trend | ${metrics.scoreTrend > 0 ? "📈" : metrics.scoreTrend < 0 ? "📉" : "➡️"} ${metrics.scoreTrend.toFixed(1)} |`,
    `| Plateauing | ${metrics.isPlateauing ? "Yes" : "No"} |`,
    `| Stagnant Branches | ${metrics.stagnantBranches} |`,
    `| Topic Exhaustion | ${(metrics.topicExhaustion * 100).toFixed(1)}% |`,
    `| Theme Count | ${metrics.themeCount} |`,
  ]
    .filter(Boolean)
    .join("\n");
}
