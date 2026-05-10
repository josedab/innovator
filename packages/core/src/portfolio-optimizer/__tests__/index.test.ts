import { describe, it, expect } from "vitest";
import {
  ideasToAssets,
  computeCorrelationMatrix,
  computePortfolioMetrics,
  runMonteCarloOptimization,
  computeEfficientFrontier,
  optimizePortfolio,
  portfolioOptimizationToMarkdown,
  type PortfolioAsset,
} from "../index.js";
import type { IdeaScore } from "../../scoring/index.js";

// ---- Helpers ----

function makeScore(overrides: Partial<IdeaScore> = {}): IdeaScore {
  return {
    ideaTitle: "Test Idea",
    angleId: "angle-1",
    feasibility: 8,
    impact: 7,
    novelty: 6,
    timeToImplement: "weeks",
    confidence: 0.8,
    rationale: "Good idea",
    ...overrides,
  };
}

function makeAsset(overrides: Partial<PortfolioAsset> = {}): PortfolioAsset {
  return {
    id: "idea-0",
    title: "Test Idea",
    expectedReturn: 0.56,
    risk: 0.2,
    weight: 0,
    category: "angle-1",
    ...overrides,
  };
}

describe("portfolio-optimizer", () => {
  // ---- ideasToAssets ----
  describe("ideasToAssets", () => {
    it("converts idea scores to portfolio assets", () => {
      const scores = [
        makeScore({
          ideaTitle: "Idea A",
          feasibility: 8,
          impact: 7,
          confidence: 0.8,
          angleId: "a1",
        }),
        makeScore({
          ideaTitle: "Idea B",
          feasibility: 5,
          impact: 9,
          confidence: 0.6,
          angleId: "a2",
        }),
      ];
      const assets = ideasToAssets(scores);

      expect(assets).toHaveLength(2);
      expect(assets[0].id).toBe("idea-0");
      expect(assets[0].title).toBe("Idea A");
      // expectedReturn = (impact * feasibility) / 100 = (7 * 8) / 100 = 0.56
      expect(assets[0].expectedReturn).toBeCloseTo(0.56, 2);
      // risk = 1 - confidence = 1 - 0.8 = 0.2
      expect(assets[0].risk).toBeCloseTo(0.2, 2);
      expect(assets[0].category).toBe("a1");
      expect(assets[0].weight).toBe(0);

      expect(assets[1].expectedReturn).toBeCloseTo(0.45, 2);
      expect(assets[1].risk).toBeCloseTo(0.4, 2);
    });
  });

  // ---- computeCorrelationMatrix ----
  describe("computeCorrelationMatrix", () => {
    it("diagonal is 1.0", () => {
      const assets = [
        makeAsset({ id: "a", category: "cat1" }),
        makeAsset({ id: "b", category: "cat2" }),
        makeAsset({ id: "c", category: "cat1" }),
      ];
      const matrix = computeCorrelationMatrix(assets);

      for (let i = 0; i < assets.length; i++) {
        expect(matrix[i][i]).toBe(1);
      }
    });

    it("same-category correlation is 0.6", () => {
      const assets = [
        makeAsset({ id: "a", category: "cat1" }),
        makeAsset({ id: "b", category: "cat1" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      expect(matrix[0][1]).toBe(0.6);
      expect(matrix[1][0]).toBe(0.6);
    });

    it("different-category correlation is 0.2", () => {
      const assets = [
        makeAsset({ id: "a", category: "cat1" }),
        makeAsset({ id: "b", category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      expect(matrix[0][1]).toBe(0.2);
      expect(matrix[1][0]).toBe(0.2);
    });

    it("matrix is symmetric", () => {
      const assets = [
        makeAsset({ id: "a", category: "cat1" }),
        makeAsset({ id: "b", category: "cat2" }),
        makeAsset({ id: "c", category: "cat1" }),
      ];
      const matrix = computeCorrelationMatrix(assets);

      for (let i = 0; i < assets.length; i++) {
        for (let j = 0; j < assets.length; j++) {
          expect(matrix[i][j]).toBe(matrix[j][i]);
        }
      }
    });

    it("single asset produces 1x1 matrix", () => {
      const matrix = computeCorrelationMatrix([makeAsset()]);
      expect(matrix).toEqual([[1]]);
    });
  });

  // ---- computePortfolioMetrics ----
  describe("computePortfolioMetrics", () => {
    it("computes weighted return correctly", () => {
      const assets = [
        makeAsset({ expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ expectedReturn: 0.2, risk: 0.3 }),
      ];
      const weights = [0.6, 0.4];
      const matrix = [
        [1, 0.2],
        [0.2, 1],
      ];

      const { returnVal } = computePortfolioMetrics(assets, weights, matrix);
      // 0.6 * 0.10 + 0.4 * 0.20 = 0.14
      expect(returnVal).toBeCloseTo(0.14, 4);
    });

    it("computes portfolio risk using Markowitz formula", () => {
      const assets = [
        makeAsset({ expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ expectedReturn: 0.2, risk: 0.3 }),
      ];
      const weights = [0.6, 0.4];
      const matrix = [
        [1, 0],
        [0, 1],
      ]; // uncorrelated

      const { risk } = computePortfolioMetrics(assets, weights, matrix);
      // variance = w1² * σ1² + w2² * σ2² = 0.36*0.04 + 0.16*0.09 = 0.0144 + 0.0144 = 0.0288
      // risk = sqrt(0.0288) ≈ 0.1697
      expect(risk).toBeCloseTo(Math.sqrt(0.0288), 3);
    });

    it("zero weights produce zero return and risk", () => {
      const assets = [makeAsset(), makeAsset()];
      const matrix = computeCorrelationMatrix(assets);
      const { returnVal, risk } = computePortfolioMetrics(assets, [0, 0], matrix);
      expect(returnVal).toBe(0);
      expect(risk).toBe(0);
    });

    it("risk is never negative", () => {
      const assets = [makeAsset({ risk: 0 }), makeAsset({ risk: 0 })];
      const matrix = computeCorrelationMatrix(assets);
      const { risk } = computePortfolioMetrics(assets, [0.5, 0.5], matrix);
      expect(risk).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- runMonteCarloOptimization ----
  describe("runMonteCarloOptimization", () => {
    it("runs default 5000 simulations", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const result = runMonteCarloOptimization(assets, matrix);

      expect(result.simulations).toBe(5000);
      expect(result.optimalPortfolio).toBeDefined();
      expect(result.percentile5).toBeDefined();
      expect(result.percentile50).toBeDefined();
      expect(result.percentile95).toBeDefined();
    });

    it("optimal portfolio has valid Sharpe ratio", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const result = runMonteCarloOptimization(assets, matrix);

      expect(typeof result.optimalPortfolio.sharpeRatio).toBe("number");
      expect(isFinite(result.optimalPortfolio.sharpeRatio)).toBe(true);
    });

    it("optimal weights reference all asset IDs", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const result = runMonteCarloOptimization(assets, matrix);

      expect(result.optimalPortfolio.weights).toHaveProperty("a");
      expect(result.optimalPortfolio.weights).toHaveProperty("b");
    });

    it("respects custom simulation count", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const result = runMonteCarloOptimization(assets, matrix, { monteCarloSimulations: 100 });

      expect(result.simulations).toBe(100);
    });

    it("percentile risk values are ordered", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
        makeAsset({ id: "c", expectedReturn: 0.3, risk: 0.5, category: "cat3" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const result = runMonteCarloOptimization(assets, matrix);

      expect(result.percentile5.risk).toBeLessThanOrEqual(result.percentile50.risk);
      expect(result.percentile50.risk).toBeLessThanOrEqual(result.percentile95.risk);
    });
  });

  // ---- computeEfficientFrontier ----
  describe("computeEfficientFrontier", () => {
    it("returns frontier points", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const frontier = computeEfficientFrontier(assets, matrix);

      expect(frontier.length).toBeGreaterThan(0);
      expect(frontier.length).toBeLessThanOrEqual(20);
    });

    it("frontier risk is monotonically non-decreasing", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
        makeAsset({ id: "c", expectedReturn: 0.3, risk: 0.5, category: "cat3" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const frontier = computeEfficientFrontier(assets, matrix);

      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i].risk).toBeGreaterThanOrEqual(frontier[i - 1].risk);
      }
    });

    it("respects custom numFrontierPoints", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const frontier = computeEfficientFrontier(assets, matrix, { numFrontierPoints: 10 });

      expect(frontier.length).toBeLessThanOrEqual(10);
    });

    it("each point has weights and Sharpe ratio", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0.2 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const frontier = computeEfficientFrontier(assets, matrix);

      for (const point of frontier) {
        expect(point.weights).toBeDefined();
        expect(typeof point.sharpeRatio).toBe("number");
        expect(typeof point.risk).toBe("number");
        expect(typeof point.expectedReturn).toBe("number");
      }
    });
  });

  // ---- optimizePortfolio ----
  describe("optimizePortfolio", () => {
    it("end-to-end optimization with mock scores", () => {
      const scores = [
        makeScore({ ideaTitle: "A", feasibility: 8, impact: 7, confidence: 0.8, angleId: "a1" }),
        makeScore({ ideaTitle: "B", feasibility: 6, impact: 9, confidence: 0.7, angleId: "a2" }),
        makeScore({ ideaTitle: "C", feasibility: 7, impact: 5, confidence: 0.9, angleId: "a1" }),
      ];
      const result = optimizePortfolio(scores);

      expect(result.assets).toHaveLength(3);
      expect(result.correlationMatrix).toHaveLength(3);
      expect(result.efficientFrontier.length).toBeGreaterThan(0);
      expect(result.optimalPortfolio).toBeDefined();
      expect(result.summary).toBeTruthy();
      expect(result.monteCarloResult).toBeDefined();
    });

    it("throws for empty scores", () => {
      expect(() => optimizePortfolio([])).toThrow("No ideas to optimize");
    });

    it("works with single idea", () => {
      const scores = [makeScore()];
      const result = optimizePortfolio(scores);
      expect(result.assets).toHaveLength(1);
    });

    it("works with identical scores", () => {
      const scores = [
        makeScore({ ideaTitle: "A" }),
        makeScore({ ideaTitle: "B" }),
        makeScore({ ideaTitle: "C" }),
      ];
      const result = optimizePortfolio(scores);
      expect(result.assets).toHaveLength(3);
      expect(result.optimalPortfolio).toBeDefined();
    });
  });

  // ---- portfolioOptimizationToMarkdown ----
  describe("portfolioOptimizationToMarkdown", () => {
    it("produces markdown with key sections", () => {
      const scores = [
        makeScore({ ideaTitle: "A", angleId: "a1" }),
        makeScore({ ideaTitle: "B", angleId: "a2" }),
      ];
      const result = optimizePortfolio(scores);
      const md = portfolioOptimizationToMarkdown(result);

      expect(md).toContain("# 📊 Innovation Portfolio Optimization");
      expect(md).toContain("## Optimal Allocation");
      expect(md).toContain("| Idea | Weight");
      expect(md).toContain("## Monte Carlo Simulation");
      expect(md).toContain("## Summary");
    });
  });

  // ---- Edge cases ----
  describe("edge cases", () => {
    it("zero-risk asset", () => {
      const assets = [
        makeAsset({ id: "a", expectedReturn: 0.1, risk: 0 }),
        makeAsset({ id: "b", expectedReturn: 0.2, risk: 0.3, category: "cat2" }),
      ];
      const matrix = computeCorrelationMatrix(assets);
      const { risk } = computePortfolioMetrics(assets, [0.5, 0.5], matrix);
      expect(isFinite(risk)).toBe(true);
      expect(risk).toBeGreaterThanOrEqual(0);
    });

    it("negative expected returns", () => {
      const scores = [makeScore({ feasibility: 1, impact: 1, confidence: 0.99 })];
      const result = optimizePortfolio(scores);
      expect(result.assets[0].expectedReturn).toBeCloseTo(0.01, 2);
    });
  });
});
