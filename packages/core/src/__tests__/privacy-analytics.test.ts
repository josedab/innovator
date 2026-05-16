import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  recordBudgetExpenditure,
  getPrivacyBudgetSummary,
  hasBudget,
  buildComparisonUIData,
  laplaceMechanismNoise,
  privatizeMetrics,
  collectOrgMetrics,
  getMetricsHistory,
  computeBenchmarkTrends,
  clearPrivacyAnalyticsData,
} from "../cross-org-benchmark/privacy-analytics.js";

describe("cross-org-benchmark/privacy-analytics", () => {
  beforeEach(() => {
    clearPrivacyAnalyticsData();
  });

  describe("privacy budget", () => {
    it("records budget expenditure", () => {
      recordBudgetExpenditure("org-1", 0.1, "comparison");
      const summary = getPrivacyBudgetSummary("org-1");
      expect(summary.totalEpsilon).toBe(0.1);
      expect(summary.remaining).toBe(0.9);
      expect(summary.isExhausted).toBe(false);
    });

    it("tracks cumulative budget", () => {
      recordBudgetExpenditure("org-1", 0.3, "comparison");
      recordBudgetExpenditure("org-1", 0.4, "trend-analysis");
      recordBudgetExpenditure("org-1", 0.3, "comparison");
      const summary = getPrivacyBudgetSummary("org-1");
      expect(summary.totalEpsilon).toBe(1.0);
      expect(summary.isExhausted).toBe(true);
    });

    it("checks budget availability", () => {
      recordBudgetExpenditure("org-1", 0.8, "comparison");
      expect(hasBudget("org-1", 0.1)).toBe(true);
      expect(hasBudget("org-1", 0.3)).toBe(false);
    });

    it("returns clean state for new org", () => {
      const summary = getPrivacyBudgetSummary("new-org");
      expect(summary.totalEpsilon).toBe(0);
      expect(summary.remaining).toBe(1.0);
    });
  });

  describe("buildComparisonUIData", () => {
    it("builds comparison with percentiles", () => {
      const orgMetrics = {
        sessionCount: 50,
        ideaCount: 200,
        averageIdeaScore: 7.5,
        ideaVelocity: 4,
      };
      const peers = [
        { sessionCount: 30, ideaCount: 100, averageIdeaScore: 6, ideaVelocity: 3.3 },
        { sessionCount: 40, ideaCount: 150, averageIdeaScore: 7, ideaVelocity: 3.75 },
        { sessionCount: 60, ideaCount: 300, averageIdeaScore: 8, ideaVelocity: 5 },
        { sessionCount: 20, ideaCount: 80, averageIdeaScore: 5.5, ideaVelocity: 4 },
      ];

      const result = buildComparisonUIData("org-1", orgMetrics, peers);
      expect(result.orgId).toBe("org-1");
      expect(result.metrics).toHaveLength(4);
      expect(result.metrics[0].percentile).toBeGreaterThanOrEqual(0);
      expect(result.industryRank).toBeDefined();
      expect(result.privacyBudget).toBeDefined();
    });

    it("generates recommendations for low percentiles", () => {
      const orgMetrics = {
        sessionCount: 5,
        ideaCount: 10,
        averageIdeaScore: 3,
        ideaVelocity: 2,
      };
      const peers = Array.from({ length: 10 }, (_, i) => ({
        sessionCount: 50 + i * 10,
        ideaCount: 200 + i * 50,
        averageIdeaScore: 7 + i * 0.2,
        ideaVelocity: 4 + i * 0.5,
      }));

      const result = buildComparisonUIData("org-low", orgMetrics, peers);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("records budget expenditure on comparison", () => {
      buildComparisonUIData(
        "budget-test",
        { sessionCount: 10, ideaCount: 50, averageIdeaScore: 6, ideaVelocity: 5 },
        []
      );
      const budget = getPrivacyBudgetSummary("budget-test");
      expect(budget.totalEpsilon).toBeGreaterThan(0);
    });
  });

  describe("Laplace mechanism", () => {
    it("adds noise to a value", () => {
      const results = new Set<number>();
      for (let i = 0; i < 20; i++) {
        results.add(laplaceMechanismNoise(100, 1, 0.5));
      }
      // Values should be different due to randomness
      expect(results.size).toBeGreaterThan(1);
    });

    it("privatizes metrics and tracks budget", () => {
      const result = privatizeMetrics(
        "laplace-org",
        {
          sessions: 50,
          ideas: 200,
        },
        { epsilon: 0.1, sensitivity: 1 }
      );
      expect(result.privatized.sessions).toBeDefined();
      expect(result.privatized.ideas).toBeDefined();
      expect(result.epsilonSpent).toBe(0.2); // 0.1 per metric × 2
      expect(result.budgetRemaining).toBeLessThan(1);
    });

    it("rejects when budget exhausted", () => {
      // Exhaust budget
      for (let i = 0; i < 5; i++) {
        recordBudgetExpenditure("exhausted-org", 0.2, "test");
      }
      expect(() => {
        privatizeMetrics("exhausted-org", { value: 100 }, { epsilon: 0.5 });
      }).toThrow("Insufficient privacy budget");
    });
  });

  describe("metrics collection and trends", () => {
    it("collects and retrieves metrics history", () => {
      collectOrgMetrics("trend-org", { sessions: 10, ideas: 50 }, "2025-01");
      collectOrgMetrics("trend-org", { sessions: 15, ideas: 75 }, "2025-02");
      collectOrgMetrics("trend-org", { sessions: 20, ideas: 100 }, "2025-03");

      const history = getMetricsHistory("trend-org");
      expect(history).toHaveLength(3);
    });

    it("computes benchmark trends", () => {
      collectOrgMetrics("trend-org2", { sessions: 10 }, "2025-01");
      collectOrgMetrics("trend-org2", { sessions: 15 }, "2025-02");
      collectOrgMetrics("trend-org2", { sessions: 20 }, "2025-03");

      const trends = computeBenchmarkTrends("trend-org2", ["sessions"]);
      expect(trends).toHaveLength(1);
      expect(trends[0].metric).toBe("sessions");
      expect(trends[0].trend).toBe("improving");
      expect(trends[0].dataPoints.length).toBe(3);
    });
  });
});
