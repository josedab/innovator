import { describe, it, expect, beforeEach } from "vitest";
import {
  submitMetrics,
  compareToPeers,
  getNetworkStats,
  benchmarkToMarkdown,
  clearBenchmarkData,
} from "../cross-org-benchmark/index.js";

describe("cross-org-benchmark", () => {
  beforeEach(() => {
    clearBenchmarkData();
  });

  const baseMetrics = {
    periodStart: "2024-01",
    periodEnd: "2024-01-31",
    sessionCount: 20,
    ideaCount: 100,
    averageIdeaScore: 7.5,
    anglesUsed: { scamper: 10, "first-principles": 8, "cross-domain": 5 },
    uniqueSubjects: 15,
    averageSessionDurationMs: 60000,
    topAngle: "scamper",
    ideaVelocity: 5,
    qualityDistribution: { low: 10, medium: 40, high: 50 },
  };

  describe("submitMetrics", () => {
    it("submits anonymized metrics", () => {
      const result = submitMetrics("org-alpha", baseMetrics);
      expect(result.orgId).not.toBe("org-alpha");
      expect(result.orgId).toContain("org-");
      expect(result.submittedAt).toBeTruthy();
    });

    it("replaces existing metrics for same org + period", () => {
      submitMetrics("org-alpha", baseMetrics);
      submitMetrics("org-alpha", { ...baseMetrics, sessionCount: 30 });
      // Should still have only one record
      const stats = getNetworkStats();
      expect(stats.totalOrganizations).toBe(1);
    });
  });

  describe("compareToPeers", () => {
    it("compares against peer organizations", () => {
      submitMetrics("org-alpha", baseMetrics);
      submitMetrics("org-beta", { ...baseMetrics, sessionCount: 10, ideaCount: 50, ideaVelocity: 5 });
      submitMetrics("org-gamma", { ...baseMetrics, sessionCount: 30, ideaCount: 150, ideaVelocity: 5 });
      submitMetrics("org-delta", { ...baseMetrics, sessionCount: 5, ideaCount: 25, ideaVelocity: 5 });

      const result = compareToPeers("org-alpha");
      expect(result).toBeDefined();
      expect(result!.percentiles.sessionCount).toBeGreaterThanOrEqual(0);
      expect(result!.percentiles.sessionCount).toBeLessThanOrEqual(100);
      expect(result!.peerStats.totalOrgs).toBe(4);
    });

    it("returns undefined for unknown org", () => {
      expect(compareToPeers("unknown-org")).toBeUndefined();
    });

    it("generates recommendations", () => {
      submitMetrics("org-alpha", { ...baseMetrics, sessionCount: 2, ideaVelocity: 1, averageIdeaScore: 3 });
      submitMetrics("org-beta", { ...baseMetrics, sessionCount: 50, ideaVelocity: 10, averageIdeaScore: 9 });
      submitMetrics("org-gamma", { ...baseMetrics, sessionCount: 30 });

      const result = compareToPeers("org-alpha");
      expect(result!.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("getNetworkStats", () => {
    it("aggregates network-wide statistics", () => {
      submitMetrics("org-a", baseMetrics);
      submitMetrics("org-b", { ...baseMetrics, sessionCount: 10 });

      const stats = getNetworkStats();
      expect(stats.totalOrganizations).toBe(2);
      expect(stats.totalSessions).toBe(30);
      expect(stats.totalIdeas).toBe(200);
      expect(stats.mostPopularAngle).toBe("scamper");
    });

    it("returns empty stats for no data", () => {
      const stats = getNetworkStats();
      expect(stats.totalOrganizations).toBe(0);
      expect(stats.mostPopularAngle).toBe("N/A");
    });
  });

  describe("benchmarkToMarkdown", () => {
    it("generates markdown report", () => {
      submitMetrics("org-a", baseMetrics);
      submitMetrics("org-b", { ...baseMetrics, sessionCount: 10 });
      const comparison = compareToPeers("org-a")!;
      const md = benchmarkToMarkdown(comparison);
      expect(md).toContain("# Cross-Organization Innovation Benchmark");
      expect(md).toContain("Percentile");
    });
  });
});
