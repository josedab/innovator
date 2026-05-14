import { describe, it, expect } from "vitest";
import {
  laplaceMechanism,
  laplaceConfidenceInterval,
  generateRecommendations,
  detectAntiPatterns,
  computeNetworkStats,
} from "../federation-dp/federation-dp.js";
import type { AnonymizedPattern } from "../federation-dp/types.js";

function makePattern(overrides: Partial<AnonymizedPattern> = {}): AnonymizedPattern {
  return {
    id: `dp-test-${Math.random().toString(36).slice(2, 8)}`,
    type: "angle-effectiveness",
    angleId: "scamper",
    topicCategory: "sustainability",
    noisedValue: 0.7,
    ciLower: 0.5,
    ciUpper: 0.9,
    sampleSize: 20,
    epoch: "2026-05",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("federation-dp", () => {
  describe("laplaceMechanism", () => {
    it("adds noise to the true value", () => {
      const { noisedValue, noise } = laplaceMechanism(50, 1, 1);
      expect(typeof noisedValue).toBe("number");
      expect(typeof noise).toBe("number");
      expect(noisedValue).toBe(50 + noise);
    });

    it("produces lower noise with higher epsilon", () => {
      const noises: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const { noise } = laplaceMechanism(0, 1, 10);
        noises.push(Math.abs(noise));
      }
      const avgNoise = noises.reduce((a, b) => a + b, 0) / noises.length;
      // With epsilon=10, sensitivity=1, b=0.1, expected |noise| ≈ 0.1
      expect(avgNoise).toBeLessThan(1);
    });

    it("produces higher noise with lower epsilon", () => {
      const noises: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const { noise } = laplaceMechanism(0, 1, 0.1);
        noises.push(Math.abs(noise));
      }
      const avgNoise = noises.reduce((a, b) => a + b, 0) / noises.length;
      // With epsilon=0.1, sensitivity=1, b=10, expected |noise| ≈ 10
      expect(avgNoise).toBeGreaterThan(1);
    });
  });

  describe("laplaceConfidenceInterval", () => {
    it("computes symmetric CI around noised value", () => {
      const { lower, upper } = laplaceConfidenceInterval(0.5, 1, 1, 0.95);
      expect(lower).toBeLessThan(0.5);
      expect(upper).toBeGreaterThan(0.5);
      expect(upper - lower).toBeGreaterThan(0);
    });

    it("wider CI with lower epsilon", () => {
      const narrow = laplaceConfidenceInterval(0.5, 1, 10, 0.95);
      const wide = laplaceConfidenceInterval(0.5, 1, 0.1, 0.95);
      expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
    });
  });

  describe("generateRecommendations", () => {
    it("recommends effective angles for matching topics", () => {
      const patterns = [
        makePattern({ angleId: "cross-domain", topicCategory: "sustainability", noisedValue: 0.85 }),
        makePattern({ angleId: "cross-domain", topicCategory: "sustainability", noisedValue: 0.80 }),
        makePattern({ angleId: "constraints", topicCategory: "sustainability", noisedValue: 0.60 }),
      ];

      const recs = generateRecommendations(
        ["sustainability"],
        ["scamper"], // User currently uses scamper
        patterns
      );

      expect(recs.length).toBeGreaterThan(0);
      // Should recommend cross-domain (highest effectiveness, user doesn't already use it)
      expect(recs[0].recommendedAngle).toBe("cross-domain");
      expect(recs[0].effectivenessScore).toBeGreaterThan(0.5);
    });

    it("does not recommend angles the user already uses", () => {
      const patterns = [
        makePattern({ angleId: "scamper", topicCategory: "sustainability", noisedValue: 0.9 }),
      ];

      const recs = generateRecommendations(
        ["sustainability"],
        ["scamper"],
        patterns
      );

      expect(recs.find((r) => r.recommendedAngle === "scamper")).toBeUndefined();
    });

    it("filters out low-effectiveness patterns", () => {
      const patterns = [
        makePattern({ angleId: "inversion", topicCategory: "sustainability", noisedValue: 0.1 }),
      ];

      const recs = generateRecommendations(["sustainability"], [], patterns);
      expect(recs).toHaveLength(0);
    });
  });

  describe("detectAntiPatterns", () => {
    it("detects consistently underperforming combinations", () => {
      const patterns = [
        makePattern({ angleId: "first-principles", topicCategory: "HR", noisedValue: 0.08 }),
        makePattern({ angleId: "first-principles", topicCategory: "HR", noisedValue: 0.12 }),
        makePattern({ angleId: "first-principles", topicCategory: "HR", noisedValue: 0.10 }),
      ];

      const antiPatterns = detectAntiPatterns(patterns, 0.15);
      expect(antiPatterns).toHaveLength(1);
      expect(antiPatterns[0].angleId).toBe("first-principles");
      expect(antiPatterns[0].topicCategory).toBe("HR");
    });

    it("requires minimum evidence count", () => {
      const patterns = [
        makePattern({ angleId: "first-principles", topicCategory: "HR", noisedValue: 0.05 }),
      ];
      const antiPatterns = detectAntiPatterns(patterns);
      expect(antiPatterns).toHaveLength(0); // Not enough evidence
    });
  });

  describe("computeNetworkStats", () => {
    it("computes network statistics", () => {
      const patterns = [
        makePattern({ angleId: "scamper", topicCategory: "AI", noisedValue: 0.7 }),
        makePattern({ angleId: "cross-domain", topicCategory: "AI", noisedValue: 0.8 }),
        makePattern({ angleId: "scamper", topicCategory: "sustainability", noisedValue: 0.6 }),
      ];

      const stats = computeNetworkStats(patterns);
      expect(stats.totalPatterns).toBe(3);
      expect(stats.trendingAngles.length).toBeGreaterThan(0);
    });
  });
});
