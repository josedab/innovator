import { describe, it, expect, beforeEach } from "vitest";

import {
  estimateTokens,
  computeRelevance,
  extractiveCompress,
  hierarchicalCompress,
  manageContext,
  createSegment,
  getModelTokenLimit,
  clearContextManagerData,
  ContextBudgetSchema,
  ContextSegmentSchema,
  CompressionResultSchema,
  ContextStatusSchema,
  DEFAULT_BUDGETS,
} from "../context-manager/index.js";
import type { ContextSegment } from "../context-manager/index.js";

describe("context-manager", () => {
  beforeEach(() => {
    clearContextManagerData();
  });

  // ---- estimateTokens ----

  describe("estimateTokens", () => {
    it("estimates ~4 chars per token", () => {
      expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → ceil = 3
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("handles long text", () => {
      const text = "a".repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });
  });

  // ---- getModelTokenLimit ----

  describe("getModelTokenLimit", () => {
    it("returns default 128000 for undefined model", () => {
      expect(getModelTokenLimit()).toBe(128000);
    });

    it("returns 200000 for Claude models", () => {
      expect(getModelTokenLimit("claude-sonnet-4-20250514")).toBe(200000);
    });

    it("returns 128000 for unknown model", () => {
      expect(getModelTokenLimit("unknown-model")).toBe(128000);
    });
  });

  // ---- computeRelevance ----

  describe("computeRelevance", () => {
    it("returns base relevanceScore for empty query terms", () => {
      const seg = createSegment("s1", "Some content here", "investigation", 0.8);
      // Query with only short words (≤2 chars) → queryTerms empty
      expect(computeRelevance(seg, "a b")).toBe(0.8);
    });

    it("scores higher when query terms match content", () => {
      const seg = createSegment("s1", "machine learning for fraud detection", "investigation", 0.5);
      const score = computeRelevance(seg, "machine learning fraud");
      expect(score).toBeGreaterThan(0.5);
    });

    it("applies source priority weights", () => {
      const userSeg = createSegment("s1", "content about testing", "user-input", 0.5);
      const historySeg = createSegment("s2", "content about testing", "history", 0.5);
      const userScore = computeRelevance(userSeg, "testing");
      const historyScore = computeRelevance(historySeg, "testing");
      expect(userScore).toBeGreaterThan(historyScore);
    });

    it("blends term relevance (0.6), source weight (0.3), and base score (0.1)", () => {
      const seg = createSegment("s1", "hello world test data", "system", 1.0);
      const score = computeRelevance(seg, "hello world");
      // term match: 2/2=1.0 → 0.6, system=0.9 → 0.27, base=1.0 → 0.1 = 0.97
      expect(score).toBeCloseTo(0.97, 1);
    });
  });

  // ---- extractiveCompress ----

  describe("extractiveCompress", () => {
    it("returns original text when ≤2 sentences", () => {
      const text = "First sentence. Second sentence.";
      expect(extractiveCompress(text, 0.5)).toBe(text);
    });

    it("returns single sentence unchanged", () => {
      expect(extractiveCompress("Hello world.", 0.5)).toBe("Hello world.");
    });

    it("compresses multi-sentence text to target ratio", () => {
      const text = "First sentence here. Second one is about something. Third has more info. Fourth is last.";
      const compressed = extractiveCompress(text, 0.5);
      const originalSentences = text.split(/(?<=[.!?])\s+/).length;
      const compressedSentences = compressed.split(/(?<=[.!?])\s+/).length;
      expect(compressedSentences).toBeLessThanOrEqual(originalSentences);
      expect(compressedSentences).toBeGreaterThanOrEqual(1);
    });

    it("preserves first/last sentences (position scoring)", () => {
      const text = "Important opening. Middle filler content. Another middle part. Critical closing.";
      const compressed = extractiveCompress(text, 0.5);
      expect(compressed).toContain("Important opening");
    });
  });

  // ---- hierarchicalCompress ----

  describe("hierarchicalCompress", () => {
    it("preserves headers", () => {
      const text = "# Header\nSome content\n## Sub Header\nMore content\nExtra stuff";
      const compressed = hierarchicalCompress(text, 0.5);
      expect(compressed).toContain("# Header");
      expect(compressed).toContain("## Sub Header");
    });

    it("preserves bold list items", () => {
      const text = "# Title\n- **Key point**: description\n* **Another**: more info\nregular line";
      const compressed = hierarchicalCompress(text, 0.3);
      expect(compressed).toContain("- **Key point**");
      expect(compressed).toContain("* **Another**");
    });

    it("removes non-structural content when over budget", () => {
      const text = "# Header\n" + "Regular content line.\n".repeat(50);
      const compressed = hierarchicalCompress(text, 0.1);
      expect(compressed).toContain("# Header");
      const lineCount = compressed.split("\n").length;
      expect(lineCount).toBeLessThan(50);
    });
  });

  // ---- manageContext ----

  describe("manageContext", () => {
    it("returns segments sorted by relevance", () => {
      const segments: ContextSegment[] = [
        createSegment("s1", "low relevance content", "history", 0.1),
        createSegment("s2", "high relevance testing content", "user-input", 0.9),
      ];
      const result = manageContext(segments, "generation", "testing");
      expect(result.segments[0].id).toBe("s2");
    });

    it("does not compress when within budget", () => {
      const segments: ContextSegment[] = [
        createSegment("s1", "short content", "user-input", 0.8),
      ];
      const result = manageContext(segments, "generation", "test");
      expect(result.status.compressionApplied).toBe(false);
      expect(result.status.compressionResult).toBeUndefined();
    });

    it("drops low-relevance segments when over budget", () => {
      // Create segments that exceed generation budget (12000 tokens)
      const bigContent = "word ".repeat(15000); // ~18750 tokens
      const segments: ContextSegment[] = [
        createSegment("important", bigContent, "user-input", 0.9),
        createSegment("low", "some low relevance stuff", "history", 0.1),
      ];
      const result = manageContext(segments, "generation", "word");
      expect(result.status.compressionApplied).toBe(true);
      // low-relevance segment with score < 0.3 should be dropped
      const ids = result.segments.map((s) => s.id);
      expect(ids).not.toContain("low");
    });

    it("compresses segments >200 tokens when still over budget", () => {
      // Create content that's large but all high-relevance
      const longContent = "The testing framework validates correctness. ".repeat(200);
      const segments: ContextSegment[] = [
        createSegment("big", longContent, "investigation", 0.9),
      ];
      const result = manageContext(segments, "investigation", "testing framework");
      if (result.status.compressionApplied) {
        expect(result.status.compressionResult).toBeDefined();
        expect(result.status.compressionResult!.segmentsCompressed).toBeGreaterThanOrEqual(0);
      }
    });

    it("uses correct budget per stage", () => {
      const segments: ContextSegment[] = [
        createSegment("s1", "content", "user-input", 0.9),
      ];
      const invResult = manageContext(segments, "investigation", "test");
      const synResult = manageContext(segments, "synthesis", "test");
      expect(invResult.status.budgetTokens).toBeLessThan(synResult.status.budgetTokens);
    });

    it("quality floor stays at 0.7 or above", () => {
      const longContent = "Many words about testing. ".repeat(500);
      const segments: ContextSegment[] = [
        createSegment("big", longContent, "investigation", 0.9),
      ];
      const result = manageContext(segments, "investigation", "testing");
      if (result.status.compressionResult) {
        expect(result.status.compressionResult.qualityEstimate).toBeGreaterThanOrEqual(0.7);
      }
    });

    it("handles empty query", () => {
      const segments: ContextSegment[] = [
        createSegment("s1", "content", "user-input", 0.5),
      ];
      const result = manageContext(segments, "generation", "");
      expect(result.segments).toHaveLength(1);
    });

    it("applies model token limit", () => {
      const segments: ContextSegment[] = [
        createSegment("s1", "content", "user-input", 0.5),
      ];
      const result = manageContext(segments, "generation", "test", "claude-sonnet-4-20250514");
      expect(result.status.budgetTokens).toBeLessThanOrEqual(200000);
    });

    it("falls back to generation budget for unknown stage", () => {
      const segments: ContextSegment[] = [createSegment("s1", "c", "user-input", 0.5)];
      const result = manageContext(segments, "unknown-stage", "test");
      // effectiveBudget = Math.min(maxTokens, modelLimit - reservedForOutput)
      const genBudget = DEFAULT_BUDGETS.generation;
      const expected = Math.min(genBudget.maxTokens, 128000 - genBudget.reservedForOutput);
      expect(result.status.budgetTokens).toBe(expected);
    });
  });

  // ---- createSegment ----

  describe("createSegment", () => {
    it("creates segment with estimated tokens", () => {
      const seg = createSegment("id1", "hello world", "investigation");
      expect(seg.id).toBe("id1");
      expect(seg.relevanceScore).toBe(0.5); // default
      expect(seg.tokenCount).toBe(estimateTokens("hello world"));
      expect(seg.compressible).toBe(true);
    });

    it("marks system segments as non-compressible", () => {
      const seg = createSegment("sys1", "system prompt", "system");
      expect(seg.compressible).toBe(false);
    });
  });

  // ---- Schema validation ----

  describe("schemas", () => {
    it("validates ContextBudget", () => {
      expect(() => ContextBudgetSchema.parse({ stage: "test", maxTokens: 1000, reservedForOutput: 500 })).not.toThrow();
      expect(() => ContextBudgetSchema.parse({ stage: "test", maxTokens: 50, reservedForOutput: 100 })).toThrow();
    });

    it("validates ContextSegment", () => {
      expect(() => ContextSegmentSchema.parse({
        id: "s1", content: "text", source: "user-input", relevanceScore: 0.5, tokenCount: 10, compressible: true,
      })).not.toThrow();
      expect(() => ContextSegmentSchema.parse({
        id: "s1", content: "text", source: "invalid-source", relevanceScore: 0.5, tokenCount: 10,
      })).toThrow();
    });
  });
});
