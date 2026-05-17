import { describe, it, expect, beforeEach } from "vitest";
import {
  recordOutcome,
  recordBatchOutcomes,
  getRecommendations,
  getAnglePerformance,
  getDomainProfile,
  listDomainProfiles,
  getLearningData,
  learningInsightsToMarkdown,
  clearLearningData,
} from "../index.js";

describe("learning-loop", () => {
  beforeEach(() => {
    clearLearningData();
  });

  describe("recordOutcome", () => {
    it("should record a single outcome signal", () => {
      const signal = recordOutcome("sess-1", "solar energy storage", "scamper", {
        rating: 8,
        exported: true,
        ideaCount: 5,
        selectedIdeas: 2,
      });

      expect(signal.sessionId).toBe("sess-1");
      expect(signal.angleId).toBe("scamper");
      expect(signal.domain).toContain("solar");
      expect(signal.rating).toBe(8);
      expect(signal.exported).toBe(true);
      expect(signal.timestamp).toBeTruthy();
    });

    it("should throw on missing required fields", () => {
      expect(() => recordOutcome("", "subject", "angle", {})).toThrow("required");
      expect(() => recordOutcome("id", "", "angle", {})).toThrow("required");
      expect(() => recordOutcome("id", "subject", "", {})).toThrow("required");
    });

    it("should throw on invalid rating", () => {
      expect(() => recordOutcome("id", "subject", "angle", { rating: 11 })).toThrow("rating");
      expect(() => recordOutcome("id", "subject", "angle", { rating: -1 })).toThrow("rating");
    });

    it("should persist signals to learning data", () => {
      recordOutcome("sess-1", "AI in healthcare", "first-principles", { rating: 7 });
      recordOutcome("sess-2", "AI in healthcare", "scamper", { rating: 9 });

      const data = getLearningData();
      expect(data.signals).toHaveLength(2);
    });
  });

  describe("recordBatchOutcomes", () => {
    it("should record multiple outcomes at once", () => {
      const signals = recordBatchOutcomes("sess-1", "quantum computing", [
        { angleId: "scamper", rating: 7, ideaCount: 3 },
        { angleId: "first-principles", rating: 9, ideaCount: 5 },
        { angleId: "cross-domain", rating: 6, ideaCount: 2 },
      ]);

      expect(signals).toHaveLength(3);
      expect(signals[0].angleId).toBe("scamper");
      expect(signals[1].angleId).toBe("first-principles");
    });
  });

  describe("getRecommendations", () => {
    it("should return empty recommendations with no data", () => {
      const rec = getRecommendations("novel subject");
      expect(rec.recommendedAngles).toHaveLength(0);
      expect(rec.confidence).toBe(0);
      expect(rec.basedOnSessions).toBe(0);
    });

    it("should recommend angles with high ratings", () => {
      // Record several sessions showing scamper works well for this domain
      for (let i = 0; i < 5; i++) {
        recordOutcome(`sess-${i}`, "machine learning", "scamper", {
          rating: 9,
          exported: true,
          ideaCount: 5,
          selectedIdeas: 3,
        });
      }
      // Record poor results for another angle
      for (let i = 0; i < 5; i++) {
        recordOutcome(`sess-low-${i}`, "machine learning", "constraints", {
          rating: 2,
          exported: false,
          ideaCount: 1,
          selectedIdeas: 0,
        });
      }

      const rec = getRecommendations("machine learning");
      expect(rec.recommendedAngles.length).toBeGreaterThan(0);
      expect(rec.confidence).toBeGreaterThan(0);

      const topAngle = rec.recommendedAngles[0];
      expect(topAngle.angleId).toBe("scamper");
      expect(topAngle.score).toBeGreaterThan(0.4);
    });
  });

  describe("getAnglePerformance", () => {
    it("should return performance data for a specific angle", () => {
      recordOutcome("s1", "robotics", "scamper", { rating: 8, ideaCount: 4 });
      recordOutcome("s2", "robotics", "scamper", { rating: 7, ideaCount: 3 });

      const perf = getAnglePerformance("scamper");
      expect(perf.length).toBeGreaterThan(0);
      expect(perf[0].angleId).toBe("scamper");
      expect(perf[0].totalSessions).toBe(2);
      expect(perf[0].averageRating).toBeGreaterThan(0);
    });

    it("should return empty for unknown angle", () => {
      const perf = getAnglePerformance("nonexistent");
      expect(perf).toHaveLength(0);
    });
  });

  describe("getDomainProfile", () => {
    it("should return domain profile after recording outcomes", () => {
      recordOutcome("s1", "sustainable packaging", "scamper", { rating: 8 });
      const profile = getDomainProfile("sustainable packaging");
      expect(profile).toBeTruthy();
      expect(profile!.totalSessions).toBe(1);
      expect(profile!.keywords.length).toBeGreaterThan(0);
    });

    it("should return undefined for unknown domain", () => {
      expect(getDomainProfile("completely unknown")).toBeUndefined();
    });
  });

  describe("listDomainProfiles", () => {
    it("should list all tracked domains sorted by session count", () => {
      recordOutcome("s1", "solar energy", "scamper", { rating: 7 });
      recordOutcome("s2", "solar energy", "first-principles", { rating: 8 });
      recordOutcome("s3", "quantum computing", "scamper", { rating: 6 });

      const profiles = listDomainProfiles();
      expect(profiles.length).toBeGreaterThanOrEqual(1);
      // First should have more sessions
      expect(profiles[0].totalSessions).toBeGreaterThanOrEqual(
        profiles[profiles.length - 1].totalSessions
      );
    });
  });

  describe("learningInsightsToMarkdown", () => {
    it("should generate markdown report", () => {
      recordOutcome("s1", "AI safety", "first-principles", { rating: 9 });
      const md = learningInsightsToMarkdown("AI safety");
      expect(md).toContain("Innovation Learning Insights");
      expect(md).toContain("Domain");
    });

    it("should handle no data gracefully", () => {
      const md = learningInsightsToMarkdown("unknown");
      expect(md).toContain("Not enough historical data");
    });
  });

  describe("extractDomain edge cases", () => {
    it("should handle empty subject", () => {
      const rec = getRecommendations("");
      expect(rec.domain).toBe("unknown");
    });

    it("should handle stop-word-only subject", () => {
      const rec = getRecommendations("the in of and");
      expect(rec.domain).toBe("unknown");
    });
  });
});
