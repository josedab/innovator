/**
 * @module simulation/monte-carlo
 *
 * Monte Carlo Simulation Engine — runs stochastic simulations for innovation
 * outcomes using the Bass diffusion model. Produces NPV, ROI, breakeven,
 * probability-of-profitability, sensitivity analysis, and scenario comparison.
 * Pure computation — no LLM calls required.
 */

import { z } from "zod";

// ---- Bass Diffusion Model ----

/** A single period's output from the Bass diffusion model. */
export interface BassDiffusionPoint {
  period: number;
  newAdopters: number;
  cumulativeAdopters: number;
  adoptionPercent: number;
}

/**
 * Compute the Bass diffusion adoption curve.
 *
 * @param p - Innovation coefficient (external influence, e.g. 0.03)
 * @param q - Imitation coefficient (internal influence, e.g. 0.38)
 * @param m - Total market potential (number of eventual adopters)
 * @param periods - Number of time periods to simulate
 * @returns Array of adoption data points per period
 */
export function bassDiffusion(
  p: number,
  q: number,
  m: number,
  periods: number
): BassDiffusionPoint[] {
  const results: BassDiffusionPoint[] = [];
  let cumulative = 0;

  for (let t = 0; t < periods; t++) {
    const remaining = m - cumulative;
    const newAdopters = remaining * (p + (q * cumulative) / m);
    const clamped = Math.max(0, Math.min(remaining, newAdopters));
    cumulative += clamped;

    results.push({
      period: t + 1,
      newAdopters: Math.round(clamped),
      cumulativeAdopters: Math.round(cumulative),
      adoptionPercent: m > 0 ? (cumulative / m) * 100 : 0,
    });
  }

  return results;
}

// ---- Schemas ----

/** Numeric range schema used for parameter distributions. */
const RangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

/** Parameters for a Monte Carlo simulation run. */
export const MonteCarloParamsSchema = z.object({
  ideaTitle: z.string().max(500),
  runs: z.number().int().min(10).max(100_000).default(1000),
  timeHorizonMonths: z.number().int().min(1).max(120),
  marketSize: RangeSchema,
  innovationCoefficient: RangeSchema,
  imitationCoefficient: RangeSchema,
  costPerUnit: RangeSchema,
  revenuePerUnit: RangeSchema,
  discountRate: z.number().min(0).max(1),
});

/** Percentile bucket for a single metric. */
const PercentileSetSchema = z.object({
  p5: z.number(),
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
  p95: z.number(),
});

/** Adoption curve data point for a named scenario band. */
const AdoptionCurvePointSchema = z.object({
  month: z.number(),
  adopters: z.number(),
});

/** A single sensitivity ranking entry. */
const SensitivityRankingSchema = z.object({
  parameter: z.string(),
  impactScore: z.number(),
});

/** Full result of a Monte Carlo simulation. */
export const MonteCarloResultSchema = z.object({
  ideaTitle: z.string(),
  runCount: z.number(),
  percentiles: z.object({
    npv: PercentileSetSchema,
    roi: PercentileSetSchema,
    breakevenMonth: PercentileSetSchema,
  }),
  mean: z.object({
    npv: z.number(),
    roi: z.number(),
    breakevenMonth: z.number(),
  }),
  stdev: z.object({
    npv: z.number(),
    roi: z.number(),
    breakevenMonth: z.number(),
  }),
  confidenceInterval95: z.object({
    npv: z.object({ lower: z.number(), upper: z.number() }),
    roi: z.object({ lower: z.number(), upper: z.number() }),
    breakevenMonth: z.object({ lower: z.number(), upper: z.number() }),
  }),
  probabilityOfProfitability: z.number(),
  adoptionCurves: z.object({
    optimistic: z.array(AdoptionCurvePointSchema),
    median: z.array(AdoptionCurvePointSchema),
    pessimistic: z.array(AdoptionCurvePointSchema),
  }),
  sensitivityRankings: z.array(SensitivityRankingSchema),
});

/** Entry produced by sensitivity / tornado analysis. */
export const TornadoEntrySchema = z.object({
  parameter: z.string(),
  baseNpv: z.number(),
  lowNpv: z.number(),
  highNpv: z.number(),
  spread: z.number(),
});

/** Result from comparing multiple Monte Carlo scenarios. */
export const ScenarioComparisonSchema = z.object({
  scenarios: z.array(
    z.object({
      name: z.string(),
      result: MonteCarloResultSchema,
    })
  ),
});

// ---- Types ----

export type MonteCarloParams = z.infer<typeof MonteCarloParamsSchema>;
export type PercentileSet = z.infer<typeof PercentileSetSchema>;
export type MonteCarloResult = z.infer<typeof MonteCarloResultSchema>;
export type TornadoEntry = z.infer<typeof TornadoEntrySchema>;
export type ScenarioComparison = z.infer<typeof ScenarioComparisonSchema>;
export type SensitivityRanking = z.infer<typeof SensitivityRankingSchema>;

// ---- Helpers ----

/** Return a uniformly-distributed random value in [min, max]. */
function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Compute a given percentile from a sorted array of numbers. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Build a PercentileSet from an unsorted array. */
function computePercentiles(values: number[]): PercentileSet {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: percentile(sorted, 5),
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Run a single simulation iteration, returning NPV, ROI, and breakeven month. */
function simulateOneRun(params: MonteCarloParams): {
  npv: number;
  roi: number;
  breakevenMonth: number;
  curve: number[];
} {
  const marketSize = randomInRange(params.marketSize.min, params.marketSize.max);
  const p = randomInRange(params.innovationCoefficient.min, params.innovationCoefficient.max);
  const q = randomInRange(params.imitationCoefficient.min, params.imitationCoefficient.max);
  const costPerUnit = randomInRange(params.costPerUnit.min, params.costPerUnit.max);
  const revenuePerUnit = randomInRange(params.revenuePerUnit.min, params.revenuePerUnit.max);

  const curve = bassDiffusion(p, q, marketSize, params.timeHorizonMonths);

  let totalRevenue = 0;
  let totalCost = 0;
  let npv = 0;
  let breakevenMonth = params.timeHorizonMonths;
  let cumulativeProfit = 0;
  let breakevenFound = false;
  const monthlyAdopters: number[] = [];

  for (const pt of curve) {
    const revenue = pt.newAdopters * revenuePerUnit;
    const cost = pt.newAdopters * costPerUnit;
    const profit = revenue - cost;
    const discountFactor = 1 / (1 + params.discountRate / 12) ** pt.period;

    npv += profit * discountFactor;
    totalRevenue += revenue;
    totalCost += cost;
    cumulativeProfit += profit;
    monthlyAdopters.push(pt.cumulativeAdopters);

    if (!breakevenFound && cumulativeProfit >= 0 && pt.period > 1) {
      breakevenMonth = pt.period;
      breakevenFound = true;
    }
  }

  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

  return { npv, roi, breakevenMonth, curve: monthlyAdopters };
}

/**
 * Compute lightweight sensitivity rankings by measuring NPV variance
 * contribution of each parameter. Uses a small run count for speed.
 */
function computeSensitivityRankings(
  params: MonteCarloParams
): { parameter: string; impactScore: number }[] {
  type RangeKey =
    | "marketSize"
    | "innovationCoefficient"
    | "imitationCoefficient"
    | "costPerUnit"
    | "revenuePerUnit";
  const factors: RangeKey[] = [
    "marketSize",
    "innovationCoefficient",
    "imitationCoefficient",
    "costPerUnit",
    "revenuePerUnit",
  ];

  const quickRuns = Math.min(params.runs, 50);
  const baseFixed: MonteCarloParams = { ...params, runs: quickRuns };
  for (const f of factors) {
    const mid = (params[f].min + params[f].max) / 2;
    (baseFixed as Record<string, unknown>)[f] = { min: mid, max: mid };
  }

  const baseNpv = runQuickNpv(baseFixed);
  const rankings: { parameter: string; impactScore: number }[] = [];

  for (const factor of factors) {
    const mid = (params[factor].min + params[factor].max) / 2;
    const lowParams = { ...baseFixed, [factor]: { min: mid * 0.8, max: mid * 0.8 } };
    const highParams = { ...baseFixed, [factor]: { min: mid * 1.2, max: mid * 1.2 } };
    const spread = Math.abs(runQuickNpv(highParams) - runQuickNpv(lowParams));
    rankings.push({
      parameter: factor,
      impactScore: +(spread / (Math.abs(baseNpv) || 1)).toFixed(4),
    });
  }

  return rankings.sort((a, b) => b.impactScore - a.impactScore);
}

function runQuickNpv(params: MonteCarloParams): number {
  let total = 0;
  const runs = params.runs;
  for (let i = 0; i < runs; i++) {
    total += simulateOneRun(params).npv;
  }
  return total / runs;
}

// ---- Core Engine ----

/**
 * Run a full Monte Carlo simulation for an innovation idea.
 *
 * @param params - Simulation parameters including ranges for stochastic variables
 * @returns Aggregated simulation result with percentiles, confidence intervals, and adoption curves
 */
export function runMonteCarloSimulation(params: MonteCarloParams): MonteCarloResult {
  const validated = MonteCarloParamsSchema.parse(params);
  const npvs: number[] = [];
  const rois: number[] = [];
  const breakevens: number[] = [];
  const allCurves: number[][] = [];

  for (let i = 0; i < validated.runs; i++) {
    const run = simulateOneRun(validated);
    npvs.push(run.npv);
    rois.push(run.roi);
    breakevens.push(run.breakevenMonth);
    allCurves.push(run.curve);
  }

  // Adoption curves: pick p10, p50, p90 across all runs per month
  const months = validated.timeHorizonMonths;
  const optimistic: { month: number; adopters: number }[] = [];
  const median: { month: number; adopters: number }[] = [];
  const pessimistic: { month: number; adopters: number }[] = [];

  for (let m = 0; m < months; m++) {
    const values = allCurves.map((c) => c[m] ?? 0);
    const sorted = [...values].sort((a, b) => a - b);
    optimistic.push({ month: m + 1, adopters: Math.round(percentile(sorted, 90)) });
    median.push({ month: m + 1, adopters: Math.round(percentile(sorted, 50)) });
    pessimistic.push({ month: m + 1, adopters: Math.round(percentile(sorted, 10)) });
  }

  const profitableCount = npvs.filter((v) => v > 0).length;

  const npvMean = mean(npvs);
  const roiMean = mean(rois);
  const breakevenMean = mean(breakevens);
  const npvStdev = stdev(npvs);
  const roiStdev = stdev(rois);
  const breakevenStdev = stdev(breakevens);

  return MonteCarloResultSchema.parse({
    ideaTitle: validated.ideaTitle,
    runCount: validated.runs,
    percentiles: {
      npv: computePercentiles(npvs),
      roi: computePercentiles(rois),
      breakevenMonth: computePercentiles(breakevens),
    },
    mean: { npv: npvMean, roi: roiMean, breakevenMonth: breakevenMean },
    stdev: { npv: npvStdev, roi: roiStdev, breakevenMonth: breakevenStdev },
    confidenceInterval95: {
      npv: { lower: npvMean - 1.96 * npvStdev, upper: npvMean + 1.96 * npvStdev },
      roi: { lower: roiMean - 1.96 * roiStdev, upper: roiMean + 1.96 * roiStdev },
      breakevenMonth: {
        lower: breakevenMean - 1.96 * breakevenStdev,
        upper: breakevenMean + 1.96 * breakevenStdev,
      },
    },
    probabilityOfProfitability: profitableCount / validated.runs,
    adoptionCurves: { optimistic, median, pessimistic },
    sensitivityRankings: computeSensitivityRankings(validated),
  } satisfies MonteCarloResult);
}

// ---- Sensitivity Analysis ----

/**
 * Run one-at-a-time sensitivity analysis, varying each parameter ±20% from its
 * midpoint while holding others at their midpoint. Produces tornado chart data.
 *
 * @param baseParams - Base simulation parameters
 * @param factorsToVary - Optional list of parameter names to test (defaults to all numeric ranges)
 * @returns Array of tornado entries sorted by impact (descending)
 */
export function runSensitivityAnalysis(
  baseParams: MonteCarloParams,
  factorsToVary?: string[]
): TornadoEntry[] {
  const validated = MonteCarloParamsSchema.parse(baseParams);

  type RangeKey =
    | "marketSize"
    | "innovationCoefficient"
    | "imitationCoefficient"
    | "costPerUnit"
    | "revenuePerUnit";

  const allFactors: RangeKey[] = [
    "marketSize",
    "innovationCoefficient",
    "imitationCoefficient",
    "costPerUnit",
    "revenuePerUnit",
  ];

  const factors =
    factorsToVary && factorsToVary.length > 0
      ? allFactors.filter((f) => factorsToVary.includes(f))
      : allFactors;

  /** Create params with a specific range key narrowed to a single value. */
  function withFixedValue(key: RangeKey, value: number): MonteCarloParams {
    return { ...validated, [key]: { min: value, max: value } };
  }

  function midpoint(key: RangeKey): number {
    return (validated[key].min + validated[key].max) / 2;
  }

  // Baseline: all at midpoints
  const baseFixed: MonteCarloParams = { ...validated };
  for (const f of allFactors) {
    const mid = midpoint(f);
    (baseFixed as Record<string, unknown>)[f] = { min: mid, max: mid };
  }
  const baseResult = runMonteCarloSimulation({ ...baseFixed, runs: Math.min(validated.runs, 500) });
  const baseNpv = baseResult.mean.npv;

  const entries: TornadoEntry[] = [];

  for (const factor of factors) {
    const mid = midpoint(factor);
    const low = mid * 0.8;
    const high = mid * 1.2;

    const lowParams = {
      ...baseFixed,
      ...withFixedValue(factor, low),
      runs: Math.min(validated.runs, 500),
    };
    const highParams = {
      ...baseFixed,
      ...withFixedValue(factor, high),
      runs: Math.min(validated.runs, 500),
    };

    const lowResult = runMonteCarloSimulation(lowParams);
    const highResult = runMonteCarloSimulation(highParams);

    entries.push({
      parameter: factor,
      baseNpv,
      lowNpv: lowResult.mean.npv,
      highNpv: highResult.mean.npv,
      spread: Math.abs(highResult.mean.npv - lowResult.mean.npv),
    });
  }

  // Attach sensitivity rankings to inform callers
  entries.sort((a, b) => b.spread - a.spread);
  return entries;
}

// ---- Scenario Comparison ----

/**
 * Run Monte Carlo simulations for multiple named scenarios and produce a comparison.
 *
 * @param scenarios - Array of named scenario configurations
 * @returns Comparison object containing results for each scenario
 */
export function compareMonteCarloScenarios(
  scenarios: { name: string; params: MonteCarloParams }[]
): ScenarioComparison {
  const results = scenarios.map((s) => ({
    name: s.name,
    result: runMonteCarloSimulation(s.params),
  }));
  return ScenarioComparisonSchema.parse({ scenarios: results });
}

// ---- Visualization Data ----

/** A single point in the probability fan chart. */
export interface FanChartPoint {
  month: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

/**
 * Generate probability fan chart data from a simulation result.
 * Uses the adoption curves and interpolates additional percentile bands.
 *
 * @param result - A completed Monte Carlo simulation result
 * @returns Array of fan chart data points per month
 */
export function generateProbabilityFan(result: MonteCarloResult): FanChartPoint[] {
  const months = result.adoptionCurves.median.length;
  const fan: FanChartPoint[] = [];

  for (let i = 0; i < months; i++) {
    const opt = result.adoptionCurves.optimistic[i]?.adopters ?? 0;
    const med = result.adoptionCurves.median[i]?.adopters ?? 0;
    const pes = result.adoptionCurves.pessimistic[i]?.adopters ?? 0;

    // Interpolate intermediate percentiles between pessimistic (p10), median (p50), optimistic (p90)
    fan.push({
      month: i + 1,
      p5: Math.round(pes * 0.8),
      p25: Math.round(pes + (med - pes) * 0.4),
      p50: med,
      p75: Math.round(med + (opt - med) * 0.6),
      p95: Math.round(opt * 1.1),
    });
  }

  return fan;
}

/** Tornado chart data entry for visualization. */
export interface TornadoChartData {
  parameter: string;
  lowDelta: number;
  highDelta: number;
  baseNpv: number;
}

/**
 * Transform sensitivity analysis entries into tornado chart visualization data.
 *
 * @param entries - Tornado entries from runSensitivityAnalysis
 * @returns Array sorted by spread (descending), with deltas relative to base NPV
 */
export function generateTornadoData(entries: TornadoEntry[]): TornadoChartData[] {
  return entries
    .sort((a, b) => b.spread - a.spread)
    .map((e) => ({
      parameter: e.parameter,
      lowDelta: e.lowNpv - e.baseNpv,
      highDelta: e.highNpv - e.baseNpv,
      baseNpv: e.baseNpv,
    }));
}

// ---- Markdown Export ----

/**
 * Export a Monte Carlo simulation result as a formatted Markdown report.
 *
 * @param result - The simulation result to export
 * @returns Markdown string
 */
export function monteCarloToMarkdown(result: MonteCarloResult): string {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtDec = (n: number) => n.toFixed(2);

  const lines: string[] = [
    `# Monte Carlo Simulation: ${result.ideaTitle}`,
    "",
    `**Simulation Runs:** ${fmt(result.runCount)}`,
    `**Probability of Profitability:** ${fmtPct(result.probabilityOfProfitability * 100)}`,
    "",
    "## Key Metrics",
    "",
    "| Metric | Mean | Std Dev | P5 | P25 | P50 | P75 | P95 |",
    "|--------|------|---------|-----|-----|-----|-----|-----|",
    `| NPV | ${fmt(result.mean.npv)} | ${fmt(result.stdev.npv)} | ${fmt(result.percentiles.npv.p5)} | ${fmt(result.percentiles.npv.p25)} | ${fmt(result.percentiles.npv.p50)} | ${fmt(result.percentiles.npv.p75)} | ${fmt(result.percentiles.npv.p95)} |`,
    `| ROI (%) | ${fmtDec(result.mean.roi)} | ${fmtDec(result.stdev.roi)} | ${fmtDec(result.percentiles.roi.p5)} | ${fmtDec(result.percentiles.roi.p25)} | ${fmtDec(result.percentiles.roi.p50)} | ${fmtDec(result.percentiles.roi.p75)} | ${fmtDec(result.percentiles.roi.p95)} |`,
    `| Breakeven (months) | ${fmtDec(result.mean.breakevenMonth)} | ${fmtDec(result.stdev.breakevenMonth)} | ${fmtDec(result.percentiles.breakevenMonth.p5)} | ${fmtDec(result.percentiles.breakevenMonth.p25)} | ${fmtDec(result.percentiles.breakevenMonth.p50)} | ${fmtDec(result.percentiles.breakevenMonth.p75)} | ${fmtDec(result.percentiles.breakevenMonth.p95)} |`,
    "",
    "## 95% Confidence Intervals",
    "",
    `- **NPV:** ${fmt(result.confidenceInterval95.npv.lower)} to ${fmt(result.confidenceInterval95.npv.upper)}`,
    `- **ROI:** ${fmtDec(result.confidenceInterval95.roi.lower)}% to ${fmtDec(result.confidenceInterval95.roi.upper)}%`,
    `- **Breakeven:** ${fmtDec(result.confidenceInterval95.breakevenMonth.lower)} to ${fmtDec(result.confidenceInterval95.breakevenMonth.upper)} months`,
    "",
  ];

  if (result.sensitivityRankings.length > 0) {
    lines.push("## Sensitivity Rankings");
    lines.push("");
    lines.push("| Rank | Parameter | Impact Score |");
    lines.push("|------|-----------|-------------|");
    result.sensitivityRankings.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${r.parameter} | ${fmtDec(r.impactScore)} |`);
    });
    lines.push("");
  }

  lines.push("## Adoption Curves (Cumulative Adopters)");
  lines.push("");
  lines.push("| Month | Pessimistic (P10) | Median (P50) | Optimistic (P90) |");
  lines.push("|-------|-------------------|--------------|------------------|");

  const step = Math.max(1, Math.floor(result.adoptionCurves.median.length / 12));
  for (let i = 0; i < result.adoptionCurves.median.length; i += step) {
    const pes = result.adoptionCurves.pessimistic[i]?.adopters ?? 0;
    const med = result.adoptionCurves.median[i]?.adopters ?? 0;
    const opt = result.adoptionCurves.optimistic[i]?.adopters ?? 0;
    lines.push(`| ${i + 1} | ${fmt(pes)} | ${fmt(med)} | ${fmt(opt)} |`);
  }
  lines.push("");

  return lines.join("\n");
}
