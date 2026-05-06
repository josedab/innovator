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
  clearCompetitiveAnalyses,
  listCompetitiveAnalyses,
  getCompetitiveAnalysis,
  rankGaps,
  rankStrategies,
  generatePositioningMatrix,
  createMonitor,
  getMonitor,
  listMonitors,
  deleteMonitor,
  recordCompetitiveSignal,
  getSignals,
  detectTrends,
  generateInvestigationSuggestions,
  clearMonitoring,
} from "../competitive/index.js";
import type {
  CompetitiveAnalysis,
  CompetitiveGap,
  DifferentiationStrategy,
} from "../competitive/index.js";

function makeAnalysis(overrides: Partial<CompetitiveAnalysis> = {}): CompetitiveAnalysis {
  return {
    subject: "AI-powered project management",
    competitors: [
      {
        name: "Competitor A",
        description: "Enterprise PM tool",
        strengths: ["market share", "brand recognition", "integrations"],
        weaknesses: ["slow innovation"],
        keyProducts: ["PM Suite"],
        targetMarket: "Enterprise",
        estimatedSize: "large",
      },
      {
        name: "Competitor B",
        description: "Startup PM tool",
        strengths: ["UX"],
        weaknesses: ["limited features", "small team", "no enterprise support"],
        keyProducts: ["Simple PM"],
        targetMarket: "SMB",
        estimatedSize: "startup",
      },
    ],
    gaps: [
      {
        title: "AI-native workflows",
        description: "No competitor has AI-first workflows",
        gap_type: "feature",
        opportunity_size: "large",
        difficulty: "moderate",
        timeToCapture: "months",
      },
      {
        title: "Developer integration",
        description: "Poor GitHub/GitLab integration",
        gap_type: "technology",
        opportunity_size: "medium",
        difficulty: "easy",
        timeToCapture: "weeks",
      },
    ],
    strategies: [
      {
        title: "AI-first differentiation",
        description: "Build AI into every workflow",
        type: "technology-moat",
        competitorsTargeted: ["Competitor A"],
        requiredCapabilities: ["ML team"],
        riskLevel: "medium",
        expectedImpact: "transformative",
      },
      {
        title: "Developer focus",
        description: "Target developers specifically",
        type: "niche-focus",
        competitorsTargeted: ["Competitor A", "Competitor B"],
        requiredCapabilities: ["API"],
        riskLevel: "low",
        expectedImpact: "significant",
      },
    ],
    flankingOpportunities: [
      {
        title: "Open source core",
        description: "Release core as OSS",
        targetSegment: "Developer community",
        approach: "Open source with premium features",
        competitorBlindSpot: "All competitors are closed-source",
        winProbability: 0.6,
      },
    ],
    marketPositionSummary:
      "Market is dominated by legacy tools with opportunity for AI disruption.",
    recommendedActions: ["Build AI workflows", "Target developers"],
    ...overrides,
  };
}

describe("competitive", () => {
  beforeEach(() => {
    clearCompetitiveAnalyses();
    clearMonitoring();
  });

  describe("store operations", () => {
    it("starts empty", () => {
      expect(listCompetitiveAnalyses()).toHaveLength(0);
    });

    it("returns undefined for unknown analysis", () => {
      expect(getCompetitiveAnalysis("unknown")).toBeUndefined();
    });
  });

  describe("rankGaps", () => {
    it("ranks gaps by opportunity score", () => {
      const gaps: CompetitiveGap[] = [
        {
          title: "Small hard",
          description: "d",
          gap_type: "feature",
          opportunity_size: "small",
          difficulty: "very-hard",
          timeToCapture: "years",
        },
        {
          title: "Large easy",
          description: "d",
          gap_type: "market",
          opportunity_size: "large",
          difficulty: "easy",
          timeToCapture: "weeks",
        },
        {
          title: "Medium moderate",
          description: "d",
          gap_type: "pricing",
          opportunity_size: "medium",
          difficulty: "moderate",
          timeToCapture: "months",
        },
      ];
      const ranked = rankGaps(gaps);
      expect(ranked[0].title).toBe("Large easy");
      expect(ranked[ranked.length - 1].title).toBe("Small hard");
    });

    it("handles empty array", () => {
      expect(rankGaps([])).toHaveLength(0);
    });
  });

  describe("rankStrategies", () => {
    it("ranks strategies by impact and risk", () => {
      const strategies: DifferentiationStrategy[] = [
        {
          title: "Low risk, transformative",
          description: "d",
          type: "technology-moat",
          competitorsTargeted: [],
          requiredCapabilities: [],
          riskLevel: "low",
          expectedImpact: "transformative",
        },
        {
          title: "High risk, incremental",
          description: "d",
          type: "cost-leadership",
          competitorsTargeted: [],
          requiredCapabilities: [],
          riskLevel: "high",
          expectedImpact: "incremental",
        },
      ];
      const ranked = rankStrategies(strategies);
      expect(ranked[0].title).toBe("Low risk, transformative");
    });
  });

  describe("generatePositioningMatrix", () => {
    it("generates matrix from analysis", () => {
      const analysis = makeAnalysis();
      const matrix = generatePositioningMatrix(analysis);
      expect(matrix).toHaveLength(2);
      expect(matrix[0].competitor).toBe("Competitor A");
      expect(matrix[0].threatLevel).toBe("high"); // 3 strengths vs 1 weakness
      expect(matrix[1].threatLevel).toBe("low"); // 1 strength vs 3 weaknesses
    });

    it("handles competitor with equal strengths and weaknesses", () => {
      const analysis = makeAnalysis({
        competitors: [
          {
            name: "Equal",
            description: "Equal",
            strengths: ["s1", "s2"],
            weaknesses: ["w1", "w2"],
            keyProducts: [],
            targetMarket: "All",
          },
        ],
      });
      const matrix = generatePositioningMatrix(analysis);
      expect(matrix[0].threatLevel).toBe("low");
    });
  });

  describe("monitor CRUD", () => {
    it("creates a monitor with generated ID", () => {
      const monitor = createMonitor({
        domain: "fintech",
        competitors: ["CompA"],
        keywords: ["payments"],
        enabled: true,
        frequency: "daily",
      });
      expect(monitor.id).toMatch(/^monitor-/);
      expect(monitor.domain).toBe("fintech");
      expect(monitor.nextRunAt).toBeDefined();
    });

    it("getMonitor retrieves by ID", () => {
      const monitor = createMonitor({
        domain: "ai",
        competitors: [],
        keywords: [],
        enabled: true,
        frequency: "hourly",
      });
      expect(getMonitor(monitor.id)).toBe(monitor);
    });

    it("getMonitor returns undefined for unknown ID", () => {
      expect(getMonitor("unknown-id")).toBeUndefined();
    });

    it("listMonitors returns all monitors", () => {
      createMonitor({
        domain: "a",
        competitors: [],
        keywords: [],
        enabled: true,
        frequency: "daily",
      });
      createMonitor({
        domain: "b",
        competitors: [],
        keywords: [],
        enabled: true,
        frequency: "weekly",
      });
      expect(listMonitors()).toHaveLength(2);
    });

    it("deleteMonitor removes and returns true", () => {
      const monitor = createMonitor({
        domain: "d",
        competitors: [],
        keywords: [],
        enabled: true,
        frequency: "daily",
      });
      expect(deleteMonitor(monitor.id)).toBe(true);
      expect(getMonitor(monitor.id)).toBeUndefined();
    });

    it("deleteMonitor returns false for non-existent", () => {
      expect(deleteMonitor("non-existent")).toBe(false);
    });
  });

  describe("recordCompetitiveSignal", () => {
    it("records a signal with generated ID and timestamp", () => {
      const signal = recordCompetitiveSignal({
        source: "news",
        title: "CompA launches new product",
        description: "A new product launch",
        relevanceScore: 0.8,
        domain: "fintech",
        competitor: "CompA",
        signalType: "new-product",
      });
      expect(signal.id).toMatch(/^signal-/);
      expect(signal.detectedAt).toBeDefined();
    });

    it("deduplicates signals with same title and source", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "Same Title",
        description: "D1",
        relevanceScore: 0.5,
        signalType: "trend",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "Same Title",
        description: "D2",
        relevanceScore: 0.6,
        signalType: "trend",
      });
      const signals = getSignals();
      expect(signals).toHaveLength(1);
    });

    it("allows same title from different sources", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "Title",
        description: "D",
        relevanceScore: 0.5,
        signalType: "trend",
      });
      recordCompetitiveSignal({
        source: "patent",
        title: "Title",
        description: "D",
        relevanceScore: 0.5,
        signalType: "trend",
      });
      expect(getSignals()).toHaveLength(2);
    });
  });

  describe("getSignals", () => {
    beforeEach(() => {
      recordCompetitiveSignal({
        source: "news",
        title: "Signal1",
        description: "D",
        relevanceScore: 0.9,
        domain: "fintech",
        signalType: "new-product",
      });
      recordCompetitiveSignal({
        source: "patent",
        title: "Signal2",
        description: "D",
        relevanceScore: 0.3,
        domain: "ai",
        signalType: "funding",
      });
    });

    it("returns all signals when no filter", () => {
      expect(getSignals()).toHaveLength(2);
    });

    it("filters by domain", () => {
      const filtered = getSignals({ domain: "fintech" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe("Signal1");
    });

    it("filters by source", () => {
      const filtered = getSignals({ source: "patent" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe("Signal2");
    });

    it("filters by minRelevance", () => {
      const filtered = getSignals({ minRelevance: 0.5 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].relevanceScore).toBeGreaterThanOrEqual(0.5);
    });

    it("respects limit", () => {
      const filtered = getSignals({ limit: 1 });
      expect(filtered).toHaveLength(1);
    });

    it("returns empty with no matching filters", () => {
      expect(getSignals({ domain: "nonexistent" })).toHaveLength(0);
    });
  });

  describe("detectTrends", () => {
    it("groups signals by type and returns trends", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "T1",
        description: "D",
        relevanceScore: 0.5,
        signalType: "new-product",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "T2",
        description: "D",
        relevanceScore: 0.5,
        signalType: "new-product",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "T3",
        description: "D",
        relevanceScore: 0.5,
        signalType: "funding",
      });

      const trends = detectTrends();
      expect(trends.length).toBeGreaterThanOrEqual(2);
      const productTrend = trends.find((t) => t.trend === "new-product");
      expect(productTrend!.signalCount).toBe(2);
    });

    it("detects 'rising' direction for recent signals", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "T1",
        description: "D",
        relevanceScore: 0.5,
        signalType: "trend",
      });
      const trends = detectTrends();
      const t = trends.find((t) => t.trend === "trend");
      // All signals are recent, so recentCount > olderCount → rising
      expect(t!.direction).toBe("rising");
    });

    it("filters by domain", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "T1",
        description: "D",
        relevanceScore: 0.5,
        domain: "fintech",
        signalType: "new-product",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "T2",
        description: "D",
        relevanceScore: 0.5,
        domain: "ai",
        signalType: "funding",
      });
      const trends = detectTrends("fintech");
      expect(trends).toHaveLength(1);
    });

    it("returns empty for no signals", () => {
      expect(detectTrends()).toHaveLength(0);
    });
  });

  describe("generateInvestigationSuggestions", () => {
    it("generates suggestions from signals", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "New AI tool",
        description: "D",
        relevanceScore: 0.8,
        signalType: "new-product",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "Funding round",
        description: "D",
        relevanceScore: 0.7,
        signalType: "funding",
      });

      const suggestions = generateInvestigationSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("respects limit parameter", () => {
      recordCompetitiveSignal({
        source: "news",
        title: "T1",
        description: "D",
        relevanceScore: 0.8,
        signalType: "new-product",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "T2",
        description: "D",
        relevanceScore: 0.8,
        signalType: "market-entry",
        competitor: "CompA",
        domain: "ai",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "T3",
        description: "D",
        relevanceScore: 0.8,
        signalType: "trend",
      });

      const suggestions = generateInvestigationSuggestions(undefined, 2);
      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it("returns empty when no relevant signals", () => {
      expect(generateInvestigationSuggestions()).toHaveLength(0);
    });
  });

  describe("clearMonitoring", () => {
    it("clears all monitors and signals", () => {
      createMonitor({
        domain: "d",
        competitors: [],
        keywords: [],
        enabled: true,
        frequency: "daily",
      });
      recordCompetitiveSignal({
        source: "news",
        title: "T",
        description: "D",
        relevanceScore: 0.5,
        signalType: "trend",
      });
      clearMonitoring();
      expect(listMonitors()).toHaveLength(0);
      expect(getSignals()).toHaveLength(0);
    });
  });
});
