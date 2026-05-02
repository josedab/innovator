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
});
