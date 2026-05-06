// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { extractKeywords, jaccardSimilarity } from "../IdeaMap";

// Test data helpers
function makeAngleResult(
  angleId: string,
  angleName: string,
  ideas: Array<{ title: string; description: string }>
) {
  return {
    angleId,
    angleName,
    ideas: ideas.map((i) => ({
      ...i,
      potentialImpact: "High impact",
      implementationHint: "Start here",
    })),
    reasoning: "Test reasoning",
  };
}

describe("extractKeywords", () => {
  it("filters stopwords and keeps words >3 chars", () => {
    const keywords = extractKeywords("the quick brown fox and the lazy dog");
    expect(keywords).toContain("quick");
    expect(keywords).toContain("brown");
    expect(keywords).toContain("lazy");
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("and");
    expect(keywords).not.toContain("fox"); // 3 chars, not > 3
    expect(keywords).not.toContain("dog");
  });

  it("deduplicates words", () => {
    const keywords = extractKeywords("hello world hello world hello");
    const helloCount = keywords.filter((w) => w === "hello").length;
    expect(helloCount).toBe(1);
  });

  it("is case-insensitive", () => {
    const keywords = extractKeywords("Hello HELLO hello");
    expect(keywords).toHaveLength(1);
    expect(keywords[0]).toBe("hello");
  });

  it("handles empty string", () => {
    expect(extractKeywords("")).toEqual([]);
  });

  it("strips non-alphanumeric characters", () => {
    const keywords = extractKeywords("data-driven innovation! #trending");
    expect(keywords).toContain("data-driven");
    expect(keywords).not.toContain("#trending");
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1/3 for ['a','b'] and ['b','c']", () => {
    const sim = jaccardSimilarity(["a", "b"], ["b", "c"]);
    expect(sim).toBeCloseTo(1 / 3);
  });

  it("returns 1.0 for identical arrays", () => {
    expect(jaccardSimilarity(["x", "y"], ["x", "y"])).toBe(1);
  });

  it("returns 0.0 for disjoint arrays", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 0 for empty arrays (division by zero guard)", () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it("returns 0 when one array is empty", () => {
    expect(jaccardSimilarity(["a"], [])).toBe(0);
  });
});
