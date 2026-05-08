import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue(
      '{"quickWins":["Start innovation sprints"],"longTermGoals":["Achieve measured maturity"]}'
    ),
  extractJson: vi
    .fn()
    .mockReturnValue(
      '{"quickWins":["Start innovation sprints"],"longTermGoals":["Achieve measured maturity"]}'
    ),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  getAssessmentQuestions,
  getQuestionsByDimension,
  scoreAssessment,
  benchmarkAssessment,
  generateRoadmap,
  getAssessmentHistory,
  isReassessmentDue,
  getAssessmentResult,
  getRoadmap,
  clearMaturityAssessmentData,
  ASSESSMENT_QUESTIONS,
} from "../maturity-assessment/index.js";
import type { QuestionResponse } from "../maturity-assessment/index.js";

function makeResponses(baseValue: number = 3): QuestionResponse[] {
  return ASSESSMENT_QUESTIONS.map((q) => ({
    questionId: q.id,
    value: Math.min(5, Math.max(1, baseValue)),
  }));
}

describe("maturity-assessment", () => {
  beforeEach(() => {
    clearMaturityAssessmentData();
  });

  describe("questionnaire", () => {
    it("provides assessment questions", () => {
      const questions = getAssessmentQuestions();
      expect(questions.length).toBe(12);
      expect(questions.every((q) => q.options.length === 5)).toBe(true);
    });

    it("filters questions by dimension", () => {
      const strategyQuestions = getQuestionsByDimension("strategy");
      expect(strategyQuestions.length).toBe(2);
      expect(strategyQuestions.every((q) => q.dimension === "strategy")).toBe(true);
    });

    it("covers all 6 dimensions", () => {
      const dimensions = new Set(getAssessmentQuestions().map((q) => q.dimension));
      expect(dimensions.size).toBe(6);
      expect(dimensions).toContain("strategy");
      expect(dimensions).toContain("leadership");
      expect(dimensions).toContain("culture");
      expect(dimensions).toContain("processes");
      expect(dimensions).toContain("tools");
      expect(dimensions).toContain("metrics");
    });
  });

  describe("scoring", () => {
    it("scores assessment at ad-hoc level", () => {
      const result = scoreAssessment("org-1", makeResponses(1));
      expect(result.overallLevel).toBe("ad-hoc");
      expect(result.overallScore).toBeCloseTo(1, 0);
    });

    it("scores assessment at defined level", () => {
      const result = scoreAssessment("org-1", makeResponses(3));
      expect(result.overallLevel).toBe("defined");
      expect(result.overallScore).toBeCloseTo(3, 0);
    });

    it("scores assessment at optimizing level", () => {
      const result = scoreAssessment("org-1", makeResponses(5));
      expect(result.overallLevel).toBe("optimizing");
      expect(result.overallScore).toBeCloseTo(5, 0);
    });

    it("provides per-dimension scores", () => {
      const result = scoreAssessment("org-1", makeResponses(3));
      expect(result.dimensionScores).toHaveLength(6);
      expect(result.dimensionScores.every((ds) => ds.score >= 1 && ds.score <= 5)).toBe(true);
    });

    it("identifies strengths and gaps", () => {
      const responses: QuestionResponse[] = [
        { questionId: "s1", value: 5 }, // Strength
        { questionId: "s2", value: 1 }, // Gap
        { questionId: "l1", value: 4 }, // Strength
        { questionId: "l2", value: 2 }, // Gap
        ...ASSESSMENT_QUESTIONS.filter((q) => !["s1", "s2", "l1", "l2"].includes(q.id)).map(
          (q) => ({ questionId: q.id, value: 3 })
        ),
      ];

      const result = scoreAssessment("org-1", responses);
      const strategy = result.dimensionScores.find((ds) => ds.dimension === "strategy")!;
      expect(strategy.strengths.length).toBeGreaterThan(0);
      expect(strategy.gaps.length).toBeGreaterThan(0);
    });

    it("rejects empty responses", () => {
      expect(() => scoreAssessment("org-1", [])).toThrow("No responses");
    });

    it("stores and retrieves assessment results", () => {
      const result = scoreAssessment("org-1", makeResponses(3));
      const fetched = getAssessmentResult(result.id);
      expect(fetched).toBeDefined();
      expect(fetched!.organizationId).toBe("org-1");
    });
  });

  describe("benchmarking", () => {
    it("benchmarks against industry data", () => {
      const result = scoreAssessment("org-1", makeResponses(3));
      const benchmarks = benchmarkAssessment(result.id);

      expect(benchmarks).toHaveLength(6);
      expect(benchmarks.every((b) => b.industryAverage > 0)).toBe(true);
      expect(benchmarks.every((b) => b.percentile >= 0 && b.percentile <= 100)).toBe(true);
    });

    it("rejects unknown assessment", () => {
      expect(() => benchmarkAssessment("nonexistent")).toThrow("not found");
    });
  });

  describe("roadmap generation", () => {
    it("generates improvement roadmap", async () => {
      const result = scoreAssessment("org-1", makeResponses(2));
      const roadmap = await generateRoadmap(result.id);

      expect(roadmap.assessmentId).toBe(result.id);
      expect(roadmap.recommendations.length).toBeGreaterThan(0);
      expect(roadmap.quickWins.length).toBeGreaterThan(0);
    });

    it("maps Innovator features to gaps", async () => {
      const result = scoreAssessment("org-1", makeResponses(2));
      const roadmap = await generateRoadmap(result.id);

      const hasFeatures = roadmap.recommendations.some((r) => r.innovatorFeatures.length > 0);
      expect(hasFeatures).toBe(true);
    });

    it("prioritizes recommendations", async () => {
      const result = scoreAssessment("org-1", makeResponses(1)); // Very low scores
      const roadmap = await generateRoadmap(result.id);

      expect(roadmap.recommendations[0].priority).toBe("critical");
    });

    it("stores and retrieves roadmaps", async () => {
      const result = scoreAssessment("org-1", makeResponses(2));
      await generateRoadmap(result.id);

      const fetched = getRoadmap(result.id);
      expect(fetched).toBeDefined();
    });
  });

  describe("progress tracking", () => {
    it("tracks assessment history", () => {
      scoreAssessment("org-1", makeResponses(2));
      scoreAssessment("org-1", makeResponses(3));
      scoreAssessment("org-2", makeResponses(4));

      const history = getAssessmentHistory("org-1");
      expect(history).toHaveLength(2);
      expect(history[0].overallScore).toBeLessThan(history[1].overallScore);
    });

    it("detects when reassessment is due", () => {
      expect(isReassessmentDue("new-org")).toBe(true);

      scoreAssessment("existing-org", makeResponses(3));
      expect(isReassessmentDue("existing-org")).toBe(false);
    });
  });
});
