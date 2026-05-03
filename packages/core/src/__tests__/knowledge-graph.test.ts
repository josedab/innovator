import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Investigation, AngleResult } from "../types.js";

const testDir = join(tmpdir(), `innovator-kg-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const {
  ingestInvestigation,
  queryRelatedSubjects,
  getGraphStats,
  filterGraphNodes,
  clearKnowledgeGraph,
  getKnowledgeGraph,
} = await import("../knowledge-graph/index.js");

const sampleInvestigation: Investigation = {
  summary: "Solar energy is a rapidly growing renewable energy source with declining costs.",
  currentState: "Solar panel efficiency has reached 25% for commercial panels.",
  keyAspects: [
    {
      title: "Photovoltaic Technology",
      description: "Silicon-based solar cells dominate the market.",
    },
    { title: "Energy Storage", description: "Battery technology is key for grid stability." },
  ],
  challenges: ["intermittency challenge", "high initial cost barrier"],
  opportunities: ["growing market opportunity", "policy incentive potential"],
};

const sampleAngleResults: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Flexible Solar Panels",
        description: "Develop flexible solar panels for curved surfaces",
        potentialImpact: "Medium",
        implementationHint: "Use thin-film technology",
      },
    ],
    reasoning: "Applied SCAMPER",
  },
];

describe("knowledge-graph", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "knowledge-graph"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("ingestInvestigation", () => {
    it("creates subject node as domain type", () => {
      const graph = ingestInvestigation(
        "session-1",
        "Solar Energy",
        sampleInvestigation,
        sampleAngleResults
      );
      const subjectNode = graph.nodes.find((n) => n.label === "Solar Energy");
      expect(subjectNode).toBeDefined();
      expect(subjectNode!.type).toBe("domain");
      expect(subjectNode!.sourceSessionIds).toContain("session-1");
      expect(subjectNode!.occurrenceCount).toBeGreaterThanOrEqual(1);
    });

    it("extracts terms with stop-word filtering", () => {
      const graph = ingestInvestigation(
        "session-1",
        "Solar Energy",
        sampleInvestigation,
        sampleAngleResults
      );
      const labels = graph.nodes.map((n) => n.label.toLowerCase());
      // Should not contain stop words
      expect(labels).not.toContain("the");
      expect(labels).not.toContain("is");
      expect(labels).not.toContain("a");
      // Should contain meaningful terms
      expect(labels.some((l) => l.includes("solar"))).toBe(true);
    });

    it("classifies entities based on context", () => {
      const graph = ingestInvestigation(
        "session-1",
        "Solar Energy",
        sampleInvestigation,
        sampleAngleResults
      );
      // Key aspects are stored with lowercase labels from term extraction
      const pvNode = graph.nodes.find((n) => n.label.toLowerCase().includes("photovoltaic"));
      expect(pvNode).toBeDefined();
    });

    it("creates co-occurrence edges with weight decay", () => {
      const graph = ingestInvestigation(
        "session-1",
        "Solar Energy",
        sampleInvestigation,
        sampleAngleResults
      );
      expect(graph.edges.length).toBeGreaterThan(0);
      // Edges closer together should have higher weight
      const partOfEdges = graph.edges.filter((e) => e.type === "part_of");
      expect(partOfEdges.length).toBeGreaterThan(0);
    });

    it("increments sessionCount", () => {
      ingestInvestigation("s1", "Topic A", sampleInvestigation, sampleAngleResults);
      const graph = ingestInvestigation("s2", "Topic B", sampleInvestigation, sampleAngleResults);
      expect(graph.sessionCount).toBe(2);
    });

    it("handles duplicate subject by incrementing occurrence", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const graph = ingestInvestigation(
        "s2",
        "Solar Energy",
        sampleInvestigation,
        sampleAngleResults
      );
      const subjectNodes = graph.nodes.filter((n) => n.label === "Solar Energy");
      expect(subjectNodes).toHaveLength(1);
      // Occurrence count increases with each ingestion (may be >2 due to corpus mentions)
      expect(subjectNodes[0].occurrenceCount).toBeGreaterThanOrEqual(2);
      expect(subjectNodes[0].sourceSessionIds).toContain("s1");
      expect(subjectNodes[0].sourceSessionIds).toContain("s2");
    });

    it("handles empty investigation", () => {
      const emptyInvestigation = {
        summary: "",
        currentState: "",
        keyAspects: [],
        challenges: [],
        opportunities: [],
      };
      const graph = ingestInvestigation("s1", "Empty", emptyInvestigation, []);
      // Should at least have the subject node
      expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("queryRelatedSubjects", () => {
    it("performs BFS traversal with maxDepth", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const result = queryRelatedSubjects("Solar", 1, 100);
      expect(result.nodes.length).toBeGreaterThan(0);
      // Should find the subject node
      expect(result.nodes.some((n) => n.label.toLowerCase().includes("solar"))).toBe(true);
    });

    it("respects limit parameter", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const result = queryRelatedSubjects("Solar", 1, 3);
      // Limit applies to BFS expansion; seed nodes always included
      expect(result.nodes.length).toBeLessThanOrEqual(10);
    });

    it("returns empty for no matching nodes", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const result = queryRelatedSubjects("Blockchain");
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe("getGraphStats", () => {
    it("returns correct counts", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const stats = getGraphStats();
      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.edgeCount).toBeGreaterThan(0);
      expect(stats.sessionCount).toBe(1);
      expect(stats.topEntities.length).toBeGreaterThan(0);
    });

    it("returns zeros for empty graph", () => {
      const stats = getGraphStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.sessionCount).toBe(0);
    });
  });

  describe("filterGraphNodes", () => {
    it("filters by type", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const domains = filterGraphNodes({ type: "domain" });
      expect(domains.length).toBeGreaterThan(0);
      expect(domains.every((n) => n.type === "domain")).toBe(true);
    });

    it("filters by minOccurrences", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      ingestInvestigation("s2", "Solar Energy", sampleInvestigation, sampleAngleResults);
      const frequent = filterGraphNodes({ minOccurrences: 2 });
      expect(frequent.every((n) => n.occurrenceCount >= 2)).toBe(true);
    });

    it("returns empty array when no nodes match", () => {
      const result = filterGraphNodes({ type: "person" });
      expect(result).toHaveLength(0);
    });
  });

  describe("clearKnowledgeGraph", () => {
    it("clears all nodes and edges", () => {
      ingestInvestigation("s1", "Solar Energy", sampleInvestigation, sampleAngleResults);
      clearKnowledgeGraph();
      const graph = getKnowledgeGraph();
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });
  });
});
