import { describe, it, expect, beforeEach } from "vitest";
import {
  enrichIdeaHeuristic,
  enrichIdea,
  enrichIdeas,
  enrichmentToMarkdown,
  registerEnrichmentProvider,
  clearEnrichmentProviders,
} from "../enrichment/index.js";
import type { EnrichmentProvider, EvidenceItem } from "../enrichment/index.js";

describe("enrichment", () => {
  beforeEach(() => {
    clearEnrichmentProviders();
  });

  describe("enrichIdeaHeuristic", () => {
    it("enriches with trend keywords detected", () => {
      const result = enrichIdeaHeuristic(
        "AI-Powered Code Analysis",
        "Use machine learning and cloud computing to analyze code patterns"
      );
      expect(result.ideaTitle).toBe("AI-Powered Code Analysis");
      expect(result.trendScore).toBeGreaterThan(0);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.marketSize).toBeDefined();
      expect(result.enrichedAt).toBeTruthy();
    });

    it("handles ideas without trending keywords", () => {
      const result = enrichIdeaHeuristic("Simple Widget", "A basic widget for display");
      expect(result.trendScore).toBeLessThan(50);
      expect(result.competitiveLandscape).toBeDefined();
    });

    it("includes market sizing", () => {
      const result = enrichIdeaHeuristic("SaaS Platform", "A cloud platform for analytics");
      expect(result.marketSize).toBeDefined();
      expect(result.marketSize!.tam).toBeTruthy();
      expect(result.marketSize!.sam).toBeTruthy();
      expect(result.marketSize!.som).toBeTruthy();
    });
  });

  describe("enrichIdea with providers", () => {
    it("uses registered providers", async () => {
      const mockProvider: EnrichmentProvider = {
        id: "test-provider",
        name: "Test Provider",
        type: "trend",
        isAvailable: () => true,
        fetchEvidence: async (query) => [{
          source: "Test",
          type: "trend" as const,
          title: `Trend for ${query.slice(0, 20)}`,
          summary: "A test trend",
          relevanceScore: 0.8,
          retrievedAt: new Date().toISOString(),
        }],
      };

      registerEnrichmentProvider(mockProvider);
      const result = await enrichIdea("AI Tool", "An AI-powered tool");
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence[0].source).toBe("Test");
    });

    it("falls back to heuristic without providers", async () => {
      const result = await enrichIdea("Simple Idea", "A simple description");
      expect(result.enrichedAt).toBeTruthy();
      expect(result.competitiveLandscape).toBeDefined();
    });
  });

  describe("enrichIdeas batch", () => {
    it("enriches multiple ideas", async () => {
      const results = await enrichIdeas([
        { title: "Idea 1", description: "Description 1" },
        { title: "Idea 2", description: "Description 2" },
      ]);
      expect(results).toHaveLength(2);
    });
  });

  describe("enrichmentToMarkdown", () => {
    it("generates markdown report", () => {
      const enriched = enrichIdeaHeuristic("AI Tool", "An AI-powered cloud tool");
      const md = enrichmentToMarkdown(enriched);
      expect(md).toContain("# Enrichment Report");
      expect(md).toContain("AI Tool");
      expect(md).toContain("Trend Score");
    });
  });
});
