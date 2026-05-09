import { describe, it, expect, beforeEach } from "vitest";
import {
  indexSearchDocument,
  removeSearchDocument,
  hybridSearch,
  getSearchSuggestions,
  getSearchIndexStats,
  clearSearchIndex,
} from "../engine.js";

describe("hybrid-search", () => {
  beforeEach(() => {
    clearSearchIndex();
  });

  describe("indexing", () => {
    it("indexes a document and assigns ID", () => {
      const doc = indexSearchDocument({
        type: "idea",
        title: "AI-powered code review",
        content:
          "Use machine learning to automatically review pull requests and suggest improvements.",
      });
      expect(doc.id).toBeDefined();
      expect(doc.createdAt).toBeDefined();
      expect(doc.type).toBe("idea");
    });

    it("removes a document from index", () => {
      const doc = indexSearchDocument({
        type: "idea",
        title: "To Remove",
        content: "This will be removed from the search index.",
      });
      expect(removeSearchDocument(doc.id)).toBe(true);
      expect(removeSearchDocument(doc.id)).toBe(false);
    });

    it("tracks index statistics", () => {
      indexSearchDocument({
        type: "idea",
        title: "Idea 1",
        content: "Content 1",
        angleId: "scamper",
      });
      indexSearchDocument({
        type: "investigation",
        title: "Investigation 1",
        content: "Content 2",
      });
      indexSearchDocument({
        type: "idea",
        title: "Idea 2",
        content: "Content 3",
        angleId: "what-if",
      });

      const stats = getSearchIndexStats();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.byType["idea"]).toBe(2);
      expect(stats.byType["investigation"]).toBe(1);
      expect(stats.byAngle["scamper"]).toBe(1);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      indexSearchDocument({
        type: "idea",
        title: "Machine Learning Pipeline",
        content:
          "Build an automated machine learning pipeline for training and deploying models at scale.",
        angleId: "first-principles",
        score: 85,
        tags: ["ai", "automation"],
      });
      indexSearchDocument({
        type: "idea",
        title: "React Component Library",
        content:
          "Create a reusable React component library with TypeScript support and Storybook documentation.",
        angleId: "scamper",
        score: 72,
        tags: ["frontend", "react"],
      });
      indexSearchDocument({
        type: "investigation",
        title: "Cloud Cost Optimization",
        content:
          "Investigate strategies for reducing cloud infrastructure costs through resource optimization.",
        tags: ["cloud", "cost"],
      });
    });

    it("finds relevant documents by keyword", () => {
      const results = hybridSearch("machine learning");
      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].document.title).toContain("Machine Learning");
      expect(results.results[0].relevanceScore).toBeGreaterThan(0);
    });

    it("returns totalResults and durationMs", () => {
      const results = hybridSearch("component");
      expect(results.totalResults).toBeGreaterThanOrEqual(0);
      expect(results.durationMs).toBeGreaterThanOrEqual(0);
      expect(results.query).toBe("component");
    });

    it("applies type facet filter", () => {
      const results = hybridSearch("build", 20, 0, { type: ["investigation"] });
      for (const r of results.results) {
        expect(r.document.type).toBe("investigation");
      }
    });

    it("applies angle facet filter", () => {
      const results = hybridSearch("build", 20, 0, { angleId: ["scamper"] });
      for (const r of results.results) {
        expect(r.document.angleId).toBe("scamper");
      }
    });

    it("returns facet counts", () => {
      const results = hybridSearch("build");
      expect(results.facetCounts.types).toBeDefined();
      expect(results.facetCounts.angles).toBeDefined();
      expect(results.facetCounts.tags).toBeDefined();
    });

    it("supports pagination via limit and offset", () => {
      // Index more documents
      for (let i = 0; i < 5; i++) {
        indexSearchDocument({
          type: "idea",
          title: `Test idea ${i}`,
          content: `Content about building software systems and applications number ${i}`,
        });
      }

      const page1 = hybridSearch("building software", 2, 0);
      const page2 = hybridSearch("building software", 2, 2);

      expect(page1.results.length).toBeLessThanOrEqual(2);
      if (page1.totalResults > 2) {
        expect(page2.results.length).toBeGreaterThan(0);
      }
    });

    it("ranks results by relevance", () => {
      const results = hybridSearch("machine learning pipeline training");
      if (results.results.length > 1) {
        expect(results.results[0].relevanceScore).toBeGreaterThanOrEqual(
          results.results[1].relevanceScore
        );
      }
    });

    it("returns empty for no matches", () => {
      const results = hybridSearch("xyzzyflurp");
      expect(results.results).toHaveLength(0);
    });

    it("provides match type information", () => {
      const results = hybridSearch("machine learning");
      if (results.results.length > 0) {
        expect(["keyword", "semantic", "hybrid"]).toContain(results.results[0].matchType);
      }
    });
  });

  describe("suggestions", () => {
    it("returns typeahead suggestions", () => {
      indexSearchDocument({
        type: "idea",
        title: "Machine Learning Pipeline",
        content: "ML pipeline",
      });
      indexSearchDocument({ type: "idea", title: "Machine Translation", content: "MT system" });

      const suggestions = getSearchSuggestions("Machine");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes("Machine"))).toBe(true);
    });

    it("returns empty for no matches", () => {
      const suggestions = getSearchSuggestions("xyzzy");
      expect(suggestions).toHaveLength(0);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        indexSearchDocument({ type: "idea", title: `Test ${i}`, content: `Content ${i}` });
      }
      const suggestions = getSearchSuggestions("Test", 3);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });
  });

  describe("clear", () => {
    it("clears entire index", () => {
      indexSearchDocument({ type: "idea", title: "Test", content: "Test" });
      clearSearchIndex();
      expect(getSearchIndexStats().totalDocuments).toBe(0);
    });
  });
});
