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
});
