import { describe, it, expect, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  scenarioToMarkdown,
  compareScenarioModels,
  ScenarioTypeSchema,
} from "../simulation/scenario.js";
import { DEFAULT_PERSONAS, StakeholderPersonaSchema } from "../simulation/stakeholder.js";
import type { ScenarioModel } from "../simulation/scenario.js";

describe("simulation - stakeholder", () => {
  it("has 6 default personas", () => {
    expect(DEFAULT_PERSONAS).toHaveLength(6);
  });

  it("validates persona schema", () => {
    for (const persona of DEFAULT_PERSONAS) {
      expect(() => StakeholderPersonaSchema.parse(persona)).not.toThrow();
    }
  });

  it("has correct persona IDs", () => {
    const ids = DEFAULT_PERSONAS.map((p) => p.id);
    expect(ids).toContain("early-adopter");
    expect(ids).toContain("enterprise-buyer");
    expect(ids).toContain("investor");
    expect(ids).toContain("regulator");
    expect(ids).toContain("competitor");
    expect(ids).toContain("end-user");
  });
});

describe("simulation - scenario", () => {
  it("validates scenario type schema", () => {
    expect(ScenarioTypeSchema.parse("optimistic")).toBe("optimistic");
    expect(ScenarioTypeSchema.parse("baseline")).toBe("baseline");
    expect(ScenarioTypeSchema.parse("pessimistic")).toBe("pessimistic");
    expect(() => ScenarioTypeSchema.parse("unknown")).toThrow();
  });

  const mockModel: ScenarioModel = {
    ideaTitle: "Test Idea",
    scenarios: [
      {
        type: "optimistic",
        probability: 0.2,
        adoptionCurve: [{ month: 6, adoptionPercent: 30 }],
        revenueEstimate: { year1: "$1M", year3: "$10M", year5: "$50M" },
        implementationCost: {
          estimate: "$500K",
          confidence: 0.7,
          breakdown: [{ category: "Engineering", amount: "$300K" }],
        },
        timeToMarket: { months: 6, milestones: [{ name: "MVP", month: 3 }] },
        keyAssumptions: ["Strong market demand"],
        risks: ["Competition"],
        narrative: "Best case scenario",
      },
      {
        type: "baseline",
        probability: 0.5,
        adoptionCurve: [{ month: 12, adoptionPercent: 15 }],
        revenueEstimate: { year1: "$200K", year3: "$2M", year5: "$10M" },
        implementationCost: { estimate: "$500K", confidence: 0.7, breakdown: [] },
        timeToMarket: { months: 12, milestones: [] },
        keyAssumptions: ["Moderate demand"],
        risks: ["Budget constraints"],
        narrative: "Expected scenario",
      },
    ],
    sensitivityFactors: [
      {
        variable: "Market size",
        baseValue: "10M",
        lowCase: "5M",
        highCase: "20M",
        impactOnRevenue: "high",
        impactOnTimeline: "low",
      },
    ],
    overallConfidence: 0.65,
    recommendation: "Proceed with caution",
  };

  it("exports scenario model to markdown", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("# Business Case: Test Idea");
    expect(md).toContain("Optimistic");
    expect(md).toContain("Baseline");
    expect(md).toContain("Sensitivity Analysis");
    expect(md).toContain("Recommendation");
  });

  it("compares two scenario models", () => {
    const modelB: ScenarioModel = { ...mockModel, ideaTitle: "Idea B", overallConfidence: 0.8 };
    const comparison = compareScenarioModels(mockModel, modelB);
    expect(comparison.ideaA).toBe("Test Idea");
    expect(comparison.ideaB).toBe("Idea B");
    expect(comparison.recommendation).toContain("Idea B");
  });
});
