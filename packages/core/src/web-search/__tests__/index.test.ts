import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the copilot client to avoid SDK dependency in tests
vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

import {
  registerSearchProvider,
  listSearchProviders,
  clearSearchProviders,
  groundingToMarkdown,
  type WebSearchGrounding,
  type WebSearchProvider,
} from "../index.js";

describe("web-search", () => {
  beforeEach(() => {
    clearSearchProviders();
  });

  describe("provider registry", () => {
    it("should register a search provider", () => {
      const provider: WebSearchProvider = {
        id: "test",
        name: "Test Provider",
        search: async () => [],
      };
      registerSearchProvider(provider);
      expect(listSearchProviders()).toHaveLength(1);
      expect(listSearchProviders()[0].id).toBe("test");
    });

    it("should list empty providers initially", () => {
      expect(listSearchProviders()).toHaveLength(0);
    });

    it("should clear all providers", () => {
      registerSearchProvider({ id: "a", name: "A", search: async () => [] });
      registerSearchProvider({ id: "b", name: "B", search: async () => [] });
      clearSearchProviders();
      expect(listSearchProviders()).toHaveLength(0);
    });
  });

  describe("groundingToMarkdown", () => {
    it("should generate comprehensive markdown report", () => {
      const grounding: WebSearchGrounding = {
        query: "sustainable energy storage",
        searchResults: [],
        priorArt: [
          {
            title: "Flow Battery Patent",
            description: "Similar concept in existing patent",
            similarity: 0.8,
            type: "patent",
          },
        ],
        competitors: [
          {
            name: "Tesla Energy",
            description: "Large-scale battery storage",
            relevance: 0.9,
            strengths: ["Scale", "Brand"],
            gaps: ["Cost", "Flexibility"],
          },
        ],
        marketValidation: {
          growthTrend: "growing",
          demandSignals: ["Government incentives", "Grid modernization"],
          risks: ["Material costs", "Regulatory changes"],
          opportunities: ["Green energy mandates"],
          confidence: 0.75,
        },
        groundedAt: new Date().toISOString(),
      };

      const md = groundingToMarkdown(grounding);
      expect(md).toContain("Web Search Grounding Report");
      expect(md).toContain("Market Validation");
      expect(md).toContain("growing");
      expect(md).toContain("Prior Art");
      expect(md).toContain("Flow Battery Patent");
      expect(md).toContain("Competitive Landscape");
      expect(md).toContain("Tesla Energy");
      expect(md).toContain("Government incentives");
    });

    it("should handle empty sections gracefully", () => {
      const grounding: WebSearchGrounding = {
        query: "test",
        searchResults: [],
        priorArt: [],
        competitors: [],
        marketValidation: {
          growthTrend: "unknown",
          demandSignals: [],
          risks: [],
          opportunities: [],
          confidence: 0,
        },
        groundedAt: new Date().toISOString(),
      };

      const md = groundingToMarkdown(grounding);
      expect(md).toContain("Web Search Grounding Report");
      expect(md).not.toContain("Prior Art");
      expect(md).not.toContain("Competitive Landscape");
    });
  });
});
