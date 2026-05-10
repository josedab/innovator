import { beforeEach, describe, expect, it, vi } from "vitest";

const MOCK_CLIMATE_RESPONSE = {
  dimensionScores: [
    {
      dimension: "psychological-safety",
      score: 8,
      maturityLevel: "advanced",
      strengths: ["Teams speak up early"],
      gaps: [],
      evidence: ["Retrospectives surface risks quickly"],
    },
    {
      dimension: "risk-tolerance",
      score: 4,
      maturityLevel: "developing",
      strengths: [],
      gaps: ["Experiments are underfunded"],
      evidence: ["Few pilots reach implementation"],
    },
  ],
  benchmarks: [
    {
      dimension: "psychological-safety",
      orgScore: 8,
      industryAverage: 6,
      topQuartile: 9,
      percentileRank: 82,
    },
  ],
  interventions: [
    {
      dimension: "risk-tolerance",
      title: "Fund more pilots",
      description: "Create an explicit experimentation budget.",
      effort: "medium",
      impact: "high",
      timeframe: "months",
      actions: ["Launch a pilot fund", "Review failed experiments monthly"],
    },
  ],
  summary: "Balanced culture with clear room to improve experimentation.",
  topStrengths: ["psychological-safety"],
  topGaps: ["risk-tolerance"],
} as const;

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => raw),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  CLIMATE_DIMENSIONS,
  assessClimate,
  climateToMarkdown,
  getSurveyQuestions,
  quickAssess,
} from "../climate/index.js";
import type {
  ClimateAssessment,
  ClimateDimension,
  ClimateSurveyResponse,
} from "../climate/types.js";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

function makeScores(
  overrides: Partial<Record<ClimateDimension, number>> = {}
): Record<ClimateDimension, number> {
  return Object.fromEntries(
    CLIMATE_DIMENSIONS.map((dimension) => [dimension, overrides[dimension] ?? 5])
  ) as Record<ClimateDimension, number>;
}

describe("climate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateText).mockResolvedValue(JSON.stringify(MOCK_CLIMATE_RESPONSE));
    vi.mocked(extractJson).mockImplementation((raw: string) => raw);
    vi.mocked(withRetry).mockImplementation(((fn: () => Promise<unknown>) =>
      fn()) as typeof withRetry);
  });

  describe("getSurveyQuestions", () => {
    it("returns survey questions for all 12 dimensions", () => {
      const questions = getSurveyQuestions();

      expect(questions).toHaveLength(12);
      expect(questions.map((entry) => entry.dimension)).toEqual(CLIMATE_DIMENSIONS);
      expect(questions.every((entry) => entry.questions.length === 3)).toBe(true);
    });
  });

  describe("quickAssess", () => {
    it("maps score thresholds to the expected maturity levels", () => {
      const assessment = quickAssess(
        makeScores({
          "psychological-safety": 9,
          "risk-tolerance": 7,
          "resource-availability": 5,
          "leadership-support": 3,
          collaboration: 2,
        }),
        "Acme",
        "Fintech"
      );
      const scores = new Map(
        assessment.dimensionScores.map((dimension) => [dimension.dimension, dimension])
      );

      expect(scores.get("psychological-safety")?.maturityLevel).toBe("leading");
      expect(scores.get("risk-tolerance")?.maturityLevel).toBe("advanced");
      expect(scores.get("resource-availability")?.maturityLevel).toBe("established");
      expect(scores.get("leadership-support")?.maturityLevel).toBe("developing");
      expect(scores.get("collaboration")?.maturityLevel).toBe("nascent");
      expect(assessment.organizationName).toBe("Acme");
      expect(assessment.industry).toBe("Fintech");
    });

    it("selects top strengths and top gaps using the documented cutoffs", () => {
      const assessment = quickAssess(
        makeScores({
          "psychological-safety": 9,
          "risk-tolerance": 8,
          "resource-availability": 7,
          collaboration: 2,
          experimentation: 4,
          "diversity-inclusion": 1,
          "learning-orientation": 3,
        })
      );

      expect(assessment.topStrengths).toEqual([
        "psychological-safety",
        "risk-tolerance",
        "resource-availability",
      ]);
      expect(assessment.topGaps).toEqual([
        "diversity-inclusion",
        "collaboration",
        "learning-orientation",
      ]);
    });

    it("clamps out-of-range scores to the 1-10 boundary", () => {
      const assessment = quickAssess(
        makeScores({
          "psychological-safety": 11,
          "risk-tolerance": 0,
        })
      );
      const scores = new Map(
        assessment.dimensionScores.map((dimension) => [dimension.dimension, dimension.score])
      );

      expect(scores.get("psychological-safety")).toBe(10);
      expect(scores.get("risk-tolerance")).toBe(1);
    });
  });

  describe("climateToMarkdown", () => {
    it("renders summary, dimension bars, strengths, gaps, and interventions", () => {
      const assessment: ClimateAssessment = {
        ...quickAssess(
          makeScores({
            "psychological-safety": 9,
            "risk-tolerance": 2,
            "resource-availability": 8,
          }),
          "Acme",
          "Fintech"
        ),
        interventions: [
          {
            id: "int-1",
            dimension: "risk-tolerance",
            title: "Create a pilot budget",
            description: "Dedicate a fixed amount to small experiments.",
            effort: "medium",
            impact: "high",
            timeframe: "months",
            actions: ["Fund three pilots", "Review learnings monthly"],
          },
        ],
      };

      const markdown = climateToMarkdown(assessment);

      expect(markdown).toContain("# Innovation Climate: Acme");
      expect(markdown).toContain("**Industry:** Fintech");
      expect(markdown).toContain("## Dimension Scores");
      expect(markdown).toContain("psychological-safety");
      expect(markdown).toContain("█");
      expect(markdown).toContain("## Top Strengths");
      expect(markdown).toContain("## Top Gaps");
      expect(markdown).toContain("## Recommended Interventions");
      expect(markdown).toContain("### Create a pilot budget");
      expect(markdown).toContain("  - Fund three pilots");
    });
  });

  describe("assessClimate", () => {
    const surveyData: ClimateSurveyResponse[] = [
      {
        dimension: "psychological-safety",
        question: "Team members feel safe to take risks and be vulnerable",
        score: 8,
        comment: "Healthy debate is common.",
      },
      {
        dimension: "risk-tolerance",
        question: "The organization actively encourages calculated risk-taking",
        score: 4,
        comment: "Pilots are still rare.",
      },
    ];

    it("builds an assessment from survey data using the mocked LLM", async () => {
      const signal = new AbortController().signal;

      const assessment = await assessClimate(surveyData, {
        organizationName: "Acme",
        industry: "Fintech",
        model: "gpt-4o-mini",
        signal,
      });

      expect(assessment.organizationName).toBe("Acme");
      expect(assessment.industry).toBe("Fintech");
      expect(assessment.overallScore).toBe(6);
      expect(assessment.overallMaturity).toBe("established");
      expect(assessment.topStrengths).toEqual(["psychological-safety"]);
      expect(assessment.topGaps).toEqual(["risk-tolerance"]);
      expect(assessment.interventions).toHaveLength(1);
      expect(assessment.interventions[0].id).toBeTruthy();
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-mini", signal })
      );
      expect(withRetry).toHaveBeenCalledTimes(1);
    });

    it("throws when no survey data is provided", async () => {
      await expect(
        assessClimate([], {
          organizationName: "Acme",
          industry: "Fintech",
        })
      ).rejects.toThrow("No survey data provided");
    });
  });
});
