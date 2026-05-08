import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((l: string, c: string) => `[${l}]: ${c}`),
}));

import {
  analyzeAnglePerformance,
  testPatternSignificance,
  generateAutoConfig,
  linkOutcomeToImplementation,
  getImplementationLinks,
  predictIdeaSuccess,
  compareRetrospectives,
  retrospectiveToMarkdown,
  clearRetrospectiveData,
  trackOutcome,
  generateRetrospectiveReport,
} from "../retrospective/index.js";
import type { IdeaOutcome, SuccessPattern, RetrospectiveReport } from "../retrospective/index.js";

// Outcomes with string angle values — passed directly to functions that accept outcomeList
// (bypasses zod validation in trackOutcome which requires z.record(z.number()))
const MOCK_OUTCOMES: IdeaOutcome[] = [
  {
    ideaTitle: "Idea A",
    status: "shipped",
    shippedAt: "2024-01-15",
    timeToShip: 14,
    originalScore: 8,
    metricsAchieved: { angle: "scamper" } as unknown as Record<string, number>,
  },
  {
    ideaTitle: "Idea B",
    status: "shipped",
    shippedAt: "2024-02-10",
    timeToShip: 25,
    originalScore: 7,
    metricsAchieved: { angle: "scamper" } as unknown as Record<string, number>,
  },
  {
    ideaTitle: "Idea C",
    status: "abandoned",
    metricsAchieved: {
      angle: "first-principles",
    } as unknown as Record<string, number>,
    lessonsLearned: ["Too much scope"],
  },
];

function makeLlmReport(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Test summary",
    successPatterns: [],
    failureModes: [],
    recommendations: ["Do better"],
    overallHealthScore: 7,
    topPerformingAngles: ["scamper"],
    ...overrides,
  };
}

function setupLlmMock(report: Record<string, unknown> = makeLlmReport()) {
  const json = JSON.stringify(report);
  mockGenerateText.mockResolvedValue(json);
  mockExtractJson.mockReturnValue(json);
}

describe("retrospective enhanced functions", () => {
  beforeEach(() => {
    clearRetrospectiveData();
    mockGenerateText.mockReset();
    mockExtractJson.mockReset();
  });

  // ---- analyzeAnglePerformance ----

  describe("analyzeAnglePerformance", () => {
    it("returns empty array for empty input", () => {
      expect(analyzeAnglePerformance([])).toEqual([]);
    });

    it("groups outcomes by angle from metricsAchieved", () => {
      const result = analyzeAnglePerformance(MOCK_OUTCOMES);
      const angleIds = result.map((r) => r.angleId);
      expect(angleIds).toContain("scamper");
      expect(angleIds).toContain("first-principles");
    });

    it("computes shipped count and average score", () => {
      const result = analyzeAnglePerformance(MOCK_OUTCOMES);
      const scamper = result.find((r) => r.angleId === "scamper")!;
      expect(scamper.shippedCount).toBe(2);
      expect(scamper.timesUsed).toBe(2);
      expect(scamper.averageScore).toBe(7.5);
      expect(scamper.bestIdeas).toContain("Idea A");
    });

    it("sorts results by shipped count descending", () => {
      const result = analyzeAnglePerformance(MOCK_OUTCOMES);
      expect(result[0].shippedCount).toBeGreaterThanOrEqual(result[1].shippedCount);
    });

    it("extracts angle from lessonsLearned tags when metricsAchieved absent", () => {
      const outcomes: IdeaOutcome[] = [
        {
          ideaTitle: "Tagged Idea",
          status: "shipped",
          lessonsLearned: ["[biomimicry] inspired approach"],
          originalScore: 6,
        },
      ];
      const result = analyzeAnglePerformance(outcomes);
      expect(result[0].angleId).toBe("biomimicry");
    });
  });

  // ---- testPatternSignificance ----

  describe("testPatternSignificance", () => {
    it("returns non-significant for zero frequency", () => {
      const pattern: SuccessPattern = {
        title: "Empty",
        description: "No data",
        frequency: 0,
        exampleIdeas: [],
        applicability: "universal",
      };
      const result = testPatternSignificance(pattern, MOCK_OUTCOMES);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBe(1);
    });

    it("returns non-significant for empty outcomes", () => {
      const pattern: SuccessPattern = {
        title: "Test",
        description: "Test",
        frequency: 3,
        exampleIdeas: [],
        applicability: "universal",
      };
      const result = testPatternSignificance(pattern, []);
      expect(result.chiSquared).toBe(0);
      expect(result.pValue).toBe(1);
      expect(result.significant).toBe(false);
    });

    it("computes chi-squared for a meaningful pattern", () => {
      const outcomes: IdeaOutcome[] = [
        { ideaTitle: "S1", status: "shipped" },
        { ideaTitle: "S2", status: "shipped" },
        { ideaTitle: "F1", status: "abandoned" },
        { ideaTitle: "F2", status: "abandoned" },
        { ideaTitle: "F3", status: "abandoned" },
      ];
      const pattern: SuccessPattern = {
        title: "High score ships",
        description: "Ideas with high scores ship more",
        frequency: 3,
        exampleIdeas: ["S1", "S2"],
        applicability: "universal",
      };
      const result = testPatternSignificance(pattern, outcomes);
      expect(result.chiSquared).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThan(1);
    });
  });

  // ---- generateAutoConfig ----

  describe("generateAutoConfig", () => {
    it("returns config with angle weights from outcomes", async () => {
      const result = await generateAutoConfig(MOCK_OUTCOMES);
      expect(result.angleWeights).toBeDefined();
      expect(result.generatedAt).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(Object.keys(result.angleWeights)).toContain("scamper");
    });

    it("returns empty config for no outcomes", async () => {
      const result = await generateAutoConfig([]);
      expect(Object.keys(result.angleWeights)).toHaveLength(0);
      expect(result.modelPreferences).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it("includes model preferences when model metadata present", async () => {
      const outcomes: IdeaOutcome[] = [
        {
          ideaTitle: "M1",
          status: "shipped",
          metricsAchieved: { model: "gpt-4" } as unknown as Record<string, number>,
        },
        {
          ideaTitle: "M2",
          status: "shipped",
          metricsAchieved: { model: "gpt-4" } as unknown as Record<string, number>,
        },
        {
          ideaTitle: "M3",
          status: "abandoned",
          metricsAchieved: { model: "gpt-3" } as unknown as Record<string, number>,
        },
      ];
      const result = await generateAutoConfig(outcomes);
      expect(result.modelPreferences).toContain("gpt-4");
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  // ---- linkOutcomeToImplementation / getImplementationLinks ----

  describe("linkOutcomeToImplementation", () => {
    it("links implementation details and retrieves them", () => {
      const link = linkOutcomeToImplementation("Link Test A", {
        repo: "owner/repo",
        pr: "#42",
        commitHash: "abc123",
      });
      expect(link.ideaTitle).toBe("Link Test A");
      expect(link.repo).toBe("owner/repo");
      expect(link.linkedAt).toBeDefined();

      const links = getImplementationLinks("Link Test A");
      expect(links).toHaveLength(1);
      expect(links[0].pr).toBe("#42");
    });

    it("supports multiple links for the same idea", () => {
      linkOutcomeToImplementation("Link Test B", { repo: "repo1" });
      linkOutcomeToImplementation("Link Test B", { repo: "repo2" });
      expect(getImplementationLinks("Link Test B")).toHaveLength(2);
    });
  });

  describe("getImplementationLinks", () => {
    it("returns empty array for unknown idea", () => {
      expect(getImplementationLinks("nonexistent-idea-xyz")).toEqual([]);
    });
  });

  // ---- predictIdeaSuccess ----

  describe("predictIdeaSuccess", () => {
    it("returns prediction with base rate when no data exists", () => {
      const result = predictIdeaSuccess("New Idea", 7, "scamper");
      expect(result.ideaTitle).toBe("New Idea");
      expect(result.predictedShipProbability).toBe(0.5);
      expect(result.basedOnSampleSize).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("returns high expected impact for score >= 8", () => {
      trackOutcome({ ideaTitle: "S1", status: "shipped", originalScore: 9 });
      const result = predictIdeaSuccess("High Score", 9, "any");
      expect(result.expectedImpact).toBe("high");
    });

    it("returns low expected impact for score < 5", () => {
      trackOutcome({ ideaTitle: "S2", status: "abandoned", originalScore: 3 });
      const result = predictIdeaSuccess("Low Score", 3, "any");
      expect(result.expectedImpact).toBe("low");
    });

    it("adjusts probability based on tracked outcomes", () => {
      trackOutcome({ ideaTitle: "T1", status: "shipped", originalScore: 7, timeToShip: 10 });
      trackOutcome({ ideaTitle: "T2", status: "shipped", originalScore: 8, timeToShip: 15 });
      trackOutcome({ ideaTitle: "T3", status: "abandoned", originalScore: 4 });
      const result = predictIdeaSuccess("Predict Me", 7, "unknown-angle");
      expect(result.predictedShipProbability).toBeGreaterThan(0);
      expect(result.basedOnSampleSize).toBe(3);
    });
  });

  // ---- compareRetrospectives ----

  describe("compareRetrospectives", () => {
    it("compares two reports and calculates changes", async () => {
      // Generate report A
      trackOutcome({ ideaTitle: "RA1", status: "shipped", originalScore: 6 });
      setupLlmMock(makeLlmReport({ overallHealthScore: 5 }));
      const reportA = await generateRetrospectiveReport("Q1-2024");

      // Generate report B with better health (don't clear — reports map must keep reportA)
      trackOutcome({ ideaTitle: "RB1", status: "shipped", originalScore: 9 });
      setupLlmMock(
        makeLlmReport({
          overallHealthScore: 8,
          successPatterns: [
            {
              title: "New Pattern",
              description: "Emerged in Q2",
              frequency: 2,
              exampleIdeas: ["RB1"],
              applicability: "universal",
            },
          ],
        })
      );
      const reportB = await generateRetrospectiveReport("Q2-2024");

      const comparison = compareRetrospectives(reportA.id, reportB.id);
      expect(comparison.healthScoreChange).toBe(3);
      expect(comparison.reportIdA).toBe(reportA.id);
      expect(comparison.reportIdB).toBe(reportB.id);
      expect(comparison.newPatterns).toContain("New Pattern");
      expect(comparison.summary).toContain("improved");
    });

    it("throws for missing report ID", () => {
      expect(() => compareRetrospectives("missing-a", "missing-b")).toThrow(
        "Report not found: missing-a"
      );
    });
  });

  // ---- retrospectiveToMarkdown ----

  describe("retrospectiveToMarkdown", () => {
    it("exports a full report as markdown", () => {
      const report: RetrospectiveReport = {
        id: "retro-1",
        period: "Q1-2024",
        generatedAt: "2024-04-01T00:00:00Z",
        summary: "Good quarter overall.",
        totalIdeasTracked: 10,
        successPatterns: [
          {
            title: "Fast Iteration",
            description: "Quick prototyping leads to shipping",
            frequency: 3,
            exampleIdeas: ["Idea X"],
            applicability: "universal",
          },
        ],
        failureModes: [
          {
            title: "Scope Creep",
            description: "Features grew too large",
            frequency: 2,
            rootCause: "No clear boundaries",
            prevention: "Define MVP upfront",
            exampleIdeas: ["Idea Y"],
          },
        ],
        velocityTrends: [
          {
            period: "Jan 2024",
            ideasGenerated: 5,
            ideasShipped: 3,
            successRate: 0.6,
            innovationScore: 7,
            averageTimeToShip: 12.5,
          },
        ],
        diminishingReturns: [
          {
            detected: true,
            area: "Brainstorming",
            description: "Diminishing returns detected",
            recommendation: "Try different angles",
            confidenceLevel: 0.8,
          },
        ],
        topPerformingAngles: ["scamper"],
        recommendations: ["Focus on quick wins"],
        overallHealthScore: 7,
      };

      const md = retrospectiveToMarkdown(report);
      expect(md).toContain("# Retrospective Report: Q1-2024");
      expect(md).toContain("**Health Score:** 7/10");
      expect(md).toContain("## Success Patterns");
      expect(md).toContain("### Fast Iteration");
      expect(md).toContain("## Failure Modes");
      expect(md).toContain("### Scope Creep");
      expect(md).toContain("## Velocity Trends");
      expect(md).toContain("60.0%");
      expect(md).toContain("## Diminishing Returns Alerts");
      expect(md).toContain("## Recommendations");
      expect(md).toContain("1. Focus on quick wins");
      expect(md).toContain("## Top Performing Angles");
      expect(md).toContain("- scamper");
    });

    it("handles minimal report without optional sections", () => {
      const report: RetrospectiveReport = {
        id: "retro-min",
        period: "Q2-2024",
        generatedAt: "2024-07-01T00:00:00Z",
        summary: "Minimal period.",
        totalIdeasTracked: 0,
        successPatterns: [],
        failureModes: [],
        velocityTrends: [],
        diminishingReturns: [],
        topPerformingAngles: [],
        recommendations: [],
        overallHealthScore: 5,
      };

      const md = retrospectiveToMarkdown(report);
      expect(md).toContain("# Retrospective Report: Q2-2024");
      expect(md).toContain("Minimal period.");
      expect(md).not.toContain("## Success Patterns");
      expect(md).not.toContain("## Failure Modes");
      expect(md).not.toContain("## Velocity Trends");
    });
  });
});
