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
});
