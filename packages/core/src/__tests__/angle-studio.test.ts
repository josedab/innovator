import { describe, it, expect, beforeEach } from "vitest";
import {
  createPipeline,
  getPipeline,
  listPipelines,
  deletePipeline,
  clearPipelines,
  addNode,
  removeNode,
  moveNode,
  updateNodeConfig,
  reorderNodes,
  addConnection,
  removeConnection,
  validatePipeline,
  createFromTemplate,
  extractAngleOrder,
  serializePipeline,
  importPipeline,
} from "../angle-studio/index.js";

describe("angle-studio", () => {
  beforeEach(() => {
    clearPipelines();
  });

  describe("createPipeline", () => {
    it("creates a new empty pipeline", () => {
      const pipeline = createPipeline("Test Pipeline", { description: "desc" });
      expect(pipeline.id).toBeTruthy();
      expect(pipeline.name).toBe("Test Pipeline");
      expect(pipeline.nodes).toEqual([]);
      expect(pipeline.connections).toEqual([]);
    });
  });

  describe("addNode / removeNode", () => {
    it("adds and removes nodes", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "n1",
        type: "angle",
        angleId: "scamper",
        label: "SCAMPER",
        position: { x: 0, y: 0 },
        enabled: true,
      });

      let updated = getPipeline(pipeline.id)!;
      expect(updated.nodes).toHaveLength(1);

      removeNode(pipeline.id, "n1");
      updated = getPipeline(pipeline.id)!;
      expect(updated.nodes).toHaveLength(0);
    });

    it("rejects duplicate node IDs", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "n1",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      expect(() =>
        addNode(pipeline.id, {
          id: "n1",
          type: "angle",
          label: "B",
          position: { x: 0, y: 0 },
          enabled: true,
        })
      ).toThrow("already exists");
    });

    it("removes connections when node is removed", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "a",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      addNode(pipeline.id, {
        id: "b",
        type: "merge",
        label: "B",
        position: { x: 100, y: 0 },
        enabled: true,
      });
      addConnection(pipeline.id, "a", "b");
      expect(getPipeline(pipeline.id)!.connections).toHaveLength(1);

      removeNode(pipeline.id, "a");
      expect(getPipeline(pipeline.id)!.connections).toHaveLength(0);
    });
  });

  describe("moveNode", () => {
    it("updates node position", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "n1",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      moveNode(pipeline.id, "n1", { x: 200, y: 300 });
      const node = getPipeline(pipeline.id)!.nodes[0];
      expect(node.position).toEqual({ x: 200, y: 300 });
    });
  });

  describe("updateNodeConfig", () => {
    it("merges config into node", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "n1",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        config: { a: 1 },
        enabled: true,
      });
      updateNodeConfig(pipeline.id, "n1", { b: 2 });
      const node = getPipeline(pipeline.id)!.nodes[0];
      expect(node.config).toEqual({ a: 1, b: 2 });
    });
  });

  describe("reorderNodes", () => {
    it("reorders nodes by ID list", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "c",
        type: "angle",
        label: "C",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      addNode(pipeline.id, {
        id: "a",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      addNode(pipeline.id, {
        id: "b",
        type: "angle",
        label: "B",
        position: { x: 0, y: 0 },
        enabled: true,
      });

      reorderNodes(pipeline.id, ["a", "b", "c"]);
      const ids = getPipeline(pipeline.id)!.nodes.map((n) => n.id);
      expect(ids).toEqual(["a", "b", "c"]);
    });
  });

  describe("connections", () => {
    it("adds connections between nodes", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "a",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      addNode(pipeline.id, {
        id: "b",
        type: "merge",
        label: "B",
        position: { x: 100, y: 0 },
        enabled: true,
      });
      addConnection(pipeline.id, "a", "b", "flow");

      const conn = getPipeline(pipeline.id)!.connections[0];
      expect(conn.sourceNodeId).toBe("a");
      expect(conn.targetNodeId).toBe("b");
      expect(conn.label).toBe("flow");
    });

    it("prevents self-connections", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "a",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      expect(() => addConnection(pipeline.id, "a", "a")).toThrow("Cannot connect a node to itself");
    });

    it("prevents duplicate connections", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "a",
        type: "angle",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      addNode(pipeline.id, {
        id: "b",
        type: "merge",
        label: "B",
        position: { x: 100, y: 0 },
        enabled: true,
      });
      addConnection(pipeline.id, "a", "b");
      expect(() => addConnection(pipeline.id, "a", "b")).toThrow("already exists");
    });
  });

  describe("validatePipeline", () => {
    it("validates a correct pipeline", () => {
      const pipeline = createFromTemplate("basic");
      const result = validatePipeline(pipeline.id);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nodeCount).toBeGreaterThan(0);
    });

    it("reports errors for empty pipeline", () => {
      const pipeline = createPipeline("empty");
      const result = validatePipeline(pipeline.id);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Pipeline has no nodes");
    });

    it("warns about disconnected nodes", () => {
      const pipeline = createPipeline("test");
      addNode(pipeline.id, {
        id: "a",
        type: "angle",
        angleId: "scamper",
        label: "A",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      addNode(pipeline.id, {
        id: "b",
        type: "angle",
        angleId: "inversion",
        label: "B",
        position: { x: 100, y: 0 },
        enabled: true,
      });
      const result = validatePipeline(pipeline.id);
      expect(result.warnings.some((w) => w.includes("not connected"))).toBe(true);
    });
  });

  describe("createFromTemplate", () => {
    it("creates basic template with 3 angles", () => {
      const pipeline = createFromTemplate("basic");
      expect(pipeline.nodes.filter((n) => n.type === "angle")).toHaveLength(3);
      expect(pipeline.connections.length).toBe(3);
    });

    it("creates comprehensive template with 8 angles", () => {
      const pipeline = createFromTemplate("comprehensive");
      expect(pipeline.nodes.filter((n) => n.type === "angle")).toHaveLength(8);
    });
  });

  describe("extractAngleOrder", () => {
    it("extracts angles in execution order", () => {
      const pipeline = createFromTemplate("basic");
      const order = extractAngleOrder(pipeline.id);
      expect(order.length).toBe(3);
      expect(order).toContain("scamper");
    });
  });

  describe("serialize / import", () => {
    it("round-trips a pipeline through JSON", () => {
      const original = createFromTemplate("speed");
      const json = serializePipeline(original.id)!;
      clearPipelines();
      const imported = importPipeline(json);
      expect(imported.name).toBe(original.name);
      expect(imported.nodes.length).toBe(original.nodes.length);
    });
  });

  describe("listPipelines / deletePipeline", () => {
    it("lists and deletes pipelines", () => {
      createPipeline("a");
      createPipeline("b");
      expect(listPipelines()).toHaveLength(2);

      const id = listPipelines()[0].id;
      deletePipeline(id);
      expect(listPipelines()).toHaveLength(1);
    });
  });
});
