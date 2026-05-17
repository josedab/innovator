import { describe, it, expect } from "vitest";
import {
  runMonteCarloSimulation,
  runMonteCarloComparison,
  monteCarloToMarkdown,
} from "../monte-carlo.js";
import type { EcosystemSnapshot, Strategy } from "../index.js";

function makeSnapshot(): EcosystemSnapshot {
  return {
    id: "test-eco",
    organizationName: "Test Corp",
    capturedAt: new Date().toISOString(),
    team: [
      {
        id: "m1",
        name: "Alice",
        role: "Engineer",
        capacity: 0.8,
        strengths: ["ai"],
        activeProjects: 2,
      },
      {
        id: "m2",
        name: "Bob",
        role: "Designer",
        capacity: 0.6,
        strengths: ["ux"],
        activeProjects: 1,
      },
      {
        id: "m3",
        name: "Carol",
        role: "PM",
        capacity: 0.9,
        strengths: ["strategy"],
        activeProjects: 3,
      },
    ],
    pipeline: [
      {
        id: "i1",
        title: "AI Assistant",
        stage: "validation",
        score: 75,
        assignedTeam: ["m1"],
        estimatedEffortWeeks: 8,
        budgetAllocated: 50000,
        budgetSpent: 20000,
      },
      {
        id: "i2",
        title: "Mobile App",
        stage: "prototyping",
        score: 60,
        assignedTeam: ["m2"],
        estimatedEffortWeeks: 12,
        budgetAllocated: 30000,
        budgetSpent: 10000,
      },
    ],
    marketContext: {
      industry: "SaaS",
      competitors: [
        { name: "CompA", threat: "high", recentMoves: ["launched AI feature"] },
        { name: "CompB", threat: "medium", recentMoves: ["raised Series C"] },
      ],
      trends: ["AI automation", "sustainability", "remote work"],
      regulatoryFactors: ["GDPR compliance"],
    },
    budget: {
      totalBudget: 200000,
      allocated: 80000,
      remaining: 120000,
      currency: "USD",
    },
    angleEffectiveness: [
      {
        angleId: "scamper",
        successRate: 0.7,
        avgIdeaQuality: 72,
        usageCount: 15,
        bestForStages: ["discovery"],
      },
      {
        angleId: "first-principles",
        successRate: 0.85,
        avgIdeaQuality: 80,
        usageCount: 10,
        bestForStages: ["validation"],
      },
    ],
  };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "conservative",
    name: "Conservative",
    description: "Focus on proven approaches with minimal risk",
    timeHorizonWeeks: 52,
    ...overrides,
  };
}

describe("runMonteCarloSimulation", () => {
  it("produces valid distribution statistics", () => {
    const result = runMonteCarloSimulation(makeSnapshot(), makeStrategy(), {
      iterations: 500,
      timeHorizonWeeks: 52,
      randomSeed: 42,
    });

    expect(result.strategyId).toBe("conservative");
    expect(result.iterations).toBe(500);
    expect(result.metrics.ideasLaunched.mean).toBeGreaterThanOrEqual(0);
    expect(result.metrics.ideasLaunched.p5).toBeLessThanOrEqual(result.metrics.ideasLaunched.p95);
    expect(result.metrics.ideasLaunched.min).toBeLessThanOrEqual(result.metrics.ideasLaunched.max);
    expect(result.metrics.breakthroughProbability).toBeGreaterThanOrEqual(0);
    expect(result.metrics.breakthroughProbability).toBeLessThanOrEqual(1);
    expect(result.metrics.budgetOverrunProbability).toBeGreaterThanOrEqual(0);
  });

  it("produces quarterly projections", () => {
    const result = runMonteCarloSimulation(makeSnapshot(), makeStrategy(), {
      iterations: 200,
      timeHorizonWeeks: 52,
      randomSeed: 42,
    });
    expect(result.quarterlyProjection.length).toBeGreaterThanOrEqual(1);
    expect(result.quarterlyProjection[0].quarter).toBe(1);
  });

  it("is deterministic with same seed", () => {
    const config = { iterations: 100, timeHorizonWeeks: 26, randomSeed: 123 };
    const a = runMonteCarloSimulation(makeSnapshot(), makeStrategy(), config);
    const b = runMonteCarloSimulation(makeSnapshot(), makeStrategy(), config);
    expect(a.metrics.ideasLaunched.mean).toBe(b.metrics.ideasLaunched.mean);
    expect(a.metrics.riskScore.mean).toBe(b.metrics.riskScore.mean);
  });

  it("aggressive strategies show higher risk", () => {
    const config = { iterations: 500, timeHorizonWeeks: 52, randomSeed: 42 };
    const conservative = runMonteCarloSimulation(makeSnapshot(), makeStrategy(), config);
    const aggressive = runMonteCarloSimulation(
      makeSnapshot(),
      makeStrategy({
        id: "aggressive",
        name: "Aggressive",
        description: "Push hard on new initiatives",
        newInitiatives: ["AI feature", "New market", "Platform play"],
      }),
      config
    );
    expect(aggressive.metrics.riskScore.mean).toBeGreaterThan(conservative.metrics.riskScore.mean);
  });
});

describe("runMonteCarloComparison", () => {
  it("compares multiple strategies and recommends one", () => {
    const comparison = runMonteCarloComparison(
      makeSnapshot(),
      [
        makeStrategy(),
        makeStrategy({
          id: "aggressive",
          name: "Aggressive",
          description: "Push hard",
          newInitiatives: ["New product"],
        }),
        makeStrategy({ id: "balanced", name: "Balanced", description: "Balanced approach" }),
      ],
      { iterations: 200, timeHorizonWeeks: 52, randomSeed: 42 }
    );

    expect(comparison.results).toHaveLength(3);
    expect(comparison.recommendation).toBeTruthy();
    expect(comparison.confidenceLevel).toBeGreaterThan(0);
    expect(comparison.confidenceLevel).toBeLessThanOrEqual(1);
  });
});

describe("monteCarloToMarkdown", () => {
  it("generates readable markdown report", () => {
    const comparison = runMonteCarloComparison(
      makeSnapshot(),
      [
        makeStrategy(),
        makeStrategy({ id: "bold", name: "Bold", description: "Go big", newInitiatives: ["X"] }),
      ],
      { iterations: 100, timeHorizonWeeks: 26, randomSeed: 42 }
    );
    const md = monteCarloToMarkdown(comparison);
    expect(md).toContain("Monte Carlo Simulation Report");
    expect(md).toContain("Conservative");
    expect(md).toContain("Bold");
    expect(md).toContain("Recommendation");
  });
});
