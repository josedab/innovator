import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const {
  recommendAnglesML,
  recordHistoricalSession,
  getHistoricalSessions,
  clearHistoricalSessions,
  getAngleEffectivenessStats,
  recommendAngles,
  clearAngleFeedback,
} = await import("../recommendation/index.js");

describe("intelligent-angle-recommendation", () => {
  beforeEach(() => {
    clearHistoricalSessions();
    clearAngleFeedback();
  });

  const baseClassification = {
    domain: "technology" as const,
    subDomain: "machine learning",
    complexity: "moderate" as const,
    intent: "explore" as const,
    keywords: ["AI", "machine-learning", "automation"],
    confidence: 0.9,
  };

  describe("recordHistoricalSession", () => {
    it("records and retrieves sessions", () => {
      recordHistoricalSession({
        domain: "technology",
        complexity: "moderate",
        intent: "explore",
        anglesUsed: ["scamper", "first-principles"],
        angleScores: { scamper: 8, "first-principles": 7 },
        overallScore: 7.5,
        keywords: ["AI", "automation"],
        timestamp: Date.now(),
      });
      expect(getHistoricalSessions()).toHaveLength(1);
    });
  });

  describe("recommendAnglesML", () => {
    it("falls back to heuristics with insufficient data", () => {
      const recs = recommendAnglesML(baseClassification, 4);
      expect(recs).toHaveLength(4);
      expect(recs[0].relevance).toBeGreaterThan(0);
    });

    it("uses historical data when available", () => {
      // Record many sessions with scamper scoring highest in technology domain
      for (let i = 0; i < 10; i++) {
        recordHistoricalSession({
          domain: "technology",
          complexity: "moderate",
          intent: "explore",
          anglesUsed: ["scamper", "first-principles", "inversion"],
          angleScores: { scamper: 9, "first-principles": 6, inversion: 4 },
          overallScore: 7,
          keywords: ["AI", "automation"],
          timestamp: Date.now() - i * 86400000,
        });
      }

      const recs = recommendAnglesML(baseClassification, 3);
      expect(recs).toHaveLength(3);

      // scamper should rank high due to consistently high scores
      const scamperRec = recs.find((r) => r.angleId === "scamper");
      const inversionRec = recs.find((r) => r.angleId === "inversion");

      // scamper (score 9) should have higher relevance than inversion (score 4)
      if (scamperRec && inversionRec) {
        expect(scamperRec.relevance).toBeGreaterThan(inversionRec.relevance);
      }
    });

    it("considers domain similarity", () => {
      // Add sessions for technology domain
      for (let i = 0; i < 5; i++) {
        recordHistoricalSession({
          domain: "technology",
          complexity: "moderate",
          intent: "explore",
          anglesUsed: ["what-if"],
          angleScores: { "what-if": 9 },
          overallScore: 9,
          keywords: ["AI"],
          timestamp: Date.now(),
        });
      }

      // Add sessions for healthcare domain (should be less relevant)
      for (let i = 0; i < 5; i++) {
        recordHistoricalSession({
          domain: "healthcare",
          complexity: "complex",
          intent: "solve",
          anglesUsed: ["perspectives"],
          angleScores: { perspectives: 9 },
          overallScore: 9,
          keywords: ["medical"],
          timestamp: Date.now(),
        });
      }

      const recs = recommendAnglesML(baseClassification, 4);
      const whatIfRec = recs.find((r) => r.angleId === "what-if");
      expect(whatIfRec).toBeDefined();
      expect(whatIfRec!.rationale).toContain("similar sessions");
    });
  });

  describe("getAngleEffectivenessStats", () => {
    it("computes per-angle statistics", () => {
      recordHistoricalSession({
        domain: "technology",
        complexity: "moderate",
        intent: "explore",
        anglesUsed: ["scamper"],
        angleScores: { scamper: 8 },
        overallScore: 8,
        keywords: [],
        timestamp: Date.now(),
      });
      recordHistoricalSession({
        domain: "technology",
        complexity: "simple",
        intent: "create",
        anglesUsed: ["scamper"],
        angleScores: { scamper: 6 },
        overallScore: 6,
        keywords: [],
        timestamp: Date.now(),
      });

      const stats = getAngleEffectivenessStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].angleId).toBe("scamper");
      expect(stats[0].avgScore).toBe(7);
      expect(stats[0].sampleSize).toBe(2);
    });

    it("filters by domain", () => {
      recordHistoricalSession({
        domain: "technology",
        complexity: "moderate",
        intent: "explore",
        anglesUsed: ["scamper"],
        angleScores: { scamper: 9 },
        overallScore: 9,
        keywords: [],
        timestamp: Date.now(),
      });
      recordHistoricalSession({
        domain: "healthcare",
        complexity: "complex",
        intent: "solve",
        anglesUsed: ["perspectives"],
        angleScores: { perspectives: 7 },
        overallScore: 7,
        keywords: [],
        timestamp: Date.now(),
      });

      const techStats = getAngleEffectivenessStats("technology");
      expect(techStats).toHaveLength(1);
      expect(techStats[0].angleId).toBe("scamper");
    });

    it("returns empty for no data", () => {
      expect(getAngleEffectivenessStats()).toEqual([]);
    });
  });
});
