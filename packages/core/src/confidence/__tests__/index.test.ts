import { describe, it, expect, vi } from "vitest";
import {
  meetsConfidenceThreshold,
  formatGapSuggestions,
  ConfidenceScoreSchema,
  type ConfidenceScore,
} from "../index.js";

// ---- Pure function tests (no LLM) ----

function makeConfidenceScore(overrides: Partial<ConfidenceScore> = {}): ConfidenceScore {
  return {
    overallScore: 75,
    dimensions: [
      { name: "Specificity", score: 80, explanation: "Detailed" },
      { name: "Domain Coverage", score: 70, explanation: "Good" },
      { name: "Recency", score: 75, explanation: "Recent" },
      { name: "Actionability", score: 72, explanation: "Actionable" },
      { name: "Depth", score: 78, explanation: "Deep" },
    ],
    gaps: [
      { topic: "Market size", importance: "high", suggestion: "Research TAM" },
      { topic: "Competitors", importance: "critical", suggestion: "Map competitors" },
      { topic: "Tech stack", importance: "low", suggestion: "Review stack" },
      { topic: "Team", importance: "medium", suggestion: "Assess team" },
    ],
    recommendation: "Good investigation overall",
    readyForIdeation: true,
    ...overrides,
  };
}

describe("meetsConfidenceThreshold", () => {
  it("returns true when score meets default threshold", () => {
    const score = makeConfidenceScore({ overallScore: 75 });
    expect(meetsConfidenceThreshold(score)).toBe(true);
  });

  it("returns false when score below default threshold", () => {
    const score = makeConfidenceScore({ overallScore: 50 });
    expect(meetsConfidenceThreshold(score)).toBe(false);
  });

  it("returns true when score equals threshold exactly", () => {
    const score = makeConfidenceScore({ overallScore: 60 });
    expect(meetsConfidenceThreshold(score, 60)).toBe(true);
  });

  it("respects custom threshold", () => {
    const score = makeConfidenceScore({ overallScore: 85 });
    expect(meetsConfidenceThreshold(score, 90)).toBe(false);
    expect(meetsConfidenceThreshold(score, 80)).toBe(true);
  });
});

describe("formatGapSuggestions", () => {
  it("filters to only high and critical importance gaps", () => {
    const score = makeConfidenceScore();
    const suggestions = formatGapSuggestions(score);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toContain("[HIGH]");
    expect(suggestions[1]).toContain("[CRITICAL]");
  });

  it("includes topic and suggestion text", () => {
    const score = makeConfidenceScore();
    const suggestions = formatGapSuggestions(score);
    expect(suggestions[0]).toContain("Market size");
    expect(suggestions[0]).toContain("Research TAM");
  });

  it("returns empty array when no high/critical gaps", () => {
    const score = makeConfidenceScore({
      gaps: [{ topic: "Minor", importance: "low", suggestion: "Optional" }],
    });
    expect(formatGapSuggestions(score)).toEqual([]);
  });
});

describe("ConfidenceScoreSchema", () => {
  it("accepts a valid confidence score", () => {
    const valid = makeConfidenceScore();
    const result = ConfidenceScoreSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects overallScore outside 0-100", () => {
    const invalid = makeConfidenceScore({ overallScore: 150 });
    const result = ConfidenceScoreSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative overallScore", () => {
    const invalid = makeConfidenceScore({ overallScore: -10 });
    const result = ConfidenceScoreSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing readyForIdeation", () => {
    const { readyForIdeation, ...noReady } = makeConfidenceScore();
    const result = ConfidenceScoreSchema.safeParse(noReady);
    expect(result.success).toBe(false);
  });

  it("rejects dimension score above 100", () => {
    const invalid = makeConfidenceScore({
      dimensions: [{ name: "Test", score: 150, explanation: "Bad" }],
    });
    const result = ConfidenceScoreSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ---- Mocked LLM tests ----

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((_label: string, value: string) => value),
}));

describe("scoreInvestigationQuality (mocked LLM)", () => {
  it("parses 5-dimension scores from LLM response", async () => {
    const { generateText } = await import("../../copilot/client.js");
    const mockResponse: ConfidenceScore = {
      overallScore: 72,
      dimensions: [
        { name: "Specificity", score: 75, explanation: "Good" },
        { name: "Domain Coverage", score: 68, explanation: "OK" },
        { name: "Recency", score: 80, explanation: "Current" },
        { name: "Actionability", score: 70, explanation: "Useful" },
        { name: "Depth", score: 65, explanation: "Adequate" },
      ],
      gaps: [],
      recommendation: "Proceed with ideation",
      readyForIdeation: true,
    };
    vi.mocked(generateText).mockResolvedValue(JSON.stringify(mockResponse));

    const { scoreInvestigationQuality } = await import("../index.js");
    const investigation = {
      summary: "Test summary",
      keyAspects: [{ title: "Aspect", description: "Description" }],
      currentState: "Current state",
      challenges: ["Challenge 1"],
      opportunities: ["Opportunity 1"],
    };

    const result = await scoreInvestigationQuality("test subject", investigation);
    expect(result.overallScore).toBe(72);
    expect(result.dimensions).toHaveLength(5);
    expect(result.readyForIdeation).toBe(true);
  });

  it("throws on empty subject", async () => {
    const { scoreInvestigationQuality } = await import("../index.js");
    const investigation = {
      summary: "Test",
      keyAspects: [],
      currentState: "Current",
      challenges: [],
      opportunities: [],
    };

    await expect(scoreInvestigationQuality("", investigation)).rejects.toThrow(
      "Subject cannot be empty"
    );
  });
});
