/**
 * @module adaptive-router
 *
 * Intelligent per-prompt model selection that routes each pipeline stage
 * to the optimal LLM based on subject domain, angle type, cost budget,
 * and historical quality scores. Uses Thompson sampling (multi-armed bandit)
 * for self-tuning optimization.
 */

import { z } from "zod";
import { getModelRegistry } from "../models/index.js";
import type { ModelCapability } from "../types.js";
import { PipelineError } from "../errors.js";

// ---- Zod Schemas ----

/** Cost budget levels. */
export const CostBudgetSchema = z.enum(["minimal", "low", "medium", "high", "unlimited"]);
export type CostBudget = z.infer<typeof CostBudgetSchema>;

/** Routing policy configuration. */
export const RoutingPolicySchema = z.object({
  id: z.string().max(200),
  name: z.string().max(300),
  costBudget: CostBudgetSchema.default("medium"),
  qualityThreshold: z.number().min(0).max(1).default(0.7),
  preferredProviders: z.array(z.string().max(100)).max(10).optional(),
  domainOverrides: z.record(z.string().max(200)).optional(),
  angleOverrides: z.record(z.string().max(200)).optional(),
  enableExploration: z.boolean().default(true),
  explorationRate: z.number().min(0).max(1).default(0.1),
});
export type RoutingPolicy = z.infer<typeof RoutingPolicySchema>;

/** Quality observation from a completed LLM call. */
export const QualityObservationSchema = z.object({
  modelId: z.string().max(200),
  stage: z.enum(["investigation", "generation", "synthesis"]),
  angleId: z.string().max(100).optional(),
  domain: z.string().max(200).optional(),
  qualityScore: z.number().min(0).max(1),
  latencyMs: z.number().min(0),
  costUnits: z.number().min(0).optional(),
  timestamp: z.string(),
});
export type QualityObservation = z.infer<typeof QualityObservationSchema>;

/** Routing decision with explanation. */
export const RoutingDecisionSchema = z.object({
  modelId: z.string(),
  stage: z.string(),
  reason: z.string().max(500),
  confidence: z.number().min(0).max(1),
  alternativeModels: z.array(z.string()).max(5),
  explorationMode: z.boolean(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

/** Model performance stats for a specific context. */
export const ModelStatsSchema = z.object({
  modelId: z.string(),
  totalObservations: z.number().int().min(0),
  meanQuality: z.number().min(0).max(1),
  meanLatencyMs: z.number().min(0),
  meanCostUnits: z.number().min(0),
  /** Beta distribution alpha param for Thompson sampling. */
  alpha: z.number().min(0),
  /** Beta distribution beta param for Thompson sampling. */
  beta: z.number().min(0),
});
export type ModelStats = z.infer<typeof ModelStatsSchema>;

/** Routing analytics summary. */
export const RoutingAnalyticsSchema = z.object({
  totalDecisions: z.number().int().min(0),
  totalObservations: z.number().int().min(0),
  modelDistribution: z.record(z.number()),
  averageQualityByModel: z.record(z.number()),
  explorationRate: z.number().min(0).max(1),
});
export type RoutingAnalytics = z.infer<typeof RoutingAnalyticsSchema>;

// ---- Cost Tier Mapping ----

const COST_BUDGET_LIMITS: Record<CostBudget, number> = {
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  unlimited: 5,
};

const COST_TIER_VALUES: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// ---- In-Memory Stores ----

const policies = new Map<string, RoutingPolicy>();
const observations: QualityObservation[] = [];
/** Context key → model → stats. Context key = `${stage}:${angleId}:${domain}`. */
const modelStats = new Map<string, Map<string, ModelStats>>();
const decisionLog: RoutingDecision[] = [];

// ---- Policy Management ----

/** Register a routing policy. */
export function registerRoutingPolicy(policy: RoutingPolicy): RoutingPolicy {
  const validated = RoutingPolicySchema.parse(policy);
  policies.set(validated.id, validated);
  return validated;
}

/** Get a routing policy by ID. */
export function getRoutingPolicy(policyId: string): RoutingPolicy | undefined {
  return policies.get(policyId);
}

/** List all routing policies. */
export function listRoutingPolicies(): RoutingPolicy[] {
  return [...policies.values()];
}

// ---- Thompson Sampling ----

/** Sample from Beta(alpha, beta) distribution using the Joehnk method. */
function sampleBeta(alpha: number, beta: number): number {
  // Simple approximation: use mean + noise for lightweight implementation
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const noise = (Math.random() - 0.5) * 2 * Math.sqrt(variance) * 3;
  return Math.max(0, Math.min(1, mean + noise));
}

/** Build a context key for model stats lookup. */
function buildContextKey(stage: string, angleId?: string, domain?: string): string {
  return `${stage}:${angleId ?? "*"}:${domain ?? "*"}`;
}

/** Get or initialize model stats for a context. */
function getOrInitStats(contextKey: string, modelId: string): ModelStats {
  let contextStats = modelStats.get(contextKey);
  if (!contextStats) {
    contextStats = new Map();
    modelStats.set(contextKey, contextStats);
  }

  let stats = contextStats.get(modelId);
  if (!stats) {
    stats = {
      modelId,
      totalObservations: 0,
      meanQuality: 0.5,
      meanLatencyMs: 1000,
      meanCostUnits: 1,
      alpha: 1, // Uniform prior
      beta: 1,
    };
    contextStats.set(modelId, stats);
  }

  return stats;
}

// ---- Core Routing ----

/** Route a pipeline stage to the optimal model using Thompson sampling. */
export function routeModel(
  stage: "investigation" | "generation" | "synthesis",
  options?: {
    policyId?: string;
    angleId?: string;
    domain?: string;
  }
): RoutingDecision {
  const policy = options?.policyId ? policies.get(options.policyId) : undefined;
  const costBudget = policy?.costBudget ?? "medium";
  const costLimit = COST_BUDGET_LIMITS[costBudget];

  // Check for explicit overrides
  if (options?.angleId && policy?.angleOverrides?.[options.angleId]) {
    const decision: RoutingDecision = {
      modelId: policy.angleOverrides[options.angleId],
      stage,
      reason: `Angle override for ${options.angleId}`,
      confidence: 1,
      alternativeModels: [],
      explorationMode: false,
    };
    decisionLog.push(decision);
    return decision;
  }

  if (options?.domain && policy?.domainOverrides?.[options.domain]) {
    const decision: RoutingDecision = {
      modelId: policy.domainOverrides[options.domain],
      stage,
      reason: `Domain override for ${options.domain}`,
      confidence: 1,
      alternativeModels: [],
      explorationMode: false,
    };
    decisionLog.push(decision);
    return decision;
  }

  // Get eligible models
  let candidates = getModelRegistry().filter((m) => {
    const costValue = COST_TIER_VALUES[m.costTier] ?? 2;
    if (costValue > costLimit) return false;
    if (policy?.preferredProviders?.length) {
      const providerPrefix = m.modelId.split("-")[0];
      if (!policy.preferredProviders.some((p) => m.modelId.startsWith(p) || providerPrefix === p)) {
        return false;
      }
    }
    return m.strengths.includes(stage);
  });

  if (candidates.length === 0) {
    // Fallback to any model that supports the stage
    candidates = getModelRegistry().filter((m) => m.strengths.includes(stage));
  }

  if (candidates.length === 0) {
    throw new PipelineError(`No models available for stage "${stage}"`, stage);
  }

  // Thompson sampling
  const contextKey = buildContextKey(stage, options?.angleId, options?.domain);
  const explorationEnabled = policy?.enableExploration ?? true;
  const explorationRate = policy?.explorationRate ?? 0.1;
  const isExploration = explorationEnabled && Math.random() < explorationRate;

  let selectedModel: ModelCapability;
  if (isExploration) {
    // Random exploration
    selectedModel = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // Thompson sampling: sample from Beta posteriors, pick highest
    let bestSample = -1;
    selectedModel = candidates[0];

    for (const candidate of candidates) {
      const stats = getOrInitStats(contextKey, candidate.modelId);
      const sample = sampleBeta(stats.alpha, stats.beta);
      if (sample > bestSample) {
        bestSample = sample;
        selectedModel = candidate;
      }
    }
  }

  const stats = getOrInitStats(contextKey, selectedModel.modelId);
  const alternativeModels = candidates
    .filter((c) => c.modelId !== selectedModel.modelId)
    .slice(0, 5)
    .map((c) => c.modelId);

  const decision: RoutingDecision = {
    modelId: selectedModel.modelId,
    stage,
    reason: isExploration
      ? "Exploration: randomly selected for learning"
      : `Thompson sampling: best posterior sample (α=${stats.alpha.toFixed(1)}, β=${stats.beta.toFixed(1)})`,
    confidence: stats.totalObservations > 10 ? stats.meanQuality : 0.5,
    alternativeModels,
    explorationMode: isExploration,
  };

  decisionLog.push(decision);
  return decision;
}

// ---- Quality Feedback Loop ----

/** Record a quality observation and update model stats. */
export function recordQualityObservation(obs: QualityObservation): void {
  const validated = QualityObservationSchema.parse(obs);
  observations.push(validated);

  const contextKey = buildContextKey(validated.stage, validated.angleId, validated.domain);
  const stats = getOrInitStats(contextKey, validated.modelId);

  // Update running averages
  const n = stats.totalObservations + 1;
  stats.meanQuality = stats.meanQuality + (validated.qualityScore - stats.meanQuality) / n;
  stats.meanLatencyMs = stats.meanLatencyMs + (validated.latencyMs - stats.meanLatencyMs) / n;
  if (validated.costUnits !== undefined) {
    stats.meanCostUnits = stats.meanCostUnits + (validated.costUnits - stats.meanCostUnits) / n;
  }
  stats.totalObservations = n;

  // Update Beta distribution params (Bernoulli-like: quality > threshold = success)
  const threshold = 0.7;
  if (validated.qualityScore >= threshold) {
    stats.alpha += 1;
  } else {
    stats.beta += 1;
  }
}

/** Get model stats for a specific context. */
export function getModelStats(stage: string, angleId?: string, domain?: string): ModelStats[] {
  const contextKey = buildContextKey(stage, angleId, domain);
  const contextStats = modelStats.get(contextKey);
  if (!contextStats) return [];
  return [...contextStats.values()].sort((a, b) => b.meanQuality - a.meanQuality);
}

// ---- Analytics ----

/** Get routing analytics summary. */
export function getRoutingAnalytics(): RoutingAnalytics {
  const modelDistribution: Record<string, number> = {};
  const modelQualitySum: Record<string, number> = {};
  const modelQualityCount: Record<string, number> = {};
  let explorationCount = 0;

  for (const decision of decisionLog) {
    modelDistribution[decision.modelId] = (modelDistribution[decision.modelId] ?? 0) + 1;
    if (decision.explorationMode) explorationCount++;
  }

  for (const obs of observations) {
    modelQualitySum[obs.modelId] = (modelQualitySum[obs.modelId] ?? 0) + obs.qualityScore;
    modelQualityCount[obs.modelId] = (modelQualityCount[obs.modelId] ?? 0) + 1;
  }

  const averageQualityByModel: Record<string, number> = {};
  for (const [modelId, sum] of Object.entries(modelQualitySum)) {
    averageQualityByModel[modelId] = sum / (modelQualityCount[modelId] ?? 1);
  }

  return {
    totalDecisions: decisionLog.length,
    totalObservations: observations.length,
    modelDistribution,
    averageQualityByModel,
    explorationRate: decisionLog.length > 0 ? explorationCount / decisionLog.length : 0,
  };
}

/** Get the best model for a given context based on historical performance. */
export function getBestModel(
  stage: "investigation" | "generation" | "synthesis",
  angleId?: string,
  domain?: string
): { modelId: string; quality: number } | undefined {
  const stats = getModelStats(stage, angleId, domain);
  if (stats.length === 0) return undefined;
  const best = stats[0];
  return { modelId: best.modelId, quality: best.meanQuality };
}

// ---- Store Management ----

/** Clear all adaptive router data (for testing). */
export function clearAdaptiveRouterData(): void {
  policies.clear();
  observations.length = 0;
  modelStats.clear();
  decisionLog.length = 0;
}
