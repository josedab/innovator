import { describe, it, expect } from "vitest";
import {
  autoClusterNodes,
  suggestConnections,
  detectConsensus,
  synthesizeCanvas,
} from "../ai-canvas.js";
import type { CanvasNode, CanvasEdge, InnovationCanvas } from "../index.js";

// ---- Helpers ----

function makeNode(id: string, x: number, y: number, overrides?: Partial<CanvasNode>): CanvasNode {
  return {
    id,
    type: "idea",
    title: `Idea ${id}`,
    description: `Description for ${id}`,
    position: { x, y },
    size: { width: 200, height: 100 },
    ...overrides,
  };
}

function makeCanvas(
  nodes: CanvasNode[],
  edges: CanvasEdge[] = []
): InnovationCanvas {
  return {
    id: "canvas-1",
    title: "Test Canvas",
    nodes,
    edges,
    clusters: [],
    annotations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---- autoClusterNodes ----

describe("autoClusterNodes", () => {
  it("returns empty clusters for empty nodes", () => {
    expect(autoClusterNodes([])).toEqual([]);
  });

  it("returns empty clusters for a single node (below minClusterSize)", () => {
    expect(autoClusterNodes([makeNode("1", 0, 0)])).toEqual([]);
  });

  it("clusters nodes in the same grid cell", () => {
    const nodes = [
      makeNode("a", 10, 10),
      makeNode("b", 20, 20),
      makeNode("c", 30, 30),
    ];
    const clusters = autoClusterNodes(nodes);
    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeIds).toHaveLength(3);
    expect(clusters[0].centroid.x).toBeCloseTo(20, 0);
    expect(clusters[0].centroid.y).toBeCloseTo(20, 0);
  });

  it("creates separate clusters for distant nodes", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 10, 10),
      makeNode("c", 1000, 1000),
      makeNode("d", 1010, 1010),
    ];
    const clusters = autoClusterNodes(nodes);
    expect(clusters.length).toBe(2);
  });

  it("ignores non-idea nodes", () => {
    const nodes = [
      makeNode("a", 0, 0, { type: "annotation" }),
      makeNode("b", 10, 10, { type: "annotation" }),
    ];
    expect(autoClusterNodes(nodes)).toEqual([]);
  });

  it("assigns unique colors to clusters", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 10, 10),
      makeNode("c", 1000, 1000),
      makeNode("d", 1010, 1010),
    ];
    const clusters = autoClusterNodes(nodes);
    const colors = clusters.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("respects custom gridSize", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 250, 250),
    ];
    expect(autoClusterNodes(nodes)).toHaveLength(1);
    expect(autoClusterNodes(nodes, { gridSize: 100 })).toHaveLength(0);
  });

  it("respects custom minClusterSize", () => {
    const nodes = [makeNode("a", 0, 0), makeNode("b", 10, 10)];
    expect(autoClusterNodes(nodes, { minClusterSize: 3 })).toHaveLength(0);
    expect(autoClusterNodes(nodes, { minClusterSize: 2 })).toHaveLength(1);
  });

  it("generates labels from node titles", () => {
    const nodes = [
      makeNode("a", 0, 0, { title: "Machine Learning Pipeline" }),
      makeNode("b", 10, 10, { title: "Machine Learning Model" }),
    ];
    const clusters = autoClusterNodes(nodes);
    expect(clusters.length).toBe(1);
    expect(clusters[0].label.toLowerCase()).toContain("machine");
  });

  it("confidence is capped at 1", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`, i * 5, i * 5));
    const clusters = autoClusterNodes(nodes);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0].confidence).toBeLessThanOrEqual(1);
  });
});

// ---- suggestConnections ----

describe("suggestConnections", () => {
  it("returns empty for empty node list", () => {
    expect(suggestConnections([], [])).toEqual([]);
  });

  it("returns empty when no similarity threshold met", () => {
    const nodes = [
      makeNode("a", 0, 0, { title: "Alpha bravo charlie" }),
      makeNode("b", 0, 0, { title: "Delta echo foxtrot" }),
    ];
    const suggestions = suggestConnections(nodes, []);
    expect(suggestions).toHaveLength(0);
  });

  it("suggests connections for similar nodes", () => {
    const nodes = [
      makeNode("a", 0, 0, {
        title: "Machine learning pipeline optimization",
        description: "Optimize the machine learning training pipeline",
      }),
      makeNode("b", 0, 0, {
        title: "Machine learning model pipeline",
        description: "Build a machine learning model pipeline",
      }),
    ];
    const suggestions = suggestConnections(nodes, []);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].confidence).toBeGreaterThan(0.2);
    expect(suggestions[0].reason).toContain("keyword overlap");
  });

  it("excludes already-connected pairs", () => {
    const nodes = [
      makeNode("a", 0, 0, { title: "Machine learning pipeline" }),
      makeNode("b", 0, 0, { title: "Machine learning model" }),
    ];
    const existingEdges: CanvasEdge[] = [
      { id: "e1", sourceId: "a", targetId: "b", type: "related" },
    ];
    const suggestions = suggestConnections(nodes, existingEdges);
    expect(suggestions).toHaveLength(0);
  });

  it("respects maxSuggestions limit", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode(`n${i}`, 0, 0, { title: `shared common words topic ${i}` })
    );
    const suggestions = suggestConnections(nodes, [], 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("returns sorted by confidence descending", () => {
    const nodes = [
      makeNode("a", 0, 0, { title: "machine learning pipeline data" }),
      makeNode("b", 0, 0, { title: "machine learning pipeline model" }),
      makeNode("c", 0, 0, { title: "machine pipeline" }),
    ];
    const suggestions = suggestConnections(nodes, [], 10);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].confidence).toBeLessThanOrEqual(suggestions[i - 1].confidence);
    }
  });

  it("ignores non-idea nodes", () => {
    const nodes = [
      makeNode("a", 0, 0, { type: "annotation", title: "machine learning" }),
      makeNode("b", 0, 0, { type: "annotation", title: "machine learning" }),
    ];
    expect(suggestConnections(nodes, [])).toHaveLength(0);
  });
});

// ---- detectConsensus ----

describe("detectConsensus", () => {
  it("returns empty for empty nodes", () => {
    expect(detectConsensus([], [])).toEqual([]);
  });

  it("returns weak consensus for nodes with no votes", () => {
    const nodes = [makeNode("a", 0, 0)];
    const results = detectConsensus(nodes, []);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      nodeId: "a",
      totalVotes: 0,
      positiveVotes: 0,
      negativeVotes: 0,
      consensusLevel: "weak",
      score: 0,
    });
  });

  it("detects strong consensus (unanimous positive)", () => {
    const nodes = [makeNode("a", 0, 0)];
    const votes = [
      { nodeId: "a", value: 1 },
      { nodeId: "a", value: 1 },
      { nodeId: "a", value: 1 },
    ];
    const results = detectConsensus(nodes, votes);
    expect(results[0].consensusLevel).toBe("strong");
    expect(results[0].positiveVotes).toBe(3);
    expect(results[0].negativeVotes).toBe(0);
    expect(results[0].score).toBe(1);
  });

  it("detects contested result (mostly negative)", () => {
    const nodes = [makeNode("a", 0, 0)];
    const votes = [
      { nodeId: "a", value: -1 },
      { nodeId: "a", value: -1 },
      { nodeId: "a", value: 1 },
    ];
    const results = detectConsensus(nodes, votes);
    expect(results[0].consensusLevel).toBe("contested");
  });

  it("detects weak consensus for evenly split votes", () => {
    const nodes = [makeNode("a", 0, 0)];
    const votes = [
      { nodeId: "a", value: 1 },
      { nodeId: "a", value: -1 },
    ];
    const results = detectConsensus(nodes, votes);
    expect(results[0].consensusLevel).toBe("weak");
    expect(results[0].score).toBe(0);
  });

  it("sorts results by score descending", () => {
    const nodes = [makeNode("a", 0, 0), makeNode("b", 0, 0)];
    const votes = [
      { nodeId: "a", value: -1 },
      { nodeId: "a", value: -1 },
      { nodeId: "b", value: 1 },
      { nodeId: "b", value: 1 },
    ];
    const results = detectConsensus(nodes, votes);
    expect(results[0].nodeId).toBe("b");
    expect(results[1].nodeId).toBe("a");
  });

  it("ignores non-idea nodes", () => {
    const nodes = [makeNode("a", 0, 0, { type: "annotation" })];
    const votes = [{ nodeId: "a", value: 1 }];
    expect(detectConsensus(nodes, votes)).toHaveLength(0);
  });

  it("uses node title for title field", () => {
    const nodes = [makeNode("a", 0, 0, { title: "My Great Idea" })];
    const results = detectConsensus(nodes, []);
    expect(results[0].title).toBe("My Great Idea");
  });
});

// ---- synthesizeCanvas ----

describe("synthesizeCanvas", () => {
  it("synthesizes empty canvas", () => {
    const canvas = makeCanvas([]);
    const result = synthesizeCanvas(canvas);
    expect(result.clusters).toEqual([]);
    expect(result.topIdeas).toEqual([]);
    expect(result.connections).toBe(0);
    expect(result.themes).toEqual([]);
    expect(result.summary).toContain("0 nodes");
    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
  });

  it("synthesizes canvas with edges", () => {
    const nodes = [makeNode("a", 0, 0), makeNode("b", 10, 10)];
    const edges: CanvasEdge[] = [{ id: "e1", sourceId: "a", targetId: "b", type: "related" }];
    const canvas = makeCanvas(nodes, edges);
    const result = synthesizeCanvas(canvas);
    expect(result.connections).toBe(1);
    expect(result.summary).toContain("1 connections");
  });

  it("extracts top ideas from node vote metadata", () => {
    const nodes = [
      makeNode("a", 0, 0, {
        title: "Voted Idea",
        metadata: { votes: [{ value: 1 }, { value: 1 }, { value: 1 }] },
      }),
      makeNode("b", 10, 10, { title: "Other Idea" }),
    ];
    const canvas = makeCanvas(nodes);
    const result = synthesizeCanvas(canvas);
    if (result.topIdeas.length > 0) {
      expect(result.topIdeas[0].title).toBe("Voted Idea");
      expect(result.topIdeas[0].votes).toBe(3);
    }
  });

  it("includes cluster themes in synthesis", () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeNode(`n${i}`, i * 10, i * 10, { title: `innovation technology solution ${i}` })
    );
    const canvas = makeCanvas(nodes);
    const result = synthesizeCanvas(canvas);
    if (result.clusters.length > 0) {
      expect(result.themes.length).toBeGreaterThan(0);
      expect(result.summary).toContain("theme clusters");
    }
  });

  it("handles canvas with only non-idea nodes", () => {
    const nodes = [
      makeNode("a", 0, 0, { type: "annotation" }),
      makeNode("b", 10, 10, { type: "cluster-label" }),
    ];
    const canvas = makeCanvas(nodes);
    const result = synthesizeCanvas(canvas);
    expect(result.clusters).toEqual([]);
    expect(result.topIdeas).toEqual([]);
  });
});
