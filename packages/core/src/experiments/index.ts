/**
 * @module experiments
 *
 * Automated Innovation Experiments — hypothesis-driven experimentation framework
 * for running A/B prompt variants, measuring idea quality scores, and producing
 * statistical reports. Leverages the existing analytics, scoring, and rubric modules.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const ExperimentStatusSchema = z.enum(["draft", "running", "paused", "completed", "failed"]);

export const PromptVariantSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  promptModifier: z.string().max(5000),
  model: z.string().max(100).optional(),
  angles: z.array(z.string().max(100)).max(20).optional(),
});

export const ExperimentResultSchema = z.object({
  variantId: z.string().max(100),
  runId: z.string().max(100),
  ideasGenerated: z.number().min(0),
  averageScore: z.number().min(0).max(10),
  scores: z.object({
    feasibility: z.number().min(0).max(10),
    originality: z.number().min(0).max(10),
    impact: z.number().min(0).max(10),
    clarity: z.number().min(0).max(10),
  }),
  durationMs: z.number().min(0),
  timestamp: z.string(),
  rawIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        score: z.number().min(0).max(10),
      })
    )
    .max(100),
});

export const ExperimentHypothesisSchema = z.object({
  statement: z.string().max(2000),
  metric: z.string().max(500),
  expectedOutcome: z.string().max(1000),
  successThreshold: z.number().min(0).max(10),
  confidenceLevel: z.number().min(0.5).max(0.99).default(0.95),
});

export const StatisticalReportSchema = z.object({
  experimentId: z.string().max(100),
  hypothesis: ExperimentHypothesisSchema,
  sampleSizes: z.record(z.number()),
  means: z.record(z.number()),
  stdDevs: z.record(z.number()),
  winner: z.string().max(100).nullable(),
  confidenceLevel: z.number().min(0).max(1),
  pValue: z.number().min(0).max(1),
  effectSize: z.number(),
  significant: z.boolean(),
  recommendation: z.string().max(2000),
  generatedAt: z.string(),
});

export const ExperimentSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000),
  subject: z.string().max(500),
  hypothesis: ExperimentHypothesisSchema,
  variants: z.array(PromptVariantSchema).min(2).max(10),
  runsPerVariant: z.number().min(1).max(50).default(5),
  status: ExperimentStatusSchema,
  results: z.array(ExperimentResultSchema),
  report: StatisticalReportSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

// ---- Types ----

export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;
export type PromptVariant = z.infer<typeof PromptVariantSchema>;
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
export type ExperimentHypothesis = z.infer<typeof ExperimentHypothesisSchema>;
export type StatisticalReport = z.infer<typeof StatisticalReportSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;

export interface ExperimentConfig {
  subject: string;
  name: string;
  description?: string;
  hypothesis: ExperimentHypothesis;
  variants: Omit<PromptVariant, "id">[];
  runsPerVariant?: number;
}

export type ExperimentProgressCallback = (progress: {
  phase: "setup" | "running" | "scoring" | "analyzing";
  variantId?: string;
  runIndex?: number;
  totalRuns?: number;
  message: string;
}) => void;

// ---- In-Memory Store ----

const experiments = new Map<string, Experiment>();

// ---- Experiment Management ----

/** Create a new experiment. */
export function createExperiment(config: ExperimentConfig): Experiment {
  const id = `exp_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const variants: PromptVariant[] = config.variants.map((v, i) => ({
    ...v,
    id: v.name ? `var_${v.name.toLowerCase().replace(/\s+/g, "_")}` : `var_${i}`,
  }));

  const experiment: Experiment = {
    id,
    name: config.name,
    description: config.description ?? "",
    subject: config.subject,
    hypothesis: config.hypothesis,
    variants,
    runsPerVariant: config.runsPerVariant ?? 5,
    status: "draft",
    results: [],
    createdAt: now,
    updatedAt: now,
  };

  experiments.set(id, experiment);
  return experiment;
}

/** Get an experiment by ID. */
export function getExperiment(id: string): Experiment | undefined {
  return experiments.get(id);
}

/** List all experiments. */
export function listExperiments(): Experiment[] {
  return Array.from(experiments.values());
}

/** Delete an experiment. */
export function deleteExperiment(id: string): boolean {
  return experiments.delete(id);
}

/** Clear all experiments (for testing). */
export function clearExperiments(): void {
  experiments.clear();
}

// ---- Experiment Execution ----

/**
 * Run an experiment — execute all variants and collect results.
 * Uses a scoring function that callers provide for flexibility.
 */
export async function runExperiment(
  experimentId: string,
  runner: (
    variant: PromptVariant,
    subject: string
  ) => Promise<{
    ideas: Array<{ title: string; description: string }>;
    durationMs: number;
  }>,
  scorer: (ideas: Array<{ title: string; description: string }>) => Promise<{
    scores: Array<{
      title: string;
      score: number;
      feasibility: number;
      originality: number;
      impact: number;
      clarity: number;
    }>;
  }>,
  onProgress?: ExperimentProgressCallback
): Promise<Experiment> {
  const experiment = experiments.get(experimentId);
  if (!experiment) throw new ValidationError(`Experiment not found: ${experimentId}`);
  if (experiment.status === "completed") throw new ValidationError("Experiment already completed");

  experiment.status = "running";
  experiment.updatedAt = new Date().toISOString();
  experiment.results = [];

  const totalRuns = experiment.variants.length * experiment.runsPerVariant;
  let runCount = 0;

  for (const variant of experiment.variants) {
    for (let i = 0; i < experiment.runsPerVariant; i++) {
      runCount++;
      onProgress?.({
        phase: "running",
        variantId: variant.id,
        runIndex: i + 1,
        totalRuns,
        message: `Running variant "${variant.name}" (${runCount}/${totalRuns})`,
      });

      try {
        const runResult = await runner(variant, experiment.subject);

        onProgress?.({
          phase: "scoring",
          variantId: variant.id,
          runIndex: i + 1,
          totalRuns,
          message: `Scoring ideas from variant "${variant.name}"`,
        });

        const scored = await scorer(runResult.ideas);

        const avgScore =
          scored.scores.length > 0
            ? scored.scores.reduce((s, r) => s + r.score, 0) / scored.scores.length
            : 0;

        const avgScores = {
          feasibility: avg(scored.scores.map((s) => s.feasibility)),
          originality: avg(scored.scores.map((s) => s.originality)),
          impact: avg(scored.scores.map((s) => s.impact)),
          clarity: avg(scored.scores.map((s) => s.clarity)),
        };

        const result: ExperimentResult = {
          variantId: variant.id,
          runId: `run_${randomUUID().slice(0, 8)}`,
          ideasGenerated: runResult.ideas.length,
          averageScore: round(avgScore, 2),
          scores: {
            feasibility: round(avgScores.feasibility, 2),
            originality: round(avgScores.originality, 2),
            impact: round(avgScores.impact, 2),
            clarity: round(avgScores.clarity, 2),
          },
          durationMs: runResult.durationMs,
          timestamp: new Date().toISOString(),
          rawIdeas: scored.scores.map((s) => ({
            title: s.title,
            description: runResult.ideas.find((i) => i.title === s.title)?.description ?? "",
            score: s.score,
          })),
        };

        experiment.results.push(result);
      } catch {
        experiment.results.push({
          variantId: variant.id,
          runId: `run_${randomUUID().slice(0, 8)}`,
          ideasGenerated: 0,
          averageScore: 0,
          scores: { feasibility: 0, originality: 0, impact: 0, clarity: 0 },
          durationMs: 0,
          timestamp: new Date().toISOString(),
          rawIdeas: [],
        });
      }
    }
  }

  onProgress?.({
    phase: "analyzing",
    message: "Generating statistical report",
  });

  experiment.report = generateStatisticalReport(experiment);
  experiment.status = "completed";
  experiment.completedAt = new Date().toISOString();
  experiment.updatedAt = new Date().toISOString();

  return experiment;
}

// ---- Statistical Analysis ----

/** Generate a statistical report from experiment results. */
export function generateStatisticalReport(experiment: Experiment): StatisticalReport {
  const variantGroups = new Map<string, ExperimentResult[]>();

  for (const result of experiment.results) {
    const group = variantGroups.get(result.variantId) ?? [];
    group.push(result);
    variantGroups.set(result.variantId, group);
  }

  const sampleSizes: Record<string, number> = {};
  const means: Record<string, number> = {};
  const stdDevs: Record<string, number> = {};

  for (const [variantId, results] of variantGroups) {
    const scores = results.map((r) => r.averageScore);
    sampleSizes[variantId] = scores.length;
    means[variantId] = avg(scores);
    stdDevs[variantId] = stdDev(scores);
  }

  // Find the best variant
  const sortedVariants = Object.entries(means).sort((a, b) => b[1] - a[1]);
  const bestVariant = sortedVariants[0]?.[0] ?? null;
  const secondBest = sortedVariants[1];

  // Two-sample t-test between best and second-best
  let pValue = 1;
  let effectSize = 0;
  let significant = false;

  if (bestVariant && secondBest) {
    const bestResults = variantGroups.get(bestVariant) ?? [];
    const secondResults = variantGroups.get(secondBest[0]) ?? [];
    const bestScores = bestResults.map((r) => r.averageScore);
    const secondScores = secondResults.map((r) => r.averageScore);

    const tTestResult = twoSampleTTest(bestScores, secondScores);
    pValue = tTestResult.pValue;
    effectSize = tTestResult.effectSize;
    significant = pValue < 1 - experiment.hypothesis.confidenceLevel;
  }

  const meetsThreshold = bestVariant
    ? (means[bestVariant] ?? 0) >= experiment.hypothesis.successThreshold
    : false;

  const recommendation = buildRecommendation(
    experiment,
    bestVariant,
    means,
    significant,
    meetsThreshold,
    pValue,
    effectSize
  );

  return {
    experimentId: experiment.id,
    hypothesis: experiment.hypothesis,
    sampleSizes,
    means: Object.fromEntries(Object.entries(means).map(([k, v]) => [k, round(v, 3)])),
    stdDevs: Object.fromEntries(Object.entries(stdDevs).map(([k, v]) => [k, round(v, 3)])),
    winner: significant ? bestVariant : null,
    confidenceLevel: experiment.hypothesis.confidenceLevel,
    pValue: round(pValue, 4),
    effectSize: round(effectSize, 3),
    significant,
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}

/** Compare specific metric between two experiment variants. */
export function compareVariants(
  experiment: Experiment,
  variantA: string,
  variantB: string,
  metric: "averageScore" | "feasibility" | "originality" | "impact" | "clarity" = "averageScore"
): {
  meanA: number;
  meanB: number;
  difference: number;
  pValue: number;
  significant: boolean;
  effectSize: number;
} {
  const scoresA = experiment.results
    .filter((r) => r.variantId === variantA)
    .map((r) => (metric === "averageScore" ? r.averageScore : r.scores[metric]));
  const scoresB = experiment.results
    .filter((r) => r.variantId === variantB)
    .map((r) => (metric === "averageScore" ? r.averageScore : r.scores[metric]));

  if (scoresA.length === 0 || scoresB.length === 0) {
    return { meanA: 0, meanB: 0, difference: 0, pValue: 1, significant: false, effectSize: 0 };
  }

  const meanA = avg(scoresA);
  const meanB = avg(scoresB);
  const result = twoSampleTTest(scoresA, scoresB);

  return {
    meanA: round(meanA, 3),
    meanB: round(meanB, 3),
    difference: round(meanA - meanB, 3),
    pValue: round(result.pValue, 4),
    significant: result.pValue < 0.05,
    effectSize: round(result.effectSize, 3),
  };
}

/** Generate a markdown report for an experiment. */
export function experimentToMarkdown(experiment: Experiment): string {
  const lines: string[] = [];
  lines.push(`# Experiment: ${experiment.name}`);
  lines.push("");
  lines.push(`**Status:** ${experiment.status}`);
  lines.push(`**Subject:** ${experiment.subject}`);
  lines.push(`**Created:** ${experiment.createdAt}`);
  if (experiment.completedAt) lines.push(`**Completed:** ${experiment.completedAt}`);
  lines.push("");

  lines.push("## Hypothesis");
  lines.push(`> ${experiment.hypothesis.statement}`);
  lines.push(`- **Metric:** ${experiment.hypothesis.metric}`);
  lines.push(`- **Expected:** ${experiment.hypothesis.expectedOutcome}`);
  lines.push(`- **Threshold:** ${experiment.hypothesis.successThreshold}/10`);
  lines.push("");

  lines.push("## Variants");
  for (const variant of experiment.variants) {
    lines.push(`### ${variant.name}`);
    lines.push(`- **Modifier:** ${variant.promptModifier.slice(0, 200)}...`);
    if (variant.model) lines.push(`- **Model:** ${variant.model}`);
    lines.push("");
  }

  if (experiment.report) {
    const r = experiment.report;
    lines.push("## Results");
    lines.push("");
    lines.push("| Variant | N | Mean | Std Dev |");
    lines.push("|---------|---|------|---------|");
    for (const variant of experiment.variants) {
      lines.push(
        `| ${variant.name} | ${r.sampleSizes[variant.id] ?? 0} | ${r.means[variant.id]?.toFixed(2) ?? "—"} | ${r.stdDevs[variant.id]?.toFixed(2) ?? "—"} |`
      );
    }
    lines.push("");

    lines.push("## Statistical Analysis");
    lines.push(`- **Winner:** ${r.winner ?? "No significant winner"}`);
    lines.push(`- **p-value:** ${r.pValue}`);
    lines.push(`- **Effect size (Cohen's d):** ${r.effectSize}`);
    lines.push(`- **Significant:** ${r.significant ? "✅ Yes" : "❌ No"}`);
    lines.push(`- **Confidence level:** ${(r.confidenceLevel * 100).toFixed(0)}%`);
    lines.push("");

    lines.push("## Recommendation");
    lines.push(r.recommendation);
  }

  return lines.join("\n");
}

// ---- Internal Helpers ----

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = avg(values);
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / (values.length - 1));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Welch's t-test for unequal variances. */
function twoSampleTTest(
  groupA: number[],
  groupB: number[]
): { tStatistic: number; pValue: number; effectSize: number } {
  const nA = groupA.length;
  const nB = groupB.length;

  if (nA < 2 || nB < 2) return { tStatistic: 0, pValue: 1, effectSize: 0 };

  const meanA = avg(groupA);
  const meanB = avg(groupB);
  const varA = stdDev(groupA) ** 2;
  const varB = stdDev(groupB) ** 2;

  const seA = varA / nA;
  const seB = varB / nB;
  const se = Math.sqrt(seA + seB);

  if (se === 0) return { tStatistic: 0, pValue: 1, effectSize: 0 };

  const t = (meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const df = (seA + seB) ** 2 / (seA ** 2 / (nA - 1) + seB ** 2 / (nB - 1));

  // Approximate p-value using the t-distribution via normal approximation for large df
  const pValue = approximatePValue(Math.abs(t), Math.max(1, Math.round(df)));

  // Cohen's d effect size
  const pooledStd = Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));
  const effectSize = pooledStd > 0 ? (meanA - meanB) / pooledStd : 0;

  return { tStatistic: round(t, 4), pValue, effectSize };
}

/** Approximate two-tailed p-value from t-statistic and df. */
function approximatePValue(t: number, df: number): number {
  // Use the regularized incomplete beta function approximation
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  // Simple approximation using the normal distribution for df > 30
  if (df > 30) {
    const z = (t * (1 - 1 / (4 * df))) / Math.sqrt(1 + (t * t) / (2 * df));
    return 2 * (1 - normalCDF(Math.abs(z)));
  }

  // For smaller df, use a simplified beta approximation
  const betaApprox = (Math.pow(x, a) * Math.pow(1 - x, b)) / (a * betaFunction(a, b));
  return Math.min(1, Math.max(0, betaApprox * df));
}

/** Standard normal CDF approximation. */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/** Beta function approximation using Stirling's formula. */
function betaFunction(a: number, b: number): number {
  return (gamma(a) * gamma(b)) / gamma(a + b);
}

/** Gamma function approximation (Stirling). */
function gamma(n: number): number {
  if (n <= 0) return Infinity;
  if (n === 1) return 1;
  if (n === 0.5) return Math.sqrt(Math.PI);
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (n < 0.5) {
    return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
  }

  n -= 1;
  let x = c[0]!;
  for (let i = 1; i < g + 2; i++) {
    x += c[i]! / (n + i);
  }

  const t = n + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
}

function buildRecommendation(
  experiment: Experiment,
  bestVariant: string | null,
  means: Record<string, number>,
  significant: boolean,
  meetsThreshold: boolean,
  pValue: number,
  effectSize: number
): string {
  const parts: string[] = [];

  if (!bestVariant) {
    parts.push("No results were collected. Consider re-running the experiment.");
    return parts.join(" ");
  }

  const bestName = experiment.variants.find((v) => v.id === bestVariant)?.name ?? bestVariant;
  const bestMean = means[bestVariant] ?? 0;

  if (significant && meetsThreshold) {
    parts.push(`**Adopt "${bestName}".** It achieved a mean score of ${bestMean.toFixed(2)}/10,`);
    parts.push(`exceeding the threshold of ${experiment.hypothesis.successThreshold}/10`);
    parts.push(`with statistical significance (p=${pValue.toFixed(4)}).`);
    if (Math.abs(effectSize) > 0.8) parts.push("The effect size is large.");
    else if (Math.abs(effectSize) > 0.5) parts.push("The effect size is medium.");
  } else if (significant && !meetsThreshold) {
    parts.push(`"${bestName}" is the statistically best variant (p=${pValue.toFixed(4)}),`);
    parts.push(
      `but its mean score of ${bestMean.toFixed(2)}/10 does not meet the hypothesis threshold`
    );
    parts.push(`of ${experiment.hypothesis.successThreshold}/10.`);
    parts.push("Consider revising the prompt or lowering the threshold.");
  } else {
    parts.push(
      `No statistically significant difference found between variants (p=${pValue.toFixed(4)}).`
    );
    parts.push(
      `"${bestName}" had the highest mean (${bestMean.toFixed(2)}/10) but more runs may be needed.`
    );
    parts.push("Consider increasing runsPerVariant or refining the prompt variants.");
  }

  return parts.join(" ");
}
