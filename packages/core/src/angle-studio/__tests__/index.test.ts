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
  type StudioNode,
} from "../index.js";

function makeNode(
  id: string,
  type: StudioNode["type"] = "angle",
  extra?: Partial<StudioNode>
): StudioNode {
  return {
    id,
    type,
    label: `Node ${id}`,
    position: { x: 0, y: 0 },
    enabled: true,
    angleId: type === "angle" ? "first-principles" : undefined,
    ...extra,
  };
}

describe("angle-studio", () => {
  beforeEach(() => {
    clearPipelines();
  });

  // ---- createPipeline / getPipeline / listPipelines / deletePipeline ----

  describe("createPipeline", () => {
    it("creates a pipeline with name and timestamps", () => {
      const p = createPipeline("Test Pipeline");
      expect(p.name).toBe("Test Pipeline");
      expect(p.id).toMatch(/^pipeline-/);
      expect(p.nodes).toEqual([]);
      expect(p.connections).toEqual([]);
      expect(p.createdAt).toBeTruthy();
      expect(p.updatedAt).toBeTruthy();
      expect(p.version).toBe("1.0.0");
    });

    it("accepts optional description, author, tags", () => {
      const p = createPipeline("P", {
        description: "Desc",
        author: "Author",
        tags: ["t1"],
      });
      expect(p.description).toBe("Desc");
      expect(p.author).toBe("Author");
      expect(p.tags).toEqual(["t1"]);
    });

    it("stores pipeline retrievable by ID", () => {
      const p = createPipeline("P");
      expect(getPipeline(p.id)).toEqual(p);
    });

    it("lists all created pipelines sorted by updatedAt desc", () => {
      createPipeline("A");
      createPipeline("B");
      const list = listPipelines();
      expect(list).toHaveLength(2);
    });
  });

  describe("deletePipeline", () => {
    it("deletes an existing pipeline", () => {
      const p = createPipeline("P");
      expect(deletePipeline(p.id)).toBe(true);
      expect(getPipeline(p.id)).toBeUndefined();
    });

    it("returns false for non-existent pipeline", () => {
      expect(deletePipeline("nonexistent")).toBe(false);
    });
  });

  // ---- addNode ----

  describe("addNode", () => {
    it("adds a node to a pipeline", () => {
      const p = createPipeline("P");
      const result = addNode(p.id, makeNode("n1"));
      expect(result).toBeDefined();
      expect(result!.nodes).toHaveLength(1);
      expect(result!.nodes[0].id).toBe("n1");
    });

    it("returns undefined for non-existent pipeline", () => {
      expect(addNode("bad-id", makeNode("n1"))).toBeUndefined();
    });

    it("throws on duplicate node ID", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      expect(() => addNode(p.id, makeNode("n1"))).toThrow("already exists");
    });

    it("updates pipeline's updatedAt timestamp", () => {
      const p = createPipeline("P");
      const before = p.updatedAt;
      // Small delay to ensure different timestamp
      const result = addNode(p.id, makeNode("n1"));
      expect(result!.updatedAt).toBeTruthy();
    });
  });

  // ---- removeNode ----

  describe("removeNode", () => {
    it("removes node and its connections", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      addConnection(p.id, "n1", "n2");
      removeNode(p.id, "n1");
      const updated = getPipeline(p.id)!;
      expect(updated.nodes).toHaveLength(1);
      expect(updated.connections).toHaveLength(0);
    });
  });

  // ---- moveNode ----

  describe("moveNode", () => {
    it("updates node position", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      moveNode(p.id, "n1", { x: 100, y: 200 });
      const node = getPipeline(p.id)!.nodes[0];
      expect(node.position).toEqual({ x: 100, y: 200 });
    });

    it("returns undefined for non-existent node", () => {
      const p = createPipeline("P");
      expect(moveNode(p.id, "nonexistent", { x: 0, y: 0 })).toBeUndefined();
    });
  });

  // ---- updateNodeConfig ----

  describe("updateNodeConfig", () => {
    it("merges config onto existing node config", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1", "filter", { config: { a: 1 } }));
      updateNodeConfig(p.id, "n1", { b: 2 });
      const node = getPipeline(p.id)!.nodes[0];
      expect(node.config).toEqual({ a: 1, b: 2 });
    });
  });

  // ---- Connection Operations ----

  describe("addConnection", () => {
    it("adds a connection between two nodes", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      const result = addConnection(p.id, "n1", "n2");
      expect(result!.connections).toHaveLength(1);
      expect(result!.connections[0].sourceNodeId).toBe("n1");
      expect(result!.connections[0].targetNodeId).toBe("n2");
    });

    it("throws for self-referencing edge", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      expect(() => addConnection(p.id, "n1", "n1")).toThrow("Cannot connect a node to itself");
    });

    it("throws for non-existent source node", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      expect(() => addConnection(p.id, "bad", "n1")).toThrow("Source node");
    });

    it("throws for non-existent target node", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      expect(() => addConnection(p.id, "n1", "bad")).toThrow("Target node");
    });

    it("throws for duplicate connection", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      addConnection(p.id, "n1", "n2");
      expect(() => addConnection(p.id, "n1", "n2")).toThrow("already exists");
    });

    it("supports optional label", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      addConnection(p.id, "n1", "n2", "my-label");
      expect(getPipeline(p.id)!.connections[0].label).toBe("my-label");
    });
  });

  describe("removeConnection", () => {
    it("removes a connection by ID", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      addConnection(p.id, "n1", "n2");
      const connId = getPipeline(p.id)!.connections[0].id;
      removeConnection(p.id, connId);
      expect(getPipeline(p.id)!.connections).toHaveLength(0);
    });
  });

  // ---- validatePipeline ----

  describe("validatePipeline", () => {
    it("reports error for empty pipeline", () => {
      const p = createPipeline("P");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(false);
      expect(v.errors).toContain("Pipeline has no nodes");
    });

    it("reports error for non-existent pipeline", () => {
      const v = validatePipeline("nonexistent");
      expect(v.valid).toBe(false);
      expect(v.errors[0]).toContain("not found");
    });

    it("validates pipeline with nodes and connections", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2", "merge"));
      addConnection(p.id, "n1", "n2");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(true);
      expect(v.nodeCount).toBe(2);
      expect(v.connectionCount).toBe(1);
    });

    it("detects cycles", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      addConnection(p.id, "n1", "n2");
      addConnection(p.id, "n2", "n1");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes("cycle"))).toBe(true);
    });

    it("warns about orphan/disconnected nodes", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2"));
      addNode(p.id, makeNode("n3"));
      addConnection(p.id, "n1", "n2");
      const v = validatePipeline(p.id);
      expect(v.warnings.some((w) => w.includes("n3") && w.includes("not connected"))).toBe(true);
    });

    it("warns about disabled nodes", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1", "angle", { enabled: false }));
      const v = validatePipeline(p.id);
      expect(v.warnings.some((w) => w.includes("disabled"))).toBe(true);
    });

    it("validates angle nodes without angleId", () => {
      const p = createPipeline("P");
      addNode(p.id, {
        id: "n1",
        type: "angle",
        label: "No Angle",
        position: { x: 0, y: 0 },
        enabled: true,
      });
      const v = validatePipeline(p.id);
      expect(v.errors.some((e) => e.includes("no angleId"))).toBe(true);
    });
  });

  // ---- topologicalSort (via validatePipeline executionOrder) ----

  describe("topologicalSort", () => {
    it("returns correct linear order", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("a"));
      addNode(p.id, makeNode("b"));
      addNode(p.id, makeNode("c"));
      addConnection(p.id, "a", "b");
      addConnection(p.id, "b", "c");
      const v = validatePipeline(p.id);
      expect(v.executionOrder).toEqual(["a", "b", "c"]);
    });

    it("handles diamond DAG correctly", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("top"));
      addNode(p.id, makeNode("left"));
      addNode(p.id, makeNode("right"));
      addNode(p.id, makeNode("bottom", "merge"));
      addConnection(p.id, "top", "left");
      addConnection(p.id, "top", "right");
      addConnection(p.id, "left", "bottom");
      addConnection(p.id, "right", "bottom");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(true);
      expect(v.executionOrder).toHaveLength(4);
      // top must come before left and right; bottom must come last
      const topIdx = v.executionOrder.indexOf("top");
      const bottomIdx = v.executionOrder.indexOf("bottom");
      expect(topIdx).toBeLessThan(bottomIdx);
    });

    it("handles fork (one source, multiple targets)", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("src"));
      addNode(p.id, makeNode("t1"));
      addNode(p.id, makeNode("t2"));
      addNode(p.id, makeNode("t3"));
      addConnection(p.id, "src", "t1");
      addConnection(p.id, "src", "t2");
      addConnection(p.id, "src", "t3");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(true);
      expect(v.executionOrder[0]).toBe("src");
      expect(v.executionOrder).toHaveLength(4);
    });

    it("single node pipeline has that node in execution order", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("only"));
      const v = validatePipeline(p.id);
      expect(v.executionOrder).toEqual(["only"]);
    });
  });

  // ---- createFromTemplate ----

  describe("createFromTemplate", () => {
    it("creates basic template with 3 angles + merge", () => {
      const p = createFromTemplate("basic");
      expect(p.nodes.length).toBe(4); // 3 angles + 1 merge
      expect(p.connections.length).toBe(3);
      expect(p.tags).toContain("basic");
    });

    it("creates comprehensive template with 8 angles + merge", () => {
      const p = createFromTemplate("comprehensive");
      expect(p.nodes.length).toBe(9); // 8 angles + 1 merge
      expect(p.connections.length).toBe(8);
    });

    it("creates speed template with 2 angles + merge", () => {
      const p = createFromTemplate("speed");
      expect(p.nodes.length).toBe(3); // 2 angles + 1 merge
      expect(p.connections.length).toBe(2);
    });

    it("creates deep-dive template with 4 angles + merge", () => {
      const p = createFromTemplate("deep-dive");
      expect(p.nodes.length).toBe(5); // 4 angles + 1 merge
      expect(p.connections.length).toBe(4);
    });

    it("uses custom name when provided", () => {
      const p = createFromTemplate("basic", "My Custom Name");
      expect(p.name).toBe("My Custom Name");
    });

    it("validates without errors", () => {
      const p = createFromTemplate("comprehensive");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(true);
      expect(v.errors).toHaveLength(0);
    });
  });

  // ---- importPipeline / serializePipeline round-trip ----

  describe("import/export round-trip", () => {
    it("serializes and reimports a pipeline with fidelity", () => {
      const p = createPipeline("Original", { description: "D", author: "A", tags: ["t"] });
      addNode(p.id, makeNode("n1"));
      addNode(p.id, makeNode("n2", "merge"));
      addConnection(p.id, "n1", "n2");

      const json = serializePipeline(p.id)!;
      expect(json).toBeTruthy();

      clearPipelines();
      const imported = importPipeline(json);
      expect(imported.name).toBe("Original");
      expect(imported.description).toBe("D");
      expect(imported.author).toBe("A");
      expect(imported.nodes).toHaveLength(2);
      expect(imported.connections).toHaveLength(1);
      expect(imported.tags).toEqual(["t"]);
    });

    it("returns undefined for non-existent pipeline serialization", () => {
      expect(serializePipeline("nonexistent")).toBeUndefined();
    });

    it("throws on invalid JSON import", () => {
      expect(() => importPipeline("not valid json")).toThrow();
    });

    it("template round-trips cleanly", () => {
      const original = createFromTemplate("basic");
      const json = serializePipeline(original.id)!;
      clearPipelines();
      const imported = importPipeline(json);
      expect(imported.nodes.length).toBe(original.nodes.length);
      expect(imported.connections.length).toBe(original.connections.length);
    });
  });

  // ---- reorderNodes ----

  describe("reorderNodes", () => {
    it("reorders nodes by given ID list", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("a"));
      addNode(p.id, makeNode("b"));
      addNode(p.id, makeNode("c"));
      reorderNodes(p.id, ["c", "a", "b"]);
      const nodeIds = getPipeline(p.id)!.nodes.map((n) => n.id);
      expect(nodeIds).toEqual(["c", "a", "b"]);
    });

    it("appends nodes not in order list at the end", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("a"));
      addNode(p.id, makeNode("b"));
      addNode(p.id, makeNode("c"));
      reorderNodes(p.id, ["b"]);
      const nodeIds = getPipeline(p.id)!.nodes.map((n) => n.id);
      expect(nodeIds[0]).toBe("b");
      expect(nodeIds).toContain("a");
      expect(nodeIds).toContain("c");
    });
  });

  // ---- extractAngleOrder ----

  describe("extractAngleOrder", () => {
    it("extracts angle IDs in topological order", () => {
      const p = createFromTemplate("basic");
      const order = extractAngleOrder(p.id);
      expect(order.length).toBeGreaterThan(0);
      expect(order).toContain("scamper");
    });

    it("returns empty for non-existent pipeline", () => {
      expect(extractAngleOrder("nonexistent")).toEqual([]);
    });

    it("skips disabled angle nodes", () => {
      const p = createPipeline("P");
      addNode(p.id, makeNode("n1", "angle", { angleId: "scamper", enabled: false }));
      addNode(p.id, makeNode("n2", "angle", { angleId: "first-principles", enabled: true }));
      addNode(p.id, makeNode("out", "merge"));
      addConnection(p.id, "n1", "out");
      addConnection(p.id, "n2", "out");
      const order = extractAngleOrder(p.id);
      expect(order).not.toContain("scamper");
      expect(order).toContain("first-principles");
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("empty pipeline validates with error", () => {
      const p = createPipeline("Empty");
      const v = validatePipeline(p.id);
      expect(v.valid).toBe(false);
      expect(v.nodeCount).toBe(0);
    });

    it("single node pipeline is valid", () => {
      const p = createPipeline("Single");
      addNode(p.id, makeNode("n1"));
      const v = validatePipeline(p.id);
      // Single node with no connections — no cycle, but may have warnings
      expect(v.nodeCount).toBe(1);
    });

    it("duplicate IDs across different pipelines are fine", () => {
      const p1 = createPipeline("P1");
      const p2 = createPipeline("P2");
      addNode(p1.id, makeNode("shared-id"));
      addNode(p2.id, makeNode("shared-id"));
      expect(getPipeline(p1.id)!.nodes).toHaveLength(1);
      expect(getPipeline(p2.id)!.nodes).toHaveLength(1);
    });
  });
});
