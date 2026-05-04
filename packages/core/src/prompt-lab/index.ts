/**
 * @module prompt-lab
 *
 * Prompt A/B Testing Lab — experiment framework for systematically testing
 * prompt variations across angles. Includes experiment definition, Welch's
 * t-test for statistical significance, git-like prompt versioning, and
 * auto-promotion of winning variants.
 */

import { z } from "zod";

// ---- Schemas ----

export const PromptVariantSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  template: z.string().max(10000),
  createdAt: z.string(),
});

export const AllocationStrategySchema = z.enum(["random", "round-robin", "epsilon-greedy"]);

export const PromptExperimentSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(1000).optional(),
  angleId: z.string().max(100),
  variants: z.array(PromptVariantSchema).min(2).max(10),
  allocation: AllocationStrategySchema.default("random"),
  successMetric: z.enum(["idea-score", "user-rating", "export-rate", "selection-rate"]).default("idea-score"),
  status: z.enum(["draft", "running", "completed", "promoted"]).default("draft"),
  minSampleSize: z.number().min(5).max(1000).default(30),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  winnerId: z.string().max(100).optional(),
});

export const ExperimentResultSchema = z.object({
  variantId: z.string().max(100),
  sampleSize: z.number().min(0),
  mean: z.number(),
  stdDev: z.number(),
  scores: z.array(z.number()).max(10000),
});

export const StatisticalTestResultSchema = z.object({
  controlId: z.string().max(100),
  treatmentId: z.string().max(100),
  tStatistic: z.number(),
  pValue: z.number().min(0).max(1),
  degreesOfFreedom: z.number(),
  isSignificant: z.boolean(),
  winner: z.string().max(100).optional(),
  confidenceLevel: z.number().min(0).max(1),
  effectSize: z.number(),
});

export const PromptVersionSchema = z.object({
  id: z.string().max(100),
  angleId: z.string().max(100),
  version: z.number().min(1),
  template: z.string().max(10000),
  parentVersion: z.number().optional(),
  message: z.string().max(500),
  createdAt: z.string(),
  isActive: z.boolean().default(false),
});

export type PromptVariant = z.infer<typeof PromptVariantSchema>;
export type AllocationStrategy = z.infer<typeof AllocationStrategySchema>;
export type PromptExperiment = z.infer<typeof PromptExperimentSchema>;
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
export type StatisticalTestResult = z.infer<typeof StatisticalTestResultSchema>;
export type PromptVersion = z.infer<typeof PromptVersionSchema>;

// ---- In-Memory Stores ----

const experiments = new Map<string, PromptExperiment>();
const experimentResults = new Map<string, Map<string, number[]>>(); // experimentId -> variantId -> scores
const promptVersions: PromptVersion[] = [];
let roundRobinCounters = new Map<string, number>();

// ---- Experiment Management ----

/**
 * Create a new prompt experiment.
 */
export function createExperiment(
  config: Omit<PromptExperiment, "createdAt" | "status">
): PromptExperiment {
  const experiment: PromptExperiment = {
    ...config,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  experiments.set(experiment.id, experiment);
  experimentResults.set(experiment.id, new Map());
  return experiment;
}

/**
 * Start a draft experiment.
 */
export function startExperiment(experimentId: string): PromptExperiment | undefined {
  const exp = experiments.get(experimentId);
  if (!exp || exp.status !== "draft") return undefined;
  exp.status = "running";
  return exp;
}

/**
 * Get an experiment by ID.
 */
export function getExperiment(experimentId: string): PromptExperiment | undefined {
  return experiments.get(experimentId);
}

/**
 * List all experiments.
 */
export function listExperiments(status?: PromptExperiment["status"]): PromptExperiment[] {
  const all = [...experiments.values()];
  if (status) return all.filter((e) => e.status === status);
  return all;
}

/**
 * Assign a variant for a given experiment using the configured allocation strategy.
 */
export function assignVariant(experimentId: string): PromptVariant | undefined {
  const exp = experiments.get(experimentId);
  if (!exp || exp.status !== "running") return undefined;

  const { variants, allocation } = exp;

  if (allocation === "round-robin") {
    const counter = roundRobinCounters.get(experimentId) ?? 0;
    const variant = variants[counter % variants.length];
    roundRobinCounters.set(experimentId, counter + 1);
    return variant;
  }

  if (allocation === "epsilon-greedy") {
    const epsilon = 0.1;
    if (Math.random() < epsilon) {
      return variants[Math.floor(Math.random() * variants.length)];
    }
    // Exploit best-performing variant
    const results = experimentResults.get(experimentId);
    if (results) {
      let bestVariant = variants[0];
      let bestMean = -Infinity;
      for (const variant of variants) {
        const scores = results.get(variant.id) ?? [];
        const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        if (mean > bestMean) {
          bestMean = mean;
          bestVariant = variant;
        }
      }
      return bestVariant;
    }
  }

  // Default: random
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Record a score for a variant in an experiment.
 */
export function recordExperimentScore(
  experimentId: string,
  variantId: string,
  score: number
): void {
  const results = experimentResults.get(experimentId);
  if (!results) return;
  const scores = results.get(variantId) ?? [];
  scores.push(score);
  results.set(variantId, scores);
}

// ---- Statistical Analysis ----

/**
 * Welch's t-test for comparing two variants' score distributions.
 * Returns significance at p < 0.05 with minimum sample sizes.
 */
export function welchTTest(
  scoresA: number[],
  scoresB: number[]
): StatisticalTestResult {
  const nA = scoresA.length;
  const nB = scoresB.length;

  const meanA = nA > 0 ? scoresA.reduce((a, b) => a + b, 0) / nA : 0;
  const meanB = nB > 0 ? scoresB.reduce((a, b) => a + b, 0) / nB : 0;

  const varA = nA > 1 ? scoresA.reduce((s, x) => s + (x - meanA) ** 2, 0) / (nA - 1) : 0;
  const varB = nB > 1 ? scoresB.reduce((s, x) => s + (x - meanB) ** 2, 0) / (nB - 1) : 0;

  const seA = varA / Math.max(nA, 1);
  const seB = varB / Math.max(nB, 1);
  const seDiff = Math.sqrt(seA + seB);

  const tStatistic = seDiff > 0 ? (meanA - meanB) / seDiff : 0;

  // Welch-Satterthwaite degrees of freedom
  const dfNumerator = (seA + seB) ** 2;
  const dfDenominator =
    (nA > 1 ? seA ** 2 / (nA - 1) : 0) + (nB > 1 ? seB ** 2 / (nB - 1) : 0);
  const df = dfDenominator > 0 ? dfNumerator / dfDenominator : 1;

  // Approximate p-value using normal approximation for large df
  const absT = Math.abs(tStatistic);
  const pValue = df > 30
    ? 2 * (1 - normalCDF(absT))
    : approximateTwoTailedP(absT, Math.round(df));

  const pooledStd = Math.sqrt(
    ((nA > 1 ? varA * (nA - 1) : 0) + (nB > 1 ? varB * (nB - 1) : 0)) / Math.max(nA + nB - 2, 1)
  );
  const effectSize = pooledStd > 0 ? (meanA - meanB) / pooledStd : 0;

  const isSignificant = pValue < 0.05 && nA >= 5 && nB >= 5;
  const winner = isSignificant ? (meanA > meanB ? "A" : "B") : undefined;

  return {
    controlId: "A",
    treatmentId: "B",
    tStatistic: Math.round(tStatistic * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    degreesOfFreedom: Math.round(df * 10) / 10,
    isSignificant,
    winner,
    confidenceLevel: isSignificant ? 1 - pValue : 0,
    effectSize: Math.round(effectSize * 1000) / 1000,
  };
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function approximateTwoTailedP(t: number, df: number): number {
  // Use approximation via normal for simplicity
  const adjustedT = t * (1 - 1 / (4 * Math.max(df, 1)));
  return 2 * (1 - normalCDF(adjustedT));
}

/**
 * Analyze an experiment's results and determine if there's a winner.
 * Auto-promotes winner when p < 0.05 and minimum sample size is met.
 */
export function analyzeExperiment(experimentId: string): {
  experiment: PromptExperiment;
  variantResults: ExperimentResult[];
  tests: StatisticalTestResult[];
  recommendation: string;
} | undefined {
  const exp = experiments.get(experimentId);
  if (!exp) return undefined;

  const results = experimentResults.get(experimentId);
  if (!results) return undefined;

  const variantResults: ExperimentResult[] = exp.variants.map((v) => {
    const scores = results.get(v.id) ?? [];
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const variance =
      scores.length > 1
        ? scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (scores.length - 1)
        : 0;
    return {
      variantId: v.id,
      sampleSize: scores.length,
      mean: Math.round(mean * 1000) / 1000,
      stdDev: Math.round(Math.sqrt(variance) * 1000) / 1000,
      scores,
    };
  });

  // Run pairwise tests (first variant is control)
  const tests: StatisticalTestResult[] = [];
  const controlScores = results.get(exp.variants[0].id) ?? [];

  for (let i = 1; i < exp.variants.length; i++) {
    const treatmentScores = results.get(exp.variants[i].id) ?? [];
    const test = welchTTest(controlScores, treatmentScores);
    test.controlId = exp.variants[0].id;
    test.treatmentId = exp.variants[i].id;
    test.winner = test.isSignificant
      ? (test.tStatistic > 0 ? exp.variants[0].id : exp.variants[i].id)
      : undefined;
    tests.push(test);
  }

  // Auto-promote if conditions met
  const significantTests = tests.filter((t) => t.isSignificant);
  let recommendation = "Insufficient data — continue collecting samples.";

  if (significantTests.length > 0) {
    const allMeetMinSample = variantResults.every((r) => r.sampleSize >= exp.minSampleSize);
    if (allMeetMinSample) {
      const bestVariant = variantResults.sort((a, b) => b.mean - a.mean)[0];
      recommendation = `Promote "${bestVariant.variantId}" — statistically significant improvement (p < 0.05).`;
      exp.winnerId = bestVariant.variantId;
      exp.status = "completed";
      exp.completedAt = new Date().toISOString();
    } else {
      recommendation = `Early signal detected but min sample size (${exp.minSampleSize}) not yet reached.`;
    }
  }

  return { experiment: exp, variantResults, tests, recommendation };
}

// ---- Prompt Versioning ----

/**
 * Commit a new prompt version (git-like versioning).
 */
export function commitPromptVersion(
  angleId: string,
  template: string,
  message: string
): PromptVersion {
  const existing = promptVersions.filter((v) => v.angleId === angleId);
  const latestVersion = existing.length > 0 ? Math.max(...existing.map((v) => v.version)) : 0;
  const newVersion: PromptVersion = {
    id: `${angleId}-v${latestVersion + 1}`,
    angleId,
    version: latestVersion + 1,
    template,
    parentVersion: latestVersion > 0 ? latestVersion : undefined,
    message,
    createdAt: new Date().toISOString(),
    isActive: false,
  };
  promptVersions.push(newVersion);
  return newVersion;
}

/**
 * Activate a specific prompt version (rollback or promotion).
 */
export function activatePromptVersion(angleId: string, version: number): PromptVersion | undefined {
  const target = promptVersions.find((v) => v.angleId === angleId && v.version === version);
  if (!target) return undefined;

  // Deactivate all other versions for this angle
  for (const v of promptVersions) {
    if (v.angleId === angleId) v.isActive = false;
  }
  target.isActive = true;
  return target;
}

/**
 * Get the active prompt version for an angle.
 */
export function getActivePromptVersion(angleId: string): PromptVersion | undefined {
  return promptVersions.find((v) => v.angleId === angleId && v.isActive);
}

/**
 * Get the version history for an angle.
 */
export function getPromptVersionHistory(angleId: string): PromptVersion[] {
  return promptVersions
    .filter((v) => v.angleId === angleId)
    .sort((a, b) => b.version - a.version);
}

/**
 * Rollback to a previous prompt version.
 */
export function rollbackPromptVersion(angleId: string, version: number): PromptVersion | undefined {
  return activatePromptVersion(angleId, version);
}

/** Clear all prompt lab data (for testing). */
export function clearPromptLab(): void {
  experiments.clear();
  experimentResults.clear();
  promptVersions.length = 0;
  roundRobinCounters.clear();
}
