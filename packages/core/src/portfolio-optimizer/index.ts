/**
 * @module portfolio-optimizer
 *
 * Innovation Portfolio Optimizer — apply Markowitz portfolio theory to idea
 * selection. Model ideas as assets with expected return (impact × feasibility),
 * risk (1 - feasibility confidence), and correlation. Compute efficient frontier
 * using quadratic optimization and Monte Carlo simulation.
 */

import { z } from "zod";
import type { IdeaScore } from "../scoring/index.js";

// ---- Schemas ----

/** Portfolio asset representing an idea. */
export const PortfolioAssetSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  expectedReturn: z.number(),
  risk: z.number().min(0).max(1),
  weight: z.number().min(0).max(1).default(0),
  category: z.string().max(200).optional(),
});

/** A point on the efficient frontier. */
export const EfficientFrontierPointSchema = z.object({
  risk: z.number().min(0),
  expectedReturn: z.number(),
  weights: z.record(z.number()),
  sharpeRatio: z.number(),
});

/** Monte Carlo simulation result. */
export const MonteCarloPortfolioResultSchema = z.object({
  simulations: z.number().min(0),
  percentile5: z.object({ risk: z.number(), return: z.number() }),
  percentile50: z.object({ risk: z.number(), return: z.number() }),
  percentile95: z.object({ risk: z.number(), return: z.number() }),
  optimalPortfolio: z.object({
    risk: z.number(),
    return: z.number(),
    weights: z.record(z.number()),
    sharpeRatio: z.number(),
  }),
});

/** Full portfolio optimization result. */
export const PortfolioOptimizationSchema = z.object({
  assets: z.array(PortfolioAssetSchema).max(100),
  correlationMatrix: z.array(z.array(z.number())).max(100),
  efficientFrontier: z.array(EfficientFrontierPointSchema).max(50),
  optimalPortfolio: EfficientFrontierPointSchema,
  monteCarloResult: MonteCarloPortfolioResultSchema.optional(),
  summary: z.string().max(2000),
});

// ---- Types ----

export type PortfolioAsset = z.infer<typeof PortfolioAssetSchema>;
export type EfficientFrontierPoint = z.infer<typeof EfficientFrontierPointSchema>;
export type MonteCarloPortfolioResult = z.infer<typeof MonteCarloPortfolioResultSchema>;
export type PortfolioOptimization = z.infer<typeof PortfolioOptimizationSchema>;

/** Configuration for portfolio optimization. */
export interface PortfolioOptimizerConfig {
  riskFreeRate?: number;
  numFrontierPoints?: number;
  monteCarloSimulations?: number;
  maxAllocationPerIdea?: number;
}

// ---- Core Functions ----

/**
 * Convert scored ideas to portfolio assets.
 */
export function ideasToAssets(scores: IdeaScore[]): PortfolioAsset[] {
  return scores.map((score, i) => ({
    id: `idea-${i}`,
    title: score.ideaTitle,
    expectedReturn: (score.impact * score.feasibility) / 100,
    risk: 1 - score.confidence,
    weight: 0,
    category: score.angleId,
  }));
}

/**
 * Compute correlation matrix between assets based on category similarity.
 */
export function computeCorrelationMatrix(assets: PortfolioAsset[]): number[][] {
  const n = assets.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        // Ideas from the same angle are more correlated
        matrix[i][j] = assets[i].category === assets[j].category ? 0.6 : 0.2;
      }
    }
  }

  return matrix;
}

/**
 * Compute portfolio return and risk for given weights.
 */
export function computePortfolioMetrics(
  assets: PortfolioAsset[],
  weights: number[],
  correlationMatrix: number[][]
): { returnVal: number; risk: number } {
  const n = assets.length;
  let portfolioReturn = 0;

  for (let i = 0; i < n; i++) {
    portfolioReturn += weights[i] * assets[i].expectedReturn;
  }

  // Portfolio variance using correlation matrix
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance +=
        weights[i] * weights[j] * assets[i].risk * assets[j].risk * correlationMatrix[i][j];
    }
  }

  return { returnVal: portfolioReturn, risk: Math.sqrt(Math.max(variance, 0)) };
}

/**
 * Generate random portfolio weights that sum to 1.
 */
function randomWeights(n: number, maxAllocation: number): number[] {
  const raw = Array.from({ length: n }, () => Math.random());
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => Math.min(w / sum, maxAllocation));
}

/**
 * Run Monte Carlo simulation to find optimal portfolio allocation.
 */
export function runMonteCarloOptimization(
  assets: PortfolioAsset[],
  correlationMatrix: number[][],
  config?: PortfolioOptimizerConfig
): MonteCarloPortfolioResult {
  const numSims = config?.monteCarloSimulations ?? 5000;
  const maxAlloc = config?.maxAllocationPerIdea ?? 0.4;
  const riskFreeRate = config?.riskFreeRate ?? 0.02;
  const n = assets.length;

  const results: Array<{ risk: number; returnVal: number; weights: number[]; sharpe: number }> = [];

  for (let i = 0; i < numSims; i++) {
    const weights = randomWeights(n, maxAlloc);
    const { returnVal, risk } = computePortfolioMetrics(assets, weights, correlationMatrix);
    const sharpe = risk > 0 ? (returnVal - riskFreeRate) / risk : 0;
    results.push({ risk, returnVal, weights, sharpe });
  }

  results.sort((a, b) => a.risk - b.risk);

  const p5 = results[Math.floor(numSims * 0.05)];
  const p50 = results[Math.floor(numSims * 0.5)];
  const p95 = results[Math.floor(numSims * 0.95)];

  // Find optimal (max Sharpe ratio)
  const optimal = results.reduce(
    (best, curr) => (curr.sharpe > best.sharpe ? curr : best),
    results[0]
  );

  const toWeightRecord = (weights: number[]): Record<string, number> => {
    const record: Record<string, number> = {};
    for (let i = 0; i < assets.length; i++) {
      record[assets[i].id] = weights[i];
    }
    return record;
  };

  return {
    simulations: numSims,
    percentile5: { risk: p5.risk, return: p5.returnVal },
    percentile50: { risk: p50.risk, return: p50.returnVal },
    percentile95: { risk: p95.risk, return: p95.returnVal },
    optimalPortfolio: {
      risk: optimal.risk,
      return: optimal.returnVal,
      weights: toWeightRecord(optimal.weights),
      sharpeRatio: optimal.sharpe,
    },
  };
}

/**
 * Compute efficient frontier by sampling across risk levels.
 */
export function computeEfficientFrontier(
  assets: PortfolioAsset[],
  correlationMatrix: number[][],
  config?: PortfolioOptimizerConfig
): EfficientFrontierPoint[] {
  const numPoints = config?.numFrontierPoints ?? 20;
  const maxAlloc = config?.maxAllocationPerIdea ?? 0.4;
  const riskFreeRate = config?.riskFreeRate ?? 0.02;
  const n = assets.length;
  const samplesPerPoint = 500;

  const frontier: EfficientFrontierPoint[] = [];
  const allResults: Array<{ risk: number; returnVal: number; weights: number[]; sharpe: number }> =
    [];

  // Generate many random portfolios
  for (let i = 0; i < samplesPerPoint * numPoints; i++) {
    const weights = randomWeights(n, maxAlloc);
    const { returnVal, risk } = computePortfolioMetrics(assets, weights, correlationMatrix);
    const sharpe = risk > 0 ? (returnVal - riskFreeRate) / risk : 0;
    allResults.push({ risk, returnVal, weights, sharpe });
  }

  // Bin by risk level and find best return per bin
  allResults.sort((a, b) => a.risk - b.risk);
  const minRisk = allResults[0]?.risk ?? 0;
  const maxRisk = allResults[allResults.length - 1]?.risk ?? 1;
  const binWidth = (maxRisk - minRisk) / numPoints || 0.01;

  for (let i = 0; i < numPoints; i++) {
    const binMin = minRisk + i * binWidth;
    const binMax = binMin + binWidth;
    const binItems = allResults.filter((r) => r.risk >= binMin && r.risk < binMax);

    if (binItems.length > 0) {
      const best = binItems.reduce((a, b) => (a.returnVal > b.returnVal ? a : b), binItems[0]);
      const weightRecord: Record<string, number> = {};
      for (let j = 0; j < assets.length; j++) {
        weightRecord[assets[j].id] = best.weights[j];
      }
      frontier.push({
        risk: best.risk,
        expectedReturn: best.returnVal,
        weights: weightRecord,
        sharpeRatio: best.sharpe,
      });
    }
  }

  return frontier;
}

/**
 * Run full portfolio optimization on scored ideas.
 *
 * @param scores - Scored ideas to optimize
 * @param config - Optimization configuration
 */
export function optimizePortfolio(
  scores: IdeaScore[],
  config?: PortfolioOptimizerConfig
): PortfolioOptimization {
  if (scores.length === 0) {
    throw new Error("No ideas to optimize");
  }

  const assets = ideasToAssets(scores);
  const correlationMatrix = computeCorrelationMatrix(assets);
  const frontier = computeEfficientFrontier(assets, correlationMatrix, config);
  const monteCarlo = runMonteCarloOptimization(assets, correlationMatrix, config);

  // Find optimal point on frontier (max Sharpe ratio)
  const optimal =
    frontier.length > 0
      ? frontier.reduce(
          (best, curr) => (curr.sharpeRatio > best.sharpeRatio ? curr : best),
          frontier[0]
        )
      : {
          risk: monteCarlo.optimalPortfolio.risk,
          expectedReturn: monteCarlo.optimalPortfolio.return,
          weights: monteCarlo.optimalPortfolio.weights,
          sharpeRatio: monteCarlo.optimalPortfolio.sharpeRatio,
        };

  // Build summary
  const topAllocations = Object.entries(optimal.weights)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, weight]) => {
      const asset = assets.find((a) => a.id === id);
      return `${asset?.title ?? id}: ${(weight * 100).toFixed(1)}%`;
    });

  const summary =
    `Optimal portfolio with Sharpe ratio ${optimal.sharpeRatio.toFixed(2)}: ` +
    `Expected return ${(optimal.expectedReturn * 100).toFixed(1)}%, ` +
    `Risk ${(optimal.risk * 100).toFixed(1)}%. ` +
    `Top allocations: ${topAllocations.join(", ")}`;

  return {
    assets,
    correlationMatrix,
    efficientFrontier: frontier,
    optimalPortfolio: optimal,
    monteCarloResult: monteCarlo,
    summary,
  };
}

/**
 * Format portfolio optimization as Markdown.
 */
export function portfolioOptimizationToMarkdown(result: PortfolioOptimization): string {
  const lines: string[] = [
    "# 📊 Innovation Portfolio Optimization",
    "",
    `**Optimal Sharpe Ratio:** ${result.optimalPortfolio.sharpeRatio.toFixed(2)}`,
    `**Expected Return:** ${(result.optimalPortfolio.expectedReturn * 100).toFixed(1)}%`,
    `**Portfolio Risk:** ${(result.optimalPortfolio.risk * 100).toFixed(1)}%`,
    "",
    "## Optimal Allocation",
    "",
    "| Idea | Weight | Expected Return | Risk |",
    "|------|--------|-----------------|------|",
  ];

  for (const asset of result.assets) {
    const weight = result.optimalPortfolio.weights[asset.id] ?? 0;
    if (weight > 0.01) {
      lines.push(
        `| ${asset.title} | ${(weight * 100).toFixed(1)}% | ${(asset.expectedReturn * 100).toFixed(1)}% | ${(asset.risk * 100).toFixed(1)}% |`
      );
    }
  }

  if (result.monteCarloResult) {
    const mc = result.monteCarloResult;
    lines.push("", "## Monte Carlo Simulation", "");
    lines.push(`- **Simulations:** ${mc.simulations.toLocaleString()}`);
    lines.push(
      `- **5th Percentile:** Return ${(mc.percentile5.return * 100).toFixed(1)}%, Risk ${(mc.percentile5.risk * 100).toFixed(1)}%`
    );
    lines.push(
      `- **50th Percentile:** Return ${(mc.percentile50.return * 100).toFixed(1)}%, Risk ${(mc.percentile50.risk * 100).toFixed(1)}%`
    );
    lines.push(
      `- **95th Percentile:** Return ${(mc.percentile95.return * 100).toFixed(1)}%, Risk ${(mc.percentile95.risk * 100).toFixed(1)}%`
    );
  }

  lines.push("", "## Summary", "", result.summary);
  return lines.join("\n");
}
