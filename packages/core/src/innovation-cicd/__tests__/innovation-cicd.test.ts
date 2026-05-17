import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  generateBadgeUrl,
  generateBadgeMarkdown,
  getInnovationTrend,
  getRepositoryScores,
  clearScoreHistory,
  prScoreToMarkdown,
  trendToMarkdown,
  InnovationScoreSchema,
  PRScoreResultSchema,
  TrendPointSchema,
  InnovationTrendSchema,
  type PRScoreResult,
  type InnovationScore,
} from "../index.js";

function makePRScoreResult(overrides: Partial<PRScoreResult> = {}): PRScoreResult {
  const score: InnovationScore = {
    overall: 75,
    dimensions: { novelty: 80, impact: 70, feasibility: 75, alignment: 72, techDebt: 68 },
    grade: "B",
    highlights: ["Good approach"],
    concerns: ["Needs more tests"],
    suggestions: ["Add integration tests"],
  };
  return {
    id: "prscore-abc12345",
    prNumber: 42,
    prTitle: "Add feature X",
    repository: "acme/repo",
    score,
    badgeUrl: generateBadgeUrl(75, "B"),
    badgeMarkdown: generateBadgeMarkdown(75, "B"),
    summary: "Solid innovation contribution.",
    scoredAt: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("innovation-cicd", () => {
  beforeEach(() => {
    clearScoreHistory();
  });

  // ---- Schema validation ----

  describe("InnovationScoreSchema", () => {
    it("accepts a valid score", () => {
      const result = InnovationScoreSchema.safeParse({
        overall: 85,
        dimensions: { novelty: 90, impact: 80, feasibility: 85, alignment: 82, techDebt: 78 },
        grade: "A",
        highlights: ["Innovative approach"],
        concerns: [],
        suggestions: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects overall > 100", () => {
      const result = InnovationScoreSchema.safeParse({
        overall: 150,
        dimensions: { novelty: 90, impact: 80, feasibility: 85, alignment: 82, techDebt: 78 },
        grade: "A",
        highlights: [],
        concerns: [],
        suggestions: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid grade", () => {
      const result = InnovationScoreSchema.safeParse({
        overall: 85,
        dimensions: { novelty: 90, impact: 80, feasibility: 85, alignment: 82, techDebt: 78 },
        grade: "X",
        highlights: [],
        concerns: [],
        suggestions: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative dimension scores", () => {
      const result = InnovationScoreSchema.safeParse({
        overall: 85,
        dimensions: { novelty: -5, impact: 80, feasibility: 85, alignment: 82, techDebt: 78 },
        grade: "A",
        highlights: [],
        concerns: [],
        suggestions: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("PRScoreResultSchema", () => {
    it("accepts a valid PR score result", () => {
      const result = PRScoreResultSchema.safeParse(makePRScoreResult());
      expect(result.success).toBe(true);
    });

    it("rejects prNumber < 1", () => {
      const result = PRScoreResultSchema.safeParse(makePRScoreResult({ prNumber: 0 }));
      expect(result.success).toBe(false);
    });
  });

  describe("TrendPointSchema", () => {
    it("accepts a valid trend point", () => {
      const result = TrendPointSchema.safeParse({
        date: "2026-01-15",
        prNumber: 42,
        score: 75,
        grade: "B",
      });
      expect(result.success).toBe(true);
    });
  });

  // ---- Badge generation ----

  describe("generateBadgeUrl", () => {
    it("returns brightgreen for scores >= 85", () => {
      const url = generateBadgeUrl(90, "A");
      expect(url).toContain("brightgreen");
      expect(url).toContain("shields.io");
    });

    it("returns green for scores >= 70", () => {
      expect(generateBadgeUrl(75, "B")).toContain("green");
    });

    it("returns yellow for scores >= 55", () => {
      expect(generateBadgeUrl(60, "C")).toContain("yellow");
    });

    it("returns orange for scores >= 40", () => {
      expect(generateBadgeUrl(45, "D")).toContain("orange");
    });

    it("returns red for scores < 40", () => {
      expect(generateBadgeUrl(30, "F")).toContain("red");
    });

    it("encodes grade and score in URL", () => {
      const url = generateBadgeUrl(85, "A");
      expect(url).toContain("A");
      expect(url).toContain("85");
    });
  });

  describe("generateBadgeMarkdown", () => {
    it("returns markdown image syntax", () => {
      const md = generateBadgeMarkdown(85, "A");
      expect(md).toMatch(/^!\[Innovation Score\]/);
      expect(md).toContain("shields.io");
    });
  });

  // ---- Trend tracking ----

  describe("getInnovationTrend", () => {
    it("returns empty trend for unknown repository", () => {
      const trend = getInnovationTrend("unknown/repo");
      expect(trend.repository).toBe("unknown/repo");
      expect(trend.dataPoints).toHaveLength(0);
      expect(trend.averageScore).toBe(0);
      expect(trend.trend).toBe("stable");
      expect(trend.trendSlope).toBe(0);
    });

    it("validates against InnovationTrendSchema", () => {
      const trend = getInnovationTrend("test/repo");
      const result = InnovationTrendSchema.safeParse(trend);
      expect(result.success).toBe(true);
    });
  });

  describe("getRepositoryScores", () => {
    it("returns empty array for unknown repository", () => {
      expect(getRepositoryScores("unknown/repo")).toEqual([]);
    });
  });

  describe("clearScoreHistory", () => {
    it("clears all stored scores", () => {
      clearScoreHistory();
      expect(getRepositoryScores("any/repo")).toEqual([]);
    });
  });

  // ---- Markdown generation ----

  describe("prScoreToMarkdown", () => {
    it("generates markdown with all sections", () => {
      const md = prScoreToMarkdown(makePRScoreResult());
      expect(md).toContain("## 💡 Innovation Score: B (75/100)");
      expect(md).toContain("| Novelty | 80 |");
      expect(md).toContain("| Impact | 70 |");
      expect(md).toContain("### Summary");
      expect(md).toContain("Solid innovation contribution.");
      expect(md).toContain("### Highlights");
      expect(md).toContain("✨ Good approach");
      expect(md).toContain("### Concerns");
      expect(md).toContain("⚠️ Needs more tests");
      expect(md).toContain("### Suggestions");
      expect(md).toContain("💡 Add integration tests");
    });

    it("omits sections with empty arrays", () => {
      const result = makePRScoreResult();
      result.score.highlights = [];
      result.score.concerns = [];
      result.score.suggestions = [];
      const md = prScoreToMarkdown(result);
      expect(md).not.toContain("### Highlights");
      expect(md).not.toContain("### Concerns");
      expect(md).not.toContain("### Suggestions");
    });

    it("includes badge markdown", () => {
      const md = prScoreToMarkdown(makePRScoreResult());
      expect(md).toContain("![Innovation Score]");
    });
  });

  describe("trendToMarkdown", () => {
    it("generates markdown for empty trend", () => {
      const trend = getInnovationTrend("test/repo");
      const md = trendToMarkdown(trend);
      expect(md).toContain("## Innovation Trend: test/repo");
      expect(md).toContain("**Average:** 0");
      expect(md).toContain("➡️ stable");
      expect(md).toContain("No data points.");
    });

    it("shows improving icon for improving trend", () => {
      const trend = getInnovationTrend("test/repo");
      trend.trend = "improving";
      const md = trendToMarkdown(trend);
      expect(md).toContain("📈 improving");
    });

    it("shows declining icon for declining trend", () => {
      const trend = getInnovationTrend("test/repo");
      trend.trend = "declining";
      const md = trendToMarkdown(trend);
      expect(md).toContain("📉 declining");
    });

    it("renders data points table", () => {
      const trend = getInnovationTrend("test/repo");
      trend.dataPoints = [
        { date: "2026-01-10T00:00:00Z", prNumber: 10, score: 70, grade: "B" },
        { date: "2026-01-15T00:00:00Z", prNumber: 15, score: 80, grade: "B+" },
      ];
      const md = trendToMarkdown(trend);
      expect(md).toContain("| #10 | 70 | B |");
      expect(md).toContain("| #15 | 80 | B+ |");
    });
  });
});
