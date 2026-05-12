import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  searchPriorArt,
  assessCompetitiveLandscape,
  estimateMarketViability,
  validateIdea,
  validateIdeas,
  generateValidationReport,
  buildValidationContext,
  registerSearchProvider,
  unregisterSearchProvider,
  getSearchProvider,
  getAvailableSearchProviders,
  clearSearchProviders,
  WebSearchProvider,
  AcademicSearchProvider,
  PatentSearchProvider,
  type SearchProvider,
} from "../market-validation/index.js";
import { generateText } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

const mockWithRetry = vi.mocked(withRetry);

describe("market-validation (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSearchProviders();
    // Re-register built-in providers
    registerSearchProvider(WebSearchProvider);
    registerSearchProvider(AcademicSearchProvider);
    registerSearchProvider(PatentSearchProvider);
  });

  describe("search providers", () => {
    it("WebSearchProvider has id google and is available", () => {
      expect(WebSearchProvider.id).toBe("google");
      expect(WebSearchProvider.name).toBe("Web Search");
      expect(WebSearchProvider.isAvailable()).toBe(true);
    });

    it("AcademicSearchProvider has id arxiv and is available", () => {
      expect(AcademicSearchProvider.id).toBe("arxiv");
      expect(AcademicSearchProvider.isAvailable()).toBe(true);
    });

    it("PatentSearchProvider has id patents and is available", () => {
      expect(PatentSearchProvider.id).toBe("patents");
      expect(PatentSearchProvider.isAvailable()).toBe(true);
    });

    it("getSearchProvider returns registered provider", () => {
      const provider = getSearchProvider("google");
      expect(provider).toBeDefined();
      expect(provider?.id).toBe("google");
    });

    it("getSearchProvider returns undefined for unknown id", () => {
      expect(getSearchProvider("unknown")).toBeUndefined();
    });

    it("getAvailableSearchProviders filters by isAvailable", () => {
      const unavailable: SearchProvider = {
        id: "unavailable",
        name: "Unavailable",
        search: async () => [],
        isAvailable: () => false,
      };
      registerSearchProvider(unavailable);
      const available = getAvailableSearchProviders();
      expect(available.every((p) => p.isAvailable())).toBe(true);
      expect(available.some((p) => p.id === "unavailable")).toBe(false);
    });
  });

  describe("searchPriorArt", () => {
    it("returns findings on valid LLM response", async () => {
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          results: [
            { title: "Result 1", url: "https://a.com", snippet: "Snippet 1", source: "Google" },
          ],
        })
      );
      // Second call for prior art analysis
      mockWithRetry
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [
              { title: "Result 1", url: "https://a.com", snippet: "Snippet 1", source: "Google" },
            ],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            findings: [
              {
                title: "Prior Art 1",
                source: "Google",
                url: "https://a.com",
                similarity: 0.75,
                summary: "Similar solution",
              },
            ],
          })
        );

      const findings = await searchPriorArt("AI healthcare", ["google"]);
      expect(Array.isArray(findings)).toBe(true);
    });

    it("returns fallback results when LLM analysis fails", async () => {
      // Search succeeds but analysis fails
      mockWithRetry
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [
              { title: "Result 1", url: "https://a.com", snippet: "Snippet 1", source: "Web" },
            ],
          })
        )
        .mockRejectedValueOnce(new Error("LLM failure"));

      const findings = await searchPriorArt("AI healthcare", ["google"]);
      expect(Array.isArray(findings)).toBe(true);
      // Fallback assigns similarity 0.5
      if (findings.length > 0) {
        expect(findings[0].similarity).toBe(0.5);
      }
    });

    it("returns empty array when no search results found", async () => {
      mockWithRetry.mockResolvedValue(JSON.stringify({ results: [] }));
      const findings = await searchPriorArt("nonexistent", ["google"]);
      expect(findings).toEqual([]);
    });

    it("clamps similarity values to 0-1", async () => {
      mockWithRetry
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [{ title: "R1", url: "https://a.com", snippet: "S1", source: "Google" }],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            findings: [
              { title: "F1", source: "G", similarity: 1.5, summary: "Over max" },
              { title: "F2", source: "G", similarity: -0.5, summary: "Under min" },
            ],
          })
        );

      const findings = await searchPriorArt("test", ["google"]);
      for (const f of findings) {
        expect(f.similarity).toBeGreaterThanOrEqual(0);
        expect(f.similarity).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("assessCompetitiveLandscape", () => {
    it("returns landscape on successful LLM response", async () => {
      mockWithRetry
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [{ title: "C1", url: "https://c.com", snippet: "Competitor", source: "Web" }],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [{ title: "C1", url: "https://c.com", snippet: "Competitor", source: "Web" }],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [{ title: "C1", url: "https://c.com", snippet: "Competitor", source: "Web" }],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            directCompetitors: ["Competitor A"],
            adjacentSolutions: ["Solution B"],
            marketGaps: ["Gap 1"],
            estimatedMarketSize: "$1B",
          })
        );

      const landscape = await assessCompetitiveLandscape("AI Healthcare", ["Diagnostics tool"]);
      expect(landscape).toMatchObject({
        directCompetitors: expect.any(Array),
        adjacentSolutions: expect.any(Array),
        marketGaps: expect.any(Array),
      });
    });

    it("returns empty arrays on LLM failure", async () => {
      mockWithRetry.mockRejectedValue(new Error("LLM failure"));
      const landscape = await assessCompetitiveLandscape("test", ["idea"]);
      expect(landscape).toEqual({
        directCompetitors: [],
        adjacentSolutions: [],
        marketGaps: [],
      });
    });
  });

  describe("estimateMarketViability", () => {
    it("returns score 0-1 on success", async () => {
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          feasibilityScore: 0.8,
          marketOpportunity: "Large market",
          confidence: 0.9,
        })
      );

      const result = await estimateMarketViability("AI tool", []);
      expect(result.feasibilityScore).toBeGreaterThanOrEqual(0);
      expect(result.feasibilityScore).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.marketOpportunity).toBe("Large market");
    });

    it("returns fallback on LLM failure", async () => {
      mockWithRetry.mockRejectedValue(new Error("fail"));
      const result = await estimateMarketViability("test", []);
      expect(result.feasibilityScore).toBe(0.5);
      expect(result.confidence).toBe(0);
      expect(result.marketOpportunity).toContain("Unable to assess");
    });

    it("clamps scores to 0-1", async () => {
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          feasibilityScore: 2.0,
          marketOpportunity: "High",
          confidence: -1,
        })
      );
      const result = await estimateMarketViability("test", []);
      expect(result.feasibilityScore).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe("validateIdea", () => {
    it("orchestrates search, viability, and competition analysis", async () => {
      // Mock all LLM calls in sequence
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          results: [{ title: "R1", url: "https://a.com", snippet: "S1", source: "Web" }],
        })
      );
      // Override for analysis steps
      mockWithRetry
        .mockResolvedValueOnce(
          JSON.stringify({
            results: [{ title: "R1", url: "https://a.com", snippet: "S1", source: "Web" }],
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ findings: [] }))
        .mockResolvedValueOnce(JSON.stringify({ results: [] }))
        .mockResolvedValueOnce(
          JSON.stringify({ feasibilityScore: 0.7, marketOpportunity: "Good", confidence: 0.8 })
        )
        .mockResolvedValueOnce(JSON.stringify({ results: [] }))
        .mockResolvedValueOnce(JSON.stringify({ results: [] }))
        .mockResolvedValueOnce(JSON.stringify({ results: [] }))
        .mockResolvedValueOnce(
          JSON.stringify({
            directCompetitors: ["A"],
            adjacentSolutions: [],
            marketGaps: ["Gap"],
          })
        );

      const result = await validateIdea("AI diagnostics", { searchProviders: ["google"] });
      expect(result.ideaTitle).toBe("AI diagnostics");
      expect(result.feasibilityScore).toBeGreaterThanOrEqual(0);
      expect(result.feasibilityScore).toBeLessThanOrEqual(1);
      expect(result.competitiveLandscape).toBeDefined();
    });
  });

  describe("validateIdeas", () => {
    it("batch validates multiple ideas", async () => {
      // Mock all calls to return defaults
      mockWithRetry.mockResolvedValue(JSON.stringify({ results: [] }));

      const results = await validateIdeas(["Idea 1", "Idea 2"], {
        searchProviders: ["google"],
      });
      expect(results).toHaveLength(2);
      expect(results[0].ideaTitle).toBe("Idea 1");
      expect(results[1].ideaTitle).toBe("Idea 2");
    });
  });

  describe("generateValidationReport", () => {
    it("generates a report with markdown assessment", async () => {
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          overallMarketAssessment: "The market is **promising** with several opportunities.",
        })
      );

      const results = [
        {
          ideaTitle: "Test Idea",
          feasibilityScore: 0.7,
          priorArtFindings: [],
          marketOpportunity: "Good",
          competitiveLandscape: {
            directCompetitors: [],
            adjacentSolutions: [],
            marketGaps: [],
          },
          validationConfidence: 0.8,
          sources: [],
        },
      ];

      const report = await generateValidationReport("Test Subject", results);
      expect(report.subject).toBe("Test Subject");
      expect(report.validatedIdeas).toHaveLength(1);
      expect(report.overallMarketAssessment).toContain("promising");
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("returns fallback assessment on LLM failure", async () => {
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const results = [
        {
          ideaTitle: "Test",
          feasibilityScore: 0.6,
          priorArtFindings: [],
          marketOpportunity: "OK",
          competitiveLandscape: {
            directCompetitors: [],
            adjacentSolutions: [],
            marketGaps: [],
          },
          validationConfidence: 0.5,
          sources: [],
        },
      ];

      const report = await generateValidationReport("Subject", results);
      expect(report.overallMarketAssessment).toContain("Validated 1 ideas");
      expect(report.overallMarketAssessment).toContain("0.60");
    });

    it("handles empty results array", async () => {
      mockWithRetry.mockRejectedValue(new Error("fail"));
      const report = await generateValidationReport("Empty", []);
      expect(report.validatedIdeas).toEqual([]);
    });
  });

  describe("buildValidationContext", () => {
    it("returns 'no data' message for empty results", () => {
      expect(buildValidationContext([])).toBe("No market validation data available.");
    });

    it("includes all sections in context output", () => {
      const results = [
        {
          ideaTitle: "Smart Farm",
          feasibilityScore: 0.7,
          priorArtFindings: [
            { title: "AgriTech", source: "web", similarity: 0.8, summary: "Existing platform" },
          ],
          marketOpportunity: "Growing demand",
          competitiveLandscape: {
            directCompetitors: ["FarmBot"],
            adjacentSolutions: [],
            marketGaps: ["Rural coverage"],
          },
          validationConfidence: 0.6,
          sources: [],
        },
      ];
      const context = buildValidationContext(results as never[]);
      expect(context).toContain("MARKET VALIDATION RESULTS");
      expect(context).toContain("Smart Farm");
      expect(context).toContain("0.70");
      expect(context).toContain("FarmBot");
      expect(context).toContain("Rural coverage");
    });
  });
});
