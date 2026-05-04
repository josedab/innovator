import { describe, it, expect } from "vitest";
import {
  createCanvasFromResults,
  addCanvasEdge,
  addCanvasAnnotation,
  moveCanvasNode,
  createCluster,
  canvasToSvg,
  type InnovationCanvas,
} from "../canvas/index.js";
import type { AngleResult } from "../types.js";

function makeAngleResult(angleId: string, ideaCount: number): AngleResult {
  return {
    angleId,
    angleName: angleId.charAt(0).toUpperCase() + angleId.slice(1),
    ideas: Array.from({ length: ideaCount }, (_, i) => ({
      title: `Idea ${i + 1}`,
      description: `Description for idea ${i + 1}`,
      potentialImpact: "High",
      implementationHint: "Build it",
    })),
    reasoning: `Applied ${angleId}`,
  };
}

describe("canvas", () => {
  // ---- createCanvasFromResults ----

  describe("createCanvasFromResults", () => {
    it("creates a canvas with correct structure", () => {
      const results = [makeAngleResult("scamper", 2)];
      const canvas = createCanvasFromResults("Test Canvas", results);

      expect(canvas.id).toBeDefined();
      expect(canvas.title).toBe("Test Canvas");
      expect(canvas.nodes).toHaveLength(2);
      expect(canvas.clusters).toHaveLength(1);
      expect(canvas.edges).toEqual([]);
      expect(canvas.annotations).toEqual([]);
      expect(canvas.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it("creates one cluster per angle", () => {
      const results = [makeAngleResult("scamper", 2), makeAngleResult("first-principles", 3)];
      const canvas = createCanvasFromResults("Multi-Angle", results);

      expect(canvas.clusters).toHaveLength(2);
      expect(canvas.clusters[0].label).toBe("Scamper");
      expect(canvas.clusters[1].label).toBe("First-principles");
      expect(canvas.nodes).toHaveLength(5);
    });

    it("assigns correct colors based on angleId", () => {
      const results = [makeAngleResult("scamper", 1)];
      const canvas = createCanvasFromResults("Color Test", results);
      expect(canvas.nodes[0].color).toBe("#3b82f6");
    });

    it("uses default gray for unknown angleId", () => {
      const results = [makeAngleResult("custom-angle", 1)];
      const canvas = createCanvasFromResults("Default Color", results);
      expect(canvas.nodes[0].color).toBe("#6b7280");
    });

    it("lays out ideas in a grid within clusters", () => {
      const results = [makeAngleResult("scamper", 4)];
      const canvas = createCanvasFromResults("Grid Layout", results);

      // 4 ideas → 3 per row, so 2 rows
      const positions = canvas.nodes.map((n) => n.position);
      // First row: 3 nodes
      expect(positions[0].y).toBe(positions[1].y);
      expect(positions[0].y).toBe(positions[2].y);
      // Second row: 1 node
      expect(positions[3].y).toBeGreaterThan(positions[0].y);
    });

    it("handles 0 angle results (empty canvas)", () => {
      const canvas = createCanvasFromResults("Empty", []);
      expect(canvas.nodes).toHaveLength(0);
      expect(canvas.clusters).toHaveLength(0);
    });

    it("handles angle with 0 ideas", () => {
      const results = [makeAngleResult("scamper", 0)];
      const canvas = createCanvasFromResults("No Ideas", results);
      expect(canvas.nodes).toHaveLength(0);
      expect(canvas.clusters).toHaveLength(1);
    });

    it("handles single idea", () => {
      const results = [makeAngleResult("scamper", 1)];
      const canvas = createCanvasFromResults("Single", results);
      expect(canvas.nodes).toHaveLength(1);
      expect(canvas.nodes[0].type).toBe("idea");
      expect(canvas.nodes[0].clusterId).toBeDefined();
    });
  });

  // ---- addCanvasEdge ----

  describe("addCanvasEdge", () => {
    it("adds an edge between two nodes", () => {
      const results = [makeAngleResult("scamper", 2)];
      const canvas = createCanvasFromResults("Edge Test", results);
      const edge = addCanvasEdge(canvas, canvas.nodes[0].id, canvas.nodes[1].id);

      expect(edge.type).toBe("related");
      expect(edge.style).toBe("solid");
      expect(canvas.edges).toHaveLength(1);
    });

    it("supports all 5 relationship types", () => {
      const results = [makeAngleResult("scamper", 6)];
      const canvas = createCanvasFromResults("Types", results);
      const types = ["related", "enables", "conflicts", "derives", "synergy"] as const;

      types.forEach((type, i) => {
        const edge = addCanvasEdge(canvas, canvas.nodes[i].id, canvas.nodes[i + 1].id, type);
        expect(edge.type).toBe(type);
      });
      expect(canvas.edges).toHaveLength(5);
    });

    it("conflicts edges use dashed style", () => {
      const results = [makeAngleResult("scamper", 2)];
      const canvas = createCanvasFromResults("Dashed", results);
      const edge = addCanvasEdge(canvas, canvas.nodes[0].id, canvas.nodes[1].id, "conflicts");
      expect(edge.style).toBe("dashed");
    });

    it("non-conflicts edges use solid style", () => {
      const results = [makeAngleResult("scamper", 2)];
      const canvas = createCanvasFromResults("Solid", results);

      for (const type of ["related", "enables", "derives", "synergy"] as const) {
        const canvas2 = createCanvasFromResults("Solid2", results);
        const edge = addCanvasEdge(canvas2, canvas2.nodes[0].id, canvas2.nodes[1].id, type);
        expect(edge.style).toBe("solid");
      }
    });

    it("includes optional label", () => {
      const results = [makeAngleResult("scamper", 2)];
      const canvas = createCanvasFromResults("Label", results);
      const edge = addCanvasEdge(
        canvas,
        canvas.nodes[0].id,
        canvas.nodes[1].id,
        "related",
        "depends on"
      );
      expect(edge.label).toBe("depends on");
    });

    it("updates canvas updatedAt", () => {
      const results = [makeAngleResult("scamper", 2)];
      const canvas = createCanvasFromResults("TS", results);
      canvas.updatedAt = "2020-01-01T00:00:00.000Z";
      addCanvasEdge(canvas, canvas.nodes[0].id, canvas.nodes[1].id);
      expect(canvas.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  // ---- addCanvasAnnotation ----

  describe("addCanvasAnnotation", () => {
    it("adds an annotation", () => {
      const canvas = createCanvasFromResults("Ann", [makeAngleResult("scamper", 1)]);
      const ann = addCanvasAnnotation(canvas, "Great idea!", { x: 50, y: 50 }, "Alice");
      expect(ann.content).toBe("Great idea!");
      expect(ann.author).toBe("Alice");
      expect(ann.color).toBe("#fef3c7");
      expect(canvas.annotations).toHaveLength(1);
    });
  });

  // ---- moveCanvasNode ----

  describe("moveCanvasNode", () => {
    it("moves a node to a new position", () => {
      const canvas = createCanvasFromResults("Move", [makeAngleResult("scamper", 1)]);
      const nodeId = canvas.nodes[0].id;
      const result = moveCanvasNode(canvas, nodeId, { x: 999, y: 888 });
      expect(result).toBe(true);
      expect(canvas.nodes[0].position).toEqual({ x: 999, y: 888 });
    });

    it("returns false for non-existent node", () => {
      const canvas = createCanvasFromResults("Move", [makeAngleResult("scamper", 1)]);
      expect(moveCanvasNode(canvas, "nonexistent", { x: 0, y: 0 })).toBe(false);
    });

    it("updates canvas updatedAt", () => {
      const canvas = createCanvasFromResults("Move", [makeAngleResult("scamper", 1)]);
      canvas.updatedAt = "2020-01-01T00:00:00.000Z";
      moveCanvasNode(canvas, canvas.nodes[0].id, { x: 100, y: 100 });
      expect(canvas.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  // ---- createCluster ----

  describe("createCluster", () => {
    it("creates a cluster from nodes with correct bounding box", () => {
      const canvas = createCanvasFromResults("Cluster", [makeAngleResult("scamper", 2)]);
      // Move nodes to known positions
      canvas.nodes[0].position = { x: 100, y: 100 };
      canvas.nodes[0].size = { width: 200, height: 120 };
      canvas.nodes[1].position = { x: 400, y: 200 };
      canvas.nodes[1].size = { width: 200, height: 120 };

      const cluster = createCluster(canvas, "My Cluster", [canvas.nodes[0].id, canvas.nodes[1].id]);

      expect(cluster.label).toBe("My Cluster");
      expect(cluster.position.x).toBe(80); // 100 - 20 padding
      expect(cluster.position.y).toBe(60); // 100 - 40 padding
      expect(cluster.size.width).toBe(540); // (600-100) + 40
      expect(cluster.size.height).toBe(280); // (320-100) + 60
    });

    it("assigns default color when not specified", () => {
      const canvas = createCanvasFromResults("Cluster", [makeAngleResult("scamper", 1)]);
      const cluster = createCluster(canvas, "Default", [canvas.nodes[0].id]);
      expect(cluster.color).toBe("#e5e7eb");
    });

    it("uses custom color when specified", () => {
      const canvas = createCanvasFromResults("Cluster", [makeAngleResult("scamper", 1)]);
      const cluster = createCluster(canvas, "Custom", [canvas.nodes[0].id], "#ff0000");
      expect(cluster.color).toBe("#ff0000");
    });

    it("updates nodes' clusterId reference", () => {
      const canvas = createCanvasFromResults("Cluster", [makeAngleResult("scamper", 2)]);
      const cluster = createCluster(canvas, "Ref", [canvas.nodes[0].id, canvas.nodes[1].id]);
      expect(canvas.nodes[0].clusterId).toBe(cluster.id);
      expect(canvas.nodes[1].clusterId).toBe(cluster.id);
    });

    it("throws when no valid nodes found", () => {
      const canvas = createCanvasFromResults("Cluster", [makeAngleResult("scamper", 1)]);
      expect(() => createCluster(canvas, "Empty", ["nonexistent"])).toThrow("No valid nodes found");
    });
  });

  // ---- canvasToSvg ----

  describe("canvasToSvg", () => {
    it("produces valid SVG output", () => {
      const canvas = createCanvasFromResults("SVG Test", [makeAngleResult("scamper", 2)]);
      const svg = canvasToSvg(canvas);

      expect(svg).toContain("<svg");
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain("viewBox=");
      expect(svg).toContain("</svg>");
    });

    it("includes cluster backgrounds", () => {
      const canvas = createCanvasFromResults("SVG", [makeAngleResult("scamper", 1)]);
      const svg = canvasToSvg(canvas);
      expect(svg).toContain("cluster-label");
      expect(svg).toContain("Scamper");
    });

    it("includes edges when present", () => {
      const canvas = createCanvasFromResults("SVG", [makeAngleResult("scamper", 2)]);
      addCanvasEdge(canvas, canvas.nodes[0].id, canvas.nodes[1].id, "conflicts");
      const svg = canvasToSvg(canvas);
      expect(svg).toContain("stroke-dasharray");
    });

    it("includes annotations", () => {
      const canvas = createCanvasFromResults("SVG", [makeAngleResult("scamper", 1)]);
      addCanvasAnnotation(canvas, "Note text", { x: 10, y: 10 });
      const svg = canvasToSvg(canvas);
      expect(svg).toContain("Note text");
    });

    it("escapes XML special characters in titles", () => {
      const results: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: 'Test <script> & "quotes"',
              description: "Desc with <tags>",
              potentialImpact: "High",
              implementationHint: "Hint",
            },
          ],
          reasoning: "Applied",
        },
      ];
      const canvas = createCanvasFromResults("XML Escape", results);
      const svg = canvasToSvg(canvas);

      expect(svg).toContain("&lt;");
      expect(svg).toContain("&amp;");
      expect(svg).toContain("&quot;");
      expect(svg).not.toContain("<script>");
    });

    it("handles canvas with 0 nodes", () => {
      const canvas = createCanvasFromResults("Empty SVG", []);
      const svg = canvasToSvg(canvas);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });
  });
});
