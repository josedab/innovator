/**
 * @module ab-testing
 *
 * Statistically rigorous A/B testing framework for comparing innovation
 * pipeline configurations. Enables controlled experiments measuring which
 * combinations of angles, models, and prompts produce the best outputs.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const TestMetricSchema = z.object({
  name: z.string().max(200),
  type: z.enum(["continuous", "binary", "ordinal"]),
  primary: z.boolean().default(false),
  higherIsBetter: z.boolean().default(true),
});

export const TestResultSchema = z.object({
  variantId: z.string().max(100),
  runId: z.string().max(100),
  metrics: z.record(z.number()),
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        score: z.number().min(0).max(10).optional(),
      })
    )
    .max(100),
  timestamp: z.string(),
  duration: z.number().min(0),
});

export const TestVariantSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000).default(""),
  config: z.object({
    model: z.string().max(100).optional(),
    angles: z.array(z.string().max(100)).max(20).optional(),
    promptTemplate: z.string().max(5000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    pipeline: z.record(z.unknown()).optional(),
  }),
  results: z.array(TestResultSchema).default([]),
});

export const ABTestConfigSchema = z.object({
  significanceLevel: z.number().min(0.001).max(0.5).default(0.05),
  minimumSampleSize: z.number().min(2).max(1000).default(30),
  powerTarget: z.number().min(0.5).max(0.99).default(0.8),
  correctionMethod: z.enum(["bonferroni", "holm", "none"]).default("none"),
});

export const ABTestStatusSchema = z.enum(["draft", "running", "paused", "completed", "cancelled"]);

export const ABTestSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000).default(""),
  hypothesis: z.string().max(2000),
  status: ABTestStatusSchema,
  variants: z.array(TestVariantSchema).min(2).max(10),
  metrics: z.array(TestMetricSchema).min(1).max(20),
  sampleSize: z.number().min(1).max(1000),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  config: ABTestConfigSchema,
});

export const PairwiseComparisonSchema = z.object({
  variantA: z.string().max(100),
  variantB: z.string().max(100),
  metric: z.string().max(200),
  meanA: z.number(),
  meanB: z.number(),
  pValue: z.number().min(0).max(1),
  effectSize: z.number(),
  confidenceInterval: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  significant: z.boolean(),
});

export const PowerAnalysisSchema = z.object({
  requiredSampleSize: z.number().min(0),
  currentPower: z.number().min(0).max(1),
  sufficientData: z.boolean(),
});

export const StatisticalAnalysisSchema = z.object({
  testId: z.string().max(100),
  pairwiseComparisons: z.array(PairwiseComparisonSchema),
  winner: z.string().max(100).nullable(),
  confidence: z.number().min(0).max(1),
  effectSize: z.number(),
  sampleSizeAdequacy: PowerAnalysisSchema,
  recommendation: z.string().max(3000),
});

// ---- Types ----

export type TestMetric = z.infer<typeof TestMetricSchema>;
export type TestResult = z.infer<typeof TestResultSchema>;
export type TestVariant = z.infer<typeof TestVariantSchema>;
export type ABTestConfig = z.infer<typeof ABTestConfigSchema>;
export type ABTestStatus = z.infer<typeof ABTestStatusSchema>;
export type ABTest = z.infer<typeof ABTestSchema>;
export type PairwiseComparison = z.infer<typeof PairwiseComparisonSchema>;
export type PowerAnalysis = z.infer<typeof PowerAnalysisSchema>;
export type StatisticalAnalysis = z.infer<typeof StatisticalAnalysisSchema>;

// ---- In-Memory Store ----

const abTests = new Map<string, ABTest>();

// ---- Core Functions ----

/** Create a new A/B test. */
export function createABTest(
  name: string,
  hypothesis: string,
  variants: Omit<TestVariant, "id" | "results">[],
  metrics: TestMetric[],
  config?: Partial<ABTestConfig>
): ABTest {
  if (variants.length < 2) throw new ValidationError("At least two variants are required");
  if (metrics.length < 1) throw new ValidationError("At least one metric is required");

  const id = `ab_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const resolvedConfig = ABTestConfigSchema.parse(config ?? {});

  const test: ABTest = {
    id,
    name,
    description: "",
    hypothesis,
    status: "draft",
    variants: variants.map((v, i) => ({
      ...v,
      id: v.name ? `var_${v.name.toLowerCase().replace(/\s+/g, "_")}` : `var_${i}`,
      results: [],
    })),
    metrics,
    sampleSize: resolvedConfig.minimumSampleSize,
    config: resolvedConfig,
  };

  abTests.set(id, test);
  return test;
}

/** Get an A/B test by ID. */
export function getABTest(id: string): ABTest | undefined {
  return abTests.get(id);
}

/** List all A/B tests. */
export function listABTests(): ABTest[] {
  return Array.from(abTests.values());
}

/** Delete an A/B test. */
export function deleteABTest(id: string): boolean {
  return abTests.delete(id);
}

/** Clear all A/B tests (for testing). */
export function clearABTests(): void {
  abTests.clear();
}

/**
 * Execute an A/B test with the provided runner function.
 * The runner is invoked for each variant × sampleSize iteration.
 */
export async function runABTest(
  testId: string,
  runner: (
    variant: TestVariant,
    runIndex: number
  ) => Promise<{
    metrics: Record<string, number>;
    ideas: Array<{ title: string; description: string; score?: number }>;
    duration: number;
  }>
): Promise<ABTest> {
  const test = abTests.get(testId);
  if (!test) throw new ValidationError(`A/B test not found: ${testId}`);
  if (test.status === "completed") throw new ValidationError("Test already completed");
  if (test.status === "cancelled") throw new ValidationError("Test has been cancelled");

  test.status = "running";
  test.startedAt = test.startedAt ?? new Date().toISOString();

  for (const variant of test.variants) {
    const existingRuns = variant.results.length;
    const remaining = test.sampleSize - existingRuns;

    for (let i = 0; i < remaining; i++) {
      try {
        const result = await runner(variant, existingRuns + i);
        const testResult: TestResult = {
          variantId: variant.id,
          runId: `run_${randomUUID().slice(0, 8)}`,
          metrics: result.metrics,
          ideas: result.ideas,
          timestamp: new Date().toISOString(),
          duration: result.duration,
        };
        variant.results.push(testResult);
      } catch {
        // Record failed run with zero metrics
        variant.results.push({
          variantId: variant.id,
          runId: `run_${randomUUID().slice(0, 8)}`,
          metrics: {},
          ideas: [],
          timestamp: new Date().toISOString(),
          duration: 0,
        });
      }
    }
  }

  test.status = "completed";
  test.completedAt = new Date().toISOString();
  return test;
}

/** Record a single test run result for a variant. */
export function recordTestResult(
  testId: string,
  variantId: string,
  result: {
    metrics: Record<string, number>;
    ideas?: Array<{ title: string; description: string; score?: number }>;
    duration?: number;
  }
): TestResult {
  const test = abTests.get(testId);
  if (!test) throw new ValidationError(`A/B test not found: ${testId}`);

  const variant = test.variants.find((v) => v.id === variantId);
  if (!variant) throw new ValidationError(`Variant not found: ${variantId}`);

  if (test.status === "draft") {
    test.status = "running";
    test.startedAt = new Date().toISOString();
  }

  const testResult: TestResult = {
    variantId,
    runId: `run_${randomUUID().slice(0, 8)}`,
    metrics: result.metrics,
    ideas: result.ideas ?? [],
    timestamp: new Date().toISOString(),
    duration: result.duration ?? 0,
  };

  variant.results.push(testResult);
  return testResult;
}

// ---- Statistical Analysis ----

/** Run full statistical analysis on an A/B test. */
export function analyzeResults(testId: string): StatisticalAnalysis {
  const test = abTests.get(testId);
  if (!test) throw new ValidationError(`A/B test not found: ${testId}`);

  if (test.metrics.length === 0) throw new ValidationError("Test has no metrics defined");
  const primaryMetrics = test.metrics.filter((m) => m.primary);
  const metricsToAnalyze = primaryMetrics.length > 0 ? primaryMetrics : [test.metrics[0]!];

  const pairwiseComparisons: PairwiseComparison[] = [];

  for (const metric of metricsToAnalyze) {
    for (let i = 0; i < test.variants.length; i++) {
      for (let j = i + 1; j < test.variants.length; j++) {
        const varA = test.variants[i]!;
        const varB = test.variants[j]!;

        const samplesA = varA.results.map((r) => r.metrics[metric.name] ?? 0);
        const samplesB = varB.results.map((r) => r.metrics[metric.name] ?? 0);

        if (samplesA.length < 2 || samplesB.length < 2) {
          pairwiseComparisons.push({
            variantA: varA.id,
            variantB: varB.id,
            metric: metric.name,
            meanA: mean(samplesA),
            meanB: mean(samplesB),
            pValue: 1,
            effectSize: 0,
            confidenceInterval: { lower: 0, upper: 0 },
            significant: false,
          });
          continue;
        }

        const pValue = computePValue(samplesA, samplesB);
        const effect = computeEffectSize(samplesA, samplesB);
        const ci = computeConfidenceInterval(
          samplesA.map((a, idx) => a - (samplesB[idx] ?? 0)),
          1 - test.config.significanceLevel
        );

        pairwiseComparisons.push({
          variantA: varA.id,
          variantB: varB.id,
          metric: metric.name,
          meanA: round(mean(samplesA), 3),
          meanB: round(mean(samplesB), 3),
          pValue: round(pValue, 4),
          effectSize: round(effect, 3),
          confidenceInterval: { lower: round(ci.lower, 3), upper: round(ci.upper, 3) },
          significant: pValue < test.config.significanceLevel,
        });
      }
    }
  }

  // Apply multiple testing correction
  if (test.config.correctionMethod !== "none" && pairwiseComparisons.length > 1) {
    const rawPValues = pairwiseComparisons.map((c) => c.pValue);
    const corrected = applyMultipleTestingCorrection(rawPValues, test.config.correctionMethod);
    for (let i = 0; i < pairwiseComparisons.length; i++) {
      pairwiseComparisons[i]!.pValue = round(corrected[i]!, 4);
      pairwiseComparisons[i]!.significant = corrected[i]! < test.config.significanceLevel;
    }
  }

  // Determine overall winner
  const metricName = metricsToAnalyze[0]!.name;
  const higherIsBetter = metricsToAnalyze[0]!.higherIsBetter;
  const variantMeans = test.variants.map((v) => ({
    id: v.id,
    mean: mean(v.results.map((r) => r.metrics[metricName] ?? 0)),
  }));
  variantMeans.sort((a, b) => (higherIsBetter ? b.mean - a.mean : a.mean - b.mean));

  const significantComparisons = pairwiseComparisons.filter((c) => c.significant);
  const topVariant = variantMeans[0]!;
  const isWinner =
    significantComparisons.length > 0 &&
    significantComparisons.some(
      (c) => (c.variantA === topVariant.id || c.variantB === topVariant.id) && c.significant
    );

  const overallEffect =
    pairwiseComparisons.length > 0
      ? pairwiseComparisons.reduce((s, c) => s + Math.abs(c.effectSize), 0) /
        pairwiseComparisons.length
      : 0;

  const power = computePowerAnalysis(test);

  const recommendation = buildABTestRecommendation(
    test,
    isWinner ? topVariant.id : null,
    pairwiseComparisons,
    power
  );

  return {
    testId: test.id,
    pairwiseComparisons,
    winner: isWinner ? topVariant.id : null,
    confidence: 1 - test.config.significanceLevel,
    effectSize: round(overallEffect, 3),
    sampleSizeAdequacy: power,
    recommendation,
  };
}

/** Welch's t-test: returns two-tailed p-value. */
export function computePValue(samplesA: number[], samplesB: number[]): number {
  if (samplesA.length < 2 || samplesB.length < 2) return 1;
  const result = welchTTest(samplesA, samplesB);
  return result.pValue;
}

/** Cohen's d effect size between two sample groups. */
export function computeEffectSize(samplesA: number[], samplesB: number[]): number {
  if (samplesA.length < 2 || samplesB.length < 2) return 0;

  const nA = samplesA.length;
  const nB = samplesB.length;
  const meanDiff = mean(samplesA) - mean(samplesB);
  const varA = variance(samplesA);
  const varB = variance(samplesB);
  const pooledStd = Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));

  return pooledStd > 0 ? meanDiff / pooledStd : 0;
}

/** Confidence interval for the mean of samples. */
export function computeConfidenceInterval(
  samples: number[],
  confidence: number = 0.95
): { lower: number; upper: number } {
  if (samples.length < 2) return { lower: 0, upper: 0 };

  const m = mean(samples);
  const se = standardDeviation(samples) / Math.sqrt(samples.length);
  const alpha = 1 - confidence;
  // Approximate t critical value via normal for simplicity
  const zCritical = normalQuantile(1 - alpha / 2);

  return {
    lower: m - zCritical * se,
    upper: m + zCritical * se,
  };
}

/** Estimate required sample size and current power for a test. */
export function computePowerAnalysis(test: ABTest): PowerAnalysis {
  const metricName = test.metrics.find((m) => m.primary)?.name ?? test.metrics[0]?.name;
  if (!metricName)
    return {
      requiredSampleSize: test.config.minimumSampleSize,
      currentPower: 0,
      sufficientData: false,
    };

  const allSamples = test.variants.map((v) => v.results.map((r) => r.metrics[metricName] ?? 0));
  const sampleSizes = allSamples.map((s) => s.length);
  const minN = Math.min(...sampleSizes);

  if (minN < 2) {
    return {
      requiredSampleSize: test.config.minimumSampleSize,
      currentPower: 0,
      sufficientData: false,
    };
  }

  // Estimate effect size from current data
  let maxEffect = 0;
  for (let i = 0; i < allSamples.length; i++) {
    for (let j = i + 1; j < allSamples.length; j++) {
      const d = Math.abs(computeEffectSize(allSamples[i]!, allSamples[j]!));
      if (d > maxEffect) maxEffect = d;
    }
  }

  // Required sample size per group using simplified formula:
  // n = ((z_alpha + z_beta) / d)^2 * 2
  const zAlpha = normalQuantile(1 - test.config.significanceLevel / 2);
  const zBeta = normalQuantile(test.config.powerTarget);
  const effectForCalc = maxEffect > 0 ? maxEffect : 0.5; // assume medium effect if none observed
  const requiredN = Math.ceil((2 * Math.pow(zAlpha + zBeta, 2)) / Math.pow(effectForCalc, 2));

  // Approximate current power
  const currentNoncentrality = effectForCalc * Math.sqrt(minN / 2);
  const criticalZ = normalQuantile(1 - test.config.significanceLevel / 2);
  const currentPower = 1 - normalCDF(criticalZ - currentNoncentrality);

  return {
    requiredSampleSize: Math.max(requiredN, test.config.minimumSampleSize),
    currentPower: round(Math.max(0, Math.min(1, currentPower)), 3),
    sufficientData: minN >= requiredN && currentPower >= test.config.powerTarget,
  };
}

/** Apply Bonferroni or Holm correction to a set of p-values. */
export function applyMultipleTestingCorrection(
  pValues: number[],
  method: "bonferroni" | "holm" | "none"
): number[] {
  if (method === "none" || pValues.length <= 1) return [...pValues];

  const m = pValues.length;

  if (method === "bonferroni") {
    return pValues.map((p) => Math.min(1, p * m));
  }

  // Holm–Bonferroni
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const corrected = new Array<number>(m);
  let maxSoFar = 0;
  for (let k = 0; k < m; k++) {
    const adjusted = indexed[k]!.p * (m - k);
    maxSoFar = Math.max(maxSoFar, adjusted);
    corrected[indexed[k]!.i] = Math.min(1, maxSoFar);
  }

  return corrected;
}

/** Sequential analysis: check if early stopping is warranted. */
export function checkEarlyStop(test: ABTest): {
  shouldStop: boolean;
  reason: string;
  analysis?: StatisticalAnalysis;
} {
  const minResults = Math.min(...test.variants.map((v) => v.results.length));

  if (minResults < 5) {
    return { shouldStop: false, reason: "Insufficient data (minimum 5 runs per variant required)" };
  }

  const analysis = analyzeResults(test.id);

  // O'Brien-Fleming-like spending function: use tighter alpha at early looks
  const fractionComplete = minResults / test.sampleSize;
  const spentAlpha = test.config.significanceLevel * Math.pow(fractionComplete, 2);

  const hasSignificant = analysis.pairwiseComparisons.some((c) => c.pValue < spentAlpha);

  if (hasSignificant && analysis.sampleSizeAdequacy.currentPower >= test.config.powerTarget) {
    return {
      shouldStop: true,
      reason: `Early stopping: significant result found (spent α=${round(spentAlpha, 4)}) with adequate power`,
      analysis,
    };
  }

  // Futility check: if effect sizes are very small and we're past halfway
  if (fractionComplete > 0.5) {
    const maxEffect = Math.max(...analysis.pairwiseComparisons.map((c) => Math.abs(c.effectSize)));
    if (maxEffect < 0.1) {
      return {
        shouldStop: true,
        reason: "Futility: effect sizes are negligible past the halfway point",
        analysis,
      };
    }
  }

  return { shouldStop: false, reason: "Continue testing", analysis };
}

/** Generate a human-readable markdown summary of the test. */
export function getTestSummary(testId: string): string {
  const test = abTests.get(testId);
  if (!test) throw new ValidationError(`A/B test not found: ${testId}`);

  const lines: string[] = [];
  lines.push(`# A/B Test: ${test.name}`);
  lines.push("");
  lines.push(`**Status:** ${test.status}`);
  lines.push(`**Hypothesis:** ${test.hypothesis}`);
  if (test.startedAt) lines.push(`**Started:** ${test.startedAt}`);
  if (test.completedAt) lines.push(`**Completed:** ${test.completedAt}`);
  lines.push("");

  lines.push("## Variants");
  for (const variant of test.variants) {
    const runs = variant.results.length;
    lines.push(`### ${variant.name}`);
    if (variant.description) lines.push(variant.description);
    lines.push(`- **Runs completed:** ${runs}/${test.sampleSize}`);
    if (variant.config.model) lines.push(`- **Model:** ${variant.config.model}`);
    if (variant.config.temperature != null)
      lines.push(`- **Temperature:** ${variant.config.temperature}`);
    if (variant.config.angles?.length)
      lines.push(`- **Angles:** ${variant.config.angles.join(", ")}`);
    lines.push("");
  }

  lines.push("## Metrics");
  for (const metric of test.metrics) {
    const tag = metric.primary ? " ⭐" : "";
    lines.push(
      `- **${metric.name}**${tag} (${metric.type}, ${metric.higherIsBetter ? "higher is better" : "lower is better"})`
    );
  }
  lines.push("");

  // Add results summary if data exists
  const hasResults = test.variants.some((v) => v.results.length >= 2);
  if (hasResults) {
    const analysis = analyzeResults(testId);

    lines.push("## Results");
    lines.push("");

    const metricNames = [...new Set(analysis.pairwiseComparisons.map((c) => c.metric))];
    for (const metricName of metricNames) {
      lines.push(`### ${metricName}`);
      lines.push("");
      lines.push("| Variant | N | Mean | Std Dev |");
      lines.push("|---------|---|------|---------|");
      for (const variant of test.variants) {
        const values = variant.results.map((r) => r.metrics[metricName] ?? 0);
        const n = values.length;
        const m = n > 0 ? mean(values) : 0;
        const sd = n > 1 ? standardDeviation(values) : 0;
        lines.push(`| ${variant.name} | ${n} | ${m.toFixed(3)} | ${sd.toFixed(3)} |`);
      }
      lines.push("");
    }

    lines.push("## Statistical Analysis");
    lines.push(`- **Winner:** ${analysis.winner ?? "No significant winner"}`);
    lines.push(`- **Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Average effect size:** ${analysis.effectSize}`);
    lines.push(`- **Power:** ${(analysis.sampleSizeAdequacy.currentPower * 100).toFixed(1)}%`);
    lines.push(
      `- **Sufficient data:** ${analysis.sampleSizeAdequacy.sufficientData ? "✅ Yes" : "❌ No"}`
    );
    lines.push("");

    if (analysis.pairwiseComparisons.length > 0) {
      lines.push("### Pairwise Comparisons");
      lines.push("");
      lines.push("| Comparison | Metric | p-value | Effect Size | Significant |");
      lines.push("|------------|--------|---------|-------------|-------------|");
      for (const c of analysis.pairwiseComparisons) {
        lines.push(
          `| ${c.variantA} vs ${c.variantB} | ${c.metric} | ${c.pValue.toFixed(4)} | ${c.effectSize.toFixed(3)} | ${c.significant ? "✅" : "❌"} |`
        );
      }
      lines.push("");
    }

    lines.push("## Recommendation");
    lines.push(analysis.recommendation);
  }

  return lines.join("\n");
}

/** Convenience: compare two models on a subject over N iterations. */
export async function compareModelPerformance(
  modelA: string,
  modelB: string,
  subject: string,
  iterations: number,
  runner: (
    variant: TestVariant,
    runIndex: number
  ) => Promise<{
    metrics: Record<string, number>;
    ideas: Array<{ title: string; description: string; score?: number }>;
    duration: number;
  }>
): Promise<StatisticalAnalysis> {
  const test = createABTest(
    `Model comparison: ${modelA} vs ${modelB}`,
    `${modelA} produces higher quality outputs than ${modelB} for "${subject}"`,
    [
      { name: modelA, description: `Using model ${modelA}`, config: { model: modelA } },
      { name: modelB, description: `Using model ${modelB}`, config: { model: modelB } },
    ],
    [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
    { minimumSampleSize: iterations }
  );

  await runABTest(test.id, runner);
  return analyzeResults(test.id);
}

/** Convenience: compare two sets of angles on a subject over N iterations. */
export async function compareAngleStrategies(
  anglesA: string[],
  anglesB: string[],
  subject: string,
  iterations: number,
  runner: (
    variant: TestVariant,
    runIndex: number
  ) => Promise<{
    metrics: Record<string, number>;
    ideas: Array<{ title: string; description: string; score?: number }>;
    duration: number;
  }>
): Promise<StatisticalAnalysis> {
  const test = createABTest(
    `Angle strategy comparison`,
    `Angles [${anglesA.join(", ")}] produce better results than [${anglesB.join(", ")}] for "${subject}"`,
    [
      {
        name: "Strategy A",
        description: `Angles: ${anglesA.join(", ")}`,
        config: { angles: anglesA },
      },
      {
        name: "Strategy B",
        description: `Angles: ${anglesB.join(", ")}`,
        config: { angles: anglesB },
      },
    ],
    [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
    { minimumSampleSize: iterations }
  );

  await runABTest(test.id, runner);
  return analyzeResults(test.id);
}

/** Export test report in the specified format. */
export function exportTestReport(testId: string, format: "markdown" | "json" = "markdown"): string {
  const test = abTests.get(testId);
  if (!test) throw new ValidationError(`A/B test not found: ${testId}`);

  if (format === "json") {
    const analysis = test.variants.some((v) => v.results.length >= 2)
      ? analyzeResults(testId)
      : null;
    return JSON.stringify({ test, analysis }, null, 2);
  }

  return getTestSummary(testId);
}

// ---- Internal Helpers ----

/** Welch's two-sample t-test for unequal variances. */
function welchTTest(
  a: number[],
  b: number[]
): { tStatistic: number; degreesOfFreedom: number; pValue: number } {
  const nA = a.length;
  const nB = b.length;

  if (nA < 2 || nB < 2) return { tStatistic: 0, degreesOfFreedom: 0, pValue: 1 };

  const meanA = mean(a);
  const meanB = mean(b);
  const varA = variance(a);
  const varB = variance(b);

  const seA = varA / nA;
  const seB = varB / nB;
  const se = Math.sqrt(seA + seB);

  if (se === 0) return { tStatistic: 0, degreesOfFreedom: nA + nB - 2, pValue: 1 };

  const t = (meanA - meanB) / se;

  // Welch–Satterthwaite degrees of freedom
  const df = (seA + seB) ** 2 / (seA ** 2 / (nA - 1) + seB ** 2 / (nB - 1));
  const safeDf = Math.max(1, Math.round(df));

  const pValue = 2 * (1 - tDistributionCDF(Math.abs(t), safeDf));

  return {
    tStatistic: round(t, 4),
    degreesOfFreedom: round(safeDf, 1),
    pValue: Math.min(1, Math.max(0, pValue)),
  };
}

/** Approximation of Student's t CDF using the regularized incomplete beta function. */
function tDistributionCDF(t: number, df: number): number {
  if (df <= 0) return 0.5;

  // For large df, approximate with normal distribution
  if (df > 30) {
    const z = (t * (1 - 1 / (4 * df))) / Math.sqrt(1 + (t * t) / (2 * df));
    return normalCDF(z);
  }

  // Use the relationship: CDF(t, df) = 1 - 0.5 * I(df/(df+t^2), df/2, 1/2)
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  const ibeta = regularizedIncompleteBeta(x, a, b);
  return 1 - 0.5 * ibeta;
}

/** Standard normal CDF approximation (Abramowitz and Stegun). */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * absZ);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ);

  return 0.5 * (1.0 + sign * y);
}

/** Approximate normal quantile (inverse CDF) using rational approximation. */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation (Beasley-Springer-Moro)
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
}

/** Regularized incomplete beta function approximation. */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use continued fraction representation (Lentz's method)
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  // Use the symmetry relation if x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  // Continued fraction
  const maxIter = 200;
  const epsilon = 1e-10;

  let c = 1;
  let d = 1 / (1 - ((a + b) * x) / (a + 1));
  let result = d;

  for (let m = 1; m <= maxIter; m++) {
    // Even step
    let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 / (1 + numerator * d);
    c = 1 + numerator / c;
    result *= d * c;

    // Odd step
    numerator = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 / (1 + numerator * d);
    c = 1 + numerator / c;
    result *= d * c;

    if (Math.abs(d * c - 1) < epsilon) break;
  }

  return (front / a) * result;
}

/** Log-gamma function (Lanczos approximation). */
function lnGamma(n: number): number {
  if (n <= 0) return Infinity;

  const g = 7;
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (n < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * n)) - lnGamma(1 - n);
  }

  n -= 1;
  let x = coefficients[0]!;
  for (let i = 1; i < g + 2; i++) {
    x += coefficients[i]! / (n + i);
  }

  const t = n + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (n + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Arithmetic mean. */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Sample standard deviation. */
function standardDeviation(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const squaredDiffs = arr.map((v) => (v - m) ** 2);
  return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / (arr.length - 1));
}

/** Sample variance. */
function variance(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return arr.map((v) => (v - m) ** 2).reduce((s, v) => s + v, 0) / (arr.length - 1);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildABTestRecommendation(
  test: ABTest,
  winner: string | null,
  comparisons: PairwiseComparison[],
  power: PowerAnalysis
): string {
  const parts: string[] = [];

  if (!winner) {
    if (!power.sufficientData) {
      parts.push("No statistically significant winner found, but sample size is insufficient.");
      parts.push(`Current power: ${(power.currentPower * 100).toFixed(1)}%.`);
      parts.push(`Consider running at least ${power.requiredSampleSize} iterations per variant.`);
    } else {
      parts.push("No statistically significant difference found between variants.");
      parts.push(
        "The variants appear to perform similarly — consider testing more distinct configurations."
      );
    }
    return parts.join(" ");
  }

  const winnerVariant = test.variants.find((v) => v.id === winner);
  const winnerName = winnerVariant?.name ?? winner;

  const significantComps = comparisons.filter(
    (c) => c.significant && (c.variantA === winner || c.variantB === winner)
  );
  const bestComp = significantComps[0];

  parts.push(`**Adopt "${winnerName}".** `);

  if (bestComp) {
    const effectLabel =
      Math.abs(bestComp.effectSize) > 0.8
        ? "large"
        : Math.abs(bestComp.effectSize) > 0.5
          ? "medium"
          : "small";
    parts.push(
      `Statistically significant improvement (p=${bestComp.pValue.toFixed(4)}, Cohen's d=${bestComp.effectSize.toFixed(2)}, ${effectLabel} effect).`
    );
  }

  if (power.sufficientData) {
    parts.push(
      `Analysis has adequate statistical power (${(power.currentPower * 100).toFixed(1)}%).`
    );
  } else {
    parts.push(
      `Note: statistical power is ${(power.currentPower * 100).toFixed(1)}% — consider additional runs for higher confidence.`
    );
  }

  return parts.join(" ");
}
