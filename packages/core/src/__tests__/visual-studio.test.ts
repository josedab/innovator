import { describe, it, expect, beforeEach } from "vitest";

import {
  arePortsCompatible,
  validateVisualPipeline,
  saveVisualPipeline,
  getVisualPipeline,
  deleteVisualPipeline,
  clearVisualPipelines,
  getNodeLibrary,
  getTemplateGallery,
} from "../pipeline-builder/visual-studio.js";
import type {
  Port,
  VisualNode,
  VisualPipeline,
  Connection,
} from "../pipeline-builder/visual-studio.js";

function makePort(overrides: Partial<Port> = {}): Port {
  return {
    id: "port-1",
    name: "Test Port",
    type: "text",
    direction: "output",
    required: true,
    multiple: false,
    ...overrides,
  };
}

function makeNode(id: string, overrides: Partial<VisualNode> = {}): VisualNode {
  return {
    id,
    type: "generate",
    label: `Node ${id}`,
    position: { x: 0, y: 0 },
    config: {},
    inputs: [],
    outputs: [],
    status: "idle",
    ...overrides,
  };
}

function makeConnection(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): Connection {
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, animated: false };
}

function makePipeline(overrides: Partial<VisualPipeline> = {}): VisualPipeline {
  const now = new Date().toISOString();
  return {
    id: "pipeline-1",
    name: "Test Pipeline",
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("pipeline-builder/visual-studio", () => {
  beforeEach(() => {
    clearVisualPipelines();
  });

  // ---- arePortsCompatible ----

  describe("arePortsCompatible", () => {
    it("returns true for compatible output→input with matching types", () => {
      const source = makePort({ type: "subject", direction: "output" });
      const target = makePort({ id: "p2", type: "investigation", direction: "input" });
      expect(arePortsCompatible(source, target)).toBe(true);
    });

    it("returns true for same-type connection", () => {
      const source = makePort({ type: "ideas", direction: "output" });
      const target = makePort({ id: "p2", type: "ideas", direction: "input" });
      expect(arePortsCompatible(source, target)).toBe(true);
    });

    it("returns false for incompatible types", () => {
      const source = makePort({ type: "config", direction: "output" });
      const target = makePort({ id: "p2", type: "ideas", direction: "input" });
      expect(arePortsCompatible(source, target)).toBe(false);
    });

    it("returns false when source is not output", () => {
      const source = makePort({ type: "text", direction: "input" });
      const target = makePort({ id: "p2", type: "text", direction: "input" });
      expect(arePortsCompatible(source, target)).toBe(false);
    });

    it("returns false when target is not input", () => {
      const source = makePort({ type: "text", direction: "output" });
      const target = makePort({ id: "p2", type: "text", direction: "output" });
      expect(arePortsCompatible(source, target)).toBe(false);
    });

    it("validates all documented compatibility pairs", () => {
      // subject → investigation
      expect(
        arePortsCompatible(
          makePort({ type: "subject", direction: "output" }),
          makePort({ type: "investigation", direction: "input" })
        )
      ).toBe(true);
      // ideas → scores
      expect(
        arePortsCompatible(
          makePort({ type: "ideas", direction: "output" }),
          makePort({ type: "scores", direction: "input" })
        )
      ).toBe(true);
      // config → config
      expect(
        arePortsCompatible(
          makePort({ type: "config", direction: "output" }),
          makePort({ type: "config", direction: "input" })
        )
      ).toBe(true);
    });
  });

  // ---- validateVisualPipeline ----

  describe("validateVisualPipeline", () => {
    it("returns no issues for empty pipeline", () => {
      const pipeline = makePipeline();
      const issues = validateVisualPipeline(pipeline);
      expect(issues).toHaveLength(0);
    });

    it("detects disconnected required inputs", () => {
      const node = makeNode("n1", {
        inputs: [makePort({ id: "in-1", direction: "input", type: "subject", required: true })],
      });
      const pipeline = makePipeline({ nodes: [node] });
      const issues = validateVisualPipeline(pipeline);
      expect(issues.some((i) => i.type === "error" && i.message.includes("not connected"))).toBe(
        true
      );
    });

    it("detects circular connections (cycle)", () => {
      const nodeA = makeNode("a", {
        outputs: [makePort({ id: "out-a", direction: "output", type: "text" })],
        inputs: [makePort({ id: "in-a", direction: "input", type: "text", required: false })],
      });
      const nodeB = makeNode("b", {
        outputs: [makePort({ id: "out-b", direction: "output", type: "text" })],
        inputs: [makePort({ id: "in-b", direction: "input", type: "text", required: false })],
      });

      const pipeline = makePipeline({
        nodes: [nodeA, nodeB],
        connections: [
          makeConnection("c1", "a", "out-a", "b", "in-b"),
          makeConnection("c2", "b", "out-b", "a", "in-a"),
        ],
      });

      const issues = validateVisualPipeline(pipeline);
      expect(issues.some((i) => i.message.includes("cycle"))).toBe(true);
    });

    it("warns about orphan nodes (disconnected non-input/output)", () => {
      const orphan = makeNode("orphan", { type: "generate" });
      const pipeline = makePipeline({ nodes: [orphan] });
      const issues = validateVisualPipeline(pipeline);
      expect(issues.some((i) => i.type === "warning" && i.message.includes("disconnected"))).toBe(
        true
      );
    });

    it("does not warn about orphan input/output nodes", () => {
      const inputNode = makeNode("in", { type: "input" });
      const outputNode = makeNode("out", { type: "output" });
      const pipeline = makePipeline({ nodes: [inputNode, outputNode] });
      const issues = validateVisualPipeline(pipeline);
      const orphanWarnings = issues.filter(
        (i) => i.type === "warning" && i.message.includes("disconnected")
      );
      expect(orphanWarnings).toHaveLength(0);
    });

    it("detects connection to non-existent source node", () => {
      const node = makeNode("n1");
      const pipeline = makePipeline({
        nodes: [node],
        connections: [makeConnection("c1", "missing", "p1", "n1", "p2")],
      });
      const issues = validateVisualPipeline(pipeline);
      expect(issues.some((i) => i.message.includes("Source node"))).toBe(true);
    });

    it("detects incompatible port types on connections", () => {
      const nodeA = makeNode("a", {
        outputs: [makePort({ id: "out-a", direction: "output", type: "config" })],
      });
      const nodeB = makeNode("b", {
        inputs: [makePort({ id: "in-b", direction: "input", type: "ideas", required: false })],
      });
      const pipeline = makePipeline({
        nodes: [nodeA, nodeB],
        connections: [makeConnection("c1", "a", "out-a", "b", "in-b")],
      });
      const issues = validateVisualPipeline(pipeline);
      expect(issues.some((i) => i.message.includes("Incompatible"))).toBe(true);
    });
  });

  // ---- saveVisualPipeline / getVisualPipeline / deleteVisualPipeline ----

  describe("pipeline CRUD", () => {
    it("saves and retrieves a pipeline round-trip", () => {
      const pipeline = makePipeline({ id: "p-save" });
      saveVisualPipeline(pipeline);
      const retrieved = getVisualPipeline("p-save");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("p-save");
      expect(retrieved!.name).toBe("Test Pipeline");
    });

    it("deleteVisualPipeline returns false for non-existent ID", () => {
      expect(deleteVisualPipeline("does-not-exist")).toBe(false);
    });

    it("deleteVisualPipeline removes existing pipeline", () => {
      saveVisualPipeline(makePipeline({ id: "p-del" }));
      expect(deleteVisualPipeline("p-del")).toBe(true);
      expect(getVisualPipeline("p-del")).toBeUndefined();
    });
  });

  // ---- Node Library ----

  describe("getNodeLibrary", () => {
    it("returns all node types with valid ports", () => {
      const library = getNodeLibrary();
      expect(library.length).toBeGreaterThan(0);
      for (const node of library) {
        expect(node.type).toBeTruthy();
        expect(node.label).toBeTruthy();
        for (const port of [...node.inputs, ...node.outputs]) {
          expect(["input", "output"]).toContain(port.direction);
        }
      }
    });
  });

  // ---- Template Gallery ----

  describe("getTemplateGallery", () => {
    it("returns valid templates that pass pipeline validation", () => {
      const templates = getTemplateGallery();
      expect(templates.length).toBeGreaterThan(0);
      for (const tmpl of templates) {
        expect(tmpl.pipeline.nodes.length).toBeGreaterThan(0);
        const issues = validateVisualPipeline(tmpl.pipeline);
        const errors = issues.filter((i) => i.type === "error");
        expect(errors).toHaveLength(0);
      }
    });
  });
});
