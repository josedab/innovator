import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import {
  registerEcosystem,
  getEcosystem,
  listEcosystems,
  removeEcosystem,
  computeEcosystemHealth,
  simulateStrategy,
  compareStrategies,
  getSimulationResult,
  clearDigitalTwinData,
  type EcosystemSnapshot,
  type Strategy,
} from "../index.js";

// ---- Helpers ----

function makeSnapshot(overrides: Partial<EcosystemSnapshot> = {}): EcosystemSnapshot {
  return {
    id: "eco-1",
    organizationName: "Test Corp",
    capturedAt: new Date().toISOString(),
    team: [
      {
        id: "t1",
        name: "Alice",
        role: "Engineer",
        capacity: 0.8,
        strengths: ["AI", "ML"],
        activeProjects: 2,
      },
      {
        id: "t2",
        name: "Bob",
        role: "Designer",
        capacity: 0.6,
        strengths: ["UX"],
        activeProjects: 1,
      },
    ],
    pipeline: [
      {
        id: "i1",
        title: "Idea 1",
        stage: "discovery",
        score: 75,
        assignedTeam: ["t1"],
        estimatedEffortWeeks: 4,
        budgetAllocated: 10000,
        budgetSpent: 2000,
      },
      {
        id: "i2",
        title: "Idea 2",
        stage: "validation",
        score: 85,
        assignedTeam: ["t2"],
        estimatedEffortWeeks: 8,
        budgetAllocated: 20000,
        budgetSpent: 5000,
      },
    ],
    marketContext: {
      industry: "SaaS",
      competitors: [{ name: "Competitor A", threat: "medium", recentMoves: ["Launch v2"] }],
      trends: ["AI-first", "Remote work"],
      regulatoryFactors: [],
    },
    budget: {
      totalBudget: 100000,
      allocated: 30000,
      remaining: 70000,
      currency: "USD",
    },
    angleEffectiveness: [
      {
        angleId: "a1",
        successRate: 0.75,
        avgIdeaQuality: 80,
        usageCount: 10,
        bestForStages: ["discovery"],
      },
    ],
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s1",
    name: "Growth Strategy",
    description: "Focus on rapid scaling",
    timeHorizonWeeks: 52,
    ...overrides,
  };
}

function makeSimulationResultResponse(strategyId: string, strategyName: string) {
  return JSON.stringify({
    strategyId,
    strategyName,
    projectedOutcomes: {
      ideasLaunched: 3,
      revenueImpact: "$500K",
      teamUtilization: 0.85,
      budgetUtilization: 0.7,
      innovationVelocity: 4,
      riskScore: 35,
    },
    milestones: [{ weekNumber: 4, event: "Beta launch", impact: "positive" }],
    risks: ["Market timing"],
    opportunities: ["First mover advantage"],
    recommendations: ["Hire more engineers"],
    confidenceScore: 0.75,
  });
}

describe("digital-twin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDigitalTwinData();
  });

  // ---- registerEcosystem ----

  describe("registerEcosystem", () => {
    it("registers a valid ecosystem snapshot", () => {
      const snapshot = makeSnapshot();
      registerEcosystem(snapshot);
      expect(getEcosystem("eco-1")).toEqual(snapshot);
    });

    it("overwrites existing ecosystem with same ID", () => {
      registerEcosystem(makeSnapshot());
      registerEcosystem(makeSnapshot({ organizationName: "Updated Corp" }));
      expect(getEcosystem("eco-1")?.organizationName).toBe("Updated Corp");
    });

    it("throws on invalid snapshot data", () => {
      expect(() => registerEcosystem({ id: "x" } as unknown as EcosystemSnapshot)).toThrow();
    });
  });

  // ---- getEcosystem ----

  describe("getEcosystem", () => {
    it("returns undefined for non-existent ID", () => {
      expect(getEcosystem("nonexistent")).toBeUndefined();
    });
  });

  // ---- listEcosystems ----

  describe("listEcosystems", () => {
    it("returns empty array when no ecosystems", () => {
      expect(listEcosystems()).toEqual([]);
    });

    it("returns all registered ecosystems", () => {
      registerEcosystem(makeSnapshot({ id: "eco-1" }));
      registerEcosystem(makeSnapshot({ id: "eco-2" }));
      expect(listEcosystems()).toHaveLength(2);
    });
  });

  // ---- removeEcosystem ----

  describe("removeEcosystem", () => {
    it("removes ecosystem and returns true", () => {
      registerEcosystem(makeSnapshot());
      expect(removeEcosystem("eco-1")).toBe(true);
      expect(getEcosystem("eco-1")).toBeUndefined();
    });

    it("returns false for non-existent", () => {
      expect(removeEcosystem("nonexistent")).toBe(false);
    });
  });

  // ---- computeEcosystemHealth ----

  describe("computeEcosystemHealth", () => {
    it("computes all health metrics", () => {
      const health = computeEcosystemHealth(makeSnapshot());
      expect(health.teamUtilization).toBeGreaterThanOrEqual(0);
      expect(health.teamUtilization).toBeLessThanOrEqual(1);
      expect(health.budgetHealth).toBeGreaterThanOrEqual(0);
      expect(health.budgetHealth).toBeLessThanOrEqual(1);
      expect(health.pipelineBalance).toHaveProperty("discovery");
      expect(health.pipelineBalance).toHaveProperty("validation");
      expect(health.avgAngleEffectiveness).toBe(0.75);
    });

    it("handles 0 team members", () => {
      const health = computeEcosystemHealth(makeSnapshot({ team: [] }));
      expect(health.teamUtilization).toBe(0);
    });

    it("handles 0 budget", () => {
      const health = computeEcosystemHealth(
        makeSnapshot({
          budget: { totalBudget: 0, allocated: 0, remaining: 0, currency: "USD" },
        })
      );
      expect(health.budgetHealth).toBe(0);
    });

    it("handles empty pipeline", () => {
      const health = computeEcosystemHealth(makeSnapshot({ pipeline: [] }));
      expect(Object.keys(health.pipelineBalance)).toHaveLength(0);
    });

    it("handles no angle effectiveness data", () => {
      const health = computeEcosystemHealth(makeSnapshot({ angleEffectiveness: [] }));
      expect(health.avgAngleEffectiveness).toBe(0);
    });

    it("caps team utilization at 1", () => {
      const health = computeEcosystemHealth(
        makeSnapshot({
          team: [
            {
              id: "t1",
              name: "Alice",
              role: "Eng",
              capacity: 0.5,
              strengths: [],
              activeProjects: 50,
            },
          ],
        })
      );
      expect(health.teamUtilization).toBe(1);
    });
  });

  // ---- simulateStrategy (mocked LLM) ----

  describe("simulateStrategy", () => {
    it("returns structured simulation result", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(
        makeSimulationResultResponse("s1", "Growth Strategy")
      );

      const snapshot = makeSnapshot();
      const strategy = makeStrategy();
      const result = await simulateStrategy(snapshot, strategy);

      expect(result.strategyId).toBe("s1");
      expect(result.strategyName).toBe("Growth Strategy");
      expect(result.projectedOutcomes.ideasLaunched).toBe(3);
      expect(result.confidenceScore).toBe(0.75);
    });

    it("throws for invalid strategy", async () => {
      await expect(
        simulateStrategy(makeSnapshot(), { name: "Invalid" } as unknown as Strategy)
      ).rejects.toThrow();
    });
  });

  // ---- compareStrategies ----

  describe("compareStrategies", () => {
    it("compares multiple strategies", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText)
        .mockResolvedValueOnce(makeSimulationResultResponse("s1", "Strategy A"))
        .mockResolvedValueOnce(makeSimulationResultResponse("s2", "Strategy B"))
        .mockResolvedValueOnce(
          JSON.stringify({
            winner: "s1",
            summary: "Strategy A wins",
            tradeoffs: ["Higher risk"],
          })
        );

      const snapshot = makeSnapshot();
      registerEcosystem(snapshot);
      const result = await compareStrategies(snapshot, [
        makeStrategy({ id: "s1", name: "Strategy A" }),
        makeStrategy({ id: "s2", name: "Strategy B" }),
      ]);

      expect(result.results).toHaveLength(2);
      expect(result.winner).toBe("s1");
      expect(result.summary).toContain("Strategy A");
    });

    it("throws for empty strategies array", async () => {
      await expect(compareStrategies(makeSnapshot(), [])).rejects.toThrow("At least one strategy");
    });

    it("throws for more than 10 strategies", async () => {
      const strategies = Array.from({ length: 11 }, (_, i) =>
        makeStrategy({ id: `s${i}`, name: `S${i}` })
      );
      await expect(compareStrategies(makeSnapshot(), strategies)).rejects.toThrow("Maximum 10");
    });

    it("stores comparison result for retrieval", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText)
        .mockResolvedValueOnce(makeSimulationResultResponse("s1", "Strategy A"))
        .mockResolvedValueOnce(JSON.stringify({ winner: "s1", summary: "Done", tradeoffs: [] }));

      const snapshot = makeSnapshot();
      registerEcosystem(snapshot);
      await compareStrategies(snapshot, [makeStrategy()]);

      expect(getSimulationResult("eco-1")).toBeDefined();
    });
  });

  // ---- getSimulationResult ----

  describe("getSimulationResult", () => {
    it("returns undefined for non-existent", () => {
      expect(getSimulationResult("nonexistent")).toBeUndefined();
    });
  });

  // ---- clearDigitalTwinData ----

  describe("clearDigitalTwinData", () => {
    it("clears all data", () => {
      registerEcosystem(makeSnapshot());
      clearDigitalTwinData();
      expect(listEcosystems()).toHaveLength(0);
      expect(getSimulationResult("eco-1")).toBeUndefined();
    });
  });
});
