import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  createDebtItem,
  updateDebtItem,
  calculateDebtScore,
  generateDebtReport,
  DebtItemSchema,
} from "../index.js";

describe("debt-tracker", () => {
  describe("createDebtItem", () => {
    it("creates a valid debt item", () => {
      const item = createDebtItem({
        title: "ML-powered search",
        description: "Deferred ML search feature",
        category: "deferred-idea",
        severity: "medium",
        deferralReason: "Insufficient team bandwidth",
        monthlyCostOfDelay: 5000,
        tags: ["search", "ml"],
      });

      expect(DebtItemSchema.parse(item)).toBeDefined();
      expect(item.status).toBe("active");
      expect(item.accumulatedCost).toBe(0);
      expect(item.tags).toEqual(["search", "ml"]);
    });
  });

  describe("updateDebtItem", () => {
    it("updates severity and status", () => {
      const item = createDebtItem({
        title: "Test Update Item",
        description: "Test",
        category: "deferred-idea",
        severity: "low",
        deferralReason: "Budget",
      });

      const updated = updateDebtItem(item.id, { severity: "high", status: "escalated" });
      expect(updated.severity).toBe("high");
      expect(updated.status).toBe("escalated");
    });

    it("throws for non-existent item", () => {
      expect(() => updateDebtItem("fake-id", { severity: "high" })).toThrow();
    });
  });

  describe("calculateDebtScore", () => {
    it("calculates a score with components", () => {
      const item = createDebtItem({
        title: "Score Test Item",
        description: "Test",
        category: "missed-market-window",
        severity: "high",
        deferralReason: "Timing",
        monthlyCostOfDelay: 10000,
      });

      const score = calculateDebtScore(item.id);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.components.ageWeightedSeverity).toBeGreaterThanOrEqual(0);
      expect(score.urgency).toBeDefined();
    });

    it("throws for non-existent item", () => {
      expect(() => calculateDebtScore("fake-id")).toThrow();
    });
  });

  describe("generateDebtReport", () => {
    it("generates a report with active items", () => {
      createDebtItem({
        title: "Report Test Debt Item",
        description: "Test",
        category: "competitive-neglect",
        severity: "critical",
        deferralReason: "No resources",
      });

      const report = generateDebtReport();
      expect(report.totalItems).toBeGreaterThan(0);
      expect(report.generatedAt).toBeDefined();
      expect(report.topItems.length).toBeGreaterThan(0);
    });
  });
});
