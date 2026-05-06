import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { generateText, extractJson } from "../copilot/client.js";
import {
  scenarioToMarkdown,
  compareScenarioModels,
  modelScenarios,
  modelScenariosBatch,
  ScenarioTypeSchema,
  ScenarioModelSchema,
  AdoptionDataPointSchema,
  SensitivityFactorSchema,
} from "../simulation/scenario.js";
import {
  DEFAULT_PERSONAS,
  StakeholderPersonaSchema,
  simulatePersonaReaction,
  simulateStakeholders,
  simulateStakeholdersBatch,
  buildConflictMatrix,
  computeReadinessScores,
} from "../simulation/stakeholder.js";
import type { ScenarioModel } from "../simulation/scenario.js";
import type { StakeholderSimulation } from "../simulation/stakeholder.js";
import type { InnovationIdea } from "../types.js";

// Also test barrel exports
import * as barrel from "../simulation/index.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const mockIdea: InnovationIdea = {
  title: "Test Idea",
  description: "A test idea for simulation",
  potentialImpact: "High impact",
  implementationHint: "Build with TypeScript",
};

describe("simulation - stakeholder", () => {
  it("has 10 default personas", () => {
    expect(DEFAULT_PERSONAS).toHaveLength(10);
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

  it("includes optimistic/baseline/pessimistic sections with probability", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("Optimistic Scenario (20% probability)");
    expect(md).toContain("Baseline Scenario (50% probability)");
  });

  it("includes revenue projections (Year 1/3/5)", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("Year 1: $1M");
    expect(md).toContain("Year 3: $10M");
    expect(md).toContain("Year 5: $50M");
  });

  it("includes cost breakdown table when present", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("| Engineering | $300K |");
    expect(md).toContain("| Category | Amount |");
  });

  it("omits cost breakdown table when empty", () => {
    // Baseline scenario has empty breakdown
    const baselineOnly: ScenarioModel = {
      ...mockModel,
      scenarios: [mockModel.scenarios[1]],
    };
    const md = scenarioToMarkdown(baselineOnly);
    expect(md).not.toContain("| Category | Amount |");
  });

  it("includes milestones when present", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("Month 3: MVP");
  });

  it("includes sensitivity analysis table", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("| Market size | 10M | 5M | 20M | high | low |");
  });

  it("includes recommendation section", () => {
    const md = scenarioToMarkdown(mockModel);
    expect(md).toContain("## Recommendation");
    expect(md).toContain("Proceed with caution");
  });

  it("compares two scenario models", () => {
    const modelB: ScenarioModel = { ...mockModel, ideaTitle: "Idea B", overallConfidence: 0.8 };
    const comparison = compareScenarioModels(mockModel, modelB);
    expect(comparison.ideaA).toBe("Test Idea");
    expect(comparison.ideaB).toBe("Idea B");
    expect(comparison.recommendation).toContain("Idea B");
  });

  it("compareScenarioModels returns correct confidence comparison", () => {
    const modelB: ScenarioModel = { ...mockModel, ideaTitle: "Idea B", overallConfidence: 0.4 };
    const comparison = compareScenarioModels(mockModel, modelB);
    expect(comparison.confidenceComparison.a).toBe(0.65);
    expect(comparison.confidenceComparison.b).toBe(0.4);
    expect(comparison.recommendation).toContain("Test Idea");
  });

  it("returns 'N/A' when baseline scenario missing", () => {
    const noBaseline: ScenarioModel = {
      ...mockModel,
      scenarios: [mockModel.scenarios[0]], // only optimistic
    };
    const modelB: ScenarioModel = { ...noBaseline, ideaTitle: "B" };
    const comparison = compareScenarioModels(noBaseline, modelB);
    expect(comparison.baselineRevenueComparison.a).toBe("N/A");
    expect(comparison.baselineRevenueComparison.b).toBe("N/A");
  });

  describe("Zod schemas", () => {
    it("ScenarioModelSchema validates correct shape", () => {
      expect(() => ScenarioModelSchema.parse(mockModel)).not.toThrow();
    });

    it("ScenarioModelSchema rejects invalid shape", () => {
      expect(() => ScenarioModelSchema.parse({ ideaTitle: 123 })).toThrow();
    });

    it("AdoptionDataPointSchema rejects out-of-range values", () => {
      expect(() => AdoptionDataPointSchema.parse({ month: -1, adoptionPercent: 50 })).toThrow();
      expect(() => AdoptionDataPointSchema.parse({ month: 6, adoptionPercent: 150 })).toThrow();
    });

    it("SensitivityFactorSchema validates correct shape", () => {
      expect(() =>
        SensitivityFactorSchema.parse({
          variable: "Test",
          baseValue: "100",
          lowCase: "50",
          highCase: "200",
          impactOnRevenue: "high",
          impactOnTimeline: "low",
        })
      ).not.toThrow();
    });
  });
});

// ---- Barrel re-exports ----

describe("simulation barrel (index.ts)", () => {
  it("re-exports stakeholder functions", () => {
    expect(barrel.simulatePersonaReaction).toBe(simulatePersonaReaction);
    expect(barrel.simulateStakeholders).toBe(simulateStakeholders);
    expect(barrel.simulateStakeholdersBatch).toBe(simulateStakeholdersBatch);
    expect(barrel.buildConflictMatrix).toBe(buildConflictMatrix);
    expect(barrel.computeReadinessScores).toBe(computeReadinessScores);
    expect(barrel.DEFAULT_PERSONAS).toBe(DEFAULT_PERSONAS);
  });

  it("re-exports scenario functions", () => {
    expect(barrel.modelScenarios).toBe(modelScenarios);
    expect(barrel.modelScenariosBatch).toBe(modelScenariosBatch);
    expect(barrel.scenarioToMarkdown).toBe(scenarioToMarkdown);
    expect(barrel.compareScenarioModels).toBe(compareScenarioModels);
  });

  it("re-exports schemas", () => {
    expect(barrel.StakeholderPersonaSchema).toBe(StakeholderPersonaSchema);
    expect(barrel.ScenarioTypeSchema).toBe(ScenarioTypeSchema);
    expect(barrel.ScenarioModelSchema).toBe(ScenarioModelSchema);
  });
});

// ---- Stakeholder simulation with LLM ----

describe("simulation - stakeholder (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockReaction = {
    personaId: "early-adopter",
    personaName: "Early Adopter",
    enthusiasm: 8,
    concerns: ["Scalability"],
    opportunities: ["First mover advantage"],
    likelyAction: "Adopt immediately",
    quote: "I love it!",
  };

  it("simulates persona reaction with mocked LLM", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(JSON.stringify(mockReaction));

    const result = await simulatePersonaReaction(mockIdea, DEFAULT_PERSONAS[0]);
    expect(result.personaId).toBe("early-adopter");
    expect(result.enthusiasm).toBe(8);
    expect(result.concerns).toHaveLength(1);
  });

  it("simulates all stakeholders with parallel execution", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(JSON.stringify(mockReaction));

    const twoPersonas = DEFAULT_PERSONAS.slice(0, 2);
    const result = await simulateStakeholders(mockIdea, twoPersonas);

    expect(result.ideaTitle).toBe("Test Idea");
    expect(result.reactions).toHaveLength(2);
    expect(result.consensusScore).toBeGreaterThan(0);
    expect(result.mostEnthusiastic).toBeTruthy();
    expect(result.mostConcerned).toBeTruthy();
  });

  it("handles LLM failure with fallback reaction", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM error"));

    const result = await simulateStakeholders(mockIdea, [DEFAULT_PERSONAS[0]]);
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].enthusiasm).toBe(5);
    expect(result.reactions[0].concerns).toContain("Simulation unavailable");
  });

  it("uses default personas when none provided", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(JSON.stringify(mockReaction));

    const result = await simulateStakeholders(mockIdea);
    expect(result.reactions).toHaveLength(10);
  });

  it("batch simulates multiple ideas", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(JSON.stringify(mockReaction));

    const results = await simulateStakeholdersBatch(
      [mockIdea, { ...mockIdea, title: "Idea 2" }],
      [DEFAULT_PERSONAS[0]]
    );
    expect(results).toHaveLength(2);
  });

  it("stops batch on AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    const results = await simulateStakeholdersBatch(
      [mockIdea, mockIdea],
      [DEFAULT_PERSONAS[0]],
      undefined,
      controller.signal
    );
    expect(results).toHaveLength(0);
  });
});

// ---- Conflict matrix ----

describe("simulation - conflict matrix", () => {
  it("builds conflict matrix from contrasting reactions", () => {
    const sim: StakeholderSimulation = {
      ideaTitle: "Test",
      reactions: [
        {
          personaId: "a",
          personaName: "Supporter",
          enthusiasm: 9,
          concerns: [],
          opportunities: ["Great!"],
          likelyAction: "Adopt",
        },
        {
          personaId: "b",
          personaName: "Skeptic",
          enthusiasm: 3,
          concerns: ["Too risky"],
          opportunities: [],
          likelyAction: "Oppose",
        },
      ],
      consensusScore: 6,
      mostEnthusiastic: "Supporter",
      mostConcerned: "Skeptic",
      keyDebates: [],
    };

    const matrix = buildConflictMatrix(sim);
    expect(matrix.conflicts.length).toBeGreaterThan(0);
    expect(matrix.conflicts[0].enthusiasmDelta).toBe(6);
    expect(matrix.supportCount).toBe(1);
    expect(matrix.oppositionCount).toBe(1);
    expect(matrix.alignmentScore).toBeLessThan(1);
  });

  it("returns no conflicts when all aligned", () => {
    const sim: StakeholderSimulation = {
      ideaTitle: "Test",
      reactions: [
        {
          personaId: "a",
          personaName: "A",
          enthusiasm: 7,
          concerns: [],
          opportunities: [],
          likelyAction: "OK",
        },
        {
          personaId: "b",
          personaName: "B",
          enthusiasm: 8,
          concerns: [],
          opportunities: [],
          likelyAction: "OK",
        },
      ],
      consensusScore: 7.5,
      mostEnthusiastic: "B",
      mostConcerned: "A",
      keyDebates: [],
    };

    const matrix = buildConflictMatrix(sim);
    expect(matrix.conflicts).toHaveLength(0);
    expect(matrix.alignmentScore).toBeGreaterThan(0.8);
  });

  it("computes readiness scores and sorts by readiness", () => {
    const highReadiness: StakeholderSimulation = {
      ideaTitle: "Good",
      reactions: [
        {
          personaId: "a",
          personaName: "A",
          enthusiasm: 9,
          concerns: [],
          opportunities: [],
          likelyAction: "Adopt",
        },
        {
          personaId: "b",
          personaName: "B",
          enthusiasm: 8,
          concerns: [],
          opportunities: [],
          likelyAction: "Adopt",
        },
      ],
      consensusScore: 8.5,
      mostEnthusiastic: "A",
      mostConcerned: "B",
      keyDebates: [],
    };

    const lowReadiness: StakeholderSimulation = {
      ideaTitle: "Bad",
      reactions: [
        {
          personaId: "a",
          personaName: "A",
          enthusiasm: 2,
          concerns: ["Bad"],
          opportunities: [],
          likelyAction: "Oppose",
        },
        {
          personaId: "b",
          personaName: "B",
          enthusiasm: 3,
          concerns: ["Terrible"],
          opportunities: [],
          likelyAction: "Oppose",
        },
      ],
      consensusScore: 2.5,
      mostEnthusiastic: "B",
      mostConcerned: "A",
      keyDebates: [],
    };

    const scores = computeReadinessScores([lowReadiness, highReadiness]);
    expect(scores[0].ideaTitle).toBe("Good");
    expect(scores[0].readinessScore).toBeGreaterThan(scores[1].readinessScore);
  });

  it("handles single reaction (no conflicts)", () => {
    const sim: StakeholderSimulation = {
      ideaTitle: "Solo",
      reactions: [
        {
          personaId: "a",
          personaName: "Solo",
          enthusiasm: 7,
          concerns: [],
          opportunities: [],
          likelyAction: "OK",
        },
      ],
      consensusScore: 7,
      mostEnthusiastic: "Solo",
      mostConcerned: "Solo",
      keyDebates: [],
    };

    const matrix = buildConflictMatrix(sim);
    expect(matrix.conflicts).toHaveLength(0);
    expect(matrix.alignmentScore).toBe(1);
  });
});

// ---- Scenario execution with LLM ----

describe("simulation - scenario execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockScenarioResult: ScenarioModel = {
    ideaTitle: "Test Idea",
    scenarios: [
      {
        type: "optimistic",
        probability: 0.2,
        adoptionCurve: [{ month: 6, adoptionPercent: 40 }],
        revenueEstimate: { year1: "$500K", year3: "$5M", year5: "$20M" },
        implementationCost: {
          estimate: "$200K",
          confidence: 0.7,
          breakdown: [{ category: "Dev", amount: "$150K" }],
        },
        timeToMarket: { months: 6, milestones: [{ name: "MVP", month: 3 }] },
        keyAssumptions: ["Strong demand"],
        risks: ["Competition"],
        narrative: "Best case",
      },
      {
        type: "baseline",
        probability: 0.5,
        adoptionCurve: [{ month: 12, adoptionPercent: 20 }],
        revenueEstimate: { year1: "$100K", year3: "$1M", year5: "$5M" },
        implementationCost: { estimate: "$200K", confidence: 0.7, breakdown: [] },
        timeToMarket: { months: 12, milestones: [] },
        keyAssumptions: ["Moderate demand"],
        risks: ["Budget"],
        narrative: "Expected case",
      },
      {
        type: "pessimistic",
        probability: 0.3,
        adoptionCurve: [{ month: 24, adoptionPercent: 5 }],
        revenueEstimate: { year1: "$10K", year3: "$50K", year5: "$100K" },
        implementationCost: { estimate: "$200K", confidence: 0.5, breakdown: [] },
        timeToMarket: { months: 24, milestones: [] },
        keyAssumptions: ["Low demand"],
        risks: ["Market collapse"],
        narrative: "Worst case",
      },
    ],
    sensitivityFactors: [],
    overallConfidence: 0.6,
    recommendation: "Proceed carefully",
  };

  it("models scenarios with mocked LLM", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(JSON.stringify(mockScenarioResult));

    const result = await modelScenarios(mockIdea);
    expect(result.ideaTitle).toBe("Test Idea");
    expect(result.scenarios).toHaveLength(3);
    expect(result.overallConfidence).toBe(0.6);
  });

  it("batch models scenarios for multiple ideas", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(JSON.stringify(mockScenarioResult));

    const results = await modelScenariosBatch([mockIdea, { ...mockIdea, title: "Idea 2" }]);
    expect(results).toHaveLength(2);
  });

  it("stops batch on AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    const results = await modelScenariosBatch([mockIdea], undefined, controller.signal);
    expect(results).toHaveLength(0);
  });
});
