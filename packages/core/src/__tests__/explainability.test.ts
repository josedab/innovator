import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  explainIdea,
  captureDecisionPoints,
  explainabilityToMarkdown,
} from "../explainability/index.js";
import { generateText } from "../copilot/client.js";
import type { Investigation, AngleResult, InnovationIdea } from "../types.js";

const mockGenerateText = vi.mocked(generateText);

const TEST_IDEA: InnovationIdea = {
  title: "AI Code Review Bot",
  description: "Automated code review using LLMs",
  potentialImpact: "50% faster reviews",
  implementationHint: "Use AST parsing + LLM analysis",
};

const TEST_INVESTIGATION: Investigation = {
  summary: "Code review is slow and inconsistent",
  keyAspects: [{ title: "Speed", description: "Reviews take too long" }],
  currentState: "Manual review process",
  challenges: ["Slow turnaround", "Inconsistent quality"],
  opportunities: ["AI-assisted review", "Pattern detection"],
};

const TEST_ANGLE_RESULTS: AngleResult[] = [
  {
    angleId: "first-principles",
    angleName: "First Principles",
    ideas: [TEST_IDEA],
    reasoning: "Breaking down code review to fundamentals",
  },
];

describe("explainability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("captureDecisionPoints", () => {
    it("should capture decision points from pipeline data", () => {
      const points = captureDecisionPoints(TEST_INVESTIGATION, TEST_ANGLE_RESULTS);
      expect(points.length).toBeGreaterThan(0);
      expect(points[0].type).toBe("investigation-trigger");
      expect(points.some((p) => p.type === "angle-selection")).toBe(true);
      expect(points.some((p) => p.type === "idea-generation")).toBe(true);
    });
  });

  describe("explainIdea", () => {
    it("should generate a full explainability report", async () => {
      const reasoningResponse = JSON.stringify({
        steps: [
          {
            stepNumber: 0,
            action: "Analyzed subject domain",
            reasoning: "Code review is a core development process",
            evidence: ["Manual reviews take 2-4 hours"],
            confidence: 0.8,
          },
        ],
        overallConfidence: 0.75,
        triggerAspects: ["Speed bottleneck"],
        patternsApplied: ["Automation pattern"],
      });

      const confidenceResponse = JSON.stringify({
        overallConfidence: 0.72,
        dimensions: [
          {
            dimension: "Technical feasibility",
            score: 0.8,
            weight: 0.3,
            evidence: "LLMs can analyze code",
          },
          {
            dimension: "Market demand",
            score: 0.9,
            weight: 0.3,
            evidence: "Strong developer need",
          },
        ],
      });

      const counterfactualResponse = JSON.stringify({
        question: "What if the target market was 10x smaller?",
        originalOutcome: "Large market adoption",
        alteredCondition: "Market shrunk 10x",
        predictedOutcome: "Niche tool with lower revenue",
        impactDelta: -0.4,
        confidence: 0.7,
        explanation: "Smaller market means less ROI",
      });

      let callIdx = 0;
      mockGenerateText.mockImplementation(async () => {
        callIdx++;
        if (callIdx === 1) return reasoningResponse;
        if (callIdx === 2) return confidenceResponse;
        return counterfactualResponse;
      });

      const report = await explainIdea(
        TEST_IDEA,
        "first-principles",
        TEST_INVESTIGATION,
        TEST_ANGLE_RESULTS,
        { counterfactualCount: 2 }
      );

      expect(report.ideaTitle).toBe("AI Code Review Bot");
      expect(report.reasoningChain.steps.length).toBeGreaterThan(0);
      expect(report.confidenceDecomposition.dimensions.length).toBeGreaterThan(0);
      expect(report.counterfactuals.length).toBe(2);
      expect(report.decisionPoints.length).toBeGreaterThan(0);
    });
  });

  describe("explainabilityToMarkdown", () => {
    it("should produce markdown report", () => {
      const md = explainabilityToMarkdown({
        ideaId: "test-1",
        ideaTitle: "Test Idea",
        reasoningChain: {
          ideaId: "test-1",
          ideaTitle: "Test Idea",
          steps: [
            {
              stepNumber: 0,
              action: "Analyzed",
              reasoning: "Because",
              evidence: ["data"],
              confidence: 0.8,
            },
          ],
          overallConfidence: 0.8,
          triggerAspects: ["aspect1"],
          patternsApplied: ["pattern1"],
        },
        confidenceDecomposition: {
          ideaId: "test-1",
          ideaTitle: "Test Idea",
          overallConfidence: 0.8,
          dimensions: [
            { dimension: "Feasibility", score: 0.9, weight: 0.5, evidence: "proven tech" },
          ],
        },
        counterfactuals: [],
        decisionPoints: [],
        summary: "Test summary",
      });

      expect(md).toContain("Explainability Report");
      expect(md).toContain("Reasoning Chain");
      expect(md).toContain("Confidence Decomposition");
    });
  });
});
