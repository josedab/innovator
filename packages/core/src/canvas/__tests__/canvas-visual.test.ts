import { describe, it, expect } from "vitest";
import type { CanvasEdge, CanvasNode, InnovationCanvas } from "../index.js";
import {
  classifyQuadrant,
  buildPriorityMatrix,
  layoutPriorityMatrix,
  priorityMatrixToSvg,
  priorityMatrixToMarkdown,
} from "../priority-matrix.js";
import {
  applyLayout,
  forceDirectedLayout,
  gridLayout,
  radialLayout,
  hierarchicalLayout,
} from "../auto-layout.js";
import { canvasToJson, canvasToPng, canvasToMarkdown } from "../canvas-export.js";

function makeNode(
  id: string,
  x: number = 0,
  y: number = 0,
  overrides?: Partial<CanvasNode>
): CanvasNode {
  return {
    id,
    type: "idea",
    title: `Idea ${id}`,
    description: `Description ${id}`,
    position: { x, y },
    size: { width: 180, height: 100 },
    ...overrides,
  };
}

function makeCanvas(
  nodes: CanvasNode[],
  edges: CanvasEdge[] = [],
  overrides?: Partial<InnovationCanvas>
): InnovationCanvas {
  return {
    id: "canvas-visual",
    title: "Visual Canvas",
    nodes,
    edges,
    clusters: [],
    annotations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("priority matrix", () => {
  it("classifies all quadrants correctly", () => {
    expect(classifyQuadrant(9, 2)).toBe("quick-win");
    expect(classifyQuadrant(8, 8)).toBe("strategic");
    expect(classifyQuadrant(3, 2)).toBe("fill-in");
    expect(classifyQuadrant(2, 8)).toBe("avoid");
  });

  it("builds a priority matrix with positioned nodes", () => {
    const matrix = buildPriorityMatrix([
      { id: "a", title: "Fast automation", impact: 9, effort: 2 },
      { id: "b", title: "Long-term platform", impact: 8, effort: 8 },
    ]);

    expect(matrix.nodes).toHaveLength(2);
    expect(matrix.nodes[0].quadrant).toBe("quick-win");
    expect(matrix.nodes[0].position.x).toBeLessThan(matrix.width / 2);
    expect(matrix.nodes[0].position.y).toBeLessThan(matrix.height / 2);
    expect(matrix.nodes[1].quadrant).toBe("strategic");
  });

  it("repositions canvas nodes into quadrants", () => {
    const canvas = makeCanvas([makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")]);

    const laidOut = layoutPriorityMatrix(canvas, [
      { nodeId: "a", impact: 9, effort: 2 },
      { nodeId: "b", impact: 8, effort: 8 },
      { nodeId: "c", impact: 2, effort: 2 },
      { nodeId: "d", impact: 1, effort: 8 },
    ]);

    const positions = new Map(laidOut.nodes.map((node) => [node.id, node.position]));
    expect(positions.get("a")?.x).toBeLessThan(400);
    expect(positions.get("a")?.y).toBeLessThan(300);
    expect(positions.get("b")?.x).toBeGreaterThan(400);
    expect(positions.get("b")?.y).toBeLessThan(300);
    expect(positions.get("c")?.x).toBeLessThan(400);
    expect(positions.get("c")?.y).toBeGreaterThan(300);
    expect(positions.get("d")?.x).toBeGreaterThan(400);
    expect(positions.get("d")?.y).toBeGreaterThan(300);
  });

  it("renders svg and markdown exports", () => {
    const matrix = buildPriorityMatrix([
      { id: "a", title: "Fast automation", impact: 9, effort: 2 },
    ]);
    const svg = priorityMatrixToSvg(matrix);
    const markdown = priorityMatrixToMarkdown(matrix);

    expect(svg).toContain("<svg");
    expect(svg).toContain("Quick Wins");
    expect(svg).toContain("Effort");
    expect(svg).toContain("Impact");
    expect(markdown).toContain("| Idea | Impact | Effort | Quadrant |");
    expect(markdown).toContain("Fast automation");
  });
});

describe("auto-layout", () => {
  it("lays out nodes in a grid", () => {
    const nodes = gridLayout([makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")], 2);
    expect(nodes[0].position).toEqual({ x: 60, y: 60 });
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x);
    expect(nodes[2].position.y).toBeGreaterThan(nodes[0].position.y);
  });

  it("lays out nodes radially around a center node", () => {
    const nodes = radialLayout(
      [makeNode("center"), makeNode("a"), makeNode("b"), makeNode("c")],
      "center"
    );
    const center = nodes.find((node) => node.id === "center");
    const orbiting = nodes.filter((node) => node.id !== "center");

    expect(center?.position).toEqual({ x: 400, y: 300 });
    expect(orbiting.every((node) => node.position.x !== 400 || node.position.y !== 300)).toBe(true);
  });

  it("spreads nodes with force-directed layout", () => {
    const nodes = forceDirectedLayout(
      [makeNode("a", 0, 0), makeNode("b", 0, 0), makeNode("c", 0, 0)],
      [{ id: "e1", sourceId: "a", targetId: "b", type: "related" }]
    );

    const uniquePositions = new Set(nodes.map((node) => `${node.position.x}:${node.position.y}`));
    expect(uniquePositions.size).toBeGreaterThan(1);
  });

  it("creates hierarchical levels from directed edges", () => {
    const nodes = hierarchicalLayout(
      [makeNode("root"), makeNode("child-1"), makeNode("child-2")],
      [
        { id: "e1", sourceId: "root", targetId: "child-1", type: "enables" },
        { id: "e2", sourceId: "root", targetId: "child-2", type: "enables" },
      ]
    );

    const root = nodes.find((node) => node.id === "root");
    const child = nodes.find((node) => node.id === "child-1");
    expect(root?.position.y).toBeLessThan(child?.position.y ?? 0);
  });

  it("applies layouts to a canvas and updates timestamps", () => {
    const canvas = makeCanvas([makeNode("a"), makeNode("b")]);
    const laidOut = applyLayout(canvas, "grid");

    expect(laidOut.updatedAt).not.toBe(canvas.updatedAt);
    expect(laidOut.nodes[0].position).toEqual({ x: 60, y: 60 });
  });
});

describe("canvas export formats", () => {
  it("exports a full json representation", () => {
    const canvas = makeCanvas([makeNode("a")]);
    const exported = JSON.parse(canvasToJson(canvas)) as InnovationCanvas;

    expect(exported.title).toBe(canvas.title);
    expect(exported.nodes[0].id).toBe("a");
  });

  it("exports markdown with nodes and relationships", () => {
    const canvas = makeCanvas(
      [makeNode("a"), makeNode("b")],
      [{ id: "e1", sourceId: "a", targetId: "b", type: "related", label: "supports" }]
    );

    const markdown = canvasToMarkdown(canvas);
    expect(markdown).toContain("## Nodes");
    expect(markdown).toContain("## Relationships");
    expect(markdown).toContain("supports");
  });

  it("exports a base64 data uri from the svg rendering", () => {
    const canvas = makeCanvas([makeNode("a")]);
    const png = canvasToPng(canvas);
    const decoded = Buffer.from(png.split(",")[1], "base64").toString("utf-8");

    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    expect(decoded).toContain("<svg");
  });
});
