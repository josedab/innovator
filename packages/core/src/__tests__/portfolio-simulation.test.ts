import { describe, it, expect } from "vitest";

import {
  sampleDistribution,
  runPortfolioSimulation,
  portfolioSimToMarkdown,
  PortfolioSimConfigSchema,
  PortfolioSimResultSchema,
} from "../simulation/portfolio-simulation.js";
import type { PortfolioSimConfig, Distribution } from "../simulation/portfolio-simulation.js";

const BASE_IDEAS = [
  {
    id: "idea-a",
    title: "AI Chatbot",
    expectedReturn: { type: "triangular" as const, min: 50000, max: 200000, mode: 100000 },
    expectedCost: { type: "uniform" as const, min: 20000, max: 60000 },
    riskFactor: 0.4,
    category: "tech",
  },
  {
    id: "idea-b",
    title: "Mobile App",
    expectedReturn: { type: "normal" as const, mean: 80000, stddev: 20000 },
    expectedCost: { type: "normal" as const, mean: 30000, stddev: 5000 },
    riskFactor: 0.3,
    category: "product",
  },
  {
    id: "idea-c",
    title: "API Platform",
    expectedReturn: { type: "lognormal" as const, mean: 11, stddev: 0.5 },
    expectedCost: { type: "uniform" as const, min: 40000, max: 80000 },
    riskFactor: 0.6,
    category: "infra",
  },
];

const BASE_CONFIG: PortfolioSimConfig = {
  ideas: BASE_IDEAS,
  runs: 500,
  totalBudget: 500000,
  riskTolerance: 0.5,
  correlationStrength: 0.2,
};

describe("sampleDistribution", () => {
  it("samples uniform distribution within range", () => {
    const dist: Distribution = { type: "uniform", min: 10, max: 20 };
    for (let i = 0; i < 100; i++) {
      const v = sampleDistribution(dist);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("samples triangular distribution within range", () => {
    const dist: Distribution = { type: "triangular", min: 0, max: 100, mode: 50 };
    for (let i = 0; i < 100; i++) {
      const v = sampleDistribution(dist);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("samples normal distribution with reasonable values", () => {
    const dist: Distribution = { type: "normal", mean: 100, stddev: 10 };
    const values = Array.from({ length: 1000 }, () => sampleDistribution(dist));
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    expect(avg).toBeGreaterThan(80);
    expect(avg).toBeLessThan(120);
  });

  it("samples lognormal distribution (always positive)", () => {
    const dist: Distribution = { type: "lognormal", mean: 2, stddev: 0.5 };
    for (let i = 0; i < 100; i++) {
      expect(sampleDistribution(dist)).toBeGreaterThan(0);
    }
  });
});

describe("runPortfolioSimulation", () => {
  it("produces valid result with all required fields", () => {
    const result = runPortfolioSimulation(BASE_CONFIG);
    expect(() => PortfolioSimResultSchema.parse(result)).not.toThrow();
    expect(result.totalBudget).toBe(500000);
    expect(result.runCount).toBe(500);
    expect(result.optimalAllocations).toHaveLength(3);
  });

  it("allocations sum to total budget", () => {
    const result = runPortfolioSimulation(BASE_CONFIG);
    const total = result.optimalAllocations.reduce((s, a) => s + a.allocation, 0);
    expect(total).toBeCloseTo(500000, 0);
  });

  it("allocation percentages sum to 100%", () => {
    const result = runPortfolioSimulation(BASE_CONFIG);
    const pctTotal = result.optimalAllocations.reduce((s, a) => s + a.allocationPercent, 0);
    expect(pctTotal).toBeCloseTo(100, 0);
  });

  it("generates efficient frontier points", () => {
    const result = runPortfolioSimulation(BASE_CONFIG);
    expect(result.efficientFrontier.length).toBeGreaterThanOrEqual(2);
    // Should be sorted by risk ascending
    for (let i = 1; i < result.efficientFrontier.length; i++) {
      expect(result.efficientFrontier[i].risk).toBeGreaterThanOrEqual(
        result.efficientFrontier[i - 1].risk - 0.001
      );
    }
  });

  it("generates correlation matrix entries", () => {
    const result = runPortfolioSimulation(BASE_CONFIG);
    // n*(n-1)/2 = 3 pairs for 3 ideas
    expect(result.correlationMatrix).toHaveLength(3);
    result.correlationMatrix.forEach((c) => {
      expect(c.correlation).toBeGreaterThanOrEqual(-1);
      expect(c.correlation).toBeLessThanOrEqual(1);
    });
  });

  it("rejects config with fewer than 2 ideas", () => {
    expect(() => runPortfolioSimulation({ ...BASE_CONFIG, ideas: [BASE_IDEAS[0]] })).toThrow();
  });

  it("adjusts allocations based on risk tolerance", () => {
    const lowRisk = runPortfolioSimulation({ ...BASE_CONFIG, riskTolerance: 0.1 });
    const highRisk = runPortfolioSimulation({ ...BASE_CONFIG, riskTolerance: 0.9 });
    // Both should be valid
    expect(lowRisk.optimalAllocations).toHaveLength(3);
    expect(highRisk.optimalAllocations).toHaveLength(3);
  });
});

describe("portfolioSimToMarkdown", () => {
  it("generates markdown report", () => {
    const result = runPortfolioSimulation(BASE_CONFIG);
    const md = portfolioSimToMarkdown(result);
    expect(md).toContain("# Portfolio Simulation Results");
    expect(md).toContain("Optimal Allocations");
    expect(md).toContain("Efficient Frontier");
    expect(md).toContain("Risk Breakdown");
  });
});
