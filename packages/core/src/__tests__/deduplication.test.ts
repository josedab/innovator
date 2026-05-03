import { describe, it, expect, vi } from "vitest";

// We test pure/exported functions directly. For the main deduplicateIdeas,
// we need to mock the LLM client.
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue("{}"),
  extractJson: vi.fn().mockReturnValue("{}"),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

// Import from the module (the mock will intercept LLM calls)
const mod = await import("../deduplication/index.js");

// Expose internals via re-export workaround — we test the pure algorithms
// by calling the module's exported schemas and the main function with mocked LLM
const { EmbeddedIdeaSchema, IdeaClusterSchema, DeduplicationResultSchema, deduplicateIdeas } = mod;

// Access unexported pure functions via the module source approach:
// We can only test exported items, so we'll test simpleTitleSimilarity indirectly
// through deduplicateIdeas fallback behavior (when LLM fails).

describe("deduplication", () => {
  describe("Zod Schemas", () => {
    it("EmbeddedIdeaSchema validates correct shape", () => {
      const result = EmbeddedIdeaSchema.safeParse({
        id: "test-1",
        title: "Test Idea",
        description: "A description",
        angleId: "scamper",
        uniquenessScore: 0.5,
        clusterId: -1,
        isOutlier: false,
      });
      expect(result.success).toBe(true);
    });

    it("EmbeddedIdeaSchema rejects invalid uniquenessScore", () => {
      const result = EmbeddedIdeaSchema.safeParse({
        id: "test-1",
        title: "Test",
        description: "d",
        angleId: "a",
        uniquenessScore: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("IdeaClusterSchema validates correct shape", () => {
      const result = IdeaClusterSchema.safeParse({
        id: 0,
        label: "Cluster 0",
        description: "Test cluster",
        ideaIds: ["a", "b"],
        centroidIdeaId: "a",
        avgSimilarity: 0.8,
      });
      expect(result.success).toBe(true);
    });

    it("DeduplicationResultSchema validates correct shape", () => {
      const result = DeduplicationResultSchema.safeParse({
        ideas: [],
        clusters: [],
        duplicatePairs: [],
        mergedIdeas: [],
        outliers: [],
        stats: {
          totalIdeas: 0,
          uniqueIdeas: 0,
          duplicatesFound: 0,
          clustersFormed: 0,
          outliersDetected: 0,
        },
        processedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("deduplicateIdeas", () => {
    it("returns empty result for empty input", async () => {
      const result = await deduplicateIdeas([]);
      expect(result.stats.totalIdeas).toBe(0);
      expect(result.ideas).toHaveLength(0);
      expect(result.clusters).toHaveLength(0);
      expect(result.duplicatePairs).toHaveLength(0);
    });

    it("handles single idea", async () => {
      const result = await deduplicateIdeas([
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Solo Idea",
              description: "The only one",
              potentialImpact: "High",
              implementationHint: "Do it",
            },
          ],
          reasoning: "test",
        },
      ]);
      expect(result.stats.totalIdeas).toBe(1);
      expect(result.stats.uniqueIdeas).toBe(1);
      expect(result.ideas).toHaveLength(1);
      expect(result.ideas[0].id).toBe("scamper-0");
    });

    it("assigns IDs based on angleId and index", async () => {
      const result = await deduplicateIdeas([
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            { title: "A", description: "d", potentialImpact: "H", implementationHint: "h" },
            { title: "B", description: "d", potentialImpact: "H", implementationHint: "h" },
          ],
          reasoning: "test",
        },
        {
          angleId: "inversion",
          angleName: "Inversion",
          ideas: [{ title: "C", description: "d", potentialImpact: "H", implementationHint: "h" }],
          reasoning: "test",
        },
      ]);
      expect(result.ideas.map((i) => i.id)).toEqual(["scamper-0", "scamper-1", "inversion-0"]);
    });

    it("respects AbortSignal cancellation", async () => {
      const controller = new AbortController();
      controller.abort();

      // Should still work (the abort is checked during LLM calls, which are mocked)
      const result = await deduplicateIdeas(
        [
          {
            angleId: "scamper",
            angleName: "SCAMPER",
            ideas: [
              { title: "Test", description: "d", potentialImpact: "H", implementationHint: "h" },
            ],
            reasoning: "test",
          },
        ],
        {},
        controller.signal
      );
      expect(result.stats.totalIdeas).toBe(1);
    });
  });
});

// Test pure functions that are not exported but can be tested via module internals.
// Since simpleTitleSimilarity, dbscanCluster, getNeighbors, computeUniquenessScores
// are not exported, we test their behavior indirectly through deduplicateIdeas
// or re-implement their logic for unit verification.

describe("pure algorithm logic (indirect testing)", () => {
  // simpleTitleSimilarity is Jaccard coefficient - we can verify via the dedup pipeline
  // when LLM fails (falls back to title similarity)

  it("identical titles should produce high similarity in fallback", async () => {
    // Mock LLM to throw, forcing fallback to simpleTitleSimilarity
    const { generateText } = await import("../copilot/client.js");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await deduplicateIdeas(
      [
        {
          angleId: "a",
          angleName: "A",
          ideas: [
            {
              title: "innovative solar panel design",
              description: "d1",
              potentialImpact: "H",
              implementationHint: "h",
            },
            {
              title: "innovative solar panel design",
              description: "d2",
              potentialImpact: "H",
              implementationHint: "h",
            },
          ],
          reasoning: "test",
        },
      ],
      { duplicateThreshold: 0.9 }
    );
    // Identical titles → Jaccard = 1.0, so they should be duplicates
    expect(result.duplicatePairs.length).toBeGreaterThanOrEqual(1);
  });

  it("completely different titles should not be duplicates in fallback", async () => {
    const { generateText } = await import("../copilot/client.js");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await deduplicateIdeas(
      [
        {
          angleId: "a",
          angleName: "A",
          ideas: [
            {
              title: "solar panel energy",
              description: "d1",
              potentialImpact: "H",
              implementationHint: "h",
            },
            {
              title: "blockchain cryptocurrency ledger",
              description: "d2",
              potentialImpact: "H",
              implementationHint: "h",
            },
          ],
          reasoning: "test",
        },
      ],
      { duplicateThreshold: 0.9 }
    );
    expect(result.duplicatePairs).toHaveLength(0);
  });
});
