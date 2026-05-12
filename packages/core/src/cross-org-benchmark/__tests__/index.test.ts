import { describe, it, expect, beforeEach } from "vitest";
import {
  submitMetrics,
  submitMetricsWithPrivacy,
  compareToPeers,
  getNetworkStats,
  benchmarkToMarkdown,
  clearBenchmarkData,
  setDifferentialPrivacy,
  getDifferentialPrivacy,
} from "../index.js";

const sampleMetrics = {
  periodStart: "2025-01-01",
  periodEnd: "2025-01-31",
  sessionCount: 50,
  ideaCount: 200,
  averageIdeaScore: 7.5,
  anglesUsed: { scamper: 20, "first-principles": 15, "cross-domain": 15 },
  uniqueSubjects: 25,
  averageSessionDurationMs: 180000,
  topAngle: "scamper",
  ideaVelocity: 4.0,
  qualityDistribution: { low: 20, medium: 100, high: 80 },
};

describe("cross-org-benchmark", () => {
  beforeEach(() => {
    clearBenchmarkData();
    setDifferentialPrivacy({ epsilon: 1.0, enabled: true });
  });

  describe("submitMetrics", () => {
    it("should submit and anonymize org metrics", () => {
      const record = submitMetrics("acme-corp", sampleMetrics);
      expect(record.orgId).toMatch(/^org-/);
      expect(record.orgId).not.toBe("acme-corp");
      expect(record.sessionCount).toBe(50);
      expect(record.submittedAt).toBeTruthy();
    });

    it("should replace existing metrics for same org and period", () => {
      submitMetrics("acme-corp", sampleMetrics);
      submitMetrics("acme-corp", { ...sampleMetrics, sessionCount: 100 });

      const stats = getNetworkStats();
      expect(stats.totalOrganizations).toBe(1);
    });
  });

  describe("compareToPeers", () => {
    it("should return undefined for unknown org", () => {
      expect(compareToPeers("unknown")).toBeUndefined();
    });

    it("should return comparison with percentiles", () => {
      submitMetrics("org-a", sampleMetrics);
      submitMetrics("org-b", { ...sampleMetrics, sessionCount: 100, ideaCount: 400 });
      submitMetrics("org-c", { ...sampleMetrics, sessionCount: 10, ideaCount: 30 });

      const comparison = compareToPeers("org-a");
      expect(comparison).toBeTruthy();
      expect(comparison!.percentiles.sessionCount).toBeGreaterThanOrEqual(0);
      expect(comparison!.percentiles.sessionCount).toBeLessThanOrEqual(100);
      expect(comparison!.peerStats.totalOrgs).toBe(3);
    });

    it("should generate recommendations for low performers", () => {
      submitMetrics("org-a", { ...sampleMetrics, sessionCount: 1, ideaCount: 2, averageIdeaScore: 2 });
      submitMetrics("org-b", { ...sampleMetrics, sessionCount: 100, ideaCount: 400, averageIdeaScore: 9 });
      submitMetrics("org-c", { ...sampleMetrics, sessionCount: 80, ideaCount: 300, averageIdeaScore: 8 });

      const comparison = compareToPeers("org-a");
      expect(comparison).toBeTruthy();
      expect(comparison!.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("getNetworkStats", () => {
    it("should return empty stats with no data", () => {
      const stats = getNetworkStats();
      expect(stats.totalOrganizations).toBe(0);
      expect(stats.totalSessions).toBe(0);
    });

    it("should aggregate across organizations", () => {
      submitMetrics("org-a", sampleMetrics);
      submitMetrics("org-b", { ...sampleMetrics, sessionCount: 30 });

      const stats = getNetworkStats();
      expect(stats.totalOrganizations).toBe(2);
      expect(stats.totalSessions).toBe(80);
      expect(stats.mostPopularAngle).toBe("scamper");
    });
  });

  describe("benchmarkToMarkdown", () => {
    it("should generate readable markdown", () => {
      submitMetrics("org-a", sampleMetrics);
      submitMetrics("org-b", { ...sampleMetrics, sessionCount: 100 });

      const comparison = compareToPeers("org-a")!;
      const md = benchmarkToMarkdown(comparison);

      expect(md).toContain("Cross-Organization Innovation Benchmark");
      expect(md).toContain("Percentile Rankings");
      expect(md).toContain("Sessions");
      expect(md).toContain("Ideas");
    });
  });

  describe("differential privacy", () => {
    it("should get/set DP configuration", () => {
      setDifferentialPrivacy({ epsilon: 2.0, enabled: false });
      const config = getDifferentialPrivacy();
      expect(config.epsilon).toBe(2.0);
      expect(config.enabled).toBe(false);
    });

    it("should add noise to submitted metrics", () => {
      setDifferentialPrivacy({ epsilon: 0.1, enabled: true });

      // Submit many times and check that values vary
      const sessionCounts: number[] = [];
      for (let i = 0; i < 20; i++) {
        clearBenchmarkData();
        const record = submitMetricsWithPrivacy(`org-${i}`, sampleMetrics);
        sessionCounts.push(record.sessionCount);
      }

      // With low epsilon, noise should be significant — not all values should be 50
      const uniqueValues = new Set(sessionCounts).size;
      expect(uniqueValues).toBeGreaterThan(1);
    });

    it("should pass through without noise when disabled", () => {
      setDifferentialPrivacy({ enabled: false });
      const record = submitMetricsWithPrivacy("org-x", sampleMetrics);
      expect(record.sessionCount).toBe(50);
      expect(record.ideaCount).toBe(200);
    });

    it("should clamp noisy values to non-negative", () => {
      setDifferentialPrivacy({ epsilon: 0.01, enabled: true });
      // With very low epsilon, noise is large — but values should still be >= 0
      for (let i = 0; i < 10; i++) {
        clearBenchmarkData();
        const record = submitMetricsWithPrivacy(`org-${i}`, {
          ...sampleMetrics,
          sessionCount: 1,
          ideaCount: 1,
        });
        expect(record.sessionCount).toBeGreaterThanOrEqual(0);
        expect(record.ideaCount).toBeGreaterThanOrEqual(0);
      }
    });

    it("should clamp averageIdeaScore to [0, 10]", () => {
      setDifferentialPrivacy({ epsilon: 0.01, enabled: true });
      for (let i = 0; i < 10; i++) {
        clearBenchmarkData();
        const record = submitMetricsWithPrivacy(`org-${i}`, sampleMetrics);
        expect(record.averageIdeaScore).toBeGreaterThanOrEqual(0);
        expect(record.averageIdeaScore).toBeLessThanOrEqual(10);
      }
    });
  });
});
