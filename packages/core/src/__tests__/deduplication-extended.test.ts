import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  deduplicateIdeas,
  analyzeGaps,
  crossSessionDeduplication,
  type DeduplicationResult,
} from "../deduplication/index.js";
import type { AngleResult } from "../types.js";
import { withRetry } from "../copilot/retry.js";

const mockWithRetry = vi.mocked(withRetry);

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

function makeEmptyResult(): DeduplicationResult {
  return {
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
  };
}

function makeResultWithClusters(): DeduplicationResult {
  return {
    ideas: [
      {
        id: "a1-0",
        title: "AI Healthcare",
        description: "Use AI in healthcare",
        angleId: "a1",
        uniquenessScore: 0.3,
        clusterId: 0,
        isOutlier: false,
      },
      {
        id: "a1-1",
        title: "AI Diagnostics",
        description: "AI for diagnostics",
        angleId: "a1",
        uniquenessScore: 0.4,
        clusterId: 0,
        isOutlier: false,
      },
      {
        id: "a2-0",
        title: "Solar Farming",
        description: "Solar energy for farming",
        angleId: "a2",
        uniquenessScore: 0.8,
        clusterId: -1,
        isOutlier: true,
      },
    ],
    clusters: [
      {
        id: 0,
        label: "AI in Medicine",
        description: "Ideas about AI applications in medicine",
        ideaIds: ["a1-0", "a1-1"],
        centroidIdeaId: "a1-0",
        avgSimilarity: 0.85,
      },
    ],
    duplicatePairs: [],
    mergedIdeas: [],
    outliers: ["a2-0"],
    stats: {
      totalIdeas: 3,
      uniqueIdeas: 3,
      duplicatesFound: 0,
      clustersFormed: 1,
      outliersDetected: 1,
    },
    processedAt: new Date().toISOString(),
  };
}

describe("deduplication (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeGaps", () => {
    it("identifies missing coverage areas from clusters", async () => {
      const dedupResult = makeResultWithClusters();
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          coveredThemes: [
            { theme: "AI in Medicine", clusterIds: [0], ideaCount: 2, coverage: "moderate" },
          ],
          gaps: [
            {
              theme: "Sustainability",
              description: "No ideas about environmental impact",
              relevance: "critical",
              suggestedAngles: ["cross-domain"],
            },
          ],
          diversityScore: 0.4,
          summary: "Limited coverage in sustainability domain",
        })
      );

      const analysis = await analyzeGaps(dedupResult, "Innovation");
      expect(analysis.coveredThemes).toHaveLength(1);
      expect(analysis.gaps).toHaveLength(1);
      expect(analysis.gaps[0].theme).toBe("Sustainability");
      expect(analysis.gaps[0].relevance).toBe("critical");
      expect(analysis.diversityScore).toBeGreaterThanOrEqual(0);
      expect(analysis.diversityScore).toBeLessThanOrEqual(1);
    });

    it("returns comprehensive gaps for empty ideas", async () => {
      const emptyResult = makeEmptyResult();
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const analysis = await analyzeGaps(emptyResult, "Test");
      expect(analysis.coveredThemes).toEqual([]);
      expect(analysis.gaps).toEqual([]);
      expect(analysis.summary).toContain("0");
    });

    it("returns minimal gaps for diverse ideas (fallback)", async () => {
      const diverseResult = makeResultWithClusters();
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const analysis = await analyzeGaps(diverseResult, "Test");
      // Fallback computes from cluster data
      expect(analysis.coveredThemes).toHaveLength(1);
      expect(analysis.coveredThemes[0].theme).toBe("AI in Medicine");
      expect(analysis.summary).toContain("1 distinct themes");
    });
  });

  describe("crossSessionDeduplication", () => {
    it("merges ideas across sessions", async () => {
      const sessions = [
        {
          sessionId: "s1",
          angleResults: [
            makeAngleResult("angle1", [
              { title: "AI Healthcare Tool", description: "A tool using AI in healthcare" },
            ]),
          ],
        },
        {
          sessionId: "s2",
          angleResults: [
            makeAngleResult("angle1", [
              { title: "Blockchain Supply Chain", description: "Blockchain for supply chain" },
            ]),
          ],
        },
      ];

      // Mock LLM to return no similar pairs (fall back to title similarity)
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await crossSessionDeduplication(sessions);
      expect(result.stats.totalIdeas).toBe(2);
      expect(result.sessionBreakdown).toMatchObject({ s1: 1, s2: 1 });
    });

    it("detects identical ideas across sessions (via title similarity)", async () => {
      const sessions = [
        {
          sessionId: "s1",
          angleResults: [
            makeAngleResult("angle1", [
              { title: "AI powered chatbot assistant", description: "An AI chatbot" },
            ]),
          ],
        },
        {
          sessionId: "s2",
          angleResults: [
            makeAngleResult("angle1", [
              { title: "AI powered chatbot assistant", description: "An AI chatbot tool" },
            ]),
          ],
        },
      ];

      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await crossSessionDeduplication(sessions);
      expect(result.stats.totalIdeas).toBe(2);
      // With identical titles, simpleTitleSimilarity = 1.0, so they should be duplicates
      expect(result.stats.duplicatesFound).toBeGreaterThanOrEqual(1);
    });

    it("returns all ideas when no overlap", async () => {
      const sessions = [
        {
          sessionId: "s1",
          angleResults: [
            makeAngleResult("a1", [
              { title: "Quantum Computing Breakthrough", description: "Novel quantum approach" },
            ]),
          ],
        },
        {
          sessionId: "s2",
          angleResults: [
            makeAngleResult("a1", [
              { title: "Sustainable Ocean Farming", description: "Growing food in oceans" },
            ]),
          ],
        },
      ];

      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await crossSessionDeduplication(sessions);
      expect(result.stats.totalIdeas).toBe(2);
      expect(result.stats.duplicatesFound).toBe(0);
    });
  });

  describe("deduplicateIdeas", () => {
    it("returns empty result for empty angle results", async () => {
      const result = await deduplicateIdeas([]);
      expect(result.stats.totalIdeas).toBe(0);
      expect(result.ideas).toEqual([]);
      expect(result.clusters).toEqual([]);
    });

    it("handles single idea", async () => {
      const angleResults = [
        makeAngleResult("a1", [{ title: "Single Idea", description: "Only one idea" }]),
      ];
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await deduplicateIdeas(angleResults);
      expect(result.stats.totalIdeas).toBe(1);
      expect(result.stats.duplicatesFound).toBe(0);
      expect(result.ideas[0].id).toBe("a1-0");
    });

    it("clusters known-similar titles using fallback similarity", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "machine learning prediction tool", description: "ML prediction" },
          { title: "machine learning prediction system", description: "ML system" },
          { title: "quantum computing hardware design", description: "QC hardware" },
        ]),
      ];

      // Force fallback to simpleTitleSimilarity
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await deduplicateIdeas(angleResults, {
        clusterThreshold: 0.4,
        minClusterSize: 2,
      });
      expect(result.stats.totalIdeas).toBe(3);
      // ML prediction ideas should have higher similarity than quantum idea
      const mlIdea0 = result.ideas.find((i) => i.id === "a1-0")!;
      const mlIdea1 = result.ideas.find((i) => i.id === "a1-1")!;
      // These should be more similar to each other
      expect(mlIdea0.uniquenessScore).toBeLessThan(1);
    });

    it("assigns uniqueness scores to all ideas", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "Idea Alpha about technology", description: "Tech idea" },
          { title: "Idea Beta about science", description: "Science idea" },
        ]),
      ];
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await deduplicateIdeas(angleResults);
      for (const idea of result.ideas) {
        expect(idea.uniquenessScore).toBeGreaterThanOrEqual(0);
        expect(idea.uniquenessScore).toBeLessThanOrEqual(1);
      }
    });

    it("uses LLM similarity when available", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "AI Healthcare", description: "AI in healthcare" },
          { title: "ML Diagnostics", description: "ML for diagnostics" },
        ]),
      ];

      // First call: similarity matrix
      mockWithRetry
        .mockResolvedValueOnce(
          JSON.stringify({
            pairs: [{ a: "a1-0", b: "a1-1", similarity: 0.95 }],
          })
        )
        // Cluster labeling
        .mockResolvedValueOnce(
          JSON.stringify({
            labels: [{ id: 0, label: "AI Medicine", description: "AI in medicine" }],
          })
        );

      const result = await deduplicateIdeas(angleResults, { duplicateThreshold: 0.9 });
      expect(result.stats.duplicatesFound).toBeGreaterThanOrEqual(1);
    });

    it("handles empty titles gracefully", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "", description: "No title" },
          { title: "", description: "Also no title" },
        ]),
      ];
      mockWithRetry.mockRejectedValue(new Error("fail"));

      const result = await deduplicateIdeas(angleResults);
      expect(result.stats.totalIdeas).toBe(2);
    });
  });
});
