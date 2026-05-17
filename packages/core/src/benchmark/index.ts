/**
 * @module benchmark
 *
 * Benchmark and evaluation mode: compare innovation quality across models,
 * angle configurations, and prompt variations. Uses LLM-as-judge with
 * calibrated rubrics for diversity, specificity, actionability, and novelty.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import type { AngleId, AngleResult } from "../types.js";
import { ANGLE_IDS } from "../types.js";

// ---- Types ----

export const EVALUATION_CRITERIA = [
  "diversity",
  "specificity",
  "actionability",
  "novelty",
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

export const IdeaEvaluationSchema = z.object({
  ideaTitle: z.string().max(500),
  diversity: z.number().min(1).max(10),
  specificity: z.number().min(1).max(10),
  actionability: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  overallScore: z.number().min(1).max(10),
  feedback: z.string().max(1000),
});

export const ModelBenchmarkSchema = z.object({
  model: z.string(),
  angleId: z.string(),
  ideaCount: z.number(),
  evaluations: z.array(IdeaEvaluationSchema),
  averageScores: z.object({
    diversity: z.number(),
    specificity: z.number(),
    actionability: z.number(),
    novelty: z.number(),
    overall: z.number(),
  }),
  durationMs: z.number(),
  error: z.string().optional(),
});

export const BenchmarkReportSchema = z.object({
  subject: z.string(),
  angleIds: z.array(z.string()),
  models: z.array(z.string()),
  results: z.array(ModelBenchmarkSchema),
  summary: z.object({
    bestOverall: z.string(),
    bestByCategory: z.record(z.string(), z.string()),
    ranking: z.array(z.object({ model: z.string(), score: z.number() })),
  }),
  createdAt: z.string(),
});

export type IdeaEvaluation = z.infer<typeof IdeaEvaluationSchema>;
export type ModelBenchmark = z.infer<typeof ModelBenchmarkSchema>;
export type BenchmarkReport = z.infer<typeof BenchmarkReportSchema>;

// ---- Evaluation Prompt ----

function buildEvaluationPrompt(subject: string, angleResult: AngleResult): string {
  return `You are an expert innovation evaluator using a calibrated rubric. Evaluate each idea independently.

${wrapUserInput("SUBJECT", subject)}

ANGLE: ${angleResult.angleName}
IDEAS TO EVALUATE:
"""
${sanitizeLlmOutput(
  JSON.stringify(
    angleResult.ideas.map((i) => ({
      title: i.title,
      description: i.description,
      potentialImpact: i.potentialImpact,
    })),
    null,
    2
  )
)}
"""

For each idea, score on these dimensions (1-10):
- **diversity**: How different is this from conventional thinking? (1=obvious, 10=paradigm-shifting)
- **specificity**: How concrete and detailed is the idea? (1=vague, 10=immediately implementable)
- **actionability**: How actionable are the next steps? (1=no path forward, 10=clear roadmap)
- **novelty**: How original is this idea? (1=exists already, 10=never been proposed)
- **overallScore**: Holistic assessment factoring all criteria
- **feedback**: Brief constructive feedback

You MUST respond with valid JSON only.

{
  "evaluations": [
    {
      "ideaTitle": "Exact idea title",
      "diversity": 7,
      "specificity": 8,
      "actionability": 6,
      "novelty": 9,
      "overallScore": 7,
      "feedback": "Brief feedback"
    }
  ]
}`;
}

// ---- Core Functions ----

/**
 * Evaluate ideas from a single angle result using LLM-as-judge.
 */
export async function evaluateAngleResult(
  subject: string,
  angleResult: AngleResult,
  judgeModel?: string,
  signal?: AbortSignal
): Promise<IdeaEvaluation[]> {
  if (angleResult.ideas.length === 0) return [];

  const prompt = buildEvaluationPrompt(subject, angleResult);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: judgeModel, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse evaluation response: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const result = z.object({ evaluations: z.array(IdeaEvaluationSchema) }).parse(parsed);
  return result.evaluations;
}

/**
 * Run a benchmark comparing innovation quality across multiple models.
 *
 * @param subject - The subject to innovate on
 * @param models - Models to compare
 * @param angleIds - Angles to test (defaults to first 3)
 * @param judgeModel - Model used for evaluation (defaults to first model)
 * @param onProgress - Optional progress callback
 * @param signal - Optional AbortSignal
 */
export async function runBenchmark(
  subject: string,
  models: string[],
  angleIds?: AngleId[],
  judgeModel?: string,
  onProgress?: (status: string) => void,
  signal?: AbortSignal
): Promise<BenchmarkReport> {
  if (models.length === 0) {
    throw new Error("At least one model is required for benchmarking");
  }

  const angles: AngleId[] = angleIds ?? [...ANGLE_IDS];
  const judge = judgeModel ?? models[0];
  const results: ModelBenchmark[] = [];

  // Investigate once with the first model
  onProgress?.("Investigating subject...");
  const investigation = await investigate(subject, models[0], signal);

  for (const model of models) {
    for (const angleId of angles) {
      if (signal?.aborted) break;
      onProgress?.(`Generating with ${model} / ${angleId}...`);

      const startTime = Date.now();
      try {
        const angleResult = await generateForAngle(subject, investigation, angleId, model, signal);

        const durationMs = Date.now() - startTime;

        onProgress?.(`Evaluating ${model} / ${angleId}...`);
        const evaluations = await evaluateAngleResult(subject, angleResult, judge, signal);

        const avgScores = computeAverageScores(evaluations);

        results.push({
          model,
          angleId,
          ideaCount: angleResult.ideas.length,
          evaluations,
          averageScores: avgScores,
          durationMs,
        });
      } catch (err) {
        results.push({
          model,
          angleId,
          ideaCount: 0,
          evaluations: [],
          averageScores: { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 },
          durationMs: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const summary = computeSummary(models, results);

  return {
    subject,
    angleIds: angles,
    models,
    results,
    summary,
    createdAt: new Date().toISOString(),
  };
}

function computeAverageScores(evaluations: IdeaEvaluation[]): ModelBenchmark["averageScores"] {
  if (evaluations.length === 0) {
    return { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 };
  }

  const sum = evaluations.reduce(
    (acc, e) => ({
      diversity: acc.diversity + e.diversity,
      specificity: acc.specificity + e.specificity,
      actionability: acc.actionability + e.actionability,
      novelty: acc.novelty + e.novelty,
      overall: acc.overall + e.overallScore,
    }),
    { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 }
  );

  const n = evaluations.length;
  return {
    diversity: +(sum.diversity / n).toFixed(2),
    specificity: +(sum.specificity / n).toFixed(2),
    actionability: +(sum.actionability / n).toFixed(2),
    novelty: +(sum.novelty / n).toFixed(2),
    overall: +(sum.overall / n).toFixed(2),
  };
}

function computeSummary(models: string[], results: ModelBenchmark[]): BenchmarkReport["summary"] {
  // Aggregate scores per model
  const modelScores = new Map<
    string,
    { total: number; count: number; perCategory: Record<string, { total: number; count: number }> }
  >();

  for (const r of results) {
    if (!modelScores.has(r.model)) {
      modelScores.set(r.model, { total: 0, count: 0, perCategory: {} });
    }
    const ms = modelScores.get(r.model)!;
    ms.total += r.averageScores.overall;
    ms.count++;

    for (const criterion of EVALUATION_CRITERIA) {
      if (!ms.perCategory[criterion]) {
        ms.perCategory[criterion] = { total: 0, count: 0 };
      }
      ms.perCategory[criterion].total += r.averageScores[criterion];
      ms.perCategory[criterion].count++;
    }
  }

  const ranking = Array.from(modelScores.entries())
    .map(([model, data]) => ({
      model,
      score: data.count > 0 ? +(data.total / data.count).toFixed(2) : 0,
    }))
    .sort((a, b) => b.score - a.score);

  const bestOverall = ranking[0]?.model ?? models[0];

  const bestByCategory: Record<string, string> = {};
  for (const criterion of EVALUATION_CRITERIA) {
    let bestModel = models[0];
    let bestScore = 0;
    for (const [model, data] of modelScores) {
      const cat = data.perCategory[criterion];
      const avg = cat ? cat.total / cat.count : 0;
      if (avg > bestScore) {
        bestScore = avg;
        bestModel = model;
      }
    }
    bestByCategory[criterion] = bestModel;
  }

  return { bestOverall, bestByCategory, ranking };
}

/**
 * Export a benchmark report to Markdown.
 */
export function benchmarkToMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# Benchmark Report: ${report.subject}`);
  lines.push(`*Generated: ${report.createdAt}*\n`);
  lines.push(`## Models Compared: ${report.models.join(", ")}`);
  lines.push(`## Angles Tested: ${report.angleIds.join(", ")}\n`);

  lines.push("## Summary");
  lines.push(`**Best Overall:** ${report.summary.bestOverall}`);
  lines.push("\n### Ranking");
  for (const r of report.summary.ranking) {
    lines.push(`- ${r.model}: ${r.score}/10`);
  }

  lines.push("\n### Best by Category");
  for (const [cat, model] of Object.entries(report.summary.bestByCategory)) {
    lines.push(`- ${cat}: ${model}`);
  }

  lines.push("\n## Detailed Results");
  for (const r of report.results) {
    lines.push(`\n### ${r.model} / ${r.angleId}`);
    if (r.error) {
      lines.push(`**Error:** ${r.error}`);
      continue;
    }
    lines.push(`Ideas: ${r.ideaCount} | Duration: ${r.durationMs}ms`);
    lines.push(
      `Scores: D:${r.averageScores.diversity} S:${r.averageScores.specificity} A:${r.averageScores.actionability} N:${r.averageScores.novelty} O:${r.averageScores.overall}`
    );
  }

  return lines.join("\n");
}

// ---- Canonical Test Subjects ----

/** 20 diverse innovation domains for comprehensive benchmarking. */
export const CANONICAL_SUBJECTS = [
  "Reducing food waste in urban restaurant supply chains",
  "Improving mental health support for remote workers",
  "Making renewable energy accessible to low-income communities",
  "Reducing plastic pollution in ocean ecosystems",
  "Enhancing K-12 STEM education in rural areas",
  "Streamlining clinical trial recruitment for rare diseases",
  "Improving last-mile delivery in dense urban environments",
  "Reducing carbon footprint of commercial air travel",
  "Enhancing cybersecurity for small and medium businesses",
  "Improving water purification in developing regions",
  "Reducing hospital readmission rates for chronic conditions",
  "Making affordable housing construction more sustainable",
  "Improving accessibility of public transportation for disabled individuals",
  "Reducing agricultural pesticide use while maintaining crop yields",
  "Enhancing elderly care through ambient assisted living",
  "Improving financial literacy among young adults",
  "Reducing textile industry waste through circular fashion",
  "Enhancing wildfire detection and early warning systems",
  "Improving organ donation matching and logistics",
  "Reducing bias in automated hiring and recruitment systems",
] as const;

// ---- Cost / Latency Tracking ----

export const BenchmarkMetricsSchema = z.object({
  model: z.string(),
  totalDurationMs: z.number(),
  latencyP50Ms: z.number(),
  latencyP90Ms: z.number(),
  latencyP99Ms: z.number(),
  estimatedCostUsd: z.number(),
  avgTokensPerIdea: z.number(),
  qualityScores: z.object({
    diversity: z.number(),
    specificity: z.number(),
    actionability: z.number(),
    novelty: z.number(),
    overall: z.number(),
  }),
  sampleCount: z.number(),
});

export type BenchmarkMetrics = z.infer<typeof BenchmarkMetricsSchema>;

/** Estimated cost per 1K tokens (USD) — rough average across common providers. */
const ESTIMATED_COST_PER_1K_TOKENS = 0.002;

/** Average tokens per idea (rough estimate based on typical output). */
const AVG_TOKENS_PER_IDEA = 150;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

/**
 * Aggregate cost, latency percentiles, and quality scores for each model
 * from a benchmark report.
 */
export function computeBenchmarkMetrics(report: BenchmarkReport): BenchmarkMetrics[] {
  const byModel = new Map<string, ModelBenchmark[]>();
  for (const r of report.results) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }

  const metrics: BenchmarkMetrics[] = [];

  for (const [model, runs] of byModel) {
    const durations = runs.map((r) => r.durationMs).sort((a, b) => a - b);
    const totalIdeas = runs.reduce((sum, r) => sum + r.ideaCount, 0);
    const totalTokens = totalIdeas * AVG_TOKENS_PER_IDEA;

    const qualitySums = { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 };
    let qualityCount = 0;
    for (const r of runs) {
      if (r.evaluations.length > 0) {
        qualitySums.diversity += r.averageScores.diversity;
        qualitySums.specificity += r.averageScores.specificity;
        qualitySums.actionability += r.averageScores.actionability;
        qualitySums.novelty += r.averageScores.novelty;
        qualitySums.overall += r.averageScores.overall;
        qualityCount++;
      }
    }

    const qc = qualityCount || 1;
    metrics.push({
      model,
      totalDurationMs: durations.reduce((s, d) => s + d, 0),
      latencyP50Ms: +percentile(durations, 50).toFixed(0),
      latencyP90Ms: +percentile(durations, 90).toFixed(0),
      latencyP99Ms: +percentile(durations, 99).toFixed(0),
      estimatedCostUsd: +((totalTokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS).toFixed(4),
      avgTokensPerIdea: totalIdeas > 0 ? +(totalTokens / totalIdeas).toFixed(0) : 0,
      qualityScores: {
        diversity: +(qualitySums.diversity / qc).toFixed(2),
        specificity: +(qualitySums.specificity / qc).toFixed(2),
        actionability: +(qualitySums.actionability / qc).toFixed(2),
        novelty: +(qualitySums.novelty / qc).toFixed(2),
        overall: +(qualitySums.overall / qc).toFixed(2),
      },
      sampleCount: runs.length,
    });
  }

  return metrics;
}

// ---- Statistical Significance (Welch's t-test) ----

export const StatisticalSignificanceSchema = z.object({
  modelA: z.string(),
  modelB: z.string(),
  meanA: z.number(),
  meanB: z.number(),
  tStatistic: z.number(),
  degreesOfFreedom: z.number(),
  pValue: z.number(),
  significant: z.boolean(),
});

export type StatisticalSignificance = z.infer<typeof StatisticalSignificanceSchema>;

/**
 * Approximate two-tailed p-value from t-statistic using the
 * regularized incomplete beta function approximation.
 */
function approxPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  const x = df / (df + t * t);
  // Approximation using the series expansion for the regularized incomplete beta function
  // For large df, use normal approximation
  if (df > 100) {
    // Normal approximation
    const absT = Math.abs(t);
    const p = Math.exp(-0.5 * absT * absT) / Math.sqrt(2 * Math.PI);
    return Math.min(1, 2 * p * (1 + (absT * (0.2316419 * absT)) / (1 + 0.2316419 * absT)));
  }
  // Simple approximation for the Beta CDF via continued fraction
  let result = 1;
  const halfDf = df / 2;
  let term = 1;
  for (let i = 1; i <= 50; i++) {
    term *= (x * (halfDf + i - 1)) / i;
    result += term;
    if (Math.abs(term) < 1e-10) break;
  }
  const beta = (result * Math.pow(x, halfDf) * Math.pow(1 - x, 0.5)) / halfDf;
  return Math.min(1, Math.max(0, beta));
}

/**
 * Compare two models' score distributions using Welch's t-test.
 * Returns statistical significance at α = 0.05.
 */
export function computeStatisticalSignificance(
  report: BenchmarkReport,
  modelA: string,
  modelB: string,
  alpha = 0.05
): StatisticalSignificance {
  const scoresA = report.results
    .filter((r) => r.model === modelA && r.evaluations.length > 0)
    .map((r) => r.averageScores.overall);
  const scoresB = report.results
    .filter((r) => r.model === modelB && r.evaluations.length > 0)
    .map((r) => r.averageScores.overall);

  const nA = scoresA.length;
  const nB = scoresB.length;

  if (nA < 2 || nB < 2) {
    return {
      modelA,
      modelB,
      meanA: nA > 0 ? scoresA.reduce((a, b) => a + b, 0) / nA : 0,
      meanB: nB > 0 ? scoresB.reduce((a, b) => a + b, 0) / nB : 0,
      tStatistic: 0,
      degreesOfFreedom: 0,
      pValue: 1,
      significant: false,
    };
  }

  const meanA = scoresA.reduce((a, b) => a + b, 0) / nA;
  const meanB = scoresB.reduce((a, b) => a + b, 0) / nB;

  const varA = scoresA.reduce((sum, s) => sum + (s - meanA) ** 2, 0) / (nA - 1);
  const varB = scoresB.reduce((sum, s) => sum + (s - meanB) ** 2, 0) / (nB - 1);

  const seA = varA / nA;
  const seB = varB / nB;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff === 0) {
    return {
      modelA,
      modelB,
      meanA,
      meanB,
      tStatistic: 0,
      degreesOfFreedom: nA + nB - 2,
      pValue: 1,
      significant: false,
    };
  }

  const tStat = (meanA - meanB) / seDiff;

  // Welch-Satterthwaite degrees of freedom
  const df = (seA + seB) ** 2 / (seA ** 2 / (nA - 1) + seB ** 2 / (nB - 1));

  const pValue = approxPValue(tStat, df);

  return {
    modelA,
    modelB,
    meanA: +meanA.toFixed(4),
    meanB: +meanB.toFixed(4),
    tStatistic: +tStat.toFixed(4),
    degreesOfFreedom: +df.toFixed(2),
    pValue: +pValue.toFixed(4),
    significant: pValue < alpha,
  };
}

// ---- Radar Chart Data ----

export const RadarChartAxisSchema = z.object({
  axis: z.string(),
  value: z.number(),
});

export const RadarChartSeriesSchema = z.object({
  model: z.string(),
  axes: z.array(RadarChartAxisSchema),
});

export const RadarChartDataSchema = z.object({
  series: z.array(RadarChartSeriesSchema),
  axisLabels: z.array(z.string()),
});

export type RadarChartAxis = z.infer<typeof RadarChartAxisSchema>;
export type RadarChartSeries = z.infer<typeof RadarChartSeriesSchema>;
export type RadarChartData = z.infer<typeof RadarChartDataSchema>;

/**
 * Transform benchmark results into radar chart visualization data.
 * Each model becomes a series with axes for each evaluation criterion.
 */
export function generateRadarChartData(report: BenchmarkReport): RadarChartData {
  const axisLabels = [...EVALUATION_CRITERIA];
  const modelAverages = new Map<string, Record<string, { total: number; count: number }>>();

  for (const r of report.results) {
    if (!modelAverages.has(r.model)) {
      modelAverages.set(r.model, {});
    }
    const ma = modelAverages.get(r.model)!;
    for (const criterion of EVALUATION_CRITERIA) {
      if (!ma[criterion]) ma[criterion] = { total: 0, count: 0 };
      ma[criterion].total += r.averageScores[criterion];
      ma[criterion].count++;
    }
  }

  const series: RadarChartSeries[] = [];
  for (const [model, avgs] of modelAverages) {
    const axes: RadarChartAxis[] = axisLabels.map((axis) => ({
      axis,
      value:
        avgs[axis] && avgs[axis].count > 0 ? +(avgs[axis].total / avgs[axis].count).toFixed(2) : 0,
    }));
    series.push({ model, axes });
  }

  return { series, axisLabels: [...axisLabels] };
}

// ---- Enhanced Comparative Report ----

export const ComparativeReportSchema = z.object({
  subject: z.string(),
  models: z.array(z.string()),
  metrics: z.array(BenchmarkMetricsSchema),
  radarChart: RadarChartDataSchema,
  pairwiseSignificance: z.array(StatisticalSignificanceSchema),
  overallRanking: z.array(z.object({ model: z.string(), score: z.number() })),
  createdAt: z.string(),
});

export type ComparativeReport = z.infer<typeof ComparativeReportSchema>;

/**
 * Generate a comprehensive comparative report across models with
 * cost/latency metrics, statistical significance, and radar chart data.
 */
export function generateComparativeReport(report: BenchmarkReport): ComparativeReport {
  const metrics = computeBenchmarkMetrics(report);
  const radarChart = generateRadarChartData(report);

  // Pairwise statistical significance for all model pairs
  const pairwiseSignificance: StatisticalSignificance[] = [];
  for (let i = 0; i < report.models.length; i++) {
    for (let j = i + 1; j < report.models.length; j++) {
      pairwiseSignificance.push(
        computeStatisticalSignificance(report, report.models[i], report.models[j])
      );
    }
  }

  return {
    subject: report.subject,
    models: report.models,
    metrics,
    radarChart,
    pairwiseSignificance,
    overallRanking: report.summary.ranking,
    createdAt: new Date().toISOString(),
  };
}

// ---- Suite Runner ----

export const BenchmarkSuiteResultSchema = z.object({
  subjects: z.array(z.string()),
  models: z.array(z.string()),
  reports: z.array(BenchmarkReportSchema),
  comparativeReports: z.array(ComparativeReportSchema),
  aggregateRanking: z.array(z.object({ model: z.string(), score: z.number() })),
  totalDurationMs: z.number(),
  createdAt: z.string(),
});

export type BenchmarkSuiteResult = z.infer<typeof BenchmarkSuiteResultSchema>;

/**
 * Run benchmarks across all canonical subjects (or a subset) with progress tracking.
 *
 * @param models - Models to compare
 * @param options - Suite configuration options
 */
export async function runBenchmarkSuite(
  models: string[],
  options?: {
    subjects?: string[];
    angleIds?: AngleId[];
    judgeModel?: string;
    onProgress?: (status: string, completed: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<BenchmarkSuiteResult> {
  const subjects = options?.subjects ?? [...CANONICAL_SUBJECTS];
  const total = subjects.length;
  const reports: BenchmarkReport[] = [];
  const comparativeReports: ComparativeReport[] = [];
  const suiteStart = Date.now();

  for (let i = 0; i < subjects.length; i++) {
    if (options?.signal?.aborted) break;

    const subject = subjects[i];
    options?.onProgress?.(`Running benchmark ${i + 1}/${total}: ${subject}`, i, total);

    try {
      const report = await runBenchmark(
        subject,
        models,
        options?.angleIds,
        options?.judgeModel,
        (status) => options?.onProgress?.(`[${i + 1}/${total}] ${status}`, i, total),
        options?.signal
      );
      reports.push(report);
      comparativeReports.push(generateComparativeReport(report));
    } catch (err) {
      // Graceful degradation: skip failed subjects
      options?.onProgress?.(
        `Skipped "${subject}": ${err instanceof Error ? err.message : String(err)}`,
        i,
        total
      );
    }
  }

  // Aggregate ranking across all reports
  const modelTotals = new Map<string, { total: number; count: number }>();
  for (const report of reports) {
    for (const entry of report.summary.ranking) {
      if (!modelTotals.has(entry.model)) modelTotals.set(entry.model, { total: 0, count: 0 });
      const mt = modelTotals.get(entry.model)!;
      mt.total += entry.score;
      mt.count++;
    }
  }

  const aggregateRanking = Array.from(modelTotals.entries())
    .map(([model, data]) => ({
      model,
      score: data.count > 0 ? +(data.total / data.count).toFixed(2) : 0,
    }))
    .sort((a, b) => b.score - a.score);

  options?.onProgress?.("Suite complete", total, total);

  return {
    subjects,
    models,
    reports,
    comparativeReports,
    aggregateRanking,
    totalDurationMs: Date.now() - suiteStart,
    createdAt: new Date().toISOString(),
  };
}
