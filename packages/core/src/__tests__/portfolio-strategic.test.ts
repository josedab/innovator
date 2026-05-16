import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  addStrategicGoal,
  listStrategicGoals,
  classifyHorizon,
  buildBalancedScorecard,
  scoreStrategicAlignment,
  simulatePortfolioRisk,
  generateRebalancingRecommendations,
  buildPortfolioBubbleChart,
  generateBoardReport,
  clearStrategicGoals,
} from "../portfolio/strategic-intelligence.js";
import type { PortfolioItem } from "../portfolio/types.js";

function makeItem(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
  return {
    id: overrides.id ?? "item-1",
    title: overrides.title ?? "Test Idea",
    description: overrides.description ?? "A test idea",
    sourceAngle: overrides.sourceAngle ?? "scamper",
    stage: overrides.stage ?? "ideation",
    transitions: [],
    createdAt: new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    tags: overrides.tags ?? [],
    impactScore: overrides.impactScore ?? 5,
    ...overrides,
  };
}

describe("portfolio/strategic-intelligence", () => {
  beforeEach(() => {
    clearStrategicGoals();
  });

  describe("classifyHorizon", () => {
    it("classifies core items as h1", () => {
      const item = makeItem({ title: "Improve existing search" });
      expect(classifyHorizon(item)).toBe("h1-core");
    });

    it("classifies adjacent items as h2", () => {
      const item = makeItem({ tags: ["adjacent", "new-market"] });
      expect(classifyHorizon(item)).toBe("h2-adjacent");
    });

    it("classifies transformational items as h3", () => {
      const item = makeItem({ title: "Moonshot quantum computing idea" });
      expect(classifyHorizon(item)).toBe("h3-transformational");
    });
  });

  describe("buildBalancedScorecard", () => {
    it("builds scorecard for empty portfolio", () => {
      const scorecard = buildBalancedScorecard([]);
      expect(scorecard.horizons["h1-core"].count).toBe(0);
      expect(scorecard.horizons["h2-adjacent"].count).toBe(0);
      expect(scorecard.horizons["h3-transformational"].count).toBe(0);
    });

    it("calculates horizon distribution", () => {
      const items = [
        makeItem({ id: "1", title: "Core improvement A" }),
        makeItem({ id: "2", title: "Core improvement B" }),
        makeItem({ id: "3", tags: ["adjacent"] }),
      ];
      const scorecard = buildBalancedScorecard(items);
      expect(scorecard.horizons["h1-core"].count).toBe(2);
      expect(scorecard.horizons["h2-adjacent"].count).toBe(1);
    });

    it("reports overall balance score", () => {
      const scorecard = buildBalancedScorecard([makeItem()]);
      expect(scorecard.overallBalance).toBeGreaterThanOrEqual(0);
      expect(scorecard.overallBalance).toBeLessThanOrEqual(1);
    });
  });

  describe("strategicAlignment", () => {
    it("scores alignment against goals", () => {
      addStrategicGoal({
        name: "Improve customer experience",
        description: "Make the product easier to use",
        weight: 0.8,
        horizon: "h1-core",
      });
      const item = makeItem({
        title: "Improve customer onboarding experience",
        description: "Better UX for new customers",
      });
      const alignment = scoreStrategicAlignment(item);
      expect(alignment.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(alignment.goalAlignments).toHaveLength(1);
    });

    it("returns zero alignment with no goals", () => {
      const item = makeItem();
      const alignment = scoreStrategicAlignment(item);
      expect(alignment.alignmentScore).toBe(0);
      expect(alignment.goalAlignments).toHaveLength(0);
    });
  });

  describe("simulatePortfolioRisk", () => {
    it("runs Monte Carlo simulation", () => {
      const items = [
        makeItem({ id: "1", impactScore: 8, stage: "prototyping" }),
        makeItem({ id: "2", impactScore: 5, stage: "ideation" }),
      ];
      const result = simulatePortfolioRisk(items, { simulations: 500 });
      expect(result.simulations).toBe(500);
      expect(result.expectedValue).toBeGreaterThan(0);
      expect(result.successProbability).toBeGreaterThan(0);
      expect(result.valueAtRisk95).toBeDefined();
    });

    it("handles empty portfolio", () => {
      const result = simulatePortfolioRisk([], { simulations: 100 });
      expect(result.expectedValue).toBe(0);
    });
  });

  describe("rebalancingRecommendations", () => {
    it("recommends adding to underrepresented horizons", () => {
      const items = Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: `item-${i}`, title: `Core idea ${i}` })
      );
      const recs = generateRebalancingRecommendations(items);
      expect(recs.some((r) => r.horizon === "h2-adjacent")).toBe(true);
    });

    it("flags stalled items", () => {
      const staleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const items = [
        makeItem({ id: "stale", title: "Stale idea", stage: "evaluation", updatedAt: staleDate }),
      ];
      const recs = generateRebalancingRecommendations(items);
      expect(recs.some((r) => r.type === "accelerate")).toBe(true);
    });
  });

  describe("buildPortfolioBubbleChart", () => {
    it("generates bubble chart data", () => {
      const items = [
        makeItem({ id: "1", title: "Core idea", impactScore: 8, stage: "prototyping" }),
        makeItem({
          id: "2",
          title: "Moonshot project",
          impactScore: 9,
          stage: "ideation",
          tags: ["transformational"],
        }),
      ];
      const bubbles = buildPortfolioBubbleChart(items);
      expect(bubbles).toHaveLength(2);
      expect(bubbles[0].x).toBe(8); // impact
      expect(bubbles[0].y).toBe(0.6); // prototyping progress
      expect(bubbles[0].size).toBeGreaterThan(0);
      expect(bubbles[0].color).toBeDefined();
    });
  });

  describe("generateBoardReport", () => {
    it("generates markdown board report", () => {
      const items = [
        makeItem({ id: "1", impactScore: 8, stage: "prototyping" }),
        makeItem({ id: "2", impactScore: 6, stage: "ideation" }),
        makeItem({ id: "3", impactScore: 4, stage: "shipped" }),
      ];
      const report = generateBoardReport(items, { title: "Q2 Innovation Review" });
      expect(report).toContain("Q2 Innovation Review");
      expect(report).toContain("Portfolio Overview");
      expect(report).toContain("Horizon Distribution");
      expect(report).toContain("Total Innovation Tracks | 3");
    });
  });
});
