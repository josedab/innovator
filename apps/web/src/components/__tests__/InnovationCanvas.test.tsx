/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import InnovationCanvas from "../InnovationCanvas";
import type {
  InnovationCanvas as CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasCluster,
  CanvasAnnotation,
} from "@innovator/core/types";

function makeNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: "node-1",
    type: "idea",
    title: "Test Node",
    description: "A test node",
    position: { x: 100, y: 100 },
    size: { width: 150, height: 80 },
    color: "#3b82f6",
    ...overrides,
  };
}

function makeEdge(overrides: Partial<CanvasEdge> = {}): CanvasEdge {
  return {
    id: "edge-1",
    sourceId: "node-1",
    targetId: "node-2",
    type: "related",
    ...overrides,
  };
}

function makeCluster(overrides: Partial<CanvasCluster> = {}): CanvasCluster {
  return {
    id: "cluster-1",
    label: "Test Cluster",
    color: "#22c55e",
    nodeIds: ["node-1"],
    position: { x: 50, y: 50 },
    size: { width: 300, height: 200 },
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<CanvasAnnotation> = {}): CanvasAnnotation {
  return {
    id: "ann-1",
    content: "A note",
    position: { x: 200, y: 200 },
    color: "#fef3c7",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCanvas(overrides: Partial<CanvasData> = {}): CanvasData {
  return {
    id: "canvas-1",
    title: "Test Canvas",
    nodes: [],
    edges: [],
    clusters: [],
    annotations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Mock window.innerWidth for mobile detection
const originalInnerWidth = window.innerWidth;

describe("InnovationCanvas component", () => {
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, writable: true });
  });

  describe("empty canvas", () => {
    it("renders without crashing with empty nodes/edges", () => {
      const { container } = render(<InnovationCanvas canvas={makeCanvas()} />);
      expect(container).toBeInstanceOf(HTMLElement);
    });

    it("renders toolbar buttons", () => {
      render(<InnovationCanvas canvas={makeCanvas()} />);
      expect(screen.getByTitle("Zoom in")).toBeInstanceOf(HTMLElement);
      expect(screen.getByTitle("Zoom out")).toBeInstanceOf(HTMLElement);
      expect(screen.getByTitle("Reset view")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("node rendering", () => {
    it("renders nodes with title and description", () => {
      const canvas = makeCanvas({
        nodes: [makeNode({ title: "My Idea", description: "Idea description" })],
      });
      render(<InnovationCanvas canvas={canvas} />);
      expect(screen.getByText("My Idea")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Idea description")).toBeInstanceOf(HTMLElement);
    });

    it("renders multiple nodes", () => {
      const canvas = makeCanvas({
        nodes: [makeNode({ id: "n1", title: "Node 1" }), makeNode({ id: "n2", title: "Node 2" })],
      });
      render(<InnovationCanvas canvas={canvas} />);
      expect(screen.getByText("Node 1")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Node 2")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("cluster rendering", () => {
    it("renders cluster labels", () => {
      const canvas = makeCanvas({
        clusters: [makeCluster({ label: "Innovation Cluster" })],
        nodes: [makeNode({ clusterId: "cluster-1" })],
      });
      render(<InnovationCanvas canvas={canvas} />);
      expect(screen.getByText("Innovation Cluster")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("edge rendering (SVG)", () => {
    it("renders SVG line for edges between existing nodes", () => {
      const canvas = makeCanvas({
        nodes: [
          makeNode({ id: "n1", position: { x: 100, y: 100 } }),
          makeNode({ id: "n2", position: { x: 300, y: 300 } }),
        ],
        edges: [makeEdge({ sourceId: "n1", targetId: "n2" })],
      });
      const { container } = render(<InnovationCanvas canvas={canvas} />);
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it("does not render edge for missing source/target nodes", () => {
      const canvas = makeCanvas({
        nodes: [makeNode({ id: "n1" })],
        edges: [makeEdge({ sourceId: "n1", targetId: "missing" })],
      });
      const { container } = render(<InnovationCanvas canvas={canvas} />);
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBe(0);
    });
  });

  describe("annotation rendering", () => {
    it("renders annotations with content", () => {
      const canvas = makeCanvas({
        annotations: [makeAnnotation({ content: "Important note" })],
      });
      render(<InnovationCanvas canvas={canvas} />);
      expect(screen.getByText("Important note")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("zoom handling", () => {
    it("zoom level is displayed as percentage", () => {
      render(<InnovationCanvas canvas={makeCanvas()} />);
      expect(screen.getByText("100%")).toBeInstanceOf(HTMLElement);
    });

    it("zoom in button increases zoom", () => {
      render(<InnovationCanvas canvas={makeCanvas()} />);
      fireEvent.click(screen.getByTitle("Zoom in"));
      expect(screen.getByText("120%")).toBeInstanceOf(HTMLElement);
    });

    it("zoom out button decreases zoom", () => {
      render(<InnovationCanvas canvas={makeCanvas()} />);
      fireEvent.click(screen.getByTitle("Zoom out"));
      expect(screen.getByText("80%")).toBeInstanceOf(HTMLElement);
    });

    it("reset button resets to 100%", () => {
      render(<InnovationCanvas canvas={makeCanvas()} />);
      fireEvent.click(screen.getByTitle("Zoom in"));
      fireEvent.click(screen.getByTitle("Reset view"));
      expect(screen.getByText("100%")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("mobile fallback", () => {
    it("renders card layout on mobile viewport", () => {
      Object.defineProperty(window, "innerWidth", { value: 400, writable: true });
      const canvas = makeCanvas({
        nodes: [makeNode({ title: "Mobile Node", clusterId: "cluster-1" })],
        clusters: [makeCluster()],
      });
      render(<InnovationCanvas canvas={canvas} />);
      expect(screen.getByText("Test Canvas")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Mobile Node")).toBeInstanceOf(HTMLElement);
    });

    it("renders unclustered nodes in mobile fallback", () => {
      Object.defineProperty(window, "innerWidth", { value: 400, writable: true });
      const canvas = makeCanvas({
        nodes: [makeNode({ title: "Unclustered Node", clusterId: undefined })],
        clusters: [],
      });
      render(<InnovationCanvas canvas={canvas} />);
      expect(screen.getByText("Unclustered Node")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("pan vs drag state", () => {
    it("mousedown on canvas background initiates panning (not drag)", () => {
      const onNodeMove = vi.fn();
      const canvas = makeCanvas({ nodes: [makeNode()] });
      const { container } = render(<InnovationCanvas canvas={canvas} onNodeMove={onNodeMove} />);
      const canvasEl = container.querySelector(".relative.w-full.h-\\[600px\\]");
      if (canvasEl) {
        fireEvent.mouseDown(canvasEl, { clientX: 50, clientY: 50 });
        fireEvent.mouseMove(canvasEl, { clientX: 100, clientY: 100 });
        fireEvent.mouseUp(canvasEl);
      }
      expect(onNodeMove).not.toHaveBeenCalled();
    });
  });

  describe("minimap", () => {
    it("renders minimap with node rectangles", () => {
      const canvas = makeCanvas({
        nodes: [makeNode({ id: "n1" })],
      });
      const { container } = render(<InnovationCanvas canvas={canvas} />);
      const minimapRects = container.querySelectorAll(".absolute.bottom-2.right-2 rect");
      // At least 1 node rect + 1 viewport rect
      expect(minimapRects.length).toBeGreaterThanOrEqual(2);
    });
  });
});
