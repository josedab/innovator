import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: (_label: string, val: string) => val,
  sanitizeLlmOutput: (val: string) => val,
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
  generateRetrospectiveReport,
  getRetrospectiveReport,
  listRetrospectiveReports,
  clearRetrospectiveData,
  type IdeaOutcome,
  type VelocityTrend,
} from "../index.js";

describe("retrospective", () => {
  beforeEach(() => {
    clearRetrospectiveData();
    vi.clearAllMocks();
  });

  describe("trackOutcome / getOutcome / listOutcomes CRUD", () => {
    it("tracks and retrieves an outcome", () => {
      const outcome: IdeaOutcome = {
        ideaTitle: "AI Chat",
        status: "shipped",
        shippedAt: "2025-01-15T00:00:00Z",
        timeToShip: 20,
        originalScore: 8,
      };
      const tracked = trackOutcome(outcome);
      expect(tracked.ideaTitle).toBe("AI Chat");

      const retrieved = getOutcome("AI Chat");
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("shipped");
    });

    it("returns undefined for unknown idea", () => {
      expect(getOutcome("nonexistent")).toBeUndefined();
    });

    it("listOutcomes returns all tracked outcomes", () => {
      trackOutcome({ ideaTitle: "A", status: "shipped" });
      trackOutcome({ ideaTitle: "B", status: "abandoned" });
      expect(listOutcomes()).toHaveLength(2);
    });

    it("updateOutcome modifies existing outcome", () => {
      trackOutcome({ ideaTitle: "A", status: "in-progress" });
      const updated = updateOutcome("A", { status: "shipped", timeToShip: 15 });
      expect(updated).toBeDefined();
      expect(updated!.status).toBe("shipped");
      expect(updated!.timeToShip).toBe(15);
      expect(updated!.ideaTitle).toBe("A"); // title preserved
    });

    it("updateOutcome returns undefined for non-existent", () => {
      expect(updateOutcome("nonexistent", { status: "shipped" })).toBeUndefined();
    });
  });

  describe("analyzeSuccessPatterns", () => {
    it("detects fast-ship pattern", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "Fast A", status: "shipped", timeToShip: 10 },
        { ideaTitle: "Fast B", status: "shipped", timeToShip: 20 },
        { ideaTitle: "Slow C", status: "shipped", timeToShip: 60 },
      ];
      const patterns = analyzeSuccessPatterns(outcomes);
      const fastShip = patterns.find((p) => p.title === "Fast Ship Cycle");
      expect(fastShip).toBeDefined();
      expect(fastShip!.frequency).toBe(2);
      expect(fastShip!.exampleIdeas).toContain("Fast A");
    });

    it("detects high-score success pattern", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "Hi A", status: "shipped", originalScore: 8 },
        { ideaTitle: "Hi B", status: "shipped", originalScore: 9 },
        { ideaTitle: "Lo C", status: "shipped", originalScore: 4 },
      ];
      const patterns = analyzeSuccessPatterns(outcomes);
      const highScore = patterns.find((p) => p.title === "High-Score Validation");
      expect(highScore).toBeDefined();
      expect(highScore!.frequency).toBe(2);
    });

    it("returns empty for fewer than 2 shipped", () => {
      const outcomes: IdeaOutcome[] = [{ ideaTitle: "A", status: "shipped", timeToShip: 5 }];
      expect(analyzeSuccessPatterns(outcomes)).toHaveLength(0);
    });

    it("returns empty for 0 outcomes", () => {
      expect(analyzeSuccessPatterns([])).toHaveLength(0);
    });
  });

  describe("analyzeFailureModes", () => {
    it("detects scope creep pattern", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "A", status: "abandoned", lessonsLearned: ["scope was too big"] },
        { ideaTitle: "B", status: "abandoned", lessonsLearned: ["scope creep killed it"] },
      ];
      const modes = analyzeFailureModes(outcomes);
      const scopeCreep = modes.find((m) => m.title === "Scope Creep");
      expect(scopeCreep).toBeDefined();
      expect(scopeCreep!.frequency).toBe(2);
    });

    it("returns empty for fewer than 2 abandoned", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "A", status: "abandoned", lessonsLearned: ["scope issue"] },
      ];
      expect(analyzeFailureModes(outcomes)).toHaveLength(0);
    });

    it("returns empty when all outcomes succeeded", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "A", status: "shipped" },
        { ideaTitle: "B", status: "shipped" },
      ];
      expect(analyzeFailureModes(outcomes)).toHaveLength(0);
    });
  });

  describe("calculateVelocityTrends", () => {
    it("groups outcomes by month", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "A", status: "shipped", shippedAt: "2025-01-15T00:00:00Z", timeToShip: 10 },
        { ideaTitle: "B", status: "shipped", shippedAt: "2025-01-20T00:00:00Z", timeToShip: 20 },
        { ideaTitle: "C", status: "abandoned", shippedAt: "2025-02-10T00:00:00Z" },
      ];
      const trends = calculateVelocityTrends(outcomes);
      expect(trends.length).toBe(2);
      const jan = trends.find((t) => t.period === "2025-01");
      expect(jan).toBeDefined();
      expect(jan!.ideasGenerated).toBe(2);
      expect(jan!.ideasShipped).toBe(2);
      expect(jan!.averageTimeToShip).toBe(15);
    });

    it("calculates success rate", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "A", status: "shipped", shippedAt: "2025-03-01T00:00:00Z" },
        { ideaTitle: "B", status: "abandoned", shippedAt: "2025-03-15T00:00:00Z" },
      ];
      const trends = calculateVelocityTrends(outcomes);
      expect(trends[0].successRate).toBe(0.5);
    });

    it("returns empty for 0 outcomes", () => {
      expect(calculateVelocityTrends([])).toHaveLength(0);
    });

    it("sorts by period ascending", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "B", status: "shipped", shippedAt: "2025-03-01T00:00:00Z" },
        { ideaTitle: "A", status: "shipped", shippedAt: "2025-01-01T00:00:00Z" },
      ];
      const trends = calculateVelocityTrends(outcomes);
      expect(trends[0].period).toBe("2025-01");
    });
  });

  describe("detectDiminishingReturns", () => {
    it("detects declining success rate", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 10,
          ideasShipped: 8,
          successRate: 0.8,
          innovationScore: 7,
        },
        {
          period: "2025-02",
          ideasGenerated: 10,
          ideasShipped: 6,
          successRate: 0.6,
          innovationScore: 7,
        },
        {
          period: "2025-03",
          ideasGenerated: 10,
          ideasShipped: 4,
          successRate: 0.4,
          innovationScore: 7,
        },
      ];
      const results = detectDiminishingReturns(trends);
      const successDecline = results.find((r) => r.area === "Success Rate");
      expect(successDecline).toBeDefined();
      expect(successDecline!.detected).toBe(true);
    });

    it("detects declining innovation score", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 10,
          ideasShipped: 8,
          successRate: 0.8,
          innovationScore: 9,
        },
        {
          period: "2025-02",
          ideasGenerated: 10,
          ideasShipped: 8,
          successRate: 0.8,
          innovationScore: 7,
        },
        {
          period: "2025-03",
          ideasGenerated: 10,
          ideasShipped: 8,
          successRate: 0.8,
          innovationScore: 5,
        },
      ];
      const results = detectDiminishingReturns(trends);
      const innovDecline = results.find((r) => r.area === "Innovation Quality");
      expect(innovDecline).toBeDefined();
    });

    it("returns empty for fewer than 3 trends", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 10,
          ideasShipped: 8,
          successRate: 0.8,
          innovationScore: 7,
        },
        {
          period: "2025-02",
          ideasGenerated: 10,
          ideasShipped: 6,
          successRate: 0.6,
          innovationScore: 5,
        },
      ];
      expect(detectDiminishingReturns(trends)).toHaveLength(0);
    });

    it("returns empty when trends are improving", () => {
      const trends: VelocityTrend[] = [
        {
          period: "2025-01",
          ideasGenerated: 10,
          ideasShipped: 4,
          successRate: 0.4,
          innovationScore: 5,
        },
        {
          period: "2025-02",
          ideasGenerated: 10,
          ideasShipped: 6,
          successRate: 0.6,
          innovationScore: 7,
        },
        {
          period: "2025-03",
          ideasGenerated: 10,
          ideasShipped: 8,
          successRate: 0.8,
          innovationScore: 9,
        },
      ];
      expect(detectDiminishingReturns(trends)).toHaveLength(0);
    });
  });

  describe("generateRetrospectiveReport", () => {
    it("generates report with LLM synthesis", async () => {
      trackOutcome({ ideaTitle: "A", status: "shipped", shippedAt: "2025-01-15T00:00:00Z" });

      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({
          summary: "Good quarter",
          successPatterns: [],
          failureModes: [],
          recommendations: ["Ship faster"],
          overallHealthScore: 8,
          topPerformingAngles: ["scamper"],
        })
      );

      const report = await generateRetrospectiveReport("Q1 2025");
      expect(report.period).toBe("Q1 2025");
      expect(report.summary).toBe("Good quarter");
      expect(report.totalIdeasTracked).toBe(1);
      expect(report.id).toMatch(/^retro-/);
    });

    it("stores report and retrieves by id", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({
          summary: "s",
          successPatterns: [],
          failureModes: [],
          recommendations: [],
          overallHealthScore: 5,
          topPerformingAngles: [],
        })
      );

      const report = await generateRetrospectiveReport("Q1");
      const retrieved = getRetrospectiveReport(report.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(report.id);
    });

    it("listRetrospectiveReports returns all", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({
          summary: "s",
          successPatterns: [],
          failureModes: [],
          recommendations: [],
          overallHealthScore: 5,
          topPerformingAngles: [],
        })
      );

      await generateRetrospectiveReport("Q1");
      await generateRetrospectiveReport("Q2");
      expect(listRetrospectiveReports()).toHaveLength(2);
    });
  });

  describe("clearRetrospectiveData", () => {
    it("clears all outcomes and reports", () => {
      trackOutcome({ ideaTitle: "A", status: "shipped" });
      clearRetrospectiveData();
      expect(listOutcomes()).toHaveLength(0);
      expect(listRetrospectiveReports()).toHaveLength(0);
    });
  });
});
