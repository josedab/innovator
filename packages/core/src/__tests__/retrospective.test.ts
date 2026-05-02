import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  trackOutcome,
  getOutcome,
  listOutcomes,
  updateOutcome,
  analyzeSuccessPatterns,
  analyzeFailureModes,
  calculateVelocityTrends,
  detectDiminishingReturns,
  getRetrospectiveReport,
  listRetrospectiveReports,
  clearRetrospectiveData,
} from "../retrospective/index.js";
import type { IdeaOutcome, VelocityTrend } from "../retrospective/index.js";

function makeOutcome(overrides: Partial<IdeaOutcome> = {}): IdeaOutcome {
  return {
    ideaTitle: "Test Idea",
    status: "shipped",
    shippedAt: "2025-06-15T00:00:00Z",
    actualImpact: "Increased user engagement by 20%",
    timeToShip: 45,
    originalScore: 7.5,
    ...overrides,
  };
}

describe("retrospective", () => {
  beforeEach(() => {
    clearRetrospectiveData();
  });

  describe("outcome tracking", () => {
    it("tracks and retrieves an outcome", () => {
      const outcome = trackOutcome(makeOutcome());
      expect(getOutcome("Test Idea")).toEqual(outcome);
    });

    it("lists all outcomes", () => {
      trackOutcome(makeOutcome({ ideaTitle: "Idea 1" }));
      trackOutcome(makeOutcome({ ideaTitle: "Idea 2" }));
      expect(listOutcomes()).toHaveLength(2);
    });

    it("updates an existing outcome", () => {
      trackOutcome(makeOutcome());
      const updated = updateOutcome("Test Idea", { status: "abandoned" });
      expect(updated?.status).toBe("abandoned");
    });

    it("returns undefined when updating non-existent outcome", () => {
      expect(updateOutcome("NonExistent", { status: "abandoned" })).toBeUndefined();
    });

    it("clears all data", () => {
      trackOutcome(makeOutcome());
      clearRetrospectiveData();
      expect(listOutcomes()).toHaveLength(0);
      expect(listRetrospectiveReports()).toHaveLength(0);
    });
  });

  describe("analyzeSuccessPatterns", () => {
    it("returns empty for insufficient data", () => {
      expect(analyzeSuccessPatterns([])).toHaveLength(0);
      expect(analyzeSuccessPatterns([makeOutcome()])).toHaveLength(0);
    });

    it("detects fast ship pattern", () => {
      const outcomes = [
        makeOutcome({ ideaTitle: "Fast 1", timeToShip: 10 }),
        makeOutcome({ ideaTitle: "Fast 2", timeToShip: 20 }),
        makeOutcome({ ideaTitle: "Slow 1", timeToShip: 60 }),
      ];
      const patterns = analyzeSuccessPatterns(outcomes);
      const fastShip = patterns.find((p) => p.title === "Fast Ship Cycle");
      expect(fastShip).toBeDefined();
      expect(fastShip!.frequency).toBe(2);
    });

    it("detects high-score success pattern", () => {
      const outcomes = [
        makeOutcome({ ideaTitle: "High 1", originalScore: 8 }),
        makeOutcome({ ideaTitle: "High 2", originalScore: 9 }),
        makeOutcome({ ideaTitle: "Low 1", originalScore: 3 }),
      ];
      const patterns = analyzeSuccessPatterns(outcomes);
      const highScore = patterns.find((p) => p.title === "High-Score Validation");
      expect(highScore).toBeDefined();
      expect(highScore!.frequency).toBe(2);
    });
  });

  describe("analyzeFailureModes", () => {
    it("returns empty for insufficient failures", () => {
      expect(analyzeFailureModes([])).toHaveLength(0);
    });

    it("detects scope creep pattern", () => {
      const outcomes = [
        makeOutcome({
          ideaTitle: "Fail 1",
          status: "abandoned",
          lessonsLearned: ["Scope was too large"],
        }),
        makeOutcome({
          ideaTitle: "Fail 2",
          status: "abandoned",
          lessonsLearned: ["Scope kept expanding"],
        }),
      ];
      const modes = analyzeFailureModes(outcomes);
      const scopeCreep = modes.find((m) => m.title === "Scope Creep");
      expect(scopeCreep).toBeDefined();
    });
  });

  describe("calculateVelocityTrends", () => {
    it("returns empty for no outcomes", () => {
      expect(calculateVelocityTrends([])).toHaveLength(0);
    });

    it("groups outcomes by month", () => {
      const outcomes = [
        makeOutcome({ ideaTitle: "I1", shippedAt: "2025-01-15T00:00:00Z" }),
        makeOutcome({ ideaTitle: "I2", shippedAt: "2025-01-20T00:00:00Z" }),
        makeOutcome({ ideaTitle: "I3", shippedAt: "2025-02-10T00:00:00Z" }),
      ];
      const trends = calculateVelocityTrends(outcomes);
      expect(trends).toHaveLength(2);
      expect(trends[0].period).toBe("2025-01");
      expect(trends[0].ideasGenerated).toBe(2);
    });

    it("calculates success rate", () => {
      const outcomes = [
        makeOutcome({ ideaTitle: "Shipped", status: "shipped", shippedAt: "2025-01-15T00:00:00Z" }),
        makeOutcome({
          ideaTitle: "Abandoned",
          status: "abandoned",
          shippedAt: "2025-01-20T00:00:00Z",
        }),
      ];
      const trends = calculateVelocityTrends(outcomes);
      expect(trends[0].successRate).toBe(0.5);
    });
  });

  describe("detectDiminishingReturns", () => {
    it("returns empty for insufficient data", () => {
      expect(detectDiminishingReturns([])).toHaveLength(0);
      expect(
        detectDiminishingReturns([
          {
            period: "2025-01",
            ideasGenerated: 5,
            ideasShipped: 3,
            successRate: 0.6,
            innovationScore: 7,
          },
        ])
      ).toHaveLength(0);
    });

    it("detects declining success rate", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 5,
          ideasShipped: 4,
          successRate: 0.8,
          innovationScore: 8,
        },
        {
          period: "2025-02",
          ideasGenerated: 5,
          ideasShipped: 3,
          successRate: 0.6,
          innovationScore: 7,
        },
        {
          period: "2025-03",
          ideasGenerated: 5,
          ideasShipped: 2,
          successRate: 0.4,
          innovationScore: 6,
        },
      ];
      const results = detectDiminishingReturns(trends);
      expect(results.some((r) => r.area === "Success Rate")).toBe(true);
    });

    it("detects declining innovation quality", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 5,
          ideasShipped: 4,
          successRate: 0.5,
          innovationScore: 9,
        },
        {
          period: "2025-02",
          ideasGenerated: 5,
          ideasShipped: 4,
          successRate: 0.5,
          innovationScore: 7,
        },
        {
          period: "2025-03",
          ideasGenerated: 5,
          ideasShipped: 4,
          successRate: 0.5,
          innovationScore: 5,
        },
      ];
      const results = detectDiminishingReturns(trends);
      expect(results.some((r) => r.area === "Innovation Quality")).toBe(true);
    });

    it("returns empty when trends are stable", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 5,
          ideasShipped: 3,
          successRate: 0.6,
          innovationScore: 7,
        },
        {
          period: "2025-02",
          ideasGenerated: 5,
          ideasShipped: 3,
          successRate: 0.6,
          innovationScore: 7,
        },
        {
          period: "2025-03",
          ideasGenerated: 5,
          ideasShipped: 3,
          successRate: 0.6,
          innovationScore: 7,
        },
      ];
      expect(detectDiminishingReturns(trends)).toHaveLength(0);
    });
  });

  describe("report store", () => {
    it("starts with empty reports", () => {
      expect(listRetrospectiveReports()).toHaveLength(0);
    });

    it("returns undefined for unknown report", () => {
      expect(getRetrospectiveReport("unknown")).toBeUndefined();
    });
  });
});
