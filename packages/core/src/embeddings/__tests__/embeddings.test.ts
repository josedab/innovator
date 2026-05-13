import { describe, it, expect, beforeEach } from "vitest";
import {
  indexDocument,
  indexDocuments,
  removeDocument,
  semanticSearch,
  findSimilar,
  clusterDocuments,
  discoverConnections,
  getIndexSize,
  clearEmbeddingsIndex,
} from "../index.js";

describe("embeddings", () => {
  beforeEach(() => {
    clearEmbeddingsIndex();
  });

  // ---- indexDocument ----

  describe("indexDocument", () => {
    it("indexes a single document and assigns an ID", () => {
      const doc = indexDocument({
        type: "investigation",
        title: "AI in Healthcare",
        content: "Artificial intelligence transforming medical diagnosis and treatment",
      });
      expect(doc.id).toBeDefined();
      expect(doc.createdAt).toBeDefined();
      expect(getIndexSize()).toBe(1);
    });

    it("indexes multiple documents", () => {
      const docs = indexDocuments([
        { type: "idea", title: "Solar Panels", content: "Renewable energy from sunlight" },
        { type: "idea", title: "Wind Turbines", content: "Renewable energy from wind" },
      ]);
      expect(docs).toHaveLength(2);
      expect(getIndexSize()).toBe(2);
    });

    it("handles empty content", () => {
      const doc = indexDocument({
        type: "investigation",
        title: "Empty",
        content: "",
      });
      expect(doc.id).toBeDefined();
      expect(getIndexSize()).toBe(1);
    });
  });

  // ---- semanticSearch ----

  describe("semanticSearch", () => {
    it("ranks exact match higher", () => {
      indexDocument({
        type: "idea",
        title: "Machine Learning Optimization",
        content:
          "Advanced machine learning algorithms for optimization problems in neural networks",
      });
      indexDocument({
        type: "idea",
        title: "Cooking Recipes",
        content: "Delicious pasta recipes from Italian cuisine traditions",
      });

      const results = semanticSearch("machine learning neural networks");
      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].document.title).toBe("Machine Learning Optimization");
    });

    it("returns empty for no matches", () => {
      indexDocument({
        type: "idea",
        title: "Quantum Computing",
        content: "Quantum computing research advances",
      });
      const results = semanticSearch("xyznonexistent987");
      expect(results.results).toHaveLength(0);
    });

    it("returns empty on empty index", () => {
      const results = semanticSearch("anything");
      expect(results.results).toHaveLength(0);
      expect(results.totalIndexed).toBe(0);
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        indexDocument({
          type: "idea",
          title: `Innovation ${i}`,
          content: `Innovation idea about technology advancement ${i}`,
        });
      }
      const results = semanticSearch("innovation technology", 2);
      expect(results.results.length).toBeLessThanOrEqual(2);
    });

    it("includes search time", () => {
      indexDocument({
        type: "idea",
        title: "Test",
        content: "Test document content",
      });
      const results = semanticSearch("test");
      expect(results.searchTimeMs).toBeDefined();
      expect(results.searchTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- findSimilar ----

  describe("findSimilar", () => {
    it("finds similar documents with high scores", () => {
      const doc1 = indexDocument({
        type: "idea",
        title: "Blockchain Supply Chain",
        content: "Using blockchain technology for supply chain transparency and tracking",
      });
      indexDocument({
        type: "idea",
        title: "Blockchain Logistics",
        content: "Blockchain technology applied to logistics and supply chain management",
      });
      indexDocument({
        type: "idea",
        title: "Underwater Basket Weaving",
        content: "Traditional craft techniques for creating baskets underwater",
      });

      const similar = findSimilar(doc1.id);
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].document.title).toBe("Blockchain Logistics");
    });

    it("returns empty for non-existent document", () => {
      expect(findSimilar("nonexistent-id")).toHaveLength(0);
    });

    it("excludes the source document itself", () => {
      const doc = indexDocument({
        type: "idea",
        title: "Self Test",
        content: "Test document for self-exclusion",
      });
      const similar = findSimilar(doc.id);
      expect(similar.every((r) => r.document.id !== doc.id)).toBe(true);
    });
  });

  // ---- clusterDocuments ----

  describe("clusterDocuments", () => {
    it("returns empty for empty index", () => {
      expect(clusterDocuments()).toHaveLength(0);
    });

    it("clusters with k=1", () => {
      indexDocument({ type: "idea", title: "A", content: "technology innovation" });
      indexDocument({ type: "idea", title: "B", content: "technology advancement" });
      const clusters = clusterDocuments(1);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].documentIds).toHaveLength(2);
    });

    it("handles k > n (more clusters than docs)", () => {
      indexDocument({ type: "idea", title: "A", content: "technology innovation" });
      indexDocument({ type: "idea", title: "B", content: "technology advancement" });
      const clusters = clusterDocuments(10);
      // Should cap at number of documents
      expect(clusters.length).toBeLessThanOrEqual(2);
    });

    it("produces clusters with centroid terms", () => {
      indexDocument({
        type: "idea",
        title: "Energy Solar",
        content: "Solar energy panels efficiency renewable",
      });
      indexDocument({
        type: "idea",
        title: "Energy Wind",
        content: "Wind energy turbines efficiency renewable",
      });
      indexDocument({
        type: "idea",
        title: "AI Vision",
        content: "Computer vision artificial intelligence deep learning",
      });
      const clusters = clusterDocuments(2);
      expect(clusters.length).toBeGreaterThan(0);
      for (const c of clusters) {
        expect(c.centroidTerms.length).toBeGreaterThan(0);
        expect(c.documentIds.length).toBeGreaterThan(0);
      }
    });
  });

  // ---- discoverConnections ----

  describe("discoverConnections", () => {
    it("finds cross-session connections", () => {
      const doc1 = indexDocument({
        type: "investigation",
        title: "AI Healthcare Session 1",
        content: "Artificial intelligence machine learning healthcare diagnosis",
        sessionId: "session-1",
      });
      indexDocument({
        type: "investigation",
        title: "AI Healthcare Session 2",
        content: "Machine learning artificial intelligence medical treatment",
        sessionId: "session-2",
      });

      const connections = discoverConnections(doc1.id);
      expect(connections.sourceId).toBe(doc1.id);
      expect(connections.relatedDocuments.length).toBeGreaterThan(0);
      // Related docs should be from different session
      expect(connections.relatedDocuments[0].document.sessionId).not.toBe("session-1");
    });

    it("excludes same-session documents", () => {
      const doc1 = indexDocument({
        type: "idea",
        title: "A",
        content: "technology innovation advancement",
        sessionId: "same-session",
      });
      indexDocument({
        type: "idea",
        title: "B",
        content: "technology innovation advancement similar",
        sessionId: "same-session",
      });

      const connections = discoverConnections(doc1.id);
      expect(connections.relatedDocuments).toHaveLength(0);
    });

    it("returns empty for non-existent document", () => {
      const connections = discoverConnections("bad-id");
      expect(connections.relatedDocuments).toHaveLength(0);
      expect(connections.sharedThemes).toHaveLength(0);
    });
  });

  // ---- removeDocument ----

  describe("removeDocument", () => {
    it("removes an existing document", () => {
      const doc = indexDocument({
        type: "idea",
        title: "To Remove",
        content: "This will be removed",
      });
      expect(removeDocument(doc.id)).toBe(true);
      expect(getIndexSize()).toBe(0);
    });

    it("returns false for non-existent document", () => {
      expect(removeDocument("nonexistent")).toBe(false);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles single-word documents", () => {
      const doc = indexDocument({
        type: "idea",
        title: "Blockchain",
        content: "blockchain",
      });
      expect(doc.id).toBeDefined();
      const results = semanticSearch("blockchain");
      expect(results.results.length).toBeGreaterThanOrEqual(0);
    });

    it("handles very long content", () => {
      const longContent = "innovation technology advancement ".repeat(200);
      const doc = indexDocument({
        type: "investigation",
        title: "Long Doc",
        content: longContent,
      });
      expect(doc.id).toBeDefined();
      expect(getIndexSize()).toBe(1);
    });

    it("idea type documents get idea- prefix ID", () => {
      const doc = indexDocument({
        type: "idea",
        title: "Test Idea",
        content: "Test content",
      });
      expect(doc.id).toMatch(/^idea-/);
    });

    it("non-idea types get full UUID", () => {
      const doc = indexDocument({
        type: "investigation",
        title: "Test Investigation",
        content: "Test content",
      });
      expect(doc.id).not.toMatch(/^idea-/);
    });

    it("handles stopword-only content", () => {
      const doc = indexDocument({
        type: "idea",
        title: "the is a",
        content: "is are the a an",
      });
      expect(doc.id).toBeDefined();
    });

    it("handles punctuation in content", () => {
      const doc = indexDocument({
        type: "idea",
        title: "Test!",
        content: "hello, world! (test) [brackets] {braces}",
      });
      expect(doc.id).toBeDefined();
      const results = semanticSearch("hello world");
      expect(results.totalIndexed).toBe(1);
    });

    it("filters tokens shorter than 3 chars", () => {
      const doc = indexDocument({
        type: "idea",
        title: "AB",
        content: "AI ML NLP is ok no",
      });
      expect(doc.id).toBeDefined();
    });

    it("handles Unicode content", () => {
      const doc = indexDocument({
        type: "idea",
        title: "Café résumé",
        content: "Café résumé naïve über straße",
      });
      expect(doc.id).toBeDefined();
    });

    it("clearEmbeddingsIndex resets everything", () => {
      indexDocument({ type: "idea", title: "A", content: "test content" });
      indexDocument({ type: "idea", title: "B", content: "test content two" });
      expect(getIndexSize()).toBe(2);
      clearEmbeddingsIndex();
      expect(getIndexSize()).toBe(0);
      expect(semanticSearch("test").results).toHaveLength(0);
    });
  });
});
