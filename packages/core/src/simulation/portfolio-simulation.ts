/**
 * @module simulation/portfolio-simulation
 *
 * Portfolio-level Monte Carlo simulation engine. Runs stochastic simulations
 * across multiple ideas simultaneously, computing correlations, optimal
 * allocation via mean-variance optimization, and efficient frontier.
 * Supports triangular, normal, and log-normal probability distributions.
 */

import { z } from "zod";

// ---- Probability Distributions ----

/** Supported distribution types for simulation parameters. */
export const DistributionTypeSchema = z.enum(["uniform", "triangular", "normal", "lognormal"]);
export type DistributionType = z.infer<typeof DistributionTypeSchema>;

/** Distribution parameter schema with type-specific fields. */
export const DistributionSchema = z.object({
  type: DistributionTypeSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  mode: z.number().optional(),
  mean: z.number().optional(),
  stddev: z.number().optional(),
});
export type Distribution = z.infer<typeof DistributionSchema>;

/** Sample from a distribution. */
export function sampleDistribution(dist: Distribution): number {
  switch (dist.type) {
    case "uniform": {
      const lo = dist.min ?? 0;
      const hi = dist.max ?? 1;
      return lo + Math.random() * (hi - lo);
    }
    case "triangular": {
      const a = dist.min ?? 0;
      const b = dist.max ?? 1;
      const c = dist.mode ?? (a + b) / 2;
      const u = Math.random();
      const fc = (c - a) / (b - a);
      if (u < fc) {
        return a + Math.sqrt(u * (b - a) * (c - a));
      }
      return b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }
    case "normal": {
      const mu = dist.mean ?? 0;
      const sigma = dist.stddev ?? 1;
      // Box-Muller transform
      const u1 = Math.random() || 1e-10;
      const u2 = Math.random();
      return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    case "lognormal": {
      const mu = dist.mean ?? 0;
      const sigma = dist.stddev ?? 1;
      const u1 = Math.random() || 1e-10;
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.exp(mu + sigma * z);
    }
  }
}

// ---- Portfolio Simulation Schemas ----

/** A single idea in the portfolio with its own distribution parameters. */
export const PortfolioIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500),
  expectedReturn: DistributionSchema,
  expectedCost: DistributionSchema,
  riskFactor: z.number().min(0).max(1).default(0.5),
  category: z.string().optional(),
});
export type PortfolioIdea = z.infer<typeof PortfolioIdeaSchema>;

/** Configuration for a portfolio simulation. */
export const PortfolioSimConfigSchema = z.object({
  ideas: z.array(PortfolioIdeaSchema).min(2).max(100),
  runs: z.number().int().min(100).max(100_000).default(5000),
  totalBudget: z.number().positive(),
  riskTolerance: z.number().min(0).max(1).default(0.5),
  correlationStrength: z.number().min(0).max(1).default(0.2),
});
export type PortfolioSimConfig = z.infer<typeof PortfolioSimConfigSchema>;

/** Result for a single idea within the portfolio. */
export const IdeaAllocationSchema = z.object({
  id: z.string(),
  title: z.string(),
  allocation: z.number(),
  allocationPercent: z.number(),
  expectedReturn: z.number(),
  expectedRisk: z.number(),
  sharpeRatio: z.number(),
});
export type IdeaAllocation = z.infer<typeof IdeaAllocationSchema>;

/** A point on the efficient frontier. */
export const FrontierPointSchema = z.object({
  risk: z.number(),
  return: z.number(),
  allocations: z.array(z.object({ id: z.string(), weight: z.number() })),
});
export type FrontierPoint = z.infer<typeof FrontierPointSchema>;

/** Full portfolio simulation result. */
export const PortfolioSimResultSchema = z.object({
  totalBudget: z.number(),
  optimalAllocations: z.array(IdeaAllocationSchema),
  portfolioReturn: z.number(),
  portfolioRisk: z.number(),
  portfolioSharpeRatio: z.number(),
  diversificationBenefit: z.number(),
  efficientFrontier: z.array(FrontierPointSchema),
  correlationMatrix: z.array(
    z.object({
      ideaA: z.string(),
      ideaB: z.string(),
      correlation: z.number(),
    })
  ),
  riskBreakdown: z.object({
    systematic: z.number(),
    idiosyncratic: z.number(),
  }),
  runCount: z.number(),
});
export type PortfolioSimResult = z.infer<typeof PortfolioSimResultSchema>;

// ---- Helpers ----

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

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const diffA = a[i] - ma;
    const diffB = b[i] - mb;
    num += diffA * diffB;
    da += diffA * diffA;
    db += diffB * diffB;
  }
  const denom = Math.sqrt(da * db);
  return denom > 0 ? num / denom : 0;
}

// ---- Core Portfolio Simulation ----

/**
 * Run a multi-idea portfolio Monte Carlo simulation.
 * Computes per-idea return distributions, correlations, and finds optimal
 * allocation using mean-variance optimization.
 */
export function runPortfolioSimulation(config: PortfolioSimConfig): PortfolioSimResult {
  const validated = PortfolioSimConfigSchema.parse(config);
  const { ideas, runs, totalBudget, riskTolerance } = validated;
  const n = ideas.length;

  // Generate return series for each idea
  const returnSeries: number[][] = ideas.map(() => []);

  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < n; i++) {
      const rev = sampleDistribution(ideas[i].expectedReturn);
      const cost = sampleDistribution(ideas[i].expectedCost);
      const roi = cost > 0 ? (rev - cost) / cost : 0;
      returnSeries[i].push(roi);
    }
  }

  // Compute per-idea statistics
  const ideaStats = ideas.map((idea, i) => ({
    id: idea.id,
    title: idea.title,
    mean: mean(returnSeries[i]),
    stdev: stdev(returnSeries[i]),
    risk: idea.riskFactor,
  }));

  // Compute correlation matrix
  const correlationMatrix: {
    ideaA: string;
    ideaB: string;
    correlation: number;
  }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const corr = correlation(returnSeries[i], returnSeries[j]);
      correlationMatrix.push({
        ideaA: ideas[i].id,
        ideaB: ideas[j].id,
        correlation: +corr.toFixed(4),
      });
    }
  }

  // Mean-variance optimization: find optimal weights
  const optimalWeights = optimizeAllocation(ideaStats, returnSeries, riskTolerance);

  // Compute portfolio metrics with optimal weights
  const portfolioReturns: number[] = [];
  for (let r = 0; r < runs; r++) {
    let portfolioReturn = 0;
    for (let i = 0; i < n; i++) {
      portfolioReturn += optimalWeights[i] * returnSeries[i][r];
    }
    portfolioReturns.push(portfolioReturn);
  }

  const portfolioReturn = mean(portfolioReturns);
  const portfolioRisk = stdev(portfolioReturns);
  const portfolioSharpeRatio = portfolioRisk > 0 ? portfolioReturn / portfolioRisk : 0;

  // Diversification benefit: compare vs equal-weight risk
  const equalReturns: number[] = [];
  for (let r = 0; r < runs; r++) {
    let eqReturn = 0;
    for (let i = 0; i < n; i++) {
      eqReturn += (1 / n) * returnSeries[i][r];
    }
    equalReturns.push(eqReturn);
  }
  const equalRisk = stdev(equalReturns);
  const diversificationBenefit = equalRisk > 0 ? 1 - portfolioRisk / equalRisk : 0;

  // Build allocations
  const optimalAllocations: IdeaAllocation[] = ideaStats.map((s, i) => ({
    id: s.id,
    title: s.title,
    allocation: +(optimalWeights[i] * totalBudget).toFixed(2),
    allocationPercent: +(optimalWeights[i] * 100).toFixed(2),
    expectedReturn: +s.mean.toFixed(4),
    expectedRisk: +s.stdev.toFixed(4),
    sharpeRatio: +(s.stdev > 0 ? s.mean / s.stdev : 0).toFixed(4),
  }));

  // Efficient frontier (10 points)
  const efficientFrontier = computeEfficientFrontier(ideaStats, returnSeries, 10);

  // Risk breakdown
  const weightedAvgRisk = ideaStats.reduce((s, st, i) => s + optimalWeights[i] * st.stdev, 0);
  const systematic = Math.min(portfolioRisk, weightedAvgRisk * 0.6);
  const idiosyncratic = portfolioRisk - systematic;

  return PortfolioSimResultSchema.parse({
    totalBudget,
    optimalAllocations,
    portfolioReturn: +portfolioReturn.toFixed(4),
    portfolioRisk: +portfolioRisk.toFixed(4),
    portfolioSharpeRatio: +portfolioSharpeRatio.toFixed(4),
    diversificationBenefit: +diversificationBenefit.toFixed(4),
    efficientFrontier,
    correlationMatrix,
    riskBreakdown: {
      systematic: +systematic.toFixed(4),
      idiosyncratic: +idiosyncratic.toFixed(4),
    },
    runCount: runs,
  });
}

/**
 * Optimize portfolio allocation using a simplified mean-variance approach.
 * Adjusts weights based on risk-adjusted returns (Sharpe-like ratios).
 */
function optimizeAllocation(
  stats: { mean: number; stdev: number; risk: number }[],
  _returnSeries: number[][],
  riskTolerance: number
): number[] {
  const n = stats.length;

  // Score each idea: blend of return and inverse risk
  const scores = stats.map((s) => {
    const returnScore = s.mean;
    const riskPenalty = s.stdev * (1 - riskTolerance);
    return Math.max(0.001, returnScore - riskPenalty + 0.1);
  });

  // Normalize to weights summing to 1
  const total = scores.reduce((s, v) => s + v, 0);
  const weights = scores.map((s) => s / total);

  // Apply minimum allocation constraint (2% per idea)
  const minWeight = 0.02;
  let deficit = 0;
  for (let i = 0; i < n; i++) {
    if (weights[i] < minWeight) {
      deficit += minWeight - weights[i];
      weights[i] = minWeight;
    }
  }

  // Redistribute deficit proportionally from larger weights
  if (deficit > 0) {
    const aboveMin = weights.filter((w) => w > minWeight);
    const aboveTotal = aboveMin.reduce((s, v) => s + v, 0);
    for (let i = 0; i < n; i++) {
      if (weights[i] > minWeight) {
        weights[i] -= deficit * (weights[i] / aboveTotal);
      }
    }
  }

  // Renormalize
  const finalTotal = weights.reduce((s, v) => s + v, 0);
  return weights.map((w) => w / finalTotal);
}

/**
 * Compute points on the efficient frontier by varying risk tolerance.
 */
function computeEfficientFrontier(
  stats: { id: string; mean: number; stdev: number; risk: number }[],
  returnSeries: number[][],
  points: number
): FrontierPoint[] {
  const frontier: FrontierPoint[] = [];
  const n = stats.length;
  const runs = returnSeries[0].length;

  for (let p = 0; p < points; p++) {
    const tolerance = p / (points - 1);
    const weights = optimizeAllocation(stats, returnSeries, tolerance);

    // Compute portfolio return/risk at these weights
    const portReturns: number[] = [];
    for (let r = 0; r < runs; r++) {
      let ret = 0;
      for (let i = 0; i < n; i++) {
        ret += weights[i] * returnSeries[i][r];
      }
      portReturns.push(ret);
    }

    frontier.push({
      risk: +stdev(portReturns).toFixed(4),
      return: +mean(portReturns).toFixed(4),
      allocations: stats.map((s, i) => ({
        id: s.id,
        weight: +weights[i].toFixed(4),
      })),
    });
  }

  return frontier.sort((a, b) => a.risk - b.risk);
}

// ---- Markdown Export ----

/**
 * Export portfolio simulation results as a formatted Markdown report.
 */
export function portfolioSimToMarkdown(result: PortfolioSimResult): string {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const lines: string[] = [
    "# Portfolio Simulation Results",
    "",
    `**Total Budget:** $${fmt(result.totalBudget)}`,
    `**Portfolio Expected Return:** ${fmtPct(result.portfolioReturn)}`,
    `**Portfolio Risk (σ):** ${fmtPct(result.portfolioRisk)}`,
    `**Sharpe Ratio:** ${result.portfolioSharpeRatio.toFixed(3)}`,
    `**Diversification Benefit:** ${fmtPct(result.diversificationBenefit)}`,
    `**Simulation Runs:** ${fmt(result.runCount)}`,
    "",
    "## Optimal Allocations",
    "",
    "| Idea | Allocation | % | Expected Return | Risk | Sharpe |",
    "|------|-----------|---|-----------------|------|--------|",
    ...result.optimalAllocations.map(
      (a) =>
        `| ${a.title} | $${fmt(a.allocation)} | ${a.allocationPercent.toFixed(1)}% | ${fmtPct(a.expectedReturn)} | ${fmtPct(a.expectedRisk)} | ${a.sharpeRatio.toFixed(3)} |`
    ),
    "",
    "## Risk Breakdown",
    "",
    `- **Systematic Risk:** ${fmtPct(result.riskBreakdown.systematic)}`,
    `- **Idiosyncratic Risk:** ${fmtPct(result.riskBreakdown.idiosyncratic)}`,
    "",
    "## Efficient Frontier",
    "",
    "| Risk | Return |",
    "|------|--------|",
    ...result.efficientFrontier.map((p) => `| ${fmtPct(p.risk)} | ${fmtPct(p.return)} |`),
    "",
  ];

  if (result.correlationMatrix.length > 0) {
    lines.push("## Correlation Matrix");
    lines.push("");
    lines.push("| Idea A | Idea B | Correlation |");
    lines.push("|--------|--------|-------------|");
    result.correlationMatrix.forEach((c) => {
      lines.push(`| ${c.ideaA} | ${c.ideaB} | ${c.correlation.toFixed(3)} |`);
    });
    lines.push("");
  }

  return lines.join("\n");
}
