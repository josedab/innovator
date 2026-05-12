import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: """${value}"""`),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import {
  buildIdeaDependencyGraph,
  dependencyGraphToMarkdown,
  dependencyGraphToMermaid,
} from "../dependency-graph/index.js";
import type { IdeaDependencyGraph } from "../dependency-graph/index.js";
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

describe("dependency-graph (extended)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("buildIdeaDependencyGraph — LLM failure fallback", () => {
    it("returns graph with empty edges when LLM fails", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "Foundation API", description: "Core API layer" },
          { title: "Auth Service", description: "Authentication service" },
        ]),
      ];

      mockWithRetry.mockRejectedValue(new Error("LLM failure"));

      const graph = await buildIdeaDependencyGraph(angleResults, "Fallback test");
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toEqual([]);
      expect(graph.criticalPath.length).toBeGreaterThan(0);
      // All nodes should still get sequence orders
      for (const node of graph.nodes) {
        expect(node.sequenceOrder).toBeDefined();
      }
    });
  });

  describe("buildIdeaDependencyGraph — critical path", () => {
    it("critical path follows highest cumulative impact", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "High Impact Start", description: "Starting point" },
          { title: "Medium Impact Next", description: "Next step" },
          { title: "Low Impact Branch", description: "Alternative" },
        ]),
      ];

      const linearResponse = {
        edges: [
          {
            source: "a1-0",
            target: "a1-1",
            relationship: "enables",
            strength: 0.9,
            reasoning: "Main path",
          },
          {
            source: "a1-0",
            target: "a1-2",
            relationship: "enables",
            strength: 0.5,
            reasoning: "Branch",
          },
        ],
        ideaScores: [
          { id: "a1-0", impactScore: 9, complexityScore: 3 },
          { id: "a1-1", impactScore: 8, complexityScore: 5 },
          { id: "a1-2", impactScore: 2, complexityScore: 2 },
        ],
        clusters: [],
      };

      mockWithRetry.mockResolvedValue(linearResponse);

      const graph = await buildIdeaDependencyGraph(angleResults, "Path test");
      expect(graph.criticalPath.length).toBeGreaterThanOrEqual(1);
      // Critical path should include the high-impact nodes
      expect(graph.criticalPath).toContain("a1-0");
    });

    it("single idea has trivial critical path", async () => {
      const angleResults = [
        makeAngleResult("a1", [{ title: "Only Idea", description: "The only one" }]),
      ];

      mockWithRetry.mockResolvedValue(JSON.stringify({ edges: [], ideaScores: [], clusters: [] }));

      const graph = await buildIdeaDependencyGraph(angleResults, "Single");
      expect(graph.criticalPath).toContain("a1-0");
      expect(graph.nodes).toHaveLength(1);
    });

    it("all independent ideas each get sequence order", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "Idea X", description: "Independent X" },
          { title: "Idea Y", description: "Independent Y" },
          { title: "Idea Z", description: "Independent Z" },
        ]),
      ];

      mockWithRetry.mockResolvedValue(JSON.stringify({ edges: [], ideaScores: [], clusters: [] }));

      const graph = await buildIdeaDependencyGraph(angleResults, "Independent");
      expect(graph.nodes).toHaveLength(3);
      // All should have sequence orders
      for (const node of graph.nodes) {
        expect(node.sequenceOrder).toBeDefined();
      }
      // With no edges, all go in phase 1
      expect(graph.sequencedPlan).toHaveLength(1);
      expect(graph.sequencedPlan[0].nodeIds).toHaveLength(3);
    });
  });

  describe("dependencyGraphToMermaid", () => {
    const testGraph: IdeaDependencyGraph = {
      nodes: [
        {
          id: "n1",
          title: "Node One",
          description: "D1",
          angleId: "a",
          impactScore: 8,
          complexityScore: 3,
          isCriticalPath: true,
          sequenceOrder: 0,
        },
        {
          id: "n2",
          title: "Node Two",
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
        { phase: 1, nodeIds: ["n1"], rationale: "Phase 1" },
        { phase: 2, nodeIds: ["n2"], rationale: "Phase 2" },
      ],
      generatedAt: "2025-01-01T00:00:00Z",
    };

    it("starts with graph TD directive", () => {
      const mermaid = dependencyGraphToMermaid(testGraph);
      expect(mermaid).toMatch(/^graph TD/);
    });

    it("includes node definitions", () => {
      const mermaid = dependencyGraphToMermaid(testGraph);
      expect(mermaid).toContain('n1[["Node One"]]'); // Critical path uses [[ ]]
      expect(mermaid).toContain('n2["Node Two"]');
    });

    it("includes edge definitions with relationship labels", () => {
      const mermaid = dependencyGraphToMermaid(testGraph);
      expect(mermaid).toContain("n1 -->|enables| n2");
    });

    it("styles critical path nodes", () => {
      const mermaid = dependencyGraphToMermaid(testGraph);
      expect(mermaid).toContain("classDef critical");
      expect(mermaid).toContain("class n1 critical");
    });

    it("styles cluster nodes", () => {
      const mermaid = dependencyGraphToMermaid(testGraph);
      expect(mermaid).toContain("classDef cluster0");
      expect(mermaid).toContain("class n1,n2 cluster0");
    });

    it("uses correct arrow styles for each relationship type", () => {
      const graphWithAllTypes: IdeaDependencyGraph = {
        ...testGraph,
        edges: [
          { source: "n1", target: "n2", relationship: "enables", strength: 0.8, reasoning: "" },
          { source: "n1", target: "n2", relationship: "requires", strength: 0.8, reasoning: "" },
          { source: "n1", target: "n2", relationship: "conflicts", strength: 0.8, reasoning: "" },
          { source: "n1", target: "n2", relationship: "complements", strength: 0.8, reasoning: "" },
          { source: "n1", target: "n2", relationship: "extends", strength: 0.8, reasoning: "" },
        ],
      };
      const mermaid = dependencyGraphToMermaid(graphWithAllTypes);
      expect(mermaid).toContain("-->|enables|");
      expect(mermaid).toContain("-.->|requires|");
      expect(mermaid).toContain("--x|conflicts|");
      expect(mermaid).toContain("<-->|complements|");
      expect(mermaid).toContain("==>|extends|");
    });

    it("handles empty graph", () => {
      const empty: IdeaDependencyGraph = {
        nodes: [],
        edges: [],
        criticalPath: [],
        clusters: [],
        sequencedPlan: [],
        generatedAt: "2025-01-01",
      };
      const mermaid = dependencyGraphToMermaid(empty);
      expect(mermaid.trim()).toBe("graph TD");
    });
  });

  describe("dependencyGraphToMarkdown", () => {
    it("includes all sections", () => {
      const graph: IdeaDependencyGraph = {
        nodes: [
          {
            id: "n1",
            title: "Node 1",
            description: "D1",
            angleId: "a",
            impactScore: 8,
            complexityScore: 3,
            isCriticalPath: true,
            sequenceOrder: 0,
          },
        ],
        edges: [
          { source: "n1", target: "n1", relationship: "enables", strength: 0.5, reasoning: "self" },
        ],
        criticalPath: ["n1"],
        clusters: [{ label: "Cluster 1", nodeIds: ["n1"] }],
        sequencedPlan: [{ phase: 1, nodeIds: ["n1"], rationale: "Phase 1" }],
        generatedAt: "2025-01-01T00:00:00Z",
      };

      const md = dependencyGraphToMarkdown(graph);
      expect(md).toContain("# Idea Dependency Graph");
      expect(md).toContain("## Implementation Sequence");
      expect(md).toContain("## Idea Clusters");
      expect(md).toContain("## Relationships");
      expect(md).toContain("Generated: 2025-01-01T00:00:00Z");
    });
  });

  describe("topological sort respects dependencies", () => {
    it("sequences ideas with no edges into single phase", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "Database Schema", description: "Design the schema" },
          { title: "API Layer", description: "Build the API" },
        ]),
      ];

      mockWithRetry.mockRejectedValue(new Error("fail"));

      const graph = await buildIdeaDependencyGraph(angleResults, "Sequence test");
      // With no edges, all nodes in one phase
      expect(graph.sequencedPlan).toHaveLength(1);
      expect(graph.sequencedPlan[0].nodeIds).toHaveLength(2);
    });
  });

  describe("edge count validation", () => {
    it("returns zero edges when LLM fails", async () => {
      const angleResults = [
        makeAngleResult("a1", [
          { title: "Idea P", description: "P" },
          { title: "Idea Q", description: "Q" },
        ]),
      ];

      mockWithRetry.mockRejectedValue(new Error("fail"));

      const graph = await buildIdeaDependencyGraph(angleResults, "Edge count");
      expect(graph.edges).toHaveLength(0);
      expect(graph.nodes).toHaveLength(2);
    });
  });
});
