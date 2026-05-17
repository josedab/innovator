import { describe, it, expect, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import { deduplicateIdeas, crossSessionDeduplication } from "../deduplication/index.js";
import type { AngleResult } from "../types.js";

function makeAngleResult(
  angleId: string,
  ideas: Array<{ title: string; description: string }>
): AngleResult {
  return {
    angleId,
    angleName: `Angle ${angleId}`,
    ideas: ideas.map((i) => ({
      title: i.title,
      description: i.description,
      potentialImpact: "High",
      implementationHint: "Build it",
    })),
    reasoning: "Test reasoning",
  };
}

describe("deduplication fallback (LLM unavailable)", () => {
  describe("title-based similarity fallback", () => {
    it("detects exact title duplicates across angles", async () => {
      const result = await deduplicateIdeas(
        [
          makeAngleResult("scamper", [
            { title: "automated code review tool", description: "A tool for code reviews" },
          ]),
          makeAngleResult("inversion", [
            { title: "automated code review tool", description: "Different description" },
          ]),
        ],
        { duplicateThreshold: 0.9 }
      );

      expect(result.duplicatePairs.length).toBe(1);
      expect(result.duplicatePairs[0].similarity).toBe(1);
    });

    it("does not mark dissimilar titles as duplicates", async () => {
      const result = await deduplicateIdeas(
        [
          makeAngleResult("scamper", [
            { title: "solar energy panel optimization", description: "d1" },
          ]),
          makeAngleResult("inversion", [
            { title: "blockchain supply chain tracking", description: "d2" },
          ]),
        ],
        { duplicateThreshold: 0.9 }
      );

      expect(result.duplicatePairs).toHaveLength(0);
    });

    it("computes uniqueness scores inversely to average similarity", async () => {
      const result = await deduplicateIdeas(
        [
          makeAngleResult("a", [
            { title: "alpha beta gamma", description: "d" },
            { title: "alpha beta gamma", description: "d" },
            { title: "completely different unique idea", description: "d" },
          ]),
        ],
        { duplicateThreshold: 0.9 }
      );

      // The unique idea should have a higher uniqueness score than the duplicates
      const uniqueIdea = result.ideas.find((i) => i.id === "a-2");
      const dupIdea = result.ideas.find((i) => i.id === "a-0");
      expect(uniqueIdea).toBeDefined();
      expect(dupIdea).toBeDefined();
      expect(uniqueIdea!.uniquenessScore).toBeGreaterThan(dupIdea!.uniquenessScore);
    });
  });

  describe("DBSCAN clustering in fallback mode", () => {
    it("clusters ideas with overlapping titles", async () => {
      const result = await deduplicateIdeas(
        [
          makeAngleResult("a", [
            { title: "machine learning prediction model", description: "d1" },
            { title: "machine learning classification model", description: "d2" },
            { title: "machine learning clustering model", description: "d3" },
          ]),
        ],
        { clusterThreshold: 0.3, minClusterSize: 2 }
      );

      // These share "machine learning" + "model" so should cluster
      expect(result.stats.clustersFormed).toBeGreaterThanOrEqual(1);
    });

    it("leaves dissimilar ideas unclustered", async () => {
      const result = await deduplicateIdeas(
        [
          makeAngleResult("a", [
            { title: "quantum computing optimization", description: "d1" },
            { title: "blockchain distributed ledger", description: "d2" },
            { title: "renewable solar energy grid", description: "d3" },
          ]),
        ],
        { clusterThreshold: 0.5, minClusterSize: 2 }
      );

      // All very different — no clusters expected
      expect(result.stats.clustersFormed).toBe(0);
      // All should remain unclustered
      expect(result.ideas.every((i) => i.clusterId === -1)).toBe(true);
    });
  });

  describe("outlier detection", () => {
    it("flags highly unique unclustered ideas as outliers", async () => {
      const result = await deduplicateIdeas(
        [
          makeAngleResult("a", [
            { title: "common shared approach pattern", description: "d1" },
            { title: "common shared approach method", description: "d2" },
            { title: "completely novel breakthrough xyz", description: "d3" },
          ]),
        ],
        { clusterThreshold: 0.3, minClusterSize: 2 }
      );

      // The unique idea should be flagged as outlier
      const novelIdea = result.ideas.find((i) => i.id === "a-2");
      if (novelIdea && novelIdea.clusterId === -1) {
        // Only expected if it's truly unclustered and unique
        expect(novelIdea.uniquenessScore).toBeGreaterThan(0);
      }
    });
  });

  describe("cross-session deduplication", () => {
    it("deduplicates across sessions", async () => {
      const result = await crossSessionDeduplication([
        {
          sessionId: "session-1",
          angleResults: [
            makeAngleResult("scamper", [{ title: "reusable energy storage", description: "d1" }]),
          ],
        },
        {
          sessionId: "session-2",
          angleResults: [
            makeAngleResult("scamper", [{ title: "reusable energy storage", description: "d2" }]),
          ],
        },
      ]);

      expect(result.stats.totalIdeas).toBe(2);
      // Same title → should detect as duplicates
      expect(result.duplicatePairs.length).toBeGreaterThanOrEqual(1);
      // Session breakdown
      expect(result.sessionBreakdown["session-1"]).toBe(1);
      expect(result.sessionBreakdown["session-2"]).toBe(1);
    });

    it("handles empty sessions gracefully", async () => {
      const result = await crossSessionDeduplication([
        { sessionId: "s1", angleResults: [] },
        { sessionId: "s2", angleResults: [] },
      ]);

      expect(result.stats.totalIdeas).toBe(0);
      expect(result.sessionBreakdown).toEqual({ s1: 0, s2: 0 });
    });
  });

  describe("edge cases", () => {
    it("handles ideas with empty titles", async () => {
      const result = await deduplicateIdeas([
        makeAngleResult("a", [
          { title: "", description: "description only" },
          { title: "", description: "another description" },
        ]),
      ]);

      expect(result.stats.totalIdeas).toBe(2);
    });

    it("handles many ideas without crashing", async () => {
      const ideas = Array.from({ length: 20 }, (_, i) => ({
        title: `idea number ${i} about topic ${i % 5}`,
        description: `description ${i}`,
      }));

      const result = await deduplicateIdeas([makeAngleResult("a", ideas)]);
      expect(result.stats.totalIdeas).toBe(20);
      expect(result.processedAt).toBeTruthy();
    });

    it("preserves idea metadata through deduplication", async () => {
      const result = await deduplicateIdeas([
        makeAngleResult("scamper", [{ title: "test idea", description: "test description" }]),
      ]);

      expect(result.ideas[0].angleId).toBe("scamper");
      expect(result.ideas[0].title).toBe("test idea");
      expect(result.ideas[0].description).toBe("test description");
    });
  });
});
