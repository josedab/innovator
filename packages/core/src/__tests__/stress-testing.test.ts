import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: """${value}"""`),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import {
  ScenarioTypeSchema,
  StressScenarioSchema,
  ImpactAssessmentSchema,
  VulnerabilitySchema,
  HedgingStrategySchema,
  StressTestResultSchema,
  generateStressScenarios,
  stressTestIdeas,
  stressTestToMarkdown,
} from "../stress-testing/index.js";
import type { StressTestResult } from "../stress-testing/index.js";
import type { InnovationIdea } from "../types.js";
import { generateText, extractJson } from "../copilot/client.js";

const fakeIdea: InnovationIdea = {
  title: "AI Tutor",
  description: "An AI-powered tutoring platform",
  potentialImpact: "Transform education",
  implementationHint: "Use LLMs for personalized learning",
};

const fakeLLMResponse = {
  scenarios: [
    {
      type: "regulatory-change" as const,
      title: "New AI regulation",
      description: "Govt bans AI in education",
      probability: "medium" as const,
      timeframe: "1-2 years",
    },
    {
      type: "market-shift" as const,
      title: "Market pivot",
      description: "Users move away",
      probability: "low" as const,
      timeframe: "2-3 years",
    },
    {
      type: "tech-breakthrough" as const,
      title: "Tech leap",
      description: "New tech emerges",
      probability: "high" as const,
      timeframe: "1 year",
    },
    {
      type: "economic-downturn" as const,
      title: "Recession",
      description: "Budget cuts",
      probability: "medium" as const,
      timeframe: "1-3 years",
    },
    {
      type: "competitor-move" as const,
      title: "Big tech enters",
      description: "Google launches competitor",
      probability: "high" as const,
      timeframe: "6 months",
    },
  ],
  impacts: [
    {
      scenarioType: "regulatory-change" as const,
      survives: true,
      impactLevel: "moderate" as const,
      explanation: "Adapts to regulation",
      adaptationStrategy: "Lobby",
    },
    {
      scenarioType: "market-shift" as const,
      survives: true,
      impactLevel: "minor" as const,
      explanation: "Adjusts target",
      adaptationStrategy: "Pivot",
    },
    {
      scenarioType: "tech-breakthrough" as const,
      survives: true,
      impactLevel: "none" as const,
      explanation: "Adopts new tech",
      adaptationStrategy: "Integrate",
    },
    {
      scenarioType: "economic-downturn" as const,
      survives: false,
      impactLevel: "severe" as const,
      explanation: "Funding dries up",
      adaptationStrategy: "Cut costs",
    },
    {
      scenarioType: "competitor-move" as const,
      survives: true,
      impactLevel: "moderate" as const,
      explanation: "Niche survives",
      adaptationStrategy: "Differentiate",
    },
  ],
  vulnerabilities: [
    { area: "Funding", severity: "high" as const, description: "Dependent on VC funding" },
  ],
  hedgingStrategies: [
    {
      strategy: "Diversify revenue",
      mitigates: ["economic-downturn" as const, "market-shift" as const],
      effort: "medium" as const,
      description: "Add B2B revenue stream",
    },
  ],
};

describe("stress-testing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- Schemas ----

  describe("ScenarioTypeSchema", () => {
    it("validates all scenario types", () => {
      for (const t of [
        "regulatory-change",
        "market-shift",
        "tech-breakthrough",
        "economic-downturn",
        "competitor-move",
      ]) {
        expect(() => ScenarioTypeSchema.parse(t)).not.toThrow();
      }
    });

    it("rejects invalid type", () => {
      expect(() => ScenarioTypeSchema.parse("invalid")).toThrow();
    });
  });

  describe("VulnerabilitySchema", () => {
    it("validates correct shape", () => {
      expect(() =>
        VulnerabilitySchema.parse({ area: "Test", severity: "high", description: "desc" })
      ).not.toThrow();
    });

    it("rejects invalid severity", () => {
      expect(() =>
        VulnerabilitySchema.parse({ area: "Test", severity: "extreme", description: "desc" })
      ).toThrow();
    });
  });

  describe("StressTestResultSchema", () => {
    it("validates complete result", () => {
      const result = {
        idea: "Test idea",
        scenarios: fakeLLMResponse.scenarios,
        impacts: fakeLLMResponse.impacts,
        resilienceScore: 4,
        vulnerabilities: fakeLLMResponse.vulnerabilities,
        hedgingStrategies: fakeLLMResponse.hedgingStrategies,
        stressTested: true,
        badge: "resilient",
      };
      expect(() => StressTestResultSchema.parse(result)).not.toThrow();
    });

    it("rejects invalid badge", () => {
      expect(() =>
        StressTestResultSchema.parse({
          idea: "x",
          scenarios: [],
          impacts: [],
          resilienceScore: 0,
          vulnerabilities: [],
          hedgingStrategies: [],
          stressTested: true,
          badge: "unknown",
        })
      ).toThrow();
    });
  });

  // ---- generateStressScenarios ----

  describe("generateStressScenarios", () => {
    it("returns valid StressTestResult with mocked LLM", async () => {
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(fakeLLMResponse));

      const result = await generateStressScenarios(fakeIdea, "education");
      expect(result.idea).toBe("AI Tutor");
      expect(result.scenarios).toHaveLength(5);
      expect(result.impacts).toHaveLength(5);
      expect(result.stressTested).toBe(true);
      expect(result.resilienceScore).toBe(4);
      expect(result.badge).toBe("resilient");
    });

    it("calculates fragile badge for low survival", async () => {
      const lowSurvival = {
        ...fakeLLMResponse,
        impacts: fakeLLMResponse.impacts.map((i) => ({ ...i, survives: false })),
      };
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(lowSurvival));

      const result = await generateStressScenarios(fakeIdea, "education");
      expect(result.resilienceScore).toBe(0);
      expect(result.badge).toBe("fragile");
    });

    it("calculates moderate badge for medium survival", async () => {
      const medSurvival = {
        ...fakeLLMResponse,
        impacts: fakeLLMResponse.impacts.map((i, idx) => ({
          ...i,
          survives: idx < 3,
        })),
      };
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(medSurvival));

      const result = await generateStressScenarios(fakeIdea, "education");
      expect(result.resilienceScore).toBe(3);
      expect(result.badge).toBe("moderate");
    });
  });

  // ---- stressTestIdeas ----

  describe("stressTestIdeas", () => {
    it("tests multiple ideas sorted by resilience", async () => {
      const idea2: InnovationIdea = { ...fakeIdea, title: "VR Classroom" };
      const lowResponse = {
        ...fakeLLMResponse,
        impacts: fakeLLMResponse.impacts.map((i) => ({ ...i, survives: false })),
      };

      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson)
        .mockReturnValueOnce(JSON.stringify(fakeLLMResponse))
        .mockReturnValueOnce(JSON.stringify(lowResponse));

      const results = await stressTestIdeas([fakeIdea, idea2], "education");
      expect(results).toHaveLength(2);
      expect(results[0].resilienceScore).toBeGreaterThanOrEqual(results[1].resilienceScore);
    });

    it("handles empty ideas array", async () => {
      const results = await stressTestIdeas([], "domain");
      expect(results).toEqual([]);
    });
  });

  // ---- stressTestToMarkdown ----

  describe("stressTestToMarkdown", () => {
    const testResult: StressTestResult = {
      idea: "AI Tutor",
      scenarios: fakeLLMResponse.scenarios,
      impacts: fakeLLMResponse.impacts,
      resilienceScore: 4,
      vulnerabilities: fakeLLMResponse.vulnerabilities,
      hedgingStrategies: fakeLLMResponse.hedgingStrategies,
      stressTested: true,
      badge: "resilient",
    };

    it("includes idea title", () => {
      const md = stressTestToMarkdown(testResult);
      expect(md).toContain("AI Tutor");
    });

    it("includes resilience badge icon", () => {
      const md = stressTestToMarkdown(testResult);
      expect(md).toContain("🛡️");
      expect(md).toContain("RESILIENT");
    });

    it("includes scenario types", () => {
      const md = stressTestToMarkdown(testResult);
      expect(md).toContain("regulatory-change");
      expect(md).toContain("competitor-move");
    });

    it("includes vulnerabilities section", () => {
      const md = stressTestToMarkdown(testResult);
      expect(md).toContain("Vulnerabilities");
      expect(md).toContain("Funding");
    });

    it("includes hedging strategies", () => {
      const md = stressTestToMarkdown(testResult);
      expect(md).toContain("Hedging Strategies");
      expect(md).toContain("Diversify revenue");
    });

    it("shows fragile badge icon", () => {
      const fragile: StressTestResult = { ...testResult, badge: "fragile", resilienceScore: 0 };
      const md = stressTestToMarkdown(fragile);
      expect(md).toContain("🔴");
    });

    it("shows moderate badge icon", () => {
      const moderate: StressTestResult = { ...testResult, badge: "moderate", resilienceScore: 3 };
      const md = stressTestToMarkdown(moderate);
      expect(md).toContain("⚠️");
    });
  });
});
