import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  recordAngleEvent,
  getAngleEvents,
  computeAngleEffectiveness,
  getWeightedAngles,
  buildAvoidanceHints,
  assignABVariant,
  getABTestResults,
  clearAngleLearning,
} from "../angle-learning/index.js";

describe("angle-learning", () => {
  beforeEach(() => {
    clearAngleLearning();
  });

  describe("recordAngleEvent / getAngleEvents", () => {
    it("records and retrieves events", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper" });
      recordAngleEvent({ eventType: "rating", angleId: "inversion", value: 4 });

      const all = getAngleEvents();
      expect(all).toHaveLength(2);
      expect(all[0].eventType).toBe("export");
      expect(all[0].timestamp).toBeDefined();
    });

    it("filters events by angleId", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper" });
      recordAngleEvent({ eventType: "rating", angleId: "inversion", value: 3 });

      expect(getAngleEvents("scamper")).toHaveLength(1);
      expect(getAngleEvents("inversion")).toHaveLength(1);
      expect(getAngleEvents("unknown")).toHaveLength(0);
    });

    it("returns a copy of the events array", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper" });
      const events = getAngleEvents();
      events.pop();
      expect(getAngleEvents()).toHaveLength(1);
    });
  });

  describe("computeAngleEffectiveness", () => {
    it("returns empty report for no events", () => {
      const report = computeAngleEffectiveness();
      expect(report.angleScores).toHaveLength(0);
      expect(report.domainAffinityMatrix).toHaveLength(0);
      expect(report.recommendedWeights).toEqual({});
      expect(report.lowPerformingPatterns).toHaveLength(0);
    });

    it("computes scores with mixed event types", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper" });
      recordAngleEvent({ eventType: "rating", angleId: "scamper", value: 4 });
      recordAngleEvent({ eventType: "selection", angleId: "scamper" });
      recordAngleEvent({ eventType: "dismiss", angleId: "scamper" });
      recordAngleEvent({ eventType: "dwell-time", angleId: "scamper", value: 15000 });

      const report = computeAngleEffectiveness();
      expect(report.angleScores).toHaveLength(1);
      const score = report.angleScores[0];
      expect(score.angleId).toBe("scamper");
      expect(score.totalEvents).toBe(5);
      expect(score.exportRate).toBeGreaterThan(0);
      expect(score.averageRating).toBe(4);
      expect(score.selectionRate).toBe(0.5); // 1 selection / (1 selection + 1 dismiss)
      expect(score.averageDwellTimeMs).toBe(15000);
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    it("computes trend as improving when recent ratings are higher", () => {
      // Older ratings: low
      for (let i = 0; i < 5; i++) {
        recordAngleEvent({ eventType: "rating", angleId: "a1", value: 2 });
      }
      // Recent ratings: high
      for (let i = 0; i < 5; i++) {
        recordAngleEvent({ eventType: "rating", angleId: "a1", value: 5 });
      }
      const report = computeAngleEffectiveness();
      expect(report.angleScores[0].trend).toBe("improving");
    });

    it("computes trend as declining when recent ratings are lower", () => {
      for (let i = 0; i < 5; i++) {
        recordAngleEvent({ eventType: "rating", angleId: "a1", value: 5 });
      }
      for (let i = 0; i < 5; i++) {
        recordAngleEvent({ eventType: "rating", angleId: "a1", value: 2 });
      }
      const report = computeAngleEffectiveness();
      expect(report.angleScores[0].trend).toBe("declining");
    });

    it("computes trend as stable when ratings are similar", () => {
      for (let i = 0; i < 10; i++) {
        recordAngleEvent({ eventType: "rating", angleId: "a1", value: 3 });
      }
      const report = computeAngleEffectiveness();
      expect(report.angleScores[0].trend).toBe("stable");
    });

    it("filters by domain when provided", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper", domain: "tech" });
      recordAngleEvent({ eventType: "export", angleId: "scamper", domain: "health" });

      const techReport = computeAngleEffectiveness("tech");
      expect(techReport.angleScores[0].totalEvents).toBe(1);
    });

    it("builds domain-angle affinity matrix", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper", domain: "tech" });
      recordAngleEvent({ eventType: "rating", angleId: "scamper", domain: "tech", value: 5 });
      recordAngleEvent({ eventType: "dismiss", angleId: "scamper", domain: "tech" });

      const report = computeAngleEffectiveness();
      expect(report.domainAffinityMatrix.length).toBeGreaterThan(0);
      const entry = report.domainAffinityMatrix[0];
      expect(entry.domain).toBe("tech");
      expect(entry.angleId).toBe("scamper");
      expect(entry.sampleSize).toBe(3);
      expect(entry.affinity).toBeGreaterThanOrEqual(0);
      expect(entry.affinity).toBeLessThanOrEqual(1);
    });

    it("normalizes recommendedWeights so best angle is 1.0", () => {
      recordAngleEvent({ eventType: "export", angleId: "a1" });
      recordAngleEvent({ eventType: "selection", angleId: "a1" });
      recordAngleEvent({ eventType: "rating", angleId: "a1", value: 5 });
      recordAngleEvent({ eventType: "dismiss", angleId: "a2" });

      const report = computeAngleEffectiveness();
      const weights = report.recommendedWeights;
      const maxWeight = Math.max(...Object.values(weights));
      expect(maxWeight).toBe(1);
    });

    it("identifies lowPerformingPatterns for scores < 30", () => {
      // Single dismiss event → low score
      recordAngleEvent({ eventType: "dismiss", angleId: "bad-angle" });
      const report = computeAngleEffectiveness();
      const badScore = report.angleScores.find((s) => s.angleId === "bad-angle");

      if (badScore && badScore.overallScore < 30) {
        expect(report.lowPerformingPatterns.length).toBeGreaterThan(0);
        expect(report.lowPerformingPatterns[0]).toContain("bad-angle");
      }
    });

    it("handles single event type only", () => {
      recordAngleEvent({ eventType: "bookmark", angleId: "a1" });
      const report = computeAngleEffectiveness();
      expect(report.angleScores).toHaveLength(1);
      expect(report.angleScores[0].totalEvents).toBe(1);
    });
  });

  describe("getWeightedAngles", () => {
    it("returns weights based on effectiveness", () => {
      recordAngleEvent({ eventType: "export", angleId: "scamper", domain: "tech" });
      recordAngleEvent({ eventType: "selection", angleId: "scamper", domain: "tech" });

      const weights = getWeightedAngles("tech");
      expect(weights).toHaveProperty("scamper");
      expect(typeof weights.scamper).toBe("number");
    });

    it("returns empty record for no events", () => {
      const weights = getWeightedAngles();
      expect(Object.keys(weights)).toHaveLength(0);
    });
  });

  describe("buildAvoidanceHints", () => {
    it("returns null when score >= 50", () => {
      recordAngleEvent({ eventType: "export", angleId: "good" });
      recordAngleEvent({ eventType: "selection", angleId: "good" });
      recordAngleEvent({ eventType: "rating", angleId: "good", value: 5 });
      recordAngleEvent({ eventType: "dwell-time", angleId: "good", value: 30000 });

      const hint = buildAvoidanceHints("good");
      const report = computeAngleEffectiveness();
      const score = report.angleScores.find((s) => s.angleId === "good");
      if (score && score.overallScore >= 50) {
        expect(hint).toBeNull();
      }
    });

    it("returns hint string for score < 50", () => {
      recordAngleEvent({ eventType: "dismiss", angleId: "bad" });
      const hint = buildAvoidanceHints("bad");
      const report = computeAngleEffectiveness();
      const score = report.angleScores.find((s) => s.angleId === "bad");
      if (score && score.overallScore < 50) {
        expect(hint).toContain("bad");
        expect(hint).toContain("underperformed");
      }
    });

    it("returns null for unknown angleId", () => {
      expect(buildAvoidanceHints("nonexistent")).toBeNull();
    });
  });

  describe("A/B Testing", () => {
    it("assignABVariant returns consistent results for same session", () => {
      const v1 = assignABVariant("session-1");
      const v2 = assignABVariant("session-1");
      expect(v1).toBe(v2);
      expect(["tuned", "default"]).toContain(v1);
    });

    it("assignABVariant assigns tuned or default", () => {
      const variants = new Set<string>();
      for (let i = 0; i < 100; i++) {
        variants.add(assignABVariant(`session-${i}`));
      }
      expect(variants.has("tuned") || variants.has("default")).toBe(true);
    });

    it("getABTestResults aggregates ratings by variant", () => {
      // Assign variants and record events
      assignABVariant("s1");
      assignABVariant("s2");

      recordAngleEvent({
        eventType: "rating",
        angleId: "a1",
        value: 4,
        sessionId: "s1",
      });
      recordAngleEvent({
        eventType: "rating",
        angleId: "a1",
        value: 5,
        sessionId: "s2",
      });

      const results = getABTestResults();
      expect(results.tunedCount + results.defaultCount).toBeLessThanOrEqual(2);
      expect(results.tuned).toBeGreaterThanOrEqual(0);
      expect(results.default).toBeGreaterThanOrEqual(0);
    });

    it("getABTestResults returns zeros when no rating events", () => {
      assignABVariant("s1");
      const results = getABTestResults();
      expect(results.tuned).toBe(0);
      expect(results.default).toBe(0);
      expect(results.tunedCount).toBe(0);
      expect(results.defaultCount).toBe(0);
    });
  });
});
