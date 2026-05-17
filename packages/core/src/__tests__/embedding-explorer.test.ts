import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { generateText, extractJson } from "../copilot/client.js";
import {
  buildEmbeddingSpace,
  generateInWhiteSpace,
  clearEmbeddingSpaces,
  listEmbeddingSpaces,
  getEmbeddingSpace,
  Point3DSchema,
  EmbeddedIdeaSchema,
  IdeaClusterSchema,
  WhiteSpaceSchema,
  EmbeddingSpaceSchema,
} from "../embedding-explorer/index.js";
import type { IdeaInput, WhiteSpace } from "../embedding-explorer/index.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

describe("embedding-explorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEmbeddingSpaces();
  });

  // ---- Zod Schema Validation ----

  describe("schemas", () => {
    it("validates Point3D", () => {
      expect(Point3DSchema.parse({ x: 1.5, y: -2.3, z: 0 })).toEqual({ x: 1.5, y: -2.3, z: 0 });
      expect(() => Point3DSchema.parse({ x: "a", y: 0, z: 0 })).toThrow();
    });

    it("validates EmbeddedIdea", () => {
      const valid = {
        id: "i1",
        title: "Test",
        description: "Desc",
        position: { x: 0, y: 0, z: 0 },
        clusterId: 0,
        tags: ["tag1"],
        score: 0.8,
      };
      expect(() => EmbeddedIdeaSchema.parse(valid)).not.toThrow();
      expect(() => EmbeddedIdeaSchema.parse({ ...valid, clusterId: -2 })).toThrow();
    });

    it("validates IdeaCluster", () => {
      const valid = {
        id: 0,
        label: "Cluster",
        centroid: { x: 0, y: 0, z: 0 },
        ideaCount: 3,
        density: 1.5,
        themes: ["AI"],
      };
      expect(() => IdeaClusterSchema.parse(valid)).not.toThrow();
      expect(() => IdeaClusterSchema.parse({ ...valid, density: -1 })).toThrow();
    });

    it("validates WhiteSpace", () => {
      const valid = {
        id: "gap-0-1",
        position: { x: 1, y: 2, z: 3 },
        nearestClusters: ["A", "B"],
        gapDescription: "Gap between A and B",
        innovationPotential: "high",
        suggestedDirection: "Combine",
      };
      expect(() => WhiteSpaceSchema.parse(valid)).not.toThrow();
      expect(() => WhiteSpaceSchema.parse({ ...valid, innovationPotential: "extreme" })).toThrow();
    });

    it("validates EmbeddingSpace", () => {
      const valid = {
        ideas: [],
        clusters: [],
        whiteSpaces: [],
        dimensions: { xLabel: "X", yLabel: "Y", zLabel: "Z" },
        totalIdeas: 0,
        generatedAt: new Date().toISOString(),
      };
      expect(() => EmbeddingSpaceSchema.parse(valid)).not.toThrow();
    });
  });

  // ---- buildEmbeddingSpace ----

  describe("buildEmbeddingSpace", () => {
    const mockIdeas: IdeaInput[] = [
      {
        id: "1",
        title: "AI chatbot",
        description: "A smart chatbot for customer service",
        tags: ["ai", "chat"],
      },
      {
        id: "2",
        title: "Blockchain supply chain",
        description: "Track goods using blockchain",
        tags: ["blockchain"],
      },
      {
        id: "3",
        title: "IoT sensors",
        description: "Smart sensors for agriculture monitoring",
        tags: ["iot", "agriculture"],
      },
      {
        id: "4",
        title: "ML fraud detection",
        description: "Machine learning for detecting fraud",
        tags: ["ml", "security"],
      },
    ];

    it("throws for empty ideas array", async () => {
      await expect(buildEmbeddingSpace([])).rejects.toThrow("At least one idea is required");
    });

    it("builds space with 3+ ideas and LLM labeling", async () => {
      const clusterLabels = [
        { id: 0, label: "AI & ML", themes: ["artificial intelligence", "machine learning"] },
        { id: 1, label: "IoT", themes: ["sensors"] },
      ];
      mockGenerateText.mockResolvedValue("json response");
      mockExtractJson.mockReturnValue(JSON.stringify(clusterLabels));

      const space = await buildEmbeddingSpace(mockIdeas);

      expect(space.totalIdeas).toBe(4);
      expect(space.ideas).toHaveLength(4);
      expect(space.clusters.length).toBeGreaterThanOrEqual(1);
      expect(space.dimensions.xLabel).toBe("Feasibility ↔ Novelty");
      expect(space.generatedAt).toBeTruthy();

      // Each idea has a position
      for (const idea of space.ideas) {
        expect(idea.position).toBeDefined();
        expect(typeof idea.position.x).toBe("number");
      }
    });

    it("uses fallback cluster labels when LLM fails", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

      const space = await buildEmbeddingSpace(mockIdeas);

      expect(space.totalIdeas).toBe(4);
      for (const cluster of space.clusters) {
        expect(cluster.label).toMatch(/^Cluster \d+$/);
        expect(cluster.themes).toEqual([]);
      }
    });

    it("handles single idea", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify([{ id: 0, label: "Solo", themes: [] }]));

      const space = await buildEmbeddingSpace([mockIdeas[0]]);
      expect(space.totalIdeas).toBe(1);
      expect(space.ideas[0].position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("handles ideas with empty tags", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify([]));

      const ideas: IdeaInput[] = [
        { id: "1", title: "Test", description: "Desc" },
        { id: "2", title: "Test2", description: "Desc2" },
      ];
      const space = await buildEmbeddingSpace(ideas);
      expect(space.ideas[0].tags).toEqual([]);
    });

    it("stores and retrieves embedding spaces", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify([]));

      await buildEmbeddingSpace(mockIdeas);
      const list = listEmbeddingSpaces();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].totalIdeas).toBe(4);
    });

    it("respects custom clusterCount", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify([]));

      const space = await buildEmbeddingSpace(mockIdeas, { clusterCount: 2 });
      expect(space.clusters.length).toBeLessThanOrEqual(2);
    });

    it("computes avgScore for clusters when ideas have scores", async () => {
      const ideas: IdeaInput[] = [
        { id: "1", title: "AI chatbot", description: "Smart chatbot", score: 0.9 },
        { id: "2", title: "ML model", description: "ML for fraud", score: 0.7 },
        { id: "3", title: "IoT sensor", description: "Farm sensors", score: 0.5 },
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify([{ id: 0, label: "All", themes: ["tech"] }]));

      const space = await buildEmbeddingSpace(ideas, { clusterCount: 1 });
      const cluster = space.clusters[0];
      if (cluster.avgScore !== undefined) {
        expect(cluster.avgScore).toBeGreaterThan(0);
        expect(cluster.avgScore).toBeLessThanOrEqual(1);
      }
    });
  });

  // ---- generateInWhiteSpace ----

  describe("generateInWhiteSpace", () => {
    const ws: WhiteSpace = {
      id: "gap-0-1",
      position: { x: 1, y: 2, z: 3 },
      nearestClusters: ["AI", "IoT"],
      gapDescription: "Between AI and IoT",
      innovationPotential: "high",
      suggestedDirection: "Combine AI with IoT",
    };

    it("generates ideas for a white space using LLM", async () => {
      const mockIdeas = [
        { title: "Smart Farm AI", description: "AI-powered farm monitoring" },
        { title: "IoT ML Pipeline", description: "ML pipeline for IoT data" },
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockIdeas));

      const ideas = await generateInWhiteSpace(ws, ["existing idea 1"], "agriculture");

      expect(ideas).toHaveLength(2);
      expect(ideas[0].title).toBe("Smart Farm AI");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("handles LLM returning object with ideas key", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({ ideas: [{ title: "Idea 1", description: "Desc 1" }] })
      );

      const ideas = await generateInWhiteSpace(ws, [], "tech");
      expect(ideas).toHaveLength(1);
    });

    it("truncates long titles and descriptions", async () => {
      const longTitle = "A".repeat(600);
      const longDesc = "B".repeat(3000);
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify([{ title: longTitle, description: longDesc }])
      );

      const ideas = await generateInWhiteSpace(ws, [], "tech");
      expect(ideas[0].title.length).toBeLessThanOrEqual(500);
      expect(ideas[0].description.length).toBeLessThanOrEqual(2000);
    });
  });

  // ---- Store operations ----

  describe("store operations", () => {
    it("getEmbeddingSpace returns undefined for unknown ID", () => {
      expect(getEmbeddingSpace("nonexistent")).toBeUndefined();
    });

    it("clearEmbeddingSpaces removes all spaces", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify([]));
      await buildEmbeddingSpace([{ id: "1", title: "T", description: "D" }]);
      expect(listEmbeddingSpaces().length).toBeGreaterThan(0);
      clearEmbeddingSpaces();
      expect(listEmbeddingSpaces()).toHaveLength(0);
    });
  });
});
