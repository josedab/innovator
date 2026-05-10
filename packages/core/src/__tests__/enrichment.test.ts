import { describe, it, expect, beforeEach } from "vitest";
import {
  enrichIdeaHeuristic,
  enrichIdea,
  enrichIdeas,
  enrichmentToMarkdown,
  registerEnrichmentProvider,
  unregisterEnrichmentProvider,
  listEnrichmentProviders,
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
      expect(result.trendScore).toBeLessThanOrEqual(100);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.marketSize).toMatchObject({
        tam: expect.any(String),
        sam: expect.any(String),
        som: expect.any(String),
        confidence: expect.stringMatching(/^(low|medium|high)$/),
      });
      expect(result.enrichedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("handles ideas without trending keywords", () => {
      const result = enrichIdeaHeuristic("Simple Widget", "A basic widget for display");
      expect(result.trendScore).toBeLessThan(50);
      expect(["blue-ocean", "emerging", "competitive", "saturated"]).toContain(
        result.competitiveLandscape
      );
    });

    it("includes market sizing with tam/sam/som/confidence", () => {
      const result = enrichIdeaHeuristic("SaaS Platform", "A cloud platform for analytics");
      expect(result.marketSize).toMatchObject({
        tam: expect.stringContaining("$"),
        sam: expect.stringContaining("$"),
        som: expect.stringContaining("$"),
        confidence: "low",
      });
    });

    it("enriches with all trending keywords", () => {
      const result = enrichIdeaHeuristic(
        "AI ML Blockchain IoT",
        "quantum cloud ar vr saas api automation sustainability green"
      );
      expect(result.trendScore).toBeGreaterThan(50);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence[0].type).toBe("trend");
    });

    it("handles empty title and description", () => {
      const result = enrichIdeaHeuristic("", "");
      expect(result.ideaTitle).toBe("");
      expect(result.trendScore).toBeGreaterThanOrEqual(0);
      expect(result.enrichedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("provider registry", () => {
    it("unregisterEnrichmentProvider returns true for existing", () => {
      const provider: EnrichmentProvider = {
        id: "test-prov",
        name: "Test",
        type: "trend",
        isAvailable: () => true,
        fetchEvidence: async () => [],
      };
      registerEnrichmentProvider(provider);
      expect(unregisterEnrichmentProvider("test-prov")).toBe(true);
    });

    it("unregisterEnrichmentProvider returns false for nonexistent", () => {
      expect(unregisterEnrichmentProvider("nonexistent")).toBe(false);
    });

    it("listEnrichmentProviders returns registered providers", () => {
      expect(listEnrichmentProviders()).toHaveLength(0);

      const provider: EnrichmentProvider = {
        id: "list-prov",
        name: "Listable",
        type: "trend",
        isAvailable: () => true,
        fetchEvidence: async () => [],
      };
      registerEnrichmentProvider(provider);
      expect(listEnrichmentProviders()).toHaveLength(1);
      expect(listEnrichmentProviders()[0].id).toBe("list-prov");
    });

    it("provider with isAvailable false is skipped", async () => {
      const provider: EnrichmentProvider = {
        id: "unavailable",
        name: "Unavailable",
        type: "trend",
        isAvailable: () => false,
        fetchEvidence: async () => [{ source: "Should not appear" } as EvidenceItem],
      };
      registerEnrichmentProvider(provider);

      const result = await enrichIdea("Test", "Description");
      // Should fall back to heuristic since no available providers
      expect(result.enrichedAt).toBeTruthy();
    });
  });

  describe("enrichIdea with providers", () => {
    it("uses registered providers", async () => {
      const mockProvider: EnrichmentProvider = {
        id: "test-provider",
        name: "Test Provider",
        type: "trend",
        isAvailable: () => true,
        fetchEvidence: async (query) => [
          {
            source: "Test",
            type: "trend" as const,
            title: `Trend for ${query.slice(0, 20)}`,
            summary: "A test trend",
            relevanceScore: 0.8,
            retrievedAt: new Date().toISOString(),
          },
        ],
      };

      registerEnrichmentProvider(mockProvider);
      const result = await enrichIdea("AI Tool", "An AI-powered tool");
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence[0].source).toBe("Test");
    });

    it("falls back to heuristic without providers", async () => {
      const result = await enrichIdea("Simple Idea", "A simple description");
      expect(result.enrichedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(["blue-ocean", "emerging", "competitive", "saturated"]).toContain(
        result.competitiveLandscape
      );
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
    it("generates markdown report with required sections", () => {
      const enriched = enrichIdeaHeuristic("AI Tool", "An AI-powered cloud tool");
      const md = enrichmentToMarkdown(enriched);
      expect(md).toContain("# Enrichment Report");
      expect(md).toContain("AI Tool");
      expect(md).toContain("Trend Score");
      expect(md).toContain("Competitive Landscape");
    });

    it("includes Market Size section when marketSize is present", () => {
      const enriched = enrichIdeaHeuristic("SaaS Product", "A cloud SaaS product");
      const md = enrichmentToMarkdown(enriched);
      expect(md).toContain("## Market Size");
      expect(md).toContain("TAM");
      expect(md).toContain("SAM");
      expect(md).toContain("SOM");
    });

    it("includes Evidence section when evidence is present", () => {
      const enriched = enrichIdeaHeuristic("AI Cloud Platform", "AI cloud automation tool");
      const md = enrichmentToMarkdown(enriched);
      if (enriched.evidence.length > 0) {
        expect(md).toContain("## Evidence");
      }
    });
  });
});
