import { describe, it, expect, beforeEach } from "vitest";
import { KnowledgeBase } from "../knowledge-base.js";

describe("KnowledgeBase", () => {
  let kb: KnowledgeBase;

  beforeEach(() => {
    kb = new KnowledgeBase("kb-1", "Test KB", "A test knowledge base");
  });

  describe("addDocument", () => {
    it("stores and returns a document with the given ID", () => {
      const doc = kb.addDocument(
        "doc-1",
        "Test Doc",
        "test.md",
        "text",
        "Hello world content here."
      );
      expect(doc.id).toBe("doc-1");
      expect(doc.title).toBe("Test Doc");
      expect(doc.source).toBe("test.md");
      expect(doc.type).toBe("text");
      expect(kb.documentCount).toBe(1);
    });

    it("handles duplicate document ID by overwriting", () => {
      kb.addDocument("doc-1", "First", "a.md", "text", "First content here.");
      kb.addDocument("doc-1", "Second", "b.md", "text", "Second content here.");
      expect(kb.documentCount).toBe(1);
      const doc = kb.getDocument("doc-1");
      expect(doc?.title).toBe("Second");
    });
  });

  describe("getDocument", () => {
    it("retrieves a document by ID", () => {
      kb.addDocument("doc-1", "Title", "src", "text", "Content for retrieval.");
      const doc = kb.getDocument("doc-1");
      expect(doc).toBeDefined();
      expect(doc?.title).toBe("Title");
    });

    it("returns undefined for unknown ID", () => {
      expect(kb.getDocument("nonexistent")).toBeUndefined();
    });
  });

  describe("removeDocument", () => {
    it("deletes an existing document and returns true", () => {
      kb.addDocument("doc-1", "Title", "src", "text", "Some content for removal.");
      expect(kb.removeDocument("doc-1")).toBe(true);
      expect(kb.documentCount).toBe(0);
      expect(kb.getDocument("doc-1")).toBeUndefined();
    });

    it("returns false for unknown ID", () => {
      expect(kb.removeDocument("nonexistent")).toBe(false);
    });
  });

  describe("listDocuments", () => {
    it("returns all stored documents", () => {
      kb.addDocument("d1", "Doc 1", "s1", "text", "Content one for listing.");
      kb.addDocument("d2", "Doc 2", "s2", "text", "Content two for listing.");
      const docs = kb.listDocuments();
      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.id)).toEqual(expect.arrayContaining(["d1", "d2"]));
    });
  });

  describe("search", () => {
    it("returns ranked results by cosine similarity", () => {
      kb.addDocument(
        "d1",
        "ML Paper",
        "ml.md",
        "text",
        "Machine learning neural networks deep learning algorithms"
      );
      kb.addDocument(
        "d2",
        "Cooking",
        "cook.md",
        "text",
        "Tropical fruit smoothie recipe with banana and mango"
      );
      const results = kb.search("neural network deep learning", 5, 0);
      expect(results.length).toBeGreaterThan(0);
      // ML doc should rank higher than cooking doc
      const mlResult = results.find((r) => r.document.id === "d1");
      const cookResult = results.find((r) => r.document.id === "d2");
      if (mlResult && cookResult) {
        expect(mlResult.score).toBeGreaterThan(cookResult.score);
      }
    });

    it("returns all docs when topK > total docs", () => {
      kb.addDocument("d1", "Doc 1", "s1", "text", "Content about artificial intelligence research");
      const results = kb.search("artificial intelligence", 100, 0);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty array for empty knowledge base", () => {
      const results = kb.search("anything at all");
      expect(results).toEqual([]);
    });
  });

  describe("getContextForQuery", () => {
    it("returns concatenated chunk text with headers", () => {
      kb.addDocument(
        "d1",
        "AI Research",
        "ai.md",
        "text",
        "Artificial intelligence and machine learning advances are ongoing."
      );
      const context = kb.getContextForQuery("artificial intelligence", 3);
      expect(context).toContain("KNOWLEDGE BASE CONTEXT:");
      expect(context).toContain("AI Research");
    });

    it("returns empty string when no results", () => {
      const context = kb.getContextForQuery("anything");
      expect(context).toBe("");
    });
  });

  describe("large document chunking", () => {
    it("creates multiple chunks for large documents", () => {
      const paragraphs = Array.from(
        { length: 50 },
        (_, i) => `Paragraph ${i}: ${"word ".repeat(100)}`
      );
      const largeContent = paragraphs.join("\n\n");
      kb.addDocument("big", "Big Doc", "big.md", "text", largeContent);
      expect(kb.chunkCount).toBeGreaterThan(1);
    });
  });
});
