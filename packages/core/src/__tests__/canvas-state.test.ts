import { beforeEach, describe, expect, it } from "vitest";

import {
  CanvasStateSchema,
  addCanvasNode,
  applyGridLayout,
  applyHierarchicalLayout,
  canvasStateToJson,
  canvasStateToSvg,
  clearCanvasStates,
  createCanvasState,
  createCluster,
  getCanvasState,
  mergeCluster,
  removeCanvasNode,
  ungroupCluster,
} from "../canvas/canvas-state.js";
import {
  addCanvasStateEdge,
  createCanvasState as createCanvasStateFromCanvasIndex,
} from "../canvas/index.js";

describe("canvas-state", () => {
  beforeEach(() => {
    clearCanvasStates();
  });

  it("creates a canvas state and stores it in memory", () => {
    const canvas = createCanvasState("Innovation map");

    expect(CanvasStateSchema.parse(canvas)).toEqual(canvas);
    expect(getCanvasState(canvas.id)?.name).toBe("Innovation map");
  });

  it("adds nodes, edges, and removes dependent edges when a node is removed", () => {
    const canvas = createCanvasState("Journey");
    const nodeA = addCanvasNode(canvas.id, {
      type: "idea",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      label: "Source",
    })!;
    const nodeB = addCanvasNode(canvas.id, {
      type: "note",
      x: 250,
      y: 50,
      width: 180,
      height: 80,
      label: "Insight",
    })!;

    const edge = addCanvasStateEdge(canvas.id, nodeA.id, nodeB.id, "supports");
    expect(edge?.label).toBe("supports");

    expect(removeCanvasNode(canvas.id, nodeA.id)).toBe(true);
    expect(getCanvasState(canvas.id)?.edges).toHaveLength(0);
  });

  it("creates, merges, and ungroups clusters", () => {
    const canvas = createCanvasStateFromCanvasIndex("Clusters");
    const nodes = [
      addCanvasNode(canvas.id, { type: "idea", x: 0, y: 0, width: 200, height: 100, label: "A" })!,
      addCanvasNode(canvas.id, {
        type: "idea",
        x: 260,
        y: 0,
        width: 200,
        height: 100,
        label: "B",
      })!,
      addCanvasNode(canvas.id, {
        type: "idea",
        x: 520,
        y: 0,
        width: 200,
        height: 100,
        label: "C",
      })!,
    ];

    const clusterOne = createCluster(canvas.id, "Alpha", [nodes[0].id, nodes[1].id])!;
    const clusterTwo = createCluster(canvas.id, "Beta", [nodes[2].id])!;
    const merged = mergeCluster(canvas.id, [clusterOne.id, clusterTwo.id], "Merged")!;

    expect(merged.nodeIds).toHaveLength(3);
    expect(getCanvasState(canvas.id)?.clusters).toHaveLength(1);
    expect(ungroupCluster(canvas.id, merged.id)).toBe(true);
    expect(getCanvasState(canvas.id)?.clusters).toHaveLength(0);
  });

  it("applies grid and hierarchical layouts", () => {
    const canvas = createCanvasState("Layouts");
    const nodes = [
      addCanvasNode(canvas.id, {
        type: "idea",
        x: 10,
        y: 10,
        width: 200,
        height: 100,
        label: "Root",
      })!,
      addCanvasNode(canvas.id, {
        type: "idea",
        x: 20,
        y: 20,
        width: 200,
        height: 100,
        label: "Child 1",
      })!,
      addCanvasNode(canvas.id, {
        type: "idea",
        x: 30,
        y: 30,
        width: 200,
        height: 100,
        label: "Child 2",
      })!,
    ];
    addCanvasStateEdge(canvas.id, nodes[0].id, nodes[1].id);
    addCanvasStateEdge(canvas.id, nodes[0].id, nodes[2].id);

    const grid = applyGridLayout(getCanvasState(canvas.id)!);
    const hierarchical = applyHierarchicalLayout(getCanvasState(canvas.id)!);

    expect(grid.layout).toBe("grid");
    expect(new Set(grid.nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(grid.nodes.length);
    expect(hierarchical.layout).toBe("hierarchical");
    expect(hierarchical.nodes.find((node) => node.label === "Root")?.x).toBe(0);
    expect(hierarchical.nodes.find((node) => node.label === "Child 1")?.x).toBeGreaterThan(0);
  });

  it("exports canvas state as JSON and SVG", () => {
    const canvas = createCanvasState("Exportable");
    addCanvasNode(canvas.id, {
      type: "image",
      x: 40,
      y: 60,
      width: 220,
      height: 120,
      label: "Mockup",
      color: "#f59e0b",
    });

    const storedCanvas = getCanvasState(canvas.id)!;
    const json = canvasStateToJson(storedCanvas);
    const svg = canvasStateToSvg(storedCanvas);

    expect(json).toContain('"name": "Exportable"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("Mockup");
  });
});
