/**
 * @module digital-twin/monte-carlo
 *
 * Monte Carlo simulation engine for innovation portfolio analysis.
 * Runs thousands of simulations to produce probability distributions
 * for key metrics under different strategy scenarios — without LLM calls.
 */

import { z } from "zod";
import type { EcosystemSnapshot, Strategy } from "./index.js";

// ---- Schemas ----

export const MonteCarloConfigSchema = z.object({
  iterations: z.number().int().min(100).max(100000).default(1000),
  timeHorizonWeeks: z.number().int().min(4).max(260).default(52),
  randomSeed: z.number().optional(),
});

export type MonteCarloConfig = z.infer<typeof MonteCarloConfigSchema>;

export interface DistributionStats {
  mean: number;
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  stdDev: number;
}

export interface MonteCarloResult {
  strategyId: string;
  strategyName: string;
  iterations: number;
  timeHorizonWeeks: number;
  metrics: {
    ideasLaunched: DistributionStats;
    budgetUtilization: DistributionStats;
    teamUtilization: DistributionStats;
    innovationVelocity: DistributionStats;
    riskScore: DistributionStats;
    breakthroughProbability: number;
    budgetOverrunProbability: number;
  };
  quarterlyProjection: Array<{
    quarter: number;
    ideasInPipeline: DistributionStats;
    cumulativeLaunched: DistributionStats;
  }>;
}

export interface MonteCarloComparison {
  ecosystemId: string;
  simulatedAt: string;
  config: MonteCarloConfig;
  results: MonteCarloResult[];
  recommendation: string;
  confidenceLevel: number;
}

// ---- PRNG (Mulberry32 for reproducibility) ----

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform for normally-distributed random numbers. */
function normalRandom(rand: () => number, mean: number, stdDev: number): number {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeStats(values: number[]): DistributionStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, p5: 0, p25: 0, p75: 0, p95: 0, min: 0, max: 0, stdDev: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

  return {
    mean: Math.round(mean * 100) / 100,
    median: sorted[Math.floor(n * 0.5)],
    p5: sorted[Math.floor(n * 0.05)],
    p25: sorted[Math.floor(n * 0.25)],
    p75: sorted[Math.floor(n * 0.75)],
    p95: sorted[Math.floor(n * 0.95)],
    min: sorted[0],
    max: sorted[n - 1],
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

// ---- Simulation Engine ----

/** Derive simulation parameters from ecosystem snapshot and strategy. */
function deriveParameters(snapshot: EcosystemSnapshot, strategy: Strategy) {
  const teamSize = snapshot.team.length;
  const avgCapacity =
    teamSize > 0 ? snapshot.team.reduce((s, m) => s + m.capacity, 0) / teamSize : 0.5;
  const budgetFraction =
    snapshot.budget.totalBudget > 0 ? snapshot.budget.remaining / snapshot.budget.totalBudget : 0.5;
  const pipelineSize = snapshot.pipeline.length;
  const competitorCount = snapshot.marketContext.competitors.length;
  const avgAngleSuccess =
    snapshot.angleEffectiveness.length > 0
      ? snapshot.angleEffectiveness.reduce((s, a) => s + a.successRate, 0) /
        snapshot.angleEffectiveness.length
      : 0.5;

  // Base rates
  const weeklyIdeaRate = teamSize * avgCapacity * avgAngleSuccess * 0.3;
  const launchRate = 0.08;
  const failRate = 0.12;

  // Strategy modifiers
  const hasNewInitiatives = (strategy.newInitiatives?.length ?? 0) > 0;
  const isRetiring = (strategy.retireInitiatives?.length ?? 0) > 0;
  const aggressiveness = hasNewInitiatives ? 1.3 : isRetiring ? 0.8 : 1.0;
  const riskMultiplier = hasNewInitiatives ? 1.4 : isRetiring ? 0.7 : 1.0;

  return {
    weeklyIdeaRate: weeklyIdeaRate * aggressiveness,
    launchRate,
    failRate,
    budgetFraction,
    teamCapacity: avgCapacity,
    competitorPressure: Math.min(competitorCount * 0.05, 0.3),
    riskMultiplier,
    pipelineSize,
    weeklyBudgetBurn:
      snapshot.budget.totalBudget > 0
        ? ((snapshot.budget.totalBudget - snapshot.budget.remaining) / Math.max(pipelineSize, 1)) *
          aggressiveness
        : 0,
  };
}

/** Run a single Monte Carlo simulation iteration. */
function runIteration(
  params: ReturnType<typeof deriveParameters>,
  weeks: number,
  rand: () => number
): {
  ideasLaunched: number;
  budgetUtilization: number;
  teamUtilization: number;
  innovationVelocity: number;
  riskScore: number;
  isBreakthrough: boolean;
  isBudgetOverrun: boolean;
  quarterlyIdeas: number[];
  quarterlyCumulativeLaunched: number[];
} {
  let ideas = params.pipelineSize;
  let launched = 0;
  let totalBudgetUsed = 0;
  const quarterlyIdeas: number[] = [];
  const quarterlyCumulativeLaunched: number[] = [];

  for (let week = 0; week < weeks; week++) {
    // Generate new ideas (Poisson-like via normal approximation)
    const newIdeas = Math.max(
      0,
      Math.round(normalRandom(rand, params.weeklyIdeaRate, params.weeklyIdeaRate * 0.3))
    );
    ideas += newIdeas;

    // Launch ideas
    const launches = Math.round(ideas * params.launchRate * (1 + normalRandom(rand, 0, 0.1)));
    const actualLaunches = Math.max(0, Math.min(launches, ideas));
    launched += actualLaunches;
    ideas -= actualLaunches;

    // Fail/prune ideas
    const failures = Math.round(ideas * params.failRate * (1 + normalRandom(rand, 0, 0.15)));
    ideas = Math.max(0, ideas - Math.max(0, failures));

    // Budget burn
    totalBudgetUsed += normalRandom(rand, params.weeklyBudgetBurn, params.weeklyBudgetBurn * 0.2);

    // Quarterly snapshots
    if ((week + 1) % 13 === 0) {
      quarterlyIdeas.push(ideas);
      quarterlyCumulativeLaunched.push(launched);
    }
  }

  const budgetUtilization = clamp(totalBudgetUsed / Math.max(1, totalBudgetUsed + 1000), 0, 1);
  const teamUtilization = clamp(
    params.teamCapacity * (ideas / Math.max(params.pipelineSize, 1)),
    0,
    1
  );
  const innovationVelocity = launched / Math.max(weeks / 13, 1);
  const riskScore = clamp(
    params.riskMultiplier *
      (params.competitorPressure * 100 + (1 - budgetUtilization) * 20 + rand() * 20),
    0,
    100
  );
  const isBreakthrough = rand() < 0.15 * params.riskMultiplier;
  const isBudgetOverrun = budgetUtilization > 0.95;

  return {
    ideasLaunched: launched,
    budgetUtilization: Math.round(budgetUtilization * 100) / 100,
    teamUtilization: Math.round(teamUtilization * 100) / 100,
    innovationVelocity: Math.round(innovationVelocity * 100) / 100,
    riskScore: Math.round(riskScore),
    isBreakthrough,
    isBudgetOverrun,
    quarterlyIdeas,
    quarterlyCumulativeLaunched,
  };
}

/** Run Monte Carlo simulation for a strategy against an ecosystem. */
export function runMonteCarloSimulation(
  snapshot: EcosystemSnapshot,
  strategy: Strategy,
  config: MonteCarloConfig = { iterations: 1000, timeHorizonWeeks: 52 }
): MonteCarloResult {
  const parsedConfig = MonteCarloConfigSchema.parse(config);
  const rand = mulberry32(parsedConfig.randomSeed ?? Date.now());
  const params = deriveParameters(snapshot, strategy);
  const weeks = parsedConfig.timeHorizonWeeks;
  const quarters = Math.ceil(weeks / 13);

  const allIdeasLaunched: number[] = [];
  const allBudgetUtil: number[] = [];
  const allTeamUtil: number[] = [];
  const allVelocity: number[] = [];
  const allRisk: number[] = [];
  let breakthroughCount = 0;
  let overrunCount = 0;
  const quarterlyIdeasAll: number[][] = Array.from({ length: quarters }, () => []);
  const quarterlyCumLaunchedAll: number[][] = Array.from({ length: quarters }, () => []);

  for (let i = 0; i < parsedConfig.iterations; i++) {
    const result = runIteration(params, weeks, rand);
    allIdeasLaunched.push(result.ideasLaunched);
    allBudgetUtil.push(result.budgetUtilization);
    allTeamUtil.push(result.teamUtilization);
    allVelocity.push(result.innovationVelocity);
    allRisk.push(result.riskScore);
    if (result.isBreakthrough) breakthroughCount++;
    if (result.isBudgetOverrun) overrunCount++;

    for (let q = 0; q < quarters && q < result.quarterlyIdeas.length; q++) {
      quarterlyIdeasAll[q].push(result.quarterlyIdeas[q]);
      quarterlyCumLaunchedAll[q].push(result.quarterlyCumulativeLaunched[q]);
    }
  }

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    iterations: parsedConfig.iterations,
    timeHorizonWeeks: weeks,
    metrics: {
      ideasLaunched: computeStats(allIdeasLaunched),
      budgetUtilization: computeStats(allBudgetUtil),
      teamUtilization: computeStats(allTeamUtil),
      innovationVelocity: computeStats(allVelocity),
      riskScore: computeStats(allRisk),
      breakthroughProbability:
        Math.round((breakthroughCount / parsedConfig.iterations) * 100) / 100,
      budgetOverrunProbability: Math.round((overrunCount / parsedConfig.iterations) * 100) / 100,
    },
    quarterlyProjection: quarterlyIdeasAll.map((ideas, i) => ({
      quarter: i + 1,
      ideasInPipeline: computeStats(ideas),
      cumulativeLaunched: computeStats(quarterlyCumLaunchedAll[i]),
    })),
  };
}

/** Compare multiple strategies via Monte Carlo. */
export function runMonteCarloComparison(
  snapshot: EcosystemSnapshot,
  strategies: Strategy[],
  config?: MonteCarloConfig
): MonteCarloComparison {
  const results = strategies.map((s) => runMonteCarloSimulation(snapshot, s, config));

  // Find best strategy based on risk-adjusted innovation velocity
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score =
      r.metrics.innovationVelocity.mean * 2 +
      r.metrics.ideasLaunched.mean -
      r.metrics.riskScore.mean * 0.5 +
      r.metrics.breakthroughProbability * 50;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const winner = results[bestIdx];
  const recommendation = [
    `Recommended strategy: "${winner.strategyName}" based on ${config?.iterations ?? 1000} Monte Carlo simulations.`,
    `Expected ideas launched: ${winner.metrics.ideasLaunched.mean} (p5-p95: ${winner.metrics.ideasLaunched.p5}-${winner.metrics.ideasLaunched.p95}).`,
    `Breakthrough probability: ${(winner.metrics.breakthroughProbability * 100).toFixed(0)}%.`,
    `Budget overrun risk: ${(winner.metrics.budgetOverrunProbability * 100).toFixed(0)}%.`,
  ].join(" ");

  return {
    ecosystemId: snapshot.id,
    simulatedAt: new Date().toISOString(),
    config: MonteCarloConfigSchema.parse(config ?? {}),
    results,
    recommendation,
    confidenceLevel: 1 - winner.metrics.riskScore.mean / 100,
  };
}

/** Format Monte Carlo results as markdown. */
export function monteCarloToMarkdown(comparison: MonteCarloComparison): string {
  const lines = [
    "# Digital Twin — Monte Carlo Simulation Report",
    "",
    `**Ecosystem:** ${comparison.ecosystemId}`,
    `**Date:** ${comparison.simulatedAt}`,
    `**Iterations:** ${comparison.config.iterations}`,
    `**Time Horizon:** ${comparison.config.timeHorizonWeeks} weeks`,
    "",
    "## Recommendation",
    "",
    comparison.recommendation,
    "",
    "## Strategy Comparison",
    "",
    "| Strategy | Ideas Launched (mean) | Velocity | Breakthrough % | Overrun % | Risk |",
    "|----------|----------------------|----------|----------------|-----------|------|",
  ];

  for (const r of comparison.results) {
    lines.push(
      `| ${r.strategyName} | ${r.metrics.ideasLaunched.mean} (${r.metrics.ideasLaunched.p5}-${r.metrics.ideasLaunched.p95}) | ${r.metrics.innovationVelocity.mean}/qtr | ${(r.metrics.breakthroughProbability * 100).toFixed(0)}% | ${(r.metrics.budgetOverrunProbability * 100).toFixed(0)}% | ${r.metrics.riskScore.mean}/100 |`
    );
  }

  lines.push("");

  for (const r of comparison.results) {
    lines.push(`### ${r.strategyName} — Detail`);
    lines.push("");
    lines.push("| Metric | Mean | P5 | P25 | Median | P75 | P95 |");
    lines.push("|--------|------|----|-----|--------|-----|-----|");
    for (const [name, stats] of Object.entries(r.metrics) as Array<
      [string, DistributionStats | number]
    >) {
      if (typeof stats === "object" && "mean" in stats) {
        lines.push(
          `| ${name} | ${stats.mean} | ${stats.p5} | ${stats.p25} | ${stats.median} | ${stats.p75} | ${stats.p95} |`
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
