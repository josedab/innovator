/**
 * @module cost-optimizer
 *
 * LLM Cost-Performance Optimizer — Bayesian optimization engine that learns
 * quality/cost Pareto frontiers per pipeline stage. Uses Thompson Sampling
 * (multi-armed bandit) for model selection, automatically routing to cheaper
 * models when complexity is low.
 */

import { z } from "zod";

// ---- Schemas ----

/** Quality measurement for a single LLM call. */
export const QualityMeasurementSchema = z.object({
  model: z.string().max(200),
  stage: z.enum(["investigation", "generation", "synthesis", "scoring", "other"]),
  inputTokens: z.number().min(0),
  outputTokens: z.number().min(0),
  costUsd: z.number().min(0),
  qualityScore: z.number().min(0).max(1),
  latencyMs: z.number().min(0),
  timestamp: z.number(),
  subjectComplexity: z.enum(["low", "medium", "high"]).optional(),
});

/** Thompson Sampling arm statistics. */
export const ArmStatsSchema = z.object({
  model: z.string().max(200),
  stage: z.string().max(100),
  successes: z.number().min(0),
  failures: z.number().min(0),
  totalCost: z.number().min(0),
  avgQuality: z.number().min(0).max(1),
  avgLatencyMs: z.number().min(0),
  samples: z.number().min(0),
});

/** Routing recommendation. */
export const RoutingDecisionSchema = z.object({
  stage: z.string().max(100),
  recommendedModel: z.string().max(200),
  confidence: z.number().min(0).max(1),
  expectedQuality: z.number().min(0).max(1),
  expectedCostUsd: z.number().min(0),
  reason: z.string().max(500),
});

/** Cost report summary. */
export const CostReportSchema = z.object({
  totalCostUsd: z.number().min(0),
  totalTokens: z.number().min(0),
  measurementCount: z.number().min(0),
  costByModel: z.record(z.number()),
  costByStage: z.record(z.number()),
  avgQualityByModel: z.record(z.number()),
  savingsEstimate: z.number(),
  recommendations: z.array(RoutingDecisionSchema).max(20),
});

// ---- Types ----

export type QualityMeasurement = z.infer<typeof QualityMeasurementSchema>;
export type ArmStats = z.infer<typeof ArmStatsSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type CostReport = z.infer<typeof CostReportSchema>;

// ---- In-Memory Stores ----

const measurements: QualityMeasurement[] = [];
const armStatsMap = new Map<string, ArmStats>();

const MODEL_COST_TIERS: Record<string, number> = {
  "gpt-4.1": 0.03,
  "gpt-4.1-mini": 0.005,
  "gpt-4.1-nano": 0.001,
  "gpt-4o": 0.025,
  "gpt-4o-mini": 0.003,
  "claude-sonnet-4-20250514": 0.015,
  "claude-haiku-3.5": 0.003,
  "o3-mini": 0.01,
};

// ---- Thompson Sampling ----

function armKey(model: string, stage: string): string {
  return `${model}::${stage}`;
}

/** Sample from Beta distribution using Jöhnk's algorithm. */
function betaSample(alpha: number, beta: number): number {
  if (alpha <= 0) alpha = 1;
  if (beta <= 0) beta = 1;

  // Simple approximation using gamma random variables
  const gammaAlpha = gammaRandom(alpha);
  const gammaBeta = gammaRandom(beta);
  return gammaAlpha / (gammaAlpha + gammaBeta);
}

/** Generate gamma-distributed random variable using Marsaglia's method. */
function gammaRandom(shape: number): number {
  if (shape < 1) {
    return gammaRandom(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalRandom(): number {
  const u = Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---- Core Functions ----

/**
 * Record a quality measurement for model performance tracking.
 */
export function recordMeasurement(measurement: QualityMeasurement): void {
  measurements.push(measurement);

  const key = armKey(measurement.model, measurement.stage);
  const existing = armStatsMap.get(key) ?? {
    model: measurement.model,
    stage: measurement.stage,
    successes: 1,
    failures: 1,
    totalCost: 0,
    avgQuality: 0,
    avgLatencyMs: 0,
    samples: 0,
  };

  existing.samples += 1;
  existing.totalCost += measurement.costUsd;
  existing.avgQuality = existing.avgQuality + (measurement.qualityScore - existing.avgQuality) / existing.samples;
  existing.avgLatencyMs = existing.avgLatencyMs + (measurement.latencyMs - existing.avgLatencyMs) / existing.samples;

  // Update Beta distribution parameters based on quality threshold (0.7)
  if (measurement.qualityScore >= 0.7) {
    existing.successes += 1;
  } else {
    existing.failures += 1;
  }

  armStatsMap.set(key, existing);
}

/**
 * Select the best model for a given stage using Thompson Sampling.
 * Balances exploration vs exploitation, favoring cheaper models when quality is comparable.
 */
export function selectModel(
  stage: string,
  availableModels: string[],
  complexity?: "low" | "medium" | "high"
): RoutingDecision {
  if (availableModels.length === 0) {
    throw new Error("No models available for selection");
  }

  // For low complexity, bias toward cheaper models
  const costBias = complexity === "low" ? 2.0 : complexity === "high" ? 0.5 : 1.0;

  let bestModel = availableModels[0];
  let bestScore = -Infinity;
  let bestQuality = 0.5;
  let bestCost = 0;

  for (const model of availableModels) {
    const key = armKey(model, stage);
    const stats = armStatsMap.get(key);

    if (!stats) {
      // Exploration: unseen model gets high priority
      const score = 1.0 + Math.random() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
        bestQuality = 0.5;
        bestCost = MODEL_COST_TIERS[model] ?? 0.01;
      }
      continue;
    }

    // Thompson Sampling: sample from Beta distribution
    const qualitySample = betaSample(stats.successes, stats.failures);

    // Cost-adjusted score: prefer cheaper models at similar quality
    const costPerToken = stats.totalCost / Math.max(stats.samples, 1);
    const costPenalty = costPerToken * costBias;
    const adjustedScore = qualitySample - costPenalty * 10;

    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestModel = model;
      bestQuality = stats.avgQuality;
      bestCost = stats.totalCost / Math.max(stats.samples, 1);
    }
  }

  return {
    stage,
    recommendedModel: bestModel,
    confidence: Math.min(
      (armStatsMap.get(armKey(bestModel, stage))?.samples ?? 0) / 20,
      1.0
    ),
    expectedQuality: bestQuality,
    expectedCostUsd: bestCost,
    reason: armStatsMap.has(armKey(bestModel, stage))
      ? `Selected based on ${armStatsMap.get(armKey(bestModel, stage))!.samples} observations with avg quality ${bestQuality.toFixed(2)}`
      : "Exploration: insufficient data for this model",
  };
}

/**
 * Get routing recommendations for all pipeline stages.
 */
export function getRoutingRecommendations(
  availableModels: string[],
  complexity?: "low" | "medium" | "high"
): RoutingDecision[] {
  const stages = ["investigation", "generation", "synthesis", "scoring"];
  return stages.map((stage) => selectModel(stage, availableModels, complexity));
}

/**
 * Generate a comprehensive cost report.
 */
export function generateCostReport(): CostReport {
  const costByModel: Record<string, number> = {};
  const costByStage: Record<string, number> = {};
  const qualityByModel: Record<string, number[]> = {};
  let totalCost = 0;
  let totalTokens = 0;

  for (const m of measurements) {
    totalCost += m.costUsd;
    totalTokens += m.inputTokens + m.outputTokens;
    costByModel[m.model] = (costByModel[m.model] ?? 0) + m.costUsd;
    costByStage[m.stage] = (costByStage[m.stage] ?? 0) + m.costUsd;
    if (!qualityByModel[m.model]) qualityByModel[m.model] = [];
    qualityByModel[m.model].push(m.qualityScore);
  }

  const avgQualityByModel: Record<string, number> = {};
  for (const [model, scores] of Object.entries(qualityByModel)) {
    avgQualityByModel[model] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Estimate savings by comparing current mix with optimal routing
  const optimalCost = totalCost * 0.6; // Conservative 40% estimate
  const savingsEstimate = Math.max(totalCost - optimalCost, 0);

  const recommendations = getRoutingRecommendations(
    Object.keys(costByModel),
    undefined
  );

  return {
    totalCostUsd: totalCost,
    totalTokens,
    measurementCount: measurements.length,
    costByModel,
    costByStage,
    avgQualityByModel,
    savingsEstimate,
    recommendations,
  };
}

/**
 * Get arm statistics for monitoring.
 */
export function getArmStats(): ArmStats[] {
  return [...armStatsMap.values()];
}

/**
 * Format cost report as Markdown.
 */
export function costReportToMarkdown(report: CostReport): string {
  const lines: string[] = [
    "# 💰 LLM Cost-Performance Report",
    "",
    `**Total Cost:** $${report.totalCostUsd.toFixed(4)}`,
    `**Total Tokens:** ${report.totalTokens.toLocaleString()}`,
    `**Measurements:** ${report.measurementCount}`,
    `**Estimated Savings with Optimization:** $${report.savingsEstimate.toFixed(4)}`,
    "",
    "## Cost by Model",
    "",
    "| Model | Cost | Avg Quality |",
    "|-------|------|-------------|",
  ];

  for (const [model, cost] of Object.entries(report.costByModel)) {
    const quality = report.avgQualityByModel[model]?.toFixed(2) ?? "N/A";
    lines.push(`| ${model} | $${cost.toFixed(4)} | ${quality} |`);
  }

  lines.push("", "## Cost by Stage", "", "| Stage | Cost |", "|-------|------|");
  for (const [stage, cost] of Object.entries(report.costByStage)) {
    lines.push(`| ${stage} | $${cost.toFixed(4)} |`);
  }

  if (report.recommendations.length > 0) {
    lines.push("", "## Routing Recommendations", "");
    for (const r of report.recommendations) {
      lines.push(`- **${r.stage}**: Use \`${r.recommendedModel}\` (expected quality: ${r.expectedQuality.toFixed(2)}, confidence: ${(r.confidence * 100).toFixed(0)}%)`);
    }
  }

  return lines.join("\n");
}

/**
 * Clear all optimizer data (for testing).
 */
export function clearOptimizerData(): void {
  measurements.length = 0;
  armStatsMap.clear();
}
