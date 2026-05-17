import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
  generateTextStream: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  registerEcosystem,
  getEcosystem,
  listEcosystems,
  removeEcosystem,
  computeEcosystemHealth,
  getSimulationResult,
  clearDigitalTwinData,
  EcosystemSnapshotSchema,
} from "../digital-twin/index.js";

function makeSnapshot(id = "eco-1") {
  return {
    id,
    organizationName: "Test Corp",
    capturedAt: new Date().toISOString(),
    team: [
      {
        id: "m1",
        name: "Alice",
        role: "Engineer",
        capacity: 0.8,
        strengths: ["frontend"],
        activeProjects: 2,
      },
    ],
    pipeline: [
      {
        id: "idea-1",
        title: "AI Chat",
        stage: "validation" as const,
        score: 75,
        assignedTeam: ["m1"],
        estimatedEffortWeeks: 4,
        budgetAllocated: 10000,
        budgetSpent: 2000,
      },
      {
        id: "idea-2",
        title: "ML Pipeline",
        stage: "discovery" as const,
        score: 60,
        assignedTeam: [],
        estimatedEffortWeeks: 8,
        budgetAllocated: 20000,
        budgetSpent: 0,
      },
    ],
    marketContext: {
      industry: "SaaS",
      competitors: [
        { name: "Competitor A", threat: "medium" as const, recentMoves: ["launched v2"] },
      ],
      trends: ["AI-first"],
      regulatoryFactors: [],
    },
    budget: { totalBudget: 100000, allocated: 30000, remaining: 70000, currency: "USD" },
    angleEffectiveness: [
      {
        angleId: "scamper",
        successRate: 0.7,
        avgIdeaQuality: 72,
        usageCount: 15,
        bestForStages: ["discovery"],
      },
    ],
  };
}

describe("digital-twin", () => {
  beforeEach(() => {
    clearDigitalTwinData();
  });

  it("registers and retrieves an ecosystem", () => {
    const snap = makeSnapshot();
    registerEcosystem(snap);
    const result = getEcosystem("eco-1");
    expect(result).toBeDefined();
    expect(result!.organizationName).toBe("Test Corp");
    expect(result!.id).toBe("eco-1");
  });

  it("listEcosystems returns array with registered ecosystems", () => {
    registerEcosystem(makeSnapshot("eco-1"));
    registerEcosystem(makeSnapshot("eco-2"));
    const list = listEcosystems();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
  });

  it("removeEcosystem returns true for existing, false for non-existent", () => {
    registerEcosystem(makeSnapshot("eco-1"));
    expect(removeEcosystem("eco-1")).toBe(true);
    expect(removeEcosystem("eco-1")).toBe(false);
    expect(removeEcosystem("non-existent")).toBe(false);
  });

  it("computeEcosystemHealth returns valid metrics", () => {
    const snap = makeSnapshot();
    const health = computeEcosystemHealth(snap);
    expect(typeof health.teamUtilization).toBe("number");
    expect(typeof health.budgetHealth).toBe("number");
    expect(typeof health.pipelineBalance).toBe("object");
    expect(typeof health.avgAngleEffectiveness).toBe("number");
    expect(health.teamUtilization).toBeGreaterThanOrEqual(0);
    expect(health.teamUtilization).toBeLessThanOrEqual(1);
  });

  it("getSimulationResult returns undefined when no simulation run", () => {
    registerEcosystem(makeSnapshot());
    expect(getSimulationResult("eco-1")).toBeUndefined();
  });

  it("clearDigitalTwinData empties all data", () => {
    registerEcosystem(makeSnapshot("eco-1"));
    registerEcosystem(makeSnapshot("eco-2"));
    clearDigitalTwinData();
    expect(listEcosystems()).toHaveLength(0);
    expect(getEcosystem("eco-1")).toBeUndefined();
  });

  it("EcosystemSnapshotSchema validates valid data", () => {
    const snap = makeSnapshot();
    const parsed = EcosystemSnapshotSchema.parse(snap);
    expect(parsed.id).toBe("eco-1");
    expect(parsed.organizationName).toBe("Test Corp");
    expect(parsed.pipeline).toHaveLength(2);
  });

  it("getEcosystem returns undefined for unknown id", () => {
    expect(getEcosystem("unknown")).toBeUndefined();
  });

  // ---- Additional coverage: computeEcosystemHealth edge cases ----

  describe("computeEcosystemHealth - edge cases", () => {
    it("handles 0 team members (empty team)", () => {
      const snap = makeSnapshot();
      snap.team = [];
      const health = computeEcosystemHealth(snap);
      expect(health.teamUtilization).toBe(0);
    });

    it("handles 0 budget total", () => {
      const snap = makeSnapshot();
      snap.budget = { totalBudget: 0, allocated: 0, remaining: 0, currency: "USD" };
      const health = computeEcosystemHealth(snap);
      expect(health.budgetHealth).toBe(0);
    });

    it("handles budget health at 100% remaining", () => {
      const snap = makeSnapshot();
      snap.budget = { totalBudget: 100000, allocated: 0, remaining: 100000, currency: "USD" };
      const health = computeEcosystemHealth(snap);
      expect(health.budgetHealth).toBe(1);
    });

    it("computes pipeline balance correctly", () => {
      const snap = makeSnapshot();
      const health = computeEcosystemHealth(snap);
      expect(health.pipelineBalance["validation"]).toBe(1);
      expect(health.pipelineBalance["discovery"]).toBe(1);
    });

    it("handles empty angle effectiveness", () => {
      const snap = makeSnapshot();
      snap.angleEffectiveness = [];
      const health = computeEcosystemHealth(snap);
      expect(health.avgAngleEffectiveness).toBe(0);
    });

    it("caps team utilization at 1", () => {
      const snap = makeSnapshot();
      snap.team = [
        { id: "m1", name: "Alice", role: "Eng", capacity: 0.5, strengths: [], activeProjects: 20 },
      ];
      const health = computeEcosystemHealth(snap);
      expect(health.teamUtilization).toBeLessThanOrEqual(1);
    });

    it("handles empty pipeline", () => {
      const snap = makeSnapshot();
      snap.pipeline = [];
      const health = computeEcosystemHealth(snap);
      expect(Object.keys(health.pipelineBalance)).toHaveLength(0);
    });
  });

  // ---- simulateStrategy (mocked LLM) ----

  describe("simulateStrategy", () => {
    it("runs simulation and returns validated result", async () => {
      const { generateText, extractJson } = await import("../copilot/client.js");
      const mockResult = {
        strategyId: "strat-1",
        strategyName: "Growth",
        projectedOutcomes: {
          ideasLaunched: 5,
          revenueImpact: "$1M",
          teamUtilization: 0.8,
          budgetUtilization: 0.7,
          innovationVelocity: 3,
          riskScore: 30,
        },
        milestones: [{ weekNumber: 4, event: "First launch", impact: "positive" }],
        risks: ["Market downturn"],
        opportunities: ["New market segment"],
        recommendations: ["Hire more engineers"],
        confidenceScore: 0.75,
      };
      vi.mocked(generateText).mockResolvedValue(JSON.stringify(mockResult));
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(mockResult));

      const { simulateStrategy } = await import("../digital-twin/index.js");
      const snap = makeSnapshot();
      registerEcosystem(snap);

      const strategy = {
        id: "strat-1",
        name: "Growth",
        description: "Aggressive growth strategy",
        timeHorizonWeeks: 26,
      };

      const result = await simulateStrategy(snap, strategy);
      expect(result.strategyId).toBe("strat-1");
      expect(result.projectedOutcomes.ideasLaunched).toBe(5);
      expect(result.confidenceScore).toBe(0.75);
    });
  });

  // ---- compareStrategies ----

  describe("compareStrategies", () => {
    it("throws for empty strategies array", async () => {
      const { compareStrategies } = await import("../digital-twin/index.js");
      const snap = makeSnapshot();
      await expect(compareStrategies(snap, [])).rejects.toThrow("At least one strategy");
    });

    it("throws for more than 10 strategies", async () => {
      const { compareStrategies } = await import("../digital-twin/index.js");
      const snap = makeSnapshot();
      const strategies = Array.from({ length: 11 }, (_, i) => ({
        id: `s${i}`,
        name: `Strategy ${i}`,
        description: "desc",
        timeHorizonWeeks: 12,
      }));
      await expect(compareStrategies(snap, strategies)).rejects.toThrow("Maximum 10 strategies");
    });

    it("compares strategies and picks winner", async () => {
      const { generateText, extractJson } = await import("../copilot/client.js");

      const simResult = {
        strategyId: "strat-1",
        strategyName: "Growth",
        projectedOutcomes: {
          ideasLaunched: 5,
          revenueImpact: "$1M",
          teamUtilization: 0.8,
          budgetUtilization: 0.7,
          innovationVelocity: 3,
          riskScore: 30,
        },
        milestones: [],
        risks: ["Risk 1"],
        opportunities: ["Opp 1"],
        recommendations: ["Rec 1"],
        confidenceScore: 0.8,
      };

      const compResult = {
        winner: "strat-1",
        summary: "Growth strategy wins",
        tradeoffs: ["Higher risk"],
      };

      // First call: simulate strategy, second call: comparison
      vi.mocked(generateText)
        .mockResolvedValueOnce(JSON.stringify(simResult))
        .mockResolvedValueOnce(JSON.stringify(compResult));
      vi.mocked(extractJson)
        .mockReturnValueOnce(JSON.stringify(simResult))
        .mockReturnValueOnce(JSON.stringify(compResult));

      const { compareStrategies } = await import("../digital-twin/index.js");
      const snap = makeSnapshot();
      const strategy = { id: "strat-1", name: "Growth", description: "desc", timeHorizonWeeks: 12 };

      const comparison = await compareStrategies(snap, [strategy]);
      expect(comparison.results).toHaveLength(1);
      expect(comparison.winner).toBe("strat-1");
      expect(comparison.summary).toContain("Growth");
    });
  });

  // ---- Schema validation ----

  describe("registerEcosystem - schema validation", () => {
    it("rejects invalid snapshot (missing required fields)", () => {
      expect(() => registerEcosystem({} as unknown as any)).toThrow();
    });

    it("rejects snapshot with invalid team member", () => {
      const snap = makeSnapshot();

      snap.team = [
        {
          id: "",
          name: "",
          role: "",
          capacity: 2,
          strengths: [],
          activeProjects: 0,
        } as unknown as any,
      ];
      expect(() => registerEcosystem(snap)).toThrow();
    });
  });
});
