import { describe, it, expect } from "vitest";

import {
  ideasToAssets,
  computeCorrelationMatrix,
  computePortfolioMetrics,
  runMonteCarloOptimization,
  computeEfficientFrontier,
  optimizePortfolio,
  portfolioOptimizationToMarkdown,
} from "../portfolio-optimizer/index.js";
import type { IdeaScore } from "../scoring/index.js";

function makeScore(overrides: Partial<IdeaScore> = {}): IdeaScore {
  return {
    ideaTitle: "Test Idea",
    angleId: "scamper",
    impact: 7,
    feasibility: 8,
    novelty: 6,
    timeToImplement: "weeks",
    confidence: 0.8,
    rationale: "Test rationale",
    ...overrides,
  };
}

describe("portfolio-optimizer", () => {
  describe("ideasToAssets", () => {
    it("converts scored ideas to portfolio assets", () => {
      const scores = [makeScore({ ideaTitle: "Idea A" }), makeScore({ ideaTitle: "Idea B" })];
      const assets = ideasToAssets(scores);

      expect(assets).toHaveLength(2);
      expect(assets[0].title).toBe("Idea A");
      expect(assets[0].expectedReturn).toBe((7 * 8) / 100);
      expect(assets[0].risk).toBeCloseTo(0.2);
      expect(assets[0].weight).toBe(0);
    });

    it("handles empty array", () => {
      expect(ideasToAssets([])).toEqual([]);
    });
  });

  describe("computeCorrelationMatrix", () => {
    it("creates identity-like matrix with category correlation", () => {
      const assets = ideasToAssets([
        makeScore({ angleId: "scamper" }),
        makeScore({ angleId: "scamper" }),
        makeScore({ angleId: "biomimicry" }),
      ]);
      const matrix = computeCorrelationMatrix(assets);

      expect(matrix).toHaveLength(3);
      expect(matrix[0][0]).toBe(1); // diagonal
      expect(matrix[0][1]).toBe(0.6); // same category
      expect(matrix[0][2]).toBe(0.2); // different category
    });

    it("handles single asset", () => {
      const assets = ideasToAssets([makeScore()]);
      const matrix = computeCorrelationMatrix(assets);
      expect(matrix).toEqual([[1]]);
    });
  });

  describe("computePortfolioMetrics", () => {
    it("computes return and risk for given weights", () => {
      const assets = ideasToAssets([makeScore(), makeScore()]);
      const matrix = computeCorrelationMatrix(assets);
      const result = computePortfolioMetrics(assets, [0.5, 0.5], matrix);

      expect(result.returnVal).toBeGreaterThan(0);
      expect(result.risk).toBeGreaterThanOrEqual(0);
    });

    it("throws ValidationError when weights length mismatches assets", () => {
      const assets = ideasToAssets([makeScore()]);
      const matrix = computeCorrelationMatrix(assets);

      expect(() => computePortfolioMetrics(assets, [0.5, 0.5], matrix)).toThrow(
        "Weights length (2) must match assets length (1)"
      );
    });

    it("throws ValidationError when correlation matrix dimensions mismatch", () => {
      const assets = ideasToAssets([makeScore(), makeScore()]);

      expect(() => computePortfolioMetrics(assets, [0.5, 0.5], [[1]])).toThrow(
        "Correlation matrix dimensions must match assets length"
      );
    });
  });

  describe("runMonteCarloOptimization", () => {
    it("runs simulations and finds optimal portfolio", () => {
      const assets = ideasToAssets([
        makeScore({ impact: 9, feasibility: 8, confidence: 0.9, angleId: "scamper" }),
        makeScore({ impact: 5, feasibility: 6, confidence: 0.7, angleId: "biomimicry" }),
        makeScore({ impact: 7, feasibility: 7, confidence: 0.8, angleId: "triz" }),
      ]);
      const matrix = computeCorrelationMatrix(assets);
      const result = runMonteCarloOptimization(assets, matrix, { monteCarloSimulations: 100 });

      expect(result.simulations).toBe(100);
      expect(result.optimalPortfolio.sharpeRatio).toBeDefined();
      expect(result.percentile5.risk).toBeLessThanOrEqual(result.percentile95.risk);
    });
  });

  describe("computeEfficientFrontier", () => {
    it("generates frontier points", () => {
      const assets = ideasToAssets([makeScore({ angleId: "a" }), makeScore({ angleId: "b" })]);
      const matrix = computeCorrelationMatrix(assets);
      const frontier = computeEfficientFrontier(assets, matrix, { numFrontierPoints: 5 });

      expect(frontier.length).toBeGreaterThan(0);
      for (const point of frontier) {
        expect(point.risk).toBeGreaterThanOrEqual(0);
        expect(point.expectedReturn).toBeDefined();
        expect(point.sharpeRatio).toBeDefined();
      }
    });
  });

  describe("optimizePortfolio", () => {
    it("runs full optimization on scored ideas", () => {
      const scores = [
        makeScore({ ideaTitle: "A", impact: 9, feasibility: 8, confidence: 0.9, angleId: "a" }),
        makeScore({ ideaTitle: "B", impact: 6, feasibility: 5, confidence: 0.7, angleId: "b" }),
        makeScore({ ideaTitle: "C", impact: 7, feasibility: 7, confidence: 0.8, angleId: "a" }),
      ];
      const result = optimizePortfolio(scores, { monteCarloSimulations: 50, numFrontierPoints: 5 });

      expect(result.assets).toHaveLength(3);
      expect(result.correlationMatrix).toHaveLength(3);
      expect(result.optimalPortfolio.sharpeRatio).toBeDefined();
      expect(result.summary).toContain("Sharpe ratio");
    });

    it("throws ValidationError for empty scores", () => {
      expect(() => optimizePortfolio([])).toThrow("No ideas to optimize");
    });
  });

  describe("portfolioOptimizationToMarkdown", () => {
    it("generates valid markdown report", () => {
      const scores = [
        makeScore({ ideaTitle: "Alpha", angleId: "x" }),
        makeScore({ ideaTitle: "Beta", angleId: "y" }),
      ];
      const result = optimizePortfolio(scores, { monteCarloSimulations: 50, numFrontierPoints: 5 });
      const md = portfolioOptimizationToMarkdown(result);

      expect(md).toContain("# 📊 Innovation Portfolio Optimization");
      expect(md).toContain("**Optimal Sharpe Ratio:**");
      expect(md).toContain("## Monte Carlo Simulation");
    });
  });
});
