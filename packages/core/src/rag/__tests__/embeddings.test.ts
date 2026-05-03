import { describe, it, expect } from "vitest";
import { generateEmbedding, cosineSimilarity } from "../embeddings.js";

describe("generateEmbedding", () => {
  it("returns a 256-dimension array", () => {
    const embedding = generateEmbedding("hello world test");
    expect(embedding).toHaveLength(256);
  });

  it("returns L2-normalized output", () => {
    const embedding = generateEmbedding("machine learning algorithms");
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it("produces identical embeddings for identical text", () => {
    const a = generateEmbedding("reproducible test input");
    const b = generateEmbedding("reproducible test input");
    expect(a).toEqual(b);
  });

  it("produces different embeddings for different text", () => {
    const a = generateEmbedding("quantum computing research");
    const b = generateEmbedding("banana smoothie recipe");
    expect(a).not.toEqual(b);
  });

  it("handles empty string without throwing", () => {
    const embedding = generateEmbedding("");
    expect(embedding).toHaveLength(256);
    // Empty string produces no tokens → all zeros
    expect(embedding.every((v) => v === 0)).toBe(true);
  });

  it("handles single short word filtered by length > 2", () => {
    const embedding = generateEmbedding("hi");
    expect(embedding).toHaveLength(256);
    expect(embedding.every((v) => v === 0)).toBe(true);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const vec = generateEmbedding("identical vectors test");
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = new Array(256).fill(0);
    const b = new Array(256).fill(0);
    a[0] = 1;
    b[1] = 1;
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("returns 0 for zero vectors without NaN", () => {
    const zero = new Array(256).fill(0);
    const other = generateEmbedding("some text here");
    expect(cosineSimilarity(zero, other)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
    expect(Number.isNaN(cosineSimilarity(zero, zero))).toBe(false);
  });

  it("returns 0 for mismatched dimensions", () => {
    const a = [1, 0, 0];
    const b = [1, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns similarity > 0.5 for similar texts", () => {
    const a = generateEmbedding("machine learning neural networks deep learning");
    const b = generateEmbedding("deep learning neural networks artificial intelligence");
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.5);
  });

  it("returns similarity < 0.3 for unrelated texts", () => {
    const a = generateEmbedding("quantum computing research papers");
    const b = generateEmbedding("tropical rainforest ecosystem biodiversity");
    expect(cosineSimilarity(a, b)).toBeLessThan(0.3);
  });
});
