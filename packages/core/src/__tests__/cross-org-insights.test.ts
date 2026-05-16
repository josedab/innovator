import { describe, it, expect, beforeEach } from "vitest";

import {
  privatizeValue,
  getPrivacyBudget,
  generateBenchmarks,
  checkDataResidencyCompliance,
  setDataResidency,
  getDataResidency,
  clearCrossOrgData,
  detectIndustryTrends,
  generateAggregateInsights,
  getAggregateInsights,
} from "../federation/cross-org-insights.js";

describe("federation/cross-org-insights", () => {
  beforeEach(() => {
    clearCrossOrgData();
  });

  // ---- privatizeValue ----

  describe("privatizeValue", () => {
    it("returns a privatized value with Laplacian noise", () => {
      const original = 100;
      const results = new Set<number>();
      // Run multiple times to verify noise is being added
      for (let i = 0; i < 20; i++) {
        clearCrossOrgData();
        const { privatized } = privatizeValue(original, `org-${i}`, 1.0);
        results.add(privatized);
      }
      // With noise, we should get different values
      expect(results.size).toBeGreaterThan(1);
    });

    it("higher epsilon produces less noise (tighter distribution)", () => {
      const original = 1000;
      const highEpsilonDeltas: number[] = [];
      const lowEpsilonDeltas: number[] = [];

      for (let i = 0; i < 50; i++) {
        clearCrossOrgData();
        const { privatized: highEps } = privatizeValue(original, `org-h-${i}`, 10.0);
        highEpsilonDeltas.push(Math.abs(highEps - original));

        clearCrossOrgData();
        const { privatized: lowEps } = privatizeValue(original, `org-l-${i}`, 0.1);
        lowEpsilonDeltas.push(Math.abs(lowEps - original));
      }

      const avgHighEps = highEpsilonDeltas.reduce((a, b) => a + b, 0) / highEpsilonDeltas.length;
      const avgLowEps = lowEpsilonDeltas.reduce((a, b) => a + b, 0) / lowEpsilonDeltas.length;

      // Low epsilon should produce MORE noise on average
      expect(avgLowEps).toBeGreaterThan(avgHighEps);
    });

    it("returns non-negative privatized value", () => {
      for (let i = 0; i < 10; i++) {
        clearCrossOrgData();
        const { privatized } = privatizeValue(5, `org-${i}`);
        expect(privatized).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ---- getPrivacyBudget ----

  describe("getPrivacyBudget", () => {
    it("creates a fresh budget for new org", () => {
      const budget = getPrivacyBudget("new-org");
      expect(budget.orgId).toBe("new-org");
      expect(budget.queriesRemaining).toBe(100);
      expect(budget.epsilon).toBe(10.0);
    });

    it("tracks budget consumption via privatizeValue", () => {
      const before = getPrivacyBudget("org-1");
      expect(before.queriesRemaining).toBe(100);

      privatizeValue(42, "org-1");
      const after = getPrivacyBudget("org-1");
      expect(after.queriesRemaining).toBe(99);
    });

    it("throws when budget is exhausted", () => {
      const budget = getPrivacyBudget("exhausted-org");
      budget.queriesRemaining = 0;

      expect(() => privatizeValue(42, "exhausted-org")).toThrow("Privacy budget exhausted");
    });
  });

  // ---- generateBenchmarks ----

  describe("generateBenchmarks", () => {
    it("returns empty array for empty org metrics", () => {
      const benchmarks = generateBenchmarks("org-1", {});
      expect(benchmarks).toHaveLength(0);
    });

    it("generates benchmarks with network comparison", () => {
      const networkData = Array.from({ length: 10 }, (_, i) => ({
        sessionsPerMonth: 20 + i * 5,
      }));

      const benchmarks = generateBenchmarks("org-1", { sessionsPerMonth: 50 }, networkData);
      expect(benchmarks).toHaveLength(1);
      expect(benchmarks[0].metric).toBe("sessionsPerMonth");
      expect(benchmarks[0].percentile).toBeGreaterThanOrEqual(0);
      expect(benchmarks[0].percentile).toBeLessThanOrEqual(100);
      expect(["above-average", "average", "below-average"]).toContain(benchmarks[0].trend);
    });

    it("classifies high-performing org as above-average", () => {
      const networkData = Array.from({ length: 10 }, () => ({
        quality: 3,
      }));

      const benchmarks = generateBenchmarks("org-1", { quality: 100 }, networkData);
      expect(benchmarks[0].trend).toBe("above-average");
    });
  });

  // ---- checkDataResidencyCompliance ----

  describe("checkDataResidencyCompliance", () => {
    it("reports non-compliant when no config is set", () => {
      const result = checkDataResidencyCompliance("unconfigured-org");
      expect(result.compliant).toBe(false);
      expect(result.violations).toContain("No data residency configuration set");
    });

    it("reports compliant for properly configured EU org", () => {
      setDataResidency({
        orgId: "eu-org",
        region: "eu-west",
        allowCrossRegion: false,
        retentionDays: 365,
        encryptionRequired: true,
        auditTrailEnabled: true,
      });

      const result = checkDataResidencyCompliance("eu-org");
      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("flags EU org with excessive retention", () => {
      setDataResidency({
        orgId: "eu-long",
        region: "eu-west",
        allowCrossRegion: false,
        retentionDays: 1000,
        encryptionRequired: true,
        auditTrailEnabled: true,
      });

      const result = checkDataResidencyCompliance("eu-long");
      expect(result.compliant).toBe(false);
      expect(result.violations.some((v) => v.includes("EU data retention"))).toBe(true);
    });

    it("flags missing encryption", () => {
      setDataResidency({
        orgId: "no-enc",
        region: "us-east",
        encryptionRequired: false,
        auditTrailEnabled: true,
      });

      const result = checkDataResidencyCompliance("no-enc");
      expect(result.violations.some((v) => v.includes("Encryption"))).toBe(true);
    });

    it("flags missing audit trail", () => {
      setDataResidency({
        orgId: "no-audit",
        region: "us-east",
        encryptionRequired: true,
        auditTrailEnabled: false,
      });

      const result = checkDataResidencyCompliance("no-audit");
      expect(result.violations.some((v) => v.includes("Audit trail"))).toBe(true);
    });
  });

  // ---- setDataResidency / getDataResidency ----

  describe("data residency CRUD", () => {
    it("round-trips data residency config", () => {
      const config = {
        orgId: "org-rt",
        region: "ap-southeast" as const,
        allowCrossRegion: true,
        retentionDays: 180,
        encryptionRequired: true,
        auditTrailEnabled: true,
      };

      setDataResidency(config);
      const retrieved = getDataResidency("org-rt");
      expect(retrieved).toBeDefined();
      expect(retrieved!.region).toBe("ap-southeast");
      expect(retrieved!.retentionDays).toBe(180);
    });

    it("returns undefined for unconfigured org", () => {
      expect(getDataResidency("missing")).toBeUndefined();
    });
  });

  // ---- clearCrossOrgData ----

  describe("clearCrossOrgData", () => {
    it("resets all state", () => {
      setDataResidency({
        orgId: "org-clear",
        region: "us-east",
        encryptionRequired: true,
        auditTrailEnabled: true,
      });
      getPrivacyBudget("org-clear");
      generateBenchmarks("org-clear", { x: 5 });
      generateAggregateInsights({
        totalOrgs: 5,
        totalSessions: 100,
        topAngles: [{ angleId: "scamper", count: 10 }],
        avgQuality: 7,
      });

      clearCrossOrgData();

      expect(getDataResidency("org-clear")).toBeUndefined();
      expect(getAggregateInsights()).toHaveLength(0);
    });
  });

  // ---- detectIndustryTrends ----

  describe("detectIndustryTrends", () => {
    it("detects trends from sufficient data", () => {
      const patterns = Array.from({ length: 10 }, (_, i) => ({
        angleId: "scamper",
        domain: "fintech",
        frequency: 3,
        successRate: 0.7,
        timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      }));

      const trends = detectIndustryTrends(patterns);
      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].trendName).toContain("fintech");
    });

    it("ignores domains with fewer than 5 frequency", () => {
      const patterns = [
        {
          angleId: "a",
          domain: "rare",
          frequency: 1,
          successRate: 0.5,
          timestamp: new Date().toISOString(),
        },
      ];
      const trends = detectIndustryTrends(patterns);
      expect(trends).toHaveLength(0);
    });
  });
});
