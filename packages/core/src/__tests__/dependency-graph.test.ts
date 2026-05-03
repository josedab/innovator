import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: """${value}"""`),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import {
  RelationshipTypeSchema,
  IdeaDependencyNodeSchema,
  IdeaDependencyEdgeSchema,
  _IdeaDependencyGraphSchema,
  buildIdeaDependencyGraph,
  dependencyGraphToMarkdown,
} from "../dependency-graph/index.js";
import type { IdeaDependencyGraph } from "../dependency-graph/index.js";
import type { AngleResult } from "../types.js";
import { generateText, extractJson } from "../copilot/client.js";

const fakeAngleResults: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Idea A",
        description: "Desc A",
        potentialImpact: "High",
        implementationHint: "Hint A",
      },
      {
        title: "Idea B",
        description: "Desc B",
        potentialImpact: "Medium",
        implementationHint: "Hint B",
      },
    ],
    reasoning: "SCAMPER reasoning",
  },
  {
    angleId: "first-principles",
    angleName: "First Principles",
    ideas: [
      {
        title: "Idea C",
        description: "Desc C",
        potentialImpact: "Low",
        implementationHint: "Hint C",
      },
    ],
    reasoning: "FP reasoning",
  },
];

const fakeLLMResponse = {
  edges: [
    {
      source: "scamper-0",
      target: "scamper-1",
      relationship: "enables",
      strength: 0.8,
      reasoning: "A enables B",
    },
    {
      source: "scamper-0",
      target: "first-principles-0",
      relationship: "complements",
      strength: 0.6,
      reasoning: "A complements C",
    },
  ],
  ideaScores: [
    { id: "scamper-0", impactScore: 9, complexityScore: 3 },
    { id: "scamper-1", impactScore: 7, complexityScore: 5 },
    { id: "first-principles-0", impactScore: 5, complexityScore: 8 },
  ],
  clusters: [{ label: "Core Ideas", nodeIds: ["scamper-0", "scamper-1"] }],
};

describe("dependency-graph", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- Schemas ----

  describe("RelationshipTypeSchema", () => {
    it("validates all relationship types", () => {
      for (const t of ["enables", "requires", "conflicts", "complements", "extends"]) {
        expect(() => RelationshipTypeSchema.parse(t)).not.toThrow();
      }
    });

    it("rejects invalid type", () => {
      expect(() => RelationshipTypeSchema.parse("invalid")).toThrow();
    });
  });

  describe("IdeaDependencyNodeSchema", () => {
    it("validates correct node", () => {
      const node = {
        id: "n1",
        title: "Title",
        description: "Desc",
        angleId: "scamper",
        impactScore: 8,
        complexityScore: 5,
        isCriticalPath: false,
      };
      expect(() => IdeaDependencyNodeSchema.parse(node)).not.toThrow();
    });

    it("applies defaults for optional fields", () => {
      const node = IdeaDependencyNodeSchema.parse({
        id: "n1",
        title: "T",
        description: "D",
        angleId: "a",
      });
      expect(node.impactScore).toBe(5);
      expect(node.complexityScore).toBe(5);
      expect(node.isCriticalPath).toBe(false);
    });

    it("rejects impactScore out of range", () => {
      expect(() =>
        IdeaDependencyNodeSchema.parse({
          id: "n1",
          title: "T",
          description: "D",
          angleId: "a",
          impactScore: 15,
        })
      ).toThrow();
    });
  });

  describe("IdeaDependencyEdgeSchema", () => {
    it("validates correct edge", () => {
      const edge = {
        source: "a",
        target: "b",
        relationship: "enables",
        strength: 0.5,
        reasoning: "test",
      };
      expect(() => IdeaDependencyEdgeSchema.parse(edge)).not.toThrow();
    });

    it("rejects strength out of range", () => {
      expect(() =>
        IdeaDependencyEdgeSchema.parse({
          source: "a",
          target: "b",
          relationship: "enables",
          strength: 2,
          reasoning: "test",
        })
      ).toThrow();
    });
  });

  // ---- buildIdeaDependencyGraph ----

  describe("buildIdeaDependencyGraph", () => {
    it("builds graph from angle results with mocked LLM", async () => {
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(fakeLLMResponse));

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "AI tools");
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.generatedAt).toBeDefined();
      expect(graph.sequencedPlan.length).toBeGreaterThan(0);
    });

    it("returns empty graph for empty angle results", async () => {
      const graph = await buildIdeaDependencyGraph([], "test");
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
      expect(graph.criticalPath).toEqual([]);
      expect(graph.sequencedPlan).toEqual([]);
    });

    it("assigns correct node IDs", async () => {
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(
        JSON.stringify({ edges: [], ideaScores: [], clusters: [] })
      );

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "test");
      const ids = graph.nodes.map((n) => n.id);
      expect(ids).toContain("scamper-0");
      expect(ids).toContain("scamper-1");
      expect(ids).toContain("first-principles-0");
    });

    it("applies impact scores from LLM response", async () => {
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(fakeLLMResponse));

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "test");
      const nodeA = graph.nodes.find((n) => n.id === "scamper-0");
      expect(nodeA?.impactScore).toBe(9);
    });

    it("filters out edges with unknown node IDs", async () => {
      const badEdgeResponse = {
        edges: [
          {
            source: "scamper-0",
            target: "nonexistent",
            relationship: "enables",
            strength: 0.8,
            reasoning: "bad",
          },
          {
            source: "scamper-0",
            target: "scamper-1",
            relationship: "enables",
            strength: 0.8,
            reasoning: "good",
          },
        ],
        ideaScores: [],
        clusters: [],
      };
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(badEdgeResponse));

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "test");
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].target).toBe("scamper-1");
    });

    it("handles LLM failure gracefully (empty edges)", async () => {
      vi.mocked(generateText).mockRejectedValue(new Error("LLM failed"));

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "test");
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toEqual([]);
    });

    it("assigns sequence orders to nodes", async () => {
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(fakeLLMResponse));

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "test");
      const withOrder = graph.nodes.filter((n) => n.sequenceOrder !== undefined);
      expect(withOrder.length).toBe(graph.nodes.length);
    });

    it("identifies critical path nodes", async () => {
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(JSON.stringify(fakeLLMResponse));

      const graph = await buildIdeaDependencyGraph(fakeAngleResults, "test");
      expect(graph.criticalPath.length).toBeGreaterThan(0);
    });
  });

  // ---- dependencyGraphToMarkdown ----

  describe("dependencyGraphToMarkdown", () => {
    const fakeGraph: IdeaDependencyGraph = {
      nodes: [
        {
          id: "n1",
          title: "Idea 1",
          description: "D1",
          angleId: "a",
          impactScore: 8,
          complexityScore: 3,
          isCriticalPath: true,
          sequenceOrder: 0,
        },
        {
          id: "n2",
          title: "Idea 2",
          description: "D2",
          angleId: "b",
          impactScore: 5,
          complexityScore: 5,
          isCriticalPath: false,
          sequenceOrder: 1,
        },
      ],
      edges: [
        { source: "n1", target: "n2", relationship: "enables", strength: 0.8, reasoning: "test" },
      ],
      criticalPath: ["n1"],
      clusters: [{ label: "Group A", nodeIds: ["n1", "n2"] }],
      sequencedPlan: [
        { phase: 1, nodeIds: ["n1"], rationale: "Phase 1: Idea 1" },
        { phase: 2, nodeIds: ["n2"], rationale: "Phase 2: Idea 2" },
      ],
      generatedAt: "2025-01-01T00:00:00Z",
    };

    it("includes header", () => {
      const md = dependencyGraphToMarkdown(fakeGraph);
      expect(md).toContain("Idea Dependency Graph");
    });

    it("includes nodes with impact and complexity", () => {
      const md = dependencyGraphToMarkdown(fakeGraph);
      expect(md).toContain("Idea 1");
      expect(md).toContain("Impact: 8/10");
    });

    it("marks critical path nodes", () => {
      const md = dependencyGraphToMarkdown(fakeGraph);
      expect(md).toContain("CRITICAL PATH");
    });

    it("includes relationships table", () => {
      const md = dependencyGraphToMarkdown(fakeGraph);
      expect(md).toContain("Relationships");
      expect(md).toContain("enables");
      expect(md).toContain("80%");
    });

    it("includes clusters section", () => {
      const md = dependencyGraphToMarkdown(fakeGraph);
      expect(md).toContain("Idea Clusters");
      expect(md).toContain("Group A");
    });

    it("includes phases", () => {
      const md = dependencyGraphToMarkdown(fakeGraph);
      expect(md).toContain("Phase 1");
      expect(md).toContain("Phase 2");
    });

    it("handles graph with no edges", () => {
      const emptyEdges: IdeaDependencyGraph = { ...fakeGraph, edges: [] };
      const md = dependencyGraphToMarkdown(emptyEdges);
      expect(md).not.toContain("Relationships");
    });

    it("handles graph with no clusters", () => {
      const noClusters: IdeaDependencyGraph = { ...fakeGraph, clusters: [] };
      const md = dependencyGraphToMarkdown(noClusters);
      expect(md).not.toContain("Idea Clusters");
    });

    it("handles single node graph", () => {
      const single: IdeaDependencyGraph = {
        nodes: [
          {
            id: "n1",
            title: "Solo",
            description: "D",
            angleId: "a",
            impactScore: 5,
            complexityScore: 5,
            isCriticalPath: false,
          },
        ],
        edges: [],
        criticalPath: ["n1"],
        clusters: [],
        sequencedPlan: [{ phase: 1, nodeIds: ["n1"], rationale: "Phase 1" }],
        generatedAt: "2025-01-01",
      };
      const md = dependencyGraphToMarkdown(single);
      expect(md).toContain("Solo");
    });
  });
});
