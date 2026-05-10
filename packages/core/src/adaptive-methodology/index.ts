/**
 * @module adaptive-methodology
 *
 * Adaptive Innovation Methodology: learns which angles, prompts, and pipeline
 * configurations produce the best ideas for specific domains and teams.
 * Tracks effectiveness, generates heuristic-based recommendations, supports
 * A/B testing of tuned vs default configurations, and produces actionable insights.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Persistence ----

const METHODOLOGY_DIR = join(homedir(), ".innovator", "adaptive-methodology");
const EFFECTIVENESS_FILE = join(METHODOLOGY_DIR, "effectiveness.jsonl");
const PROFILES_FILE = join(METHODOLOGY_DIR, "profiles.json");
const EXPERIMENTS_FILE = join(METHODOLOGY_DIR, "experiments.json");
const FEEDBACK_FILE = join(METHODOLOGY_DIR, "feedback.jsonl");

function ensureDir(): void {
  if (!existsSync(METHODOLOGY_DIR)) mkdirSync(METHODOLOGY_DIR, { recursive: true });
}

// ---- Schemas ----

/** Schema for the optimal pipeline configuration within a profile. */
export const OptimalConfigSchema = z.object({
  preferredAngles: z.array(z.string().max(100)).max(20),
  suggestedDepth: z.number().min(1).max(10).default(3),
  suggestedModel: z.string().max(100).optional(),
  confidenceScore: z.number().min(0).max(1),
});

/** Schema for a methodology profile for a domain/team combination. */
export const MethodologyProfileSchema = z.object({
  id: z.string().max(100),
  domain: z.string().max(200),
  teamId: z.string().max(100).optional(),
  totalRuns: z.number().min(0),
  lastUpdated: z.string(),
  angleEffectiveness: z.record(z.number().min(0).max(100)),
  optimalConfig: OptimalConfigSchema,
  recommendations: z.array(z.string().max(500)).max(20),
});

/** Schema for an angle recommendation. */
export const AngleRecommendationSchema = z.object({
  angleId: z.string().max(100),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
  historicalScore: z.number().min(0).max(100),
  suggestedWeight: z.number().min(0).max(1),
});

/** Schema for a full pipeline recommendation. */
export const PipelineRecommendationSchema = z.object({
  recommendedAngles: z.array(z.string().max(100)).max(20),
  suggestedDepth: z.number().min(1).max(10),
  suggestedModel: z.string().max(100).optional(),
  estimatedQuality: z.number().min(0).max(1),
  explanation: z.string().max(2000),
});

/** Schema for a single effectiveness record. */
export const EffectivenessRecordSchema = z.object({
  runId: z.string().max(100),
  domain: z.string().max(200),
  teamId: z.string().max(100).optional(),
  angleId: z.string().max(100),
  inputSubject: z.string().max(500),
  outputScore: z.number().min(0).max(100),
  userRating: z.number().min(0).max(10).optional(),
  exported: z.boolean(),
  timestamp: z.string(),
});

/** Schema for an A/B test configuration comparing tuned vs default methodology. */
export const ABTestConfigSchema = z.object({
  experimentId: z.string().max(100),
  variantA: z.object({
    name: z.string().max(200).default("control"),
    angles: z.array(z.string().max(100)).max(20),
    depth: z.number().min(1).max(10).optional(),
    model: z.string().max(100).optional(),
  }),
  variantB: z.object({
    name: z.string().max(200).default("tuned"),
    angles: z.array(z.string().max(100)).max(20),
    depth: z.number().min(1).max(10).optional(),
    model: z.string().max(100).optional(),
  }),
  metric: z.string().max(200),
  minSamples: z.number().min(2).max(1000).default(30),
  status: z.enum(["draft", "running", "completed", "cancelled"]).default("draft"),
});

/** Schema for a methodology insight. */
export const MethodologyInsightSchema = z.object({
  type: z.enum(["trend", "anomaly", "recommendation"]),
  title: z.string().max(200),
  description: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  actionable: z.boolean(),
});

/** Schema for user feedback on a pipeline run. */
export const FeedbackRecordSchema = z.object({
  runId: z.string().max(100),
  rating: z.number().min(0).max(10).optional(),
  exported: z.boolean().optional(),
  used: z.boolean().optional(),
  timestamp: z.string(),
});

/** Schema for A/B experiment results. */
export const ExperimentResultsSchema = z.object({
  experimentId: z.string().max(100),
  variantAMetrics: z.object({
    averageScore: z.number(),
    sampleSize: z.number(),
  }),
  variantBMetrics: z.object({
    averageScore: z.number(),
    sampleSize: z.number(),
  }),
  winner: z.enum(["variantA", "variantB", "inconclusive"]),
  significanceLevel: z.number().min(0).max(1),
});

// ---- Types ----

export type MethodologyProfile = z.infer<typeof MethodologyProfileSchema>;
export type AngleRecommendation = z.infer<typeof AngleRecommendationSchema>;
export type PipelineRecommendation = z.infer<typeof PipelineRecommendationSchema>;
export type EffectivenessRecord = z.infer<typeof EffectivenessRecordSchema>;
export type ABTestConfig = z.infer<typeof ABTestConfigSchema>;
export type MethodologyInsight = z.infer<typeof MethodologyInsightSchema>;
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;
export type ExperimentResults = z.infer<typeof ExperimentResultsSchema>;

// ---- In-Memory Stores ----

const effectivenessRecords: EffectivenessRecord[] = [];
const profiles: Map<string, MethodologyProfile> = new Map();
const experiments: Map<string, ABTestConfig> = new Map();
const feedbackRecords: FeedbackRecord[] = [];
let initialized = false;

// ---- Persistence Helpers ----

function loadState(): void {
  if (initialized) return;
  initialized = true;
  ensureDir();

  // Load effectiveness records
  if (existsSync(EFFECTIVENESS_FILE)) {
    try {
      const lines = readFileSync(EFFECTIVENESS_FILE, "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          effectivenessRecords.push(EffectivenessRecordSchema.parse(JSON.parse(line)));
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // Load profiles
  if (existsSync(PROFILES_FILE)) {
    try {
      const data = JSON.parse(readFileSync(PROFILES_FILE, "utf-8"));
      for (const profile of data) {
        try {
          const validated = MethodologyProfileSchema.parse(profile);
          profiles.set(validated.id, validated);
        } catch {
          // Skip malformed profiles
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // Load experiments
  if (existsSync(EXPERIMENTS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(EXPERIMENTS_FILE, "utf-8"));
      for (const exp of data) {
        try {
          const validated = ABTestConfigSchema.parse(exp);
          experiments.set(validated.experimentId, validated);
        } catch {
          // Skip malformed experiments
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // Load feedback
  if (existsSync(FEEDBACK_FILE)) {
    try {
      const lines = readFileSync(FEEDBACK_FILE, "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          feedbackRecords.push(FeedbackRecordSchema.parse(JSON.parse(line)));
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Ignore read errors
    }
  }
}

function saveProfiles(): void {
  ensureDir();
  try {
    writeFileSync(PROFILES_FILE, JSON.stringify(Array.from(profiles.values()), null, 2), "utf-8");
  } catch {
    // Persistence should never break the main flow
  }
}

function saveExperiments(): void {
  ensureDir();
  try {
    writeFileSync(
      EXPERIMENTS_FILE,
      JSON.stringify(Array.from(experiments.values()), null, 2),
      "utf-8"
    );
  } catch {
    // Persistence should never break the main flow
  }
}

// ---- Effectiveness Tracking ----

/**
 * Record the effectiveness of an angle/pipeline run.
 */
export function recordEffectiveness(
  record: Omit<EffectivenessRecord, "timestamp">
): EffectivenessRecord {
  loadState();

  const fullRecord: EffectivenessRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  };

  const validated = EffectivenessRecordSchema.parse(fullRecord);
  effectivenessRecords.push(validated);

  try {
    ensureDir();
    appendFileSync(EFFECTIVENESS_FILE, JSON.stringify(validated) + "\n", "utf-8");
  } catch {
    // Persistence should never break the main flow
  }

  return validated;
}

/**
 * Query effectiveness history with optional filters.
 */
export function getEffectivenessHistory(options?: {
  domain?: string;
  angleId?: string;
  timeRange?: { start: string; end: string };
}): EffectivenessRecord[] {
  loadState();

  let records = [...effectivenessRecords];

  if (options?.domain) {
    records = records.filter((r) => r.domain === options.domain);
  }
  if (options?.angleId) {
    records = records.filter((r) => r.angleId === options.angleId);
  }
  if (options?.timeRange) {
    records = records.filter(
      (r) => r.timestamp >= options.timeRange!.start && r.timestamp <= options.timeRange!.end
    );
  }

  return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ---- Recommendation Engine ----

/**
 * Suggest optimal angle selection for a domain based on historical effectiveness.
 */
export function getAngleRecommendations(
  domain: string,
  teamId?: string
): AngleRecommendation[] {
  loadState();

  let records = effectivenessRecords.filter((r) => r.domain === domain);
  if (teamId) {
    records = records.filter((r) => r.teamId === teamId);
  }

  if (records.length === 0) return [];

  // Group by angleId and compute stats
  const angleGroups = new Map<
    string,
    { scores: number[]; ratings: number[]; exports: number; total: number }
  >();

  for (const record of records) {
    const group = angleGroups.get(record.angleId) ?? {
      scores: [],
      ratings: [],
      exports: 0,
      total: 0,
    };
    group.scores.push(record.outputScore);
    if (record.userRating !== undefined) group.ratings.push(record.userRating);
    if (record.exported) group.exports++;
    group.total++;
    angleGroups.set(record.angleId, group);
  }

  const recommendations: AngleRecommendation[] = [];

  for (const [angleId, group] of angleGroups) {
    const avgScore =
      group.scores.length > 0
        ? group.scores.reduce((a, b) => a + b, 0) / group.scores.length
        : 0;
    const avgRating =
      group.ratings.length > 0
        ? group.ratings.reduce((a, b) => a + b, 0) / group.ratings.length
        : 0;
    const exportRate = group.total > 0 ? group.exports / group.total : 0;

    // Composite historical score (0-100)
    const historicalScore = Math.round(
      avgScore * 0.4 + (avgRating / 10) * 100 * 0.3 + exportRate * 100 * 0.3
    );

    // Confidence based on sample size (more samples = higher confidence)
    const confidence = Math.round(Math.min(group.total / 10, 1) * 100) / 100;

    // Suggested weight normalized to 0-1
    const suggestedWeight = Math.round((historicalScore / 100) * 100) / 100;

    const reasoning = buildAngleReasoning(angleId, avgScore, avgRating, exportRate, group.total);

    recommendations.push({
      angleId,
      confidence,
      reasoning,
      historicalScore,
      suggestedWeight,
    });
  }

  return recommendations.sort((a, b) => b.historicalScore - a.historicalScore);
}

function buildAngleReasoning(
  angleId: string,
  avgScore: number,
  avgRating: number,
  exportRate: number,
  sampleSize: number
): string {
  const parts: string[] = [];

  if (avgScore >= 70) parts.push(`high output scores (avg ${Math.round(avgScore)})`);
  else if (avgScore >= 40) parts.push(`moderate output scores (avg ${Math.round(avgScore)})`);
  else parts.push(`low output scores (avg ${Math.round(avgScore)})`);

  if (avgRating >= 7) parts.push(`strong user ratings (avg ${avgRating.toFixed(1)})`);
  else if (avgRating > 0) parts.push(`user ratings avg ${avgRating.toFixed(1)}`);

  if (exportRate >= 0.5) parts.push(`high export rate (${Math.round(exportRate * 100)}%)`);
  else if (exportRate > 0) parts.push(`${Math.round(exportRate * 100)}% export rate`);

  parts.push(`based on ${sampleSize} run${sampleSize !== 1 ? "s" : ""}`);

  return `"${angleId}": ${parts.join(", ")}.`;
}

/**
 * Recommend a full pipeline configuration based on historical data.
 */
export function getPipelineRecommendation(
  subject: string,
  options?: { domain?: string; teamId?: string }
): PipelineRecommendation {
  loadState();

  const domain = options?.domain ?? extractDomain(subject);
  const angleRecs = getAngleRecommendations(domain, options?.teamId);

  // Default recommendation when no history exists
  if (angleRecs.length === 0) {
    return {
      recommendedAngles: ["first-principles", "cross-domain", "constraints"],
      suggestedDepth: 3,
      estimatedQuality: 0.5,
      explanation:
        `No historical data for domain "${domain}". Using default balanced configuration ` +
        `with first-principles, cross-domain, and constraints angles at depth 3.`,
    };
  }

  // Select top-performing angles (score >= 40, or top 5 if fewer qualify)
  const qualifiedAngles = angleRecs.filter((r) => r.historicalScore >= 40);
  const selectedAngles =
    qualifiedAngles.length >= 2
      ? qualifiedAngles.slice(0, 5)
      : angleRecs.slice(0, Math.max(3, Math.min(angleRecs.length, 5)));

  const recommendedAngles = selectedAngles.map((r) => r.angleId);

  // Determine depth based on average effectiveness
  const avgScore =
    selectedAngles.reduce((s, r) => s + r.historicalScore, 0) / selectedAngles.length;
  const suggestedDepth = avgScore >= 70 ? 4 : avgScore >= 40 ? 3 : 2;

  // Find best model from records
  const domainRecords = effectivenessRecords.filter((r) => r.domain === domain);
  const suggestedModel = findBestModel(domainRecords);

  // Estimated quality based on historical performance
  const estimatedQuality = Math.round(Math.min(avgScore / 100, 1) * 100) / 100;

  const explanation = buildPipelineExplanation(
    domain,
    recommendedAngles,
    suggestedDepth,
    suggestedModel,
    estimatedQuality,
    domainRecords.length
  );

  return {
    recommendedAngles,
    suggestedDepth,
    suggestedModel,
    estimatedQuality,
    explanation,
  };
}

function findBestModel(records: EffectivenessRecord[]): string | undefined {
  const modelScores = new Map<string, { total: number; count: number }>();

  for (const r of records) {
    // Use feedback data if available to determine model performance
    const feedback = feedbackRecords.find((f) => f.runId === r.runId);
    const score = feedback?.rating ? feedback.rating * 10 : r.outputScore;

    // Group by runId prefix as a proxy for model (since records don't store model directly)
    const runPrefix = r.runId.split("-")[0];
    if (!runPrefix) continue;

    const entry = modelScores.get(runPrefix) ?? { total: 0, count: 0 };
    entry.total += score;
    entry.count++;
    modelScores.set(runPrefix, entry);
  }

  // No reliable model data without explicit tracking
  return undefined;
}

function buildPipelineExplanation(
  domain: string,
  angles: string[],
  depth: number,
  model: string | undefined,
  quality: number,
  sampleSize: number
): string {
  const parts: string[] = [
    `Based on ${sampleSize} historical runs in the "${domain}" domain:`,
    `Recommended angles: ${angles.join(", ")} (selected for highest effectiveness).`,
    `Suggested depth: ${depth} (${depth >= 4 ? "high" : depth >= 3 ? "standard" : "focused"} exploration).`,
  ];

  if (model) parts.push(`Suggested model: ${model} (best historical performance).`);

  parts.push(
    `Estimated quality: ${Math.round(quality * 100)}% based on historical outcomes.`
  );

  return parts.join(" ");
}

function extractDomain(subject: string): string {
  const lower = subject.toLowerCase();
  const domainKeywords: Record<string, string[]> = {
    technology: ["ai", "software", "app", "platform", "api", "cloud", "data", "machine learning"],
    healthcare: ["health", "medical", "patient", "clinical", "pharma", "diagnosis"],
    finance: ["finance", "banking", "payment", "invest", "trading", "fintech"],
    education: ["education", "learning", "teaching", "student", "course", "training"],
    sustainability: ["sustainability", "green", "climate", "energy", "environment", "carbon"],
    retail: ["retail", "ecommerce", "shopping", "store", "consumer", "marketplace"],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some((k) => lower.includes(k))) return domain;
  }
  return "general";
}

/**
 * Generate a human-readable explanation of why a pipeline recommendation was made.
 */
export function explainRecommendation(recommendation: PipelineRecommendation): string {
  const lines: string[] = [
    "## Pipeline Recommendation Explanation\n",
    recommendation.explanation,
    "",
    `**Estimated Quality:** ${Math.round(recommendation.estimatedQuality * 100)}%`,
    `**Exploration Depth:** ${recommendation.suggestedDepth}`,
    "",
    "### Recommended Angles",
    ...recommendation.recommendedAngles.map((a, i) => `${i + 1}. ${a}`),
  ];

  if (recommendation.suggestedModel) {
    lines.push("", `### Suggested Model`, recommendation.suggestedModel);
  }

  return lines.join("\n");
}

// ---- Feedback Loop ----

/**
 * Record user feedback for a pipeline run.
 */
export function recordFeedback(
  runId: string,
  feedback: { rating?: number; exported?: boolean; used?: boolean }
): FeedbackRecord {
  loadState();

  const record: FeedbackRecord = {
    runId,
    rating: feedback.rating,
    exported: feedback.exported,
    used: feedback.used,
    timestamp: new Date().toISOString(),
  };

  const validated = FeedbackRecordSchema.parse(record);
  feedbackRecords.push(validated);

  // Update effectiveness records with feedback
  for (const eff of effectivenessRecords) {
    if (eff.runId === runId) {
      if (validated.rating !== undefined) eff.userRating = validated.rating;
      if (validated.exported !== undefined) eff.exported = validated.exported;
    }
  }

  try {
    ensureDir();
    appendFileSync(FEEDBACK_FILE, JSON.stringify(validated) + "\n", "utf-8");
  } catch {
    // Persistence should never break the main flow
  }

  return validated;
}

/**
 * Re-compute methodology profiles from accumulated effectiveness and feedback data.
 */
export function recalculateProfiles(): MethodologyProfile[] {
  loadState();

  // Group records by domain+teamId
  const groups = new Map<string, EffectivenessRecord[]>();
  for (const record of effectivenessRecords) {
    const key = record.teamId ? `${record.domain}::${record.teamId}` : record.domain;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const updatedProfiles: MethodologyProfile[] = [];

  for (const [key, records] of groups) {
    const [domain, teamId] = key.includes("::") ? key.split("::") : [key, undefined];

    // Compute angle effectiveness
    const angleGroups = new Map<string, number[]>();
    for (const r of records) {
      const scores = angleGroups.get(r.angleId) ?? [];
      const feedback = feedbackRecords.find((f) => f.runId === r.runId);
      const score = feedback?.rating ? feedback.rating * 10 : r.outputScore;
      scores.push(score);
      angleGroups.set(r.angleId, scores);
    }

    const angleEffectiveness: Record<string, number> = {};
    for (const [angleId, scores] of angleGroups) {
      angleEffectiveness[angleId] = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      );
    }

    // Determine optimal config
    const rankedAngles = Object.entries(angleEffectiveness)
      .sort(([, a], [, b]) => b - a);

    const preferredAngles = rankedAngles
      .filter(([, score]) => score >= 40)
      .slice(0, 10)
      .map(([id]) => id);

    const avgEffectiveness = rankedAngles.length > 0
      ? rankedAngles.reduce((s, [, v]) => s + v, 0) / rankedAngles.length
      : 0;

    const suggestedDepth = avgEffectiveness >= 70 ? 4 : avgEffectiveness >= 40 ? 3 : 2;

    // Generate recommendations
    const recommendations: string[] = [];
    const topAngles = rankedAngles.slice(0, 3);
    if (topAngles.length > 0) {
      recommendations.push(
        `Top performing angles: ${topAngles.map(([id, s]) => `${id} (${s})`).join(", ")}`
      );
    }
    const weakAngles = rankedAngles.filter(([, s]) => s < 30);
    if (weakAngles.length > 0) {
      recommendations.push(
        `Consider avoiding: ${weakAngles.map(([id]) => id).join(", ")} (low effectiveness)`
      );
    }
    if (records.length < 10) {
      recommendations.push("More data needed for reliable recommendations (< 10 runs).");
    }

    const profileId = teamId ? `${domain}-${teamId}` : domain;
    const profile: MethodologyProfile = {
      id: profileId,
      domain,
      teamId,
      totalRuns: records.length,
      lastUpdated: new Date().toISOString(),
      angleEffectiveness,
      optimalConfig: {
        preferredAngles,
        suggestedDepth,
        confidenceScore: Math.round(Math.min(records.length / 20, 1) * 100) / 100,
      },
      recommendations,
    };

    const validated = MethodologyProfileSchema.parse(profile);
    profiles.set(validated.id, validated);
    updatedProfiles.push(validated);
  }

  saveProfiles();
  return updatedProfiles;
}

// ---- A/B Testing Integration ----

/**
 * Create an A/B test experiment comparing a tuned methodology configuration
 * against the default for a specific domain.
 */
export function createMethodologyExperiment(
  domain: string,
  variantConfig: {
    angles: string[];
    depth?: number;
    model?: string;
  }
): ABTestConfig {
  loadState();

  const defaultAngles = ["first-principles", "cross-domain", "constraints", "what-if"];

  const experiment: ABTestConfig = {
    experimentId: `exp-${randomUUID().slice(0, 8)}`,
    variantA: {
      name: "control",
      angles: defaultAngles,
      depth: 3,
    },
    variantB: {
      name: "tuned",
      angles: variantConfig.angles,
      depth: variantConfig.depth ?? 3,
      model: variantConfig.model,
    },
    metric: "outputScore",
    minSamples: 30,
    status: "running",
  };

  const validated = ABTestConfigSchema.parse(experiment);
  experiments.set(validated.experimentId, validated);
  saveExperiments();

  return validated;
}

/**
 * Retrieve A/B test results with statistical significance analysis.
 */
export function getExperimentResults(experimentId: string): ExperimentResults | undefined {
  loadState();

  const experiment = experiments.get(experimentId);
  if (!experiment) return undefined;

  // Collect scores for each variant from effectiveness records
  const variantAScores: number[] = [];
  const variantBScores: number[] = [];

  for (const record of effectivenessRecords) {
    if (experiment.variantA.angles.includes(record.angleId)) {
      variantAScores.push(record.outputScore);
    }
    if (experiment.variantB.angles.includes(record.angleId)) {
      variantBScores.push(record.outputScore);
    }
  }

  const avgA =
    variantAScores.length > 0
      ? variantAScores.reduce((a, b) => a + b, 0) / variantAScores.length
      : 0;
  const avgB =
    variantBScores.length > 0
      ? variantBScores.reduce((a, b) => a + b, 0) / variantBScores.length
      : 0;

  // Simple significance estimate based on sample size and effect size
  const totalSamples = variantAScores.length + variantBScores.length;
  const minSamples = Math.min(variantAScores.length, variantBScores.length);
  const effectSize = Math.abs(avgA - avgB);
  const significanceLevel =
    minSamples >= experiment.minSamples && effectSize > 5
      ? Math.max(0.01, 1 - minSamples / (experiment.minSamples * 2))
      : 1;

  let winner: "variantA" | "variantB" | "inconclusive" = "inconclusive";
  if (significanceLevel < 0.05 && totalSamples >= experiment.minSamples) {
    winner = avgA > avgB ? "variantA" : "variantB";
  }

  // Update experiment status if we have enough samples
  if (totalSamples >= experiment.minSamples && experiment.status === "running") {
    experiment.status = "completed";
    experiments.set(experimentId, experiment);
    saveExperiments();
  }

  return {
    experimentId,
    variantAMetrics: {
      averageScore: Math.round(avgA * 100) / 100,
      sampleSize: variantAScores.length,
    },
    variantBMetrics: {
      averageScore: Math.round(avgB * 100) / 100,
      sampleSize: variantBScores.length,
    },
    winner,
    significanceLevel: Math.round(significanceLevel * 1000) / 1000,
  };
}

// ---- Insights ----

/**
 * Generate insights about what methodology approaches work best.
 */
export function generateMethodologyInsights(domain?: string): MethodologyInsight[] {
  loadState();

  const records = domain
    ? effectivenessRecords.filter((r) => r.domain === domain)
    : effectivenessRecords;

  const insights: MethodologyInsight[] = [];

  if (records.length === 0) return insights;

  // Trend: Best performing angle
  const angleScores = new Map<string, number[]>();
  for (const r of records) {
    const scores = angleScores.get(r.angleId) ?? [];
    scores.push(r.outputScore);
    angleScores.set(r.angleId, scores);
  }

  const angleAvgs = Array.from(angleScores.entries())
    .map(([angleId, scores]) => ({
      angleId,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  if (angleAvgs.length > 0) {
    const best = angleAvgs[0];
    insights.push({
      type: "trend",
      title: "Top Performing Angle",
      description:
        `"${best.angleId}" is the highest-performing angle with an average score of ` +
        `${Math.round(best.avg)} across ${best.count} runs` +
        (domain ? ` in the "${domain}" domain` : "") +
        ".",
      confidence: Math.min(best.count / 10, 1),
      actionable: true,
    });
  }

  // Anomaly: Underperforming angles
  const weakAngles = angleAvgs.filter((a) => a.avg < 30 && a.count >= 3);
  if (weakAngles.length > 0) {
    insights.push({
      type: "anomaly",
      title: "Underperforming Angles Detected",
      description:
        `The following angles consistently underperform: ${weakAngles.map((a) => `${a.angleId} (avg ${Math.round(a.avg)})`).join(", ")}. ` +
        "Consider reducing their weight or removing them from your pipeline.",
      confidence: 0.8,
      actionable: true,
    });
  }

  // Recommendation: Diversification
  if (angleAvgs.length < 3 && records.length > 10) {
    insights.push({
      type: "recommendation",
      title: "Limited Angle Diversity",
      description:
        `Only ${angleAvgs.length} angle(s) have been used across ${records.length} runs. ` +
        "Try exploring more angles to discover potentially effective approaches.",
      confidence: 0.7,
      actionable: true,
    });
  }

  // Trend: Improving or declining over time
  if (records.length >= 10) {
    const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const midpoint = Math.floor(sorted.length / 2);
    const olderAvg =
      sorted.slice(0, midpoint).reduce((s, r) => s + r.outputScore, 0) / midpoint;
    const recentAvg =
      sorted.slice(midpoint).reduce((s, r) => s + r.outputScore, 0) / (sorted.length - midpoint);

    if (recentAvg > olderAvg + 5) {
      insights.push({
        type: "trend",
        title: "Improving Results",
        description:
          `Recent runs show improved quality (avg ${Math.round(recentAvg)}) compared to earlier ` +
          `runs (avg ${Math.round(olderAvg)}). Your methodology adaptations are working.`,
        confidence: 0.75,
        actionable: false,
      });
    } else if (recentAvg < olderAvg - 5) {
      insights.push({
        type: "anomaly",
        title: "Declining Results",
        description:
          `Recent runs show declining quality (avg ${Math.round(recentAvg)}) compared to earlier ` +
          `runs (avg ${Math.round(olderAvg)}). Consider reviewing your pipeline configuration.`,
        confidence: 0.75,
        actionable: true,
      });
    }
  }

  // Recommendation: Feedback utilization
  const feedbackCount = feedbackRecords.filter((f) =>
    records.some((r) => r.runId === f.runId)
  ).length;
  if (feedbackCount < records.length * 0.3 && records.length > 5) {
    insights.push({
      type: "recommendation",
      title: "Low Feedback Rate",
      description:
        `Only ${Math.round((feedbackCount / records.length) * 100)}% of runs have user feedback. ` +
        "Providing more ratings and feedback will improve recommendation accuracy.",
      confidence: 0.6,
      actionable: true,
    });
  }

  // Trend: Export rate
  const exportedCount = records.filter((r) => r.exported).length;
  const exportRate = records.length > 0 ? exportedCount / records.length : 0;
  if (exportRate > 0.5 && records.length >= 5) {
    insights.push({
      type: "trend",
      title: "High Export Rate",
      description:
        `${Math.round(exportRate * 100)}% of ideas are being exported, indicating high-quality ` +
        "output that users find actionable.",
      confidence: 0.7,
      actionable: false,
    });
  } else if (exportRate < 0.1 && records.length >= 10) {
    insights.push({
      type: "anomaly",
      title: "Low Export Rate",
      description:
        `Only ${Math.round(exportRate * 100)}% of ideas are being exported. ` +
        "The pipeline may not be producing actionable ideas. Consider trying different angles.",
      confidence: 0.65,
      actionable: true,
    });
  }

  return insights;
}

/**
 * Convert methodology insights to a markdown report.
 */
export function insightsToMarkdown(insights: MethodologyInsight[]): string {
  if (insights.length === 0) return "# Methodology Insights\n\nNo insights available yet.\n";

  const lines: string[] = ["# Methodology Insights\n"];

  const typeEmoji: Record<string, string> = {
    trend: "📈",
    anomaly: "⚠️",
    recommendation: "💡",
  };

  for (const insight of insights) {
    const emoji = typeEmoji[insight.type] ?? "📋";
    const confidence = Math.round(insight.confidence * 100);
    const badge = insight.actionable ? " `actionable`" : "";

    lines.push(`## ${emoji} ${insight.title}${badge}\n`);
    lines.push(`**Type:** ${insight.type} · **Confidence:** ${confidence}%\n`);
    lines.push(insight.description);
    lines.push("");
  }

  return lines.join("\n");
}

// ---- Testing Utility ----

/** Clear all adaptive methodology data (for testing). */
export function clearAdaptiveMethodology(): void {
  effectivenessRecords.length = 0;
  profiles.clear();
  experiments.clear();
  feedbackRecords.length = 0;
  initialized = false;
}
