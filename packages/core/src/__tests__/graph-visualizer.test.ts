import { describe, it, expect } from "vitest";
import { GraphVisualizer } from "../knowledge-graph/graph-visualizer.js";
import type { EntityNode, RelationshipEdge } from "../knowledge-graph/index.js";

const sampleEntities: EntityNode[] = [
  { id: "n1", label: "Machine Learning", type: "technology", sourceSessionIds: ["s1"], firstSeen: "2024-01-01", lastSeen: "2024-01-15", occurrenceCount: 5 },
  { id: "n2", label: "Healthcare", type: "domain", sourceSessionIds: ["s1"], firstSeen: "2024-01-01", lastSeen: "2024-01-10", occurrenceCount: 3 },
  { id: "n3", label: "Data Privacy", type: "concept", sourceSessionIds: ["s1"], firstSeen: "2024-01-05", lastSeen: "2024-01-15", occurrenceCount: 2 },
  { id: "n4", label: "OpenAI", type: "organization", sourceSessionIds: ["s1", "s2"], firstSeen: "2024-01-01", lastSeen: "2024-01-20", occurrenceCount: 4 },
];

const sampleEdges: RelationshipEdge[] = [
  { id: "e1", source: "n1", target: "n2", type: "enables", weight: 0.8, sourceSessionIds: ["s1"] },
  { id: "e2", source: "n1", target: "n3", type: "related_to", weight: 0.6, sourceSessionIds: ["s1"] },
  { id: "e3", source: "n2", target: "n3", type: "challenges", weight: 0.5, sourceSessionIds: ["s1"] },
  { id: "e4", source: "n1", target: "n4", type: "related_to", weight: 0.7, sourceSessionIds: ["s1"] },
];

describe("graph-visualizer", () => {
  const visualizer = new GraphVisualizer();

  describe("computeForceLayout", () => {
    it("positions all nodes with x and y coordinates", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      expect(layout.nodes).toHaveLength(4);
      for (const node of layout.nodes) {
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("returns edges matching source entities", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      expect(layout.edges.length).toBeGreaterThan(0);
      for (const edge of layout.edges) {
        expect(edge).toHaveProperty("source");
        expect(edge).toHaveProperty("target");
        expect(edge).toHaveProperty("weight");
      }
    });

    it("computes bounds from node positions", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      expect(layout.bounds.minX).toBeLessThanOrEqual(layout.bounds.maxX);
      expect(layout.bounds.minY).toBeLessThanOrEqual(layout.bounds.maxY);
    });

    it("returns empty layout for no entities", () => {
      const layout = visualizer.computeForceLayout([], []);
      expect(layout.nodes).toHaveLength(0);
      expect(layout.edges).toHaveLength(0);
      expect(layout.clusters).toHaveLength(0);
    });

    it("assigns node sizes based on occurrenceCount", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const mlNode = layout.nodes.find((n) => n.id === "n1")!;
      const privNode = layout.nodes.find((n) => n.id === "n3")!;
      expect(mlNode.size).toBeGreaterThan(privNode.size);
    });

    it("respects custom layout options", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges, {
        width: 1200,
        height: 900,
        iterations: 10,
      });
      expect(layout.nodes).toHaveLength(4);
    });
  });

  describe("clusterByDomain", () => {
    it("groups nodes by type", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const clusters = visualizer.clusterByDomain(layout.nodes);
      expect(clusters.length).toBeGreaterThan(0);
      for (const cluster of clusters) {
        expect(cluster.nodeIds.length).toBeGreaterThan(0);
        expect(cluster.dominantType).toBeTruthy();
        expect(typeof cluster.centerX).toBe("number");
        expect(typeof cluster.centerY).toBe("number");
      }
    });

    it("returns empty for empty nodes", () => {
      expect(visualizer.clusterByDomain([])).toHaveLength(0);
    });
  });

  describe("searchNodes", () => {
    it("finds nodes matching query", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const results = visualizer.searchNodes(layout, "machine");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain("Machine");
    });

    it("returns all nodes for empty query", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const results = visualizer.searchNodes(layout, "");
      expect(results).toHaveLength(layout.nodes.length);
    });

    it("returns empty for non-matching query", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const results = visualizer.searchNodes(layout, "xyznonexistent");
      expect(results).toHaveLength(0);
    });

    it("prioritizes exact matches", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const results = visualizer.searchNodes(layout, "healthcare");
      expect(results[0].label.toLowerCase()).toBe("healthcare");
    });
  });

  describe("getInsightSuggestions", () => {
    it("returns insight suggestions array", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const insights = visualizer.getInsightSuggestions(layout);
      expect(Array.isArray(insights)).toBe(true);
    });

    it("insights have required fields", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const insights = visualizer.getInsightSuggestions(layout);
      for (const insight of insights) {
        expect(insight).toHaveProperty("type");
        expect(insight).toHaveProperty("title");
        expect(insight).toHaveProperty("description");
        expect(insight).toHaveProperty("entityIds");
        expect(insight).toHaveProperty("confidence");
        expect(["bridge-node", "isolated-cluster", "trending-entity", "gap-analysis"]).toContain(insight.type);
      }
    });

    it("finds trending (most connected) entities", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const insights = visualizer.getInsightSuggestions(layout);
      const trending = insights.find((i) => i.type === "trending-entity");
      expect(trending).toBeDefined();
      expect(trending!.entityIds.length).toBeGreaterThan(0);
    });
  });

  describe("filterByTimeRange", () => {
    it("filters to entities within time range", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const filtered = visualizer.filterByTimeRange(
        layout,
        "2024-01-01",
        "2024-01-05",
        sampleEntities
      );
      expect(filtered.nodes.length).toBeLessThanOrEqual(layout.nodes.length);
      expect(filtered.nodes.length).toBeGreaterThan(0);
    });

    it("returns no nodes outside time range", () => {
      const layout = visualizer.computeForceLayout(sampleEntities, sampleEdges);
      const filtered = visualizer.filterByTimeRange(
        layout,
        "2025-01-01",
        "2025-12-31",
        sampleEntities
      );
      expect(filtered.nodes).toHaveLength(0);
    });
  });
});
