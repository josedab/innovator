import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  registerSearchProvider,
  unregisterSearchProvider,
  listSearchProviders,
  buildValidationContext,
  clearSearchProviders,
  WebSearchResultSchema,
  MarketValidationResultSchema,
  ValidationConfigSchema,
} from "../market-validation/index.js";

beforeEach(() => {
  clearSearchProviders();
});

describe("WebSearchResultSchema", () => {
  it("validates a valid search result", () => {
    const result = {
      title: "AI Healthcare Startup",
      url: "https://example.com/ai-health",
      snippet: "An AI startup focused on healthcare diagnostics",
      source: "web",
      relevanceScore: 0.85,
    };
    const parsed = WebSearchResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("rejects result without title", () => {
    const result = {
      url: "https://example.com",
      snippet: "Missing title",
    };
    const parsed = WebSearchResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });
});

describe("ValidationConfigSchema", () => {
  it("validates a valid config", () => {
    const config = {
      searchProviders: ["google", "arxiv"],
      maxResults: 10,
      includeAcademic: true,
      includePatents: false,
      timeout: 30000,
    };
    const parsed = ValidationConfigSchema.safeParse(config);
    expect(parsed.success).toBe(true);
  });
});

describe("registerSearchProvider", () => {
  it("registers a custom search provider", () => {
    const provider = {
      id: "custom-search",
      name: "Custom Search",
      search: async () => [],
      isAvailable: () => true,
    };
    registerSearchProvider(provider);
    const providers = listSearchProviders();
    expect(providers.some((p) => p.id === "custom-search")).toBe(true);
  });

  it("replaces existing provider with same id", () => {
    const provider1 = {
      id: "dup",
      name: "First",
      search: async () => [],
      isAvailable: () => true,
    };
    const provider2 = {
      id: "dup",
      name: "Second",
      search: async () => [],
      isAvailable: () => true,
    };
    registerSearchProvider(provider1);
    registerSearchProvider(provider2);
    const providers = listSearchProviders();
    const dup = providers.filter((p) => p.id === "dup");
    expect(dup).toHaveLength(1);
    expect(dup[0].name).toBe("Second");
  });
});

describe("unregisterSearchProvider", () => {
  it("removes a registered provider", () => {
    registerSearchProvider({
      id: "to-remove",
      name: "Removable",
      search: async () => [],
      isAvailable: () => true,
    });
    const removed = unregisterSearchProvider("to-remove");
    expect(removed).toBe(true);
    const providers = listSearchProviders();
    expect(providers.some((p) => p.id === "to-remove")).toBe(false);
  });

  it("returns false for non-existent provider", () => {
    const removed = unregisterSearchProvider("nonexistent");
    expect(removed).toBe(false);
  });
});

describe("listSearchProviders", () => {
  it("returns empty array when cleared", () => {
    const providers = listSearchProviders();
    expect(providers).toEqual([]);
  });

  it("returns all registered providers", () => {
    registerSearchProvider({
      id: "p1",
      name: "P1",
      search: async () => [],
      isAvailable: () => true,
    });
    registerSearchProvider({
      id: "p2",
      name: "P2",
      search: async () => [],
      isAvailable: () => true,
    });
    const providers = listSearchProviders();
    expect(providers).toHaveLength(2);
  });
});

describe("buildValidationContext", () => {
  it("builds context from empty results", () => {
    const context = buildValidationContext([]);
    expect(typeof context).toBe("string");
  });

  it("builds context from validation results", () => {
    const results = [
      {
        ideaTitle: "AI diagnostics",
        feasibilityScore: 0.7,
        priorArtFindings: [
          {
            title: "Existing AI tool",
            source: "web",
            url: "https://example.com",
            similarity: 0.7,
            summary: "An existing diagnostic tool",
          },
        ],
        marketOpportunity: "Large untapped market in rural areas",
        competitiveLandscape: {
          directCompetitors: ["CompA"],
          adjacentSolutions: ["SolB"],
          marketGaps: ["No solution for rural areas"],
        },
        validationConfidence: 0.6,
        sources: ["https://example.com"],
      },
    ];
    const context = buildValidationContext(results as never[]);
    expect(typeof context).toBe("string");
    expect(context.length).toBeGreaterThan(0);
  });

  it("includes prior art information in context", () => {
    const results = [
      {
        ideaTitle: "Smart farming",
        feasibilityScore: 0.5,
        priorArtFindings: [
          {
            title: "AgriTech Solution",
            source: "web",
            url: "https://agri.example.com",
            similarity: 0.8,
            summary: "Existing smart farming platform",
          },
        ],
        marketOpportunity: "Growing demand for smart agriculture",
        competitiveLandscape: {
          directCompetitors: ["FarmBot"],
          adjacentSolutions: [],
          marketGaps: [],
        },
        validationConfidence: 0.5,
        sources: ["https://agri.example.com"],
      },
    ];
    const context = buildValidationContext(results as never[]);
    expect(context).toContain("Smart farming");
  });
});

describe("MarketValidationResultSchema", () => {
  it("validates a complete result", () => {
    const result = {
      ideaTitle: "Test idea",
      feasibilityScore: 0.7,
      priorArtFindings: [],
      marketOpportunity: "Growing market",
      competitiveLandscape: {
        directCompetitors: [],
        adjacentSolutions: [],
        marketGaps: [],
      },
      validationConfidence: 0.7,
      sources: [],
    };
    const parsed = MarketValidationResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
