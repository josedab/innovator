import { describe, it, expect } from "vitest";

import {
  buildLineageGraph,
  getLineageForIdea,
  exportLineageToSvgData,
  exportLineageToJson,
  exportLineageToMarkdown,
  LineageGraphSchema,
} from "../index.js";

const sampleSessions = [
  {
    id: "session-1",
    createdAt: "2024-01-15T10:00:00Z",
    investigation: { summary: "Exploring AI assistants for developers" },
    angleResults: [
      {
        angleId: "first-principles",
        angleName: "First Principles",
        ideas: [
          { title: "AI Code Reviewer", score: 85, survivedGauntlet: true },
          { title: "AI Test Generator", score: 60, survivedGauntlet: false },
        ],
      },
      {
        angleId: "scamper",
        angleName: "SCAMPER",
        ideas: [
          {
            title: "AI Pair Programmer",
            score: 90,
            survivedGauntlet: true,
            evolvedFrom: "AI Code Reviewer",
          },
        ],
      },
    ],
    synthesis: {
      summary: "AI-powered developer tools with focus on code review and pair programming",
    },
  },
  {
    id: "session-2",
    createdAt: "2024-01-16T14:00:00Z",
    investigation: { summary: "Following up on AI developer tools" },
    angleResults: [
      {
        angleId: "blue-ocean",
        angleName: "Blue Ocean",
        ideas: [{ title: "AI Architecture Advisor", score: 75 }],
      },
    ],
  },
];

describe("idea-lineage", () => {
  describe("buildLineageGraph", () => {
    it("builds a valid graph from session data", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      expect(() => LineageGraphSchema.parse(graph)).not.toThrow();
      expect(graph.sessionCount).toBe(2);
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
    });

    it("includes investigation, angle, and idea nodes", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const types = new Set(graph.nodes.map((n) => n.type));
      expect(types.has("session")).toBe(true);
      expect(types.has("investigation")).toBe(true);
      expect(types.has("angle")).toBe(true);
      expect(types.has("idea")).toBe(true);
    });

    it("filters by session IDs", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions, {
        sessionIds: ["session-1"],
      });
      expect(graph.sessionCount).toBe(1);
    });

    it("excludes failures when configured", () => {
      const withFailures = buildLineageGraph("Test", sampleSessions, { includeFailures: true });
      const withoutFailures = buildLineageGraph("Test", sampleSessions, { includeFailures: false });
      expect(withFailures.nodes.length).toBeGreaterThanOrEqual(withoutFailures.nodes.length);
    });

    it("creates evolution edges", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const evolutionEdges = graph.edges.filter((e) => e.type === "evolved-into");
      expect(evolutionEdges.length).toBeGreaterThan(0);
    });
  });

  describe("getLineageForIdea", () => {
    it("finds ancestors and descendants for an idea", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const lineage = getLineageForIdea(graph, "AI Code Reviewer");
      expect(lineage.ancestors.length).toBeGreaterThan(0);
    });

    it("returns empty for non-existent idea", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const lineage = getLineageForIdea(graph, "Non-existent Idea");
      expect(lineage.ancestors).toHaveLength(0);
      expect(lineage.descendants).toHaveLength(0);
    });
  });

  describe("exportLineageToSvgData", () => {
    it("exports graph as SVG-compatible data", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const svgData = exportLineageToSvgData(graph);
      expect(svgData.nodes.length).toBe(graph.nodes.length);
      expect(svgData.width).toBeGreaterThan(0);
      expect(svgData.height).toBeGreaterThan(0);

      for (const node of svgData.nodes) {
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
      }
    });
  });

  describe("exportLineageToJson", () => {
    it("exports valid JSON with stats", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const json = exportLineageToJson(graph);
      const parsed = JSON.parse(json);
      expect(parsed.subject).toBe("AI Developer Tools");
      expect(parsed.stats.nodes).toBe(graph.nodes.length);
      expect(parsed.stats.sessions).toBe(2);
      expect(parsed.nodes.length).toBeGreaterThan(0);
      expect(parsed.edges.length).toBeGreaterThan(0);
    });
  });

  describe("exportLineageToMarkdown", () => {
    it("exports markdown with headers and idea list", () => {
      const graph = buildLineageGraph("AI Developer Tools", sampleSessions);
      const md = exportLineageToMarkdown(graph);
      expect(md).toContain("# Idea Lineage: AI Developer Tools");
      expect(md).toContain("## Ideas");
      expect(md).toContain("AI Code Reviewer");
      expect(md).toContain("## Relationships");
    });
  });
});
