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
  getIndicator,
  sustainabilityToMarkdown,
  scoreSustainability,
  scorePortfolioSustainability,
  TrafficLightSchema,
  SustainabilityScorecardSchema,
  PortfolioSustainabilitySchema,
  ESGRiskFlagSchema,
  ImprovementSuggestionSchema,
} from "../sustainability/index.js";
import type { SustainabilityScorecard } from "../sustainability/index.js";
import type { InnovationIdea } from "../types.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const mockIdea: InnovationIdea = {
  title: "Green AI Platform",
  description: "AI platform using renewable energy",
  potentialImpact: "Reduce carbon footprint of AI by 40%",
  implementationHint: "Use green data centers",
};

const mockScorecardJson: SustainabilityScorecard = {
  ideaTitle: "Green AI Platform",
  environmental: { carbonImpact: 8, wasteGeneration: 7, resourceUse: 6, overallScore: 7, indicator: "green", details: "Low carbon" },
  social: { accessibility: 8, inclusion: 7, displacement: 5, overallScore: 6.7, indicator: "yellow", details: "Inclusive" },
  governance: { transparency: 6, accountability: 7, overallScore: 6.5, indicator: "yellow", details: "Transparent" },
  overallScore: 6.7,
  overallIndicator: "yellow",
  riskFlags: [{ dimension: "social", severity: "medium", description: "Worker displacement", mitigation: "Retraining" }],
  improvements: [{ dimension: "environmental", suggestion: "Solar panels", effort: "low", impact: "high" }],
  summary: "Good sustainability profile",
};

describe("sustainability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct traffic light indicators", () => {
    expect(getIndicator(8)).toBe("green");
    expect(getIndicator(7)).toBe("green");
    expect(getIndicator(5)).toBe("yellow");
    expect(getIndicator(4)).toBe("yellow");
    expect(getIndicator(3)).toBe("red");
    expect(getIndicator(0)).toBe("red");
  });

  it("validates traffic light schema", () => {
    expect(TrafficLightSchema.parse("green")).toBe("green");
    expect(TrafficLightSchema.parse("yellow")).toBe("yellow");
    expect(TrafficLightSchema.parse("red")).toBe("red");
    expect(() => TrafficLightSchema.parse("blue")).toThrow();
  });

  it("exports scorecard as markdown", () => {
    const scorecard: SustainabilityScorecard = {
      ideaTitle: "Green AI",
      environmental: {
        carbonImpact: 8,
        wasteGeneration: 7,
        resourceUse: 6,
        overallScore: 7,
        indicator: "green",
        details: "Low carbon footprint",
      },
      social: {
        accessibility: 8,
        inclusion: 7,
        displacement: 5,
        overallScore: 6.7,
        indicator: "yellow",
        details: "Generally inclusive",
      },
      governance: {
        transparency: 6,
        accountability: 7,
        overallScore: 6.5,
        indicator: "yellow",
        details: "Good governance",
      },
      overallScore: 6.7,
      overallIndicator: "yellow",
      riskFlags: [
        {
          dimension: "social",
          severity: "medium",
          description: "May displace some workers",
          mitigation: "Provide retraining programs",
        },
      ],
      improvements: [
        {
          dimension: "environmental",
          suggestion: "Use renewable energy",
          effort: "low",
          impact: "high",
        },
      ],
      summary: "Overall positive sustainability profile with room for improvement",
    };

    const md = sustainabilityToMarkdown(scorecard);
    expect(md).toContain("# Sustainability Assessment: Green AI");
    expect(md).toContain("Environmental");
    expect(md).toContain("Social");
    expect(md).toContain("Governance");
    expect(md).toContain("Risk Flags");
    expect(md).toContain("Improvement Suggestions");
    expect(md).toContain("renewable energy");
  });

  // ---- scoreSustainability (LLM-based) ----

  describe("scoreSustainability", () => {
    it("scores a single idea across 3 ESG dimensions with mocked LLM", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockScorecardJson));

      const result = await scoreSustainability(mockIdea);

      expect(result.ideaTitle).toBe("Green AI Platform");
      expect(result.environmental.overallScore).toBe(7);
      expect(result.social.overallScore).toBe(6.7);
      expect(result.governance.overallScore).toBe(6.5);
      expect(result.overallIndicator).toBe("yellow");
      expect(result.riskFlags).toHaveLength(1);
      expect(result.improvements).toHaveLength(1);
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("validates result against SustainabilityScorecardSchema", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockScorecardJson));

      const result = await scoreSustainability(mockIdea);
      expect(() => SustainabilityScorecardSchema.parse(result)).not.toThrow();
    });
  });

  // ---- scorePortfolioSustainability ----

  describe("scorePortfolioSustainability", () => {
    it("scores multiple ideas and aggregates", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockScorecardJson));

      const ideas: InnovationIdea[] = [
        mockIdea,
        { ...mockIdea, title: "Idea 2" },
      ];
      const result = await scorePortfolioSustainability(ideas);

      expect(result.totalIdeas).toBe(2);
      expect(result.averageScore).toBeCloseTo(6.7, 1);
      expect(result.scorecards).toHaveLength(2);
      expect(result.distribution.yellow).toBe(2);
    });

    it("handles zero scorecards when all LLM calls fail", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM failure"));

      const result = await scorePortfolioSustainability([mockIdea]);
      expect(result.totalIdeas).toBe(0);
      expect(result.averageScore).toBe(0);
      expect(result.scorecards).toHaveLength(0);
    });

    it("skips failed assessments and continues", async () => {
      mockGenerateText.mockResolvedValueOnce("json");
      mockExtractJson.mockReturnValueOnce(JSON.stringify(mockScorecardJson));
      // Second call fails
      mockGenerateText.mockRejectedValueOnce(new Error("fail"));

      const ideas: InnovationIdea[] = [mockIdea, { ...mockIdea, title: "Failing Idea" }];
      const result = await scorePortfolioSustainability(ideas);
      expect(result.totalIdeas).toBe(1);
      expect(result.scorecards).toHaveLength(1);
    });

    it("stops on AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await scorePortfolioSustainability([mockIdea, mockIdea], undefined, controller.signal);
      expect(result.totalIdeas).toBe(0);
    });

    it("sorts risks by severity (critical > high > medium > low)", async () => {
      const scorecardWithRisks: SustainabilityScorecard = {
        ...mockScorecardJson,
        riskFlags: [
          { dimension: "social", severity: "low", description: "Minor", mitigation: "N/A" },
          { dimension: "environmental", severity: "critical", description: "Critical", mitigation: "Stop" },
          { dimension: "governance", severity: "high", description: "High risk", mitigation: "Fix" },
        ],
      };
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(scorecardWithRisks));

      const result = await scorePortfolioSustainability([mockIdea]);
      expect(result.topRisks[0].severity).toBe("critical");
      expect(result.topRisks[1].severity).toBe("high");
      expect(result.topRisks[2].severity).toBe("low");
    });

    it("sorts improvements by impact+effort score", async () => {
      const scorecardWithImps: SustainabilityScorecard = {
        ...mockScorecardJson,
        improvements: [
          { dimension: "environmental", suggestion: "Hard low impact", effort: "high", impact: "low" },
          { dimension: "social", suggestion: "Easy high impact", effort: "low", impact: "high" },
        ],
      };
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(scorecardWithImps));

      const result = await scorePortfolioSustainability([mockIdea]);
      expect(result.topImprovements[0].suggestion).toBe("Easy high impact");
    });
  });

  // ---- Additional schema validation ----

  describe("additional schemas", () => {
    it("validates ESGRiskFlag with all severities", () => {
      for (const severity of ["low", "medium", "high", "critical"] as const) {
        expect(() =>
          ESGRiskFlagSchema.parse({ dimension: "environmental", severity, description: "test", mitigation: "fix" })
        ).not.toThrow();
      }
      expect(() =>
        ESGRiskFlagSchema.parse({ dimension: "environmental", severity: "unknown", description: "test", mitigation: "fix" })
      ).toThrow();
    });

    it("validates ImprovementSuggestion", () => {
      expect(() =>
        ImprovementSuggestionSchema.parse({ dimension: "social", suggestion: "Do X", effort: "low", impact: "high" })
      ).not.toThrow();
      expect(() =>
        ImprovementSuggestionSchema.parse({ dimension: "social", suggestion: "Do X", effort: "extreme", impact: "high" })
      ).toThrow();
    });
  });

  // ---- Markdown edge cases ----

  describe("markdown edge cases", () => {
    it("omits Risk Flags section when empty", () => {
      const scorecard: SustainabilityScorecard = {
        ...mockScorecardJson,
        riskFlags: [],
        improvements: [],
      };
      const md = sustainabilityToMarkdown(scorecard);
      expect(md).not.toContain("## Risk Flags");
      expect(md).not.toContain("## Improvement Suggestions");
    });

    it("maps severity to correct emoji", () => {
      const scorecard: SustainabilityScorecard = {
        ...mockScorecardJson,
        riskFlags: [
          { dimension: "environmental", severity: "critical", description: "Critical issue", mitigation: "Stop" },
          { dimension: "social", severity: "high", description: "High issue", mitigation: "Fix" },
          { dimension: "governance", severity: "low", description: "Low issue", mitigation: "Monitor" },
        ],
      };
      const md = sustainabilityToMarkdown(scorecard);
      expect(md).toContain("🔴"); // critical
      expect(md).toContain("🟠"); // high
      expect(md).toContain("🟢"); // low
    });
  });
});
