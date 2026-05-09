import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  getAllPatterns,
  findSimilarPatterns,
  analyzeFailureRisk,
  reportFailure,
  getPatternsByCategory,
  failureAnalysisToMarkdown,
  CANONICAL_FAILURE_PATTERNS,
} from "../failure-library/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("failure-library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CANONICAL_FAILURE_PATTERNS", () => {
    it("should contain exactly 50 patterns", () => {
      expect(CANONICAL_FAILURE_PATTERNS.length).toBe(50);
    });

    it("each pattern should have required fields", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(pattern.id).toBeTruthy();
        expect(pattern.title).toBeTruthy();
        expect(pattern.category).toBeTruthy();
        expect(pattern.symptoms.length).toBeGreaterThan(0);
        expect(pattern.preventionStrategies.length).toBeGreaterThan(0);
      }
    });
  });

  describe("findSimilarPatterns", () => {
    it("should find patterns matching keywords", () => {
      const matches = findSimilarPatterns(
        "We need to pivot our product but the team is hesitant and we are running low on budget"
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].similarityScore).toBeGreaterThan(0);
    });

    it("should filter by category", () => {
      const matches = findSimilarPatterns("pivot too late market timing", {
        categories: ["pivot-failure"],
      });
      for (const match of matches) {
        expect(match.pattern.category).toBe("pivot-failure");
      }
    });

    it("should respect maxMatches", () => {
      const matches = findSimilarPatterns("budget scaling team hiring", {
        maxMatches: 3,
      });
      expect(matches.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getPatternsByCategory", () => {
    it("should return patterns for a given category", () => {
      const patterns = getPatternsByCategory("pivot-failure");
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) {
        expect(p.category).toBe("pivot-failure");
      }
    });
  });

  describe("reportFailure", () => {
    it("should add a user-reported failure to the library", () => {
      const before = getAllPatterns().length;
      reportFailure({
        id: "test-failure-1",
        title: "Test Failure",
        description: "A test failure pattern",
        category: "market-misread",
        lessonsLearned: ["Don't ignore user feedback"],
        reportedAt: new Date().toISOString(),
      });
      const after = getAllPatterns().length;
      expect(after).toBe(before + 1);
    });
  });

  describe("analyzeFailureRisk", () => {
    it("should analyze an idea for failure risks", async () => {
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          matches: [
            {
              patternTitle: "Pivot Too Late",
              similarityScore: 0.7,
              matchedSymptoms: ["declining metrics"],
              riskLevel: "high",
              mitigationAdvice: "Set kill criteria",
            },
          ],
          overallRiskScore: 0.6,
          riskSummary: "Moderate risk identified",
          recommendations: ["Monitor metrics closely"],
        })
      );

      const result = await analyzeFailureRisk(
        "New Product Pivot",
        "Pivoting our existing product to serve a new market segment with tight budget"
      );

      expect(result.ideaTitle).toBe("New Product Pivot");
      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("failureAnalysisToMarkdown", () => {
    it("should produce markdown", () => {
      const md = failureAnalysisToMarkdown({
        ideaTitle: "Test",
        matches: [],
        overallRiskScore: 0.3,
        riskSummary: "Low risk",
        recommendations: ["Keep going"],
      });
      expect(md).toContain("Failure Risk Analysis");
      expect(md).toContain("Test");
    });
  });
});
