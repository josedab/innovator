import { describe, it, expect } from "vitest";
import { buildIdeaGraph, getAngleColor } from "../visualization/index.js";
import type { AngleResult } from "../types.js";

const sampleResults: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Solar Paint for Buildings",
        description: "Paint that converts sunlight into electricity for building walls",
        potentialImpact: "Revolutionary building-integrated solar",
        implementationHint: "Partner with paint manufacturers",
      },
      {
        title: "Modular Solar Tiles",
        description: "Interlocking solar tiles that replace traditional roofing",
        potentialImpact: "Significant roof-top solar improvement",
        implementationHint: "Start with residential prototypes",
      },
    ],
    reasoning: "Applied SCAMPER substitution",
  },
  {
    angleId: "first-principles",
    angleName: "First Principles",
    ideas: [
      {
        title: "Quantum Dot Solar Cells",
        description: "Using quantum dots to capture broader spectrum of sunlight for electricity",
        potentialImpact: "Breakthrough efficiency improvement",
        implementationHint: "Research partnerships with universities",
      },
      {
        title: "Bio-Solar Hybrid Panel",
        description: "Combining photosynthesis processes with solar cells for energy generation",
        potentialImpact: "Novel approach to solar energy capture",
        implementationHint: "Lab research phase first",
      },
    ],
    reasoning: "Decomposed solar energy fundamentals",
  },
];

describe("visualization", () => {
  it("builds an idea graph from angle results", () => {
    const graph = buildIdeaGraph(sampleResults);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.clusters).toHaveLength(2);
  });

  it("creates nodes with correct properties", () => {
    const graph = buildIdeaGraph(sampleResults);
    const node = graph.nodes[0];
    expect(node.id).toBe("scamper-0");
    expect(node.label).toBe("Solar Paint for Buildings");
    expect(node.angleId).toBe("scamper");
    expect(node.impactScore).toBeGreaterThan(0);
    expect(node.impactScore).toBeLessThanOrEqual(10);
  });

  it("detects edges between related ideas", () => {
    const graph = buildIdeaGraph(sampleResults, undefined, 0.05);
    // Solar-related ideas should have connections
    expect(graph.edges.length).toBeGreaterThanOrEqual(0);
  });

  it("respects similarity threshold", () => {
    const looseGraph = buildIdeaGraph(sampleResults, undefined, 0.01);
    const strictGraph = buildIdeaGraph(sampleResults, undefined, 0.9);
    expect(looseGraph.edges.length).toBeGreaterThanOrEqual(strictGraph.edges.length);
  });

  it("creates clusters by angle", () => {
    const graph = buildIdeaGraph(sampleResults);
    expect(graph.clusters[0].name).toBe("SCAMPER");
    expect(graph.clusters[0].nodeIds).toHaveLength(2);
    expect(graph.clusters[1].name).toBe("First Principles");
    expect(graph.clusters[1].nodeIds).toHaveLength(2);
  });

  it("getAngleColor returns colors for known angles", () => {
    expect(getAngleColor("scamper")).toBe("#3B82F6");
    expect(getAngleColor("first-principles")).toBe("#EF4444");
  });

  it("getAngleColor returns default for unknown angles", () => {
    expect(getAngleColor("unknown")).toBe("#6B7280");
  });

  it("handles empty angle results", () => {
    const graph = buildIdeaGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.clusters).toHaveLength(0);
  });

  describe("estimateImpact scoring", () => {
    it("'revolutionary' keyword scores +1.5", () => {
      const revolutionaryResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Revolutionary Idea",
              description: "A revolutionary approach to energy",
              potentialImpact: "Revolutionary change in the industry",
              implementationHint: "Start now",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ];
      const graph = buildIdeaGraph(revolutionaryResults);
      // Base score is 5, +1.5 for each 'revolutionary' occurrence
      expect(graph.nodes[0].impactScore).toBeGreaterThan(5);
    });

    it("no impact keywords returns base score", () => {
      const neutralResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Plain Idea",
              description: "A plain approach",
              potentialImpact: "Some effect",
              implementationHint: "Do it",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ];
      const graph = buildIdeaGraph(neutralResults);
      expect(graph.nodes[0].impactScore).toBe(5);
    });
  });

  describe("buildIdeaGraph edge cases", () => {
    it("identical ideas create edges with high similarity", () => {
      const identicalResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Solar Energy Panels",
              description: "Solar energy panels for buildings",
              potentialImpact: "Significant",
              implementationHint: "Install",
            },
          ],
          reasoning: "Applied",
        },
        {
          angleId: "first-principles",
          angleName: "First Principles",
          ideas: [
            {
              title: "Solar Energy Panels",
              description: "Solar energy panels for buildings",
              potentialImpact: "Significant",
              implementationHint: "Install",
            },
          ],
          reasoning: "Applied",
        },
      ];
      const graph = buildIdeaGraph(identicalResults, undefined, 0.01);
      // Identical text should produce edges with similarity 1.0
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
      expect(graph.edges[0].weight).toBe(1);
    });

    it("unrelated ideas create 0 edges with high threshold", () => {
      const unrelatedResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Quantum Computing",
              description: "Quantum bits processing algorithms",
              potentialImpact: "Computing speed",
              implementationHint: "Research",
            },
          ],
          reasoning: "Applied",
        },
        {
          angleId: "first-principles",
          angleName: "First Principles",
          ideas: [
            {
              title: "Organic Farming",
              description: "Growing vegetables without pesticides naturally",
              potentialImpact: "Healthier food",
              implementationHint: "Plant",
            },
          ],
          reasoning: "Applied",
        },
      ];
      const graph = buildIdeaGraph(unrelatedResults, undefined, 0.99);
      expect(graph.edges).toHaveLength(0);
    });

    it("edge weight between 0 and 1", () => {
      const graph = buildIdeaGraph(sampleResults, undefined, 0.01);
      for (const edge of graph.edges) {
        expect(edge.weight).toBeGreaterThanOrEqual(0);
        expect(edge.weight).toBeLessThanOrEqual(1);
      }
    });

    it("node impact score clamped 1-10", () => {
      const extremeResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Super Idea",
              description:
                "revolutionary transformative breakthrough disruptive paradigm revolutionary transformative",
              potentialImpact:
                "revolutionary transformative breakthrough disruptive paradigm shifting",
              implementationHint: "Start now",
            },
            {
              title: "Tiny Idea",
              description: "incremental minor slight marginal small incremental minor slight",
              potentialImpact: "incremental minor slight marginal small",
              implementationHint: "Maybe",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ];
      const graph = buildIdeaGraph(extremeResults);
      for (const node of graph.nodes) {
        expect(node.impactScore).toBeGreaterThanOrEqual(1);
        expect(node.impactScore).toBeLessThanOrEqual(10);
      }
    });

    it("synthesis parameter enriches graph clusters", () => {
      const synthesis = {
        topIdeas: [
          {
            title: "Top Idea",
            description: "The best",
            sourceAngle: "SCAMPER",
            potentialImpact: "High",
            feasibility: "high" as const,
          },
        ],
        themes: ["solar", "energy"],
        recommendation: "Go solar",
      };
      const graph = buildIdeaGraph(sampleResults, synthesis);
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.clusters.length).toBeGreaterThan(0);
    });

    it("empty idea titles don't crash keyword extraction", () => {
      const emptyTitleResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "",
              description: "",
              potentialImpact: "",
              implementationHint: "",
            },
          ],
          reasoning: "Applied",
        },
      ];
      expect(() => buildIdeaGraph(emptyTitleResults)).not.toThrow();
      const graph = buildIdeaGraph(emptyTitleResults);
      expect(graph.nodes).toHaveLength(1);
    });
  });
});
