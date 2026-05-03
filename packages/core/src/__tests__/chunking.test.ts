import { describe, it, expect } from "vitest";
import { chunkText } from "../rag/chunking.js";

describe("chunkText", () => {
  describe("paragraph strategy", () => {
    it("merges short paragraphs within maxChunkSize", () => {
      const content = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
      const chunks = chunkText(content, "doc1", {
        maxChunkSize: 1000,
        overlap: 0,
        strategy: "paragraph",
      });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain("Paragraph one.");
      expect(chunks[0].content).toContain("Paragraph three.");
    });

    it("splits at maxChunkSize when paragraphs are too large", () => {
      const para1 = "A".repeat(50);
      const para2 = "B".repeat(50);
      const content = `${para1}\n\n${para2}`;
      const chunks = chunkText(content, "doc1", {
        maxChunkSize: 60,
        overlap: 0,
        strategy: "paragraph",
      });
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe("sentence strategy", () => {
    it("splits at sentence boundaries", () => {
      const content = "First sentence. Second sentence. Third sentence.";
      const chunks = chunkText(content, "doc1", {
        maxChunkSize: 30,
        overlap: 0,
        strategy: "sentence",
      });
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should end at a sentence boundary
      for (const chunk of chunks) {
        expect(chunk.content).toMatch(/[.!?]$/);
      }
    });

    it("very long single-sentence text returns at least 1 chunk", () => {
      const content = "A".repeat(200) + ".";
      const chunks = chunkText(content, "doc1", {
        maxChunkSize: 50,
        overlap: 0,
        strategy: "sentence",
      });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("fixed strategy", () => {
    it("uses fixed-size windows", () => {
      const content = "ABCDEFGHIJ";
      const chunks = chunkText(content, "doc1", {
        maxChunkSize: 5,
        overlap: 0,
        strategy: "fixed",
      });
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe("ABCDE");
      expect(chunks[1].content).toBe("FGHIJ");
    });

    it("handles non-evenly-divisible text", () => {
      const content = "ABCDEFGH";
      const chunks = chunkText(content, "doc1", {
        maxChunkSize: 5,
        overlap: 0,
        strategy: "fixed",
      });
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe("ABCDE");
      expect(chunks[1].content).toBe("FGH");
    });
  });

  it("empty content returns empty array", () => {
    expect(chunkText("", "doc1")).toEqual([]);
  });

  it("whitespace-only content returns empty array", () => {
    expect(chunkText("   \n\n  ", "doc1")).toEqual([]);
  });

  it("single paragraph shorter than maxChunkSize returns 1 chunk", () => {
    const chunks = chunkText("Short text.", "doc1", {
      maxChunkSize: 1000,
      overlap: 0,
      strategy: "paragraph",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Short text.");
  });

  it("chunk IDs follow pattern ${documentId}-chunk-${index}", () => {
    const content = "Para one.\n\nPara two.\n\nPara three.";
    const chunks = chunkText(content, "my-doc", {
      maxChunkSize: 15,
      overlap: 0,
      strategy: "paragraph",
    });
    chunks.forEach((chunk, i) => {
      expect(chunk.id).toBe(`my-doc-chunk-${i}`);
      expect(chunk.documentId).toBe("my-doc");
    });
  });

  it("chunkIndex is sequential starting from 0", () => {
    const content = "A".repeat(100) + "\n\n" + "B".repeat(100);
    const chunks = chunkText(content, "doc1", {
      maxChunkSize: 50,
      overlap: 0,
      strategy: "fixed",
    });
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it("unknown strategy falls back to paragraph", () => {
    const content = "Para one.\n\nPara two.";
    const chunks = chunkText(content, "doc1", {
      maxChunkSize: 1000,
      overlap: 0,
      strategy: "unknown" as "paragraph",
    });
    // Falls back to paragraph strategy, which merges both
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Para one.");
    expect(chunks[0].content).toContain("Para two.");
  });
});
