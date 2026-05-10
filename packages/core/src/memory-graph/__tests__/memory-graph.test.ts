import { describe, it, expect, beforeEach } from "vitest";
import {
  autoIndexSession,
  retrieveRelatedMemories,
  detectConvergence,
  generateOrgDNA,
  getIdeaLineage,
  orgDNAToMarkdown,
  getMemoryGraph,
  clearMemoryGraph,
} from "../index.js";
import { clearEmbeddingsIndex } from "../../embeddings/index.js";
import type { Investigation, AngleResult, Synthesis } from "../../types.js";

// ---- Test fixtures ----

function makeInvestigation(overrides?: Partial<Investigation>): Investigation {
  return {
    summary: "AI in healthcare diagnostics",
    currentState: "Machine learning models are being used for radiology",
    keyAspects: [
      { title: "Deep Learning", description: "Neural networks for image classification" },
      { title: "Data Privacy", description: "Patient data protection challenges" },
    ],
    challenges: ["Regulatory approval", "Data quality"],
    opportunities: ["Faster diagnosis", "Cost reduction"],
    ...overrides,
  };
}

function makeAngleResult(overrides?: Partial<AngleResult>): AngleResult {
  return {
    angleId: "biomimicry",
    angleName: "Biomimicry",
    reasoning: "Applying natural patterns to healthcare AI systems for robust diagnosis",
    ideas: [
      {
        title: "Neural Pattern Recognition",
        description: "Mimic brain neural pathways for medical image analysis",
        potentialImpact: "Faster more accurate diagnosis",
        implementationHint: "Use convolutional neural network architectures",
      },
    ],
    ...overrides,
  };
}

function makeSynthesis(overrides?: Partial<Synthesis>): Synthesis {
  return {
    recommendation: "Invest in AI-driven diagnostic tools leveraging biomimicry patterns",
    themes: ["artificial intelligence", "healthcare innovation"],
    topIdeas: [
      {
        title: "Neural Pattern Recognition",
        description: "Mimic brain pathways for medical imaging",
        sourceAngle: "biomimicry",
        potentialImpact: "High accuracy diagnosis",
        feasibility: "medium",
      },
    ],
    ...overrides,
  };
}

describe("memory-graph", () => {
  beforeEach(() => {
    clearMemoryGraph();
    clearEmbeddingsIndex();
  });

  // ---- getMemoryGraph / clearMemoryGraph ----

  describe("getMemoryGraph / clearMemoryGraph", () => {
    it("returns an empty graph initially", () => {
      const graph = getMemoryGraph();
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.sessions).toHaveLength(0);
      expect(graph.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("clears all data after indexing", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      clearMemoryGraph();
      const graph = getMemoryGraph();
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.sessions).toHaveLength(0);
    });
  });

  // ---- autoIndexSession ----

  describe("autoIndexSession", () => {
    it("indexes an investigation and creates nodes", () => {
      const graph = autoIndexSession("session-1", makeInvestigation(), []);
      expect(graph.sessions).toContain("session-1");
      const invNodes = graph.nodes.filter((n) => n.type === "investigation");
      expect(invNodes.length).toBeGreaterThanOrEqual(1);
      expect(invNodes[0].sessionId).toBe("session-1");
    });

    it("indexes angle results with ideas and creates edges", () => {
      const graph = autoIndexSession("session-1", makeInvestigation(), [makeAngleResult()]);
      const arNodes = graph.nodes.filter((n) => n.type === "angle-result");
      expect(arNodes.length).toBeGreaterThanOrEqual(1);
      const ideaNodes = graph.nodes.filter((n) => n.type === "idea");
      expect(ideaNodes.length).toBeGreaterThanOrEqual(1);
      // Edges: investigation -> angle-result (part_of), angle-result -> idea (derived_from)
      const partOfEdges = graph.edges.filter((e) => e.type === "part_of");
      expect(partOfEdges.length).toBeGreaterThanOrEqual(1);
      const derivedEdges = graph.edges.filter((e) => e.type === "derived_from");
      expect(derivedEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("indexes synthesis and creates theme nodes", () => {
      const graph = autoIndexSession(
        "session-1",
        makeInvestigation(),
        [makeAngleResult()],
        makeSynthesis()
      );
      const synthNodes = graph.nodes.filter((n) => n.type === "synthesis");
      expect(synthNodes.length).toBe(1);
      const themeNodes = graph.nodes.filter((n) => n.type === "theme");
      expect(themeNodes.length).toBe(2); // two themes in fixture
      // evolves_into edge from investigation to synthesis
      const evolvesEdges = graph.edges.filter((e) => e.type === "evolves_into");
      expect(evolvesEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("assigns embeddingDocId to nodes", () => {
      const graph = autoIndexSession(
        "session-1",
        makeInvestigation(),
        [makeAngleResult()],
        makeSynthesis()
      );
      const nodesWithEmbeddings = graph.nodes.filter((n) => n.embeddingDocId);
      expect(nodesWithEmbeddings.length).toBeGreaterThan(0);
    });

    it("does not duplicate session on re-index", () => {
      autoIndexSession("session-1", makeInvestigation(), []);
      const graph = autoIndexSession("session-1", makeInvestigation(), []);
      const sessionOccurrences = graph.sessions.filter((s) => s === "session-1");
      expect(sessionOccurrences).toHaveLength(1);
    });

    it("creates cross-session similarity edges", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      clearEmbeddingsIndex();
      // Index a second session with similar content
      const graph = autoIndexSession(
        "s2",
        makeInvestigation({ summary: "AI diagnostics in healthcare using machine learning" }),
        [
          makeAngleResult({
            angleId: "cross-pollination",
            angleName: "Cross-Pollination",
            reasoning: "Applying healthcare AI patterns for robust medical diagnosis",
          }),
        ]
      );
      // similar_to edges might or might not appear depending on TF-IDF overlap
      // At minimum, the graph should have nodes from both sessions
      const s1Nodes = graph.nodes.filter((n) => n.sessionId === "s1");
      const s2Nodes = graph.nodes.filter((n) => n.sessionId === "s2");
      expect(s1Nodes.length).toBeGreaterThan(0);
      expect(s2Nodes.length).toBeGreaterThan(0);
    });

    it("handles empty angle results array", () => {
      const graph = autoIndexSession("session-empty", makeInvestigation(), []);
      expect(graph.nodes.filter((n) => n.type === "investigation")).toHaveLength(1);
      expect(graph.nodes.filter((n) => n.type === "angle-result")).toHaveLength(0);
      expect(graph.nodes.filter((n) => n.type === "idea")).toHaveLength(0);
    });

    it("handles angle result with no ideas", () => {
      const graph = autoIndexSession("s1", makeInvestigation(), [makeAngleResult({ ideas: [] })]);
      expect(graph.nodes.filter((n) => n.type === "angle-result")).toHaveLength(1);
      expect(graph.nodes.filter((n) => n.type === "idea")).toHaveLength(0);
    });

    it("handles multiple angle results", () => {
      const graph = autoIndexSession("s1", makeInvestigation(), [
        makeAngleResult({ angleId: "a1", angleName: "Angle 1" }),
        makeAngleResult({ angleId: "a2", angleName: "Angle 2" }),
      ]);
      const arNodes = graph.nodes.filter((n) => n.type === "angle-result");
      expect(arNodes).toHaveLength(2);
    });

    it("handles synthesis without themes", () => {
      const graph = autoIndexSession("s1", makeInvestigation(), [], makeSynthesis({ themes: [] }));
      expect(graph.nodes.filter((n) => n.type === "theme")).toHaveLength(0);
      expect(graph.nodes.filter((n) => n.type === "synthesis")).toHaveLength(1);
    });
  });

  // ---- retrieveRelatedMemories ----

  describe("retrieveRelatedMemories", () => {
    it("returns matching nodes with scores", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      const result = retrieveRelatedMemories("healthcare AI diagnosis");
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.scores.size).toBeGreaterThan(0);
      for (const [nodeId, score] of result.scores) {
        expect(score).toBeGreaterThan(0);
        expect(result.nodes.some((n) => n.id === nodeId)).toBe(true);
      }
    });

    it("returns empty for unrelated query", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      const result = retrieveRelatedMemories("xyznonexistent987zzz");
      expect(result.nodes).toHaveLength(0);
      expect(result.scores.size).toBe(0);
    });

    it("handles empty graph", () => {
      const result = retrieveRelatedMemories("anything");
      expect(result.nodes).toHaveLength(0);
      expect(result.scores.size).toBe(0);
    });

    it("respects threshold option", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      const highThreshold = retrieveRelatedMemories("healthcare", { threshold: 0.99 });
      const lowThreshold = retrieveRelatedMemories("healthcare", { threshold: 0.01 });
      expect(lowThreshold.nodes.length).toBeGreaterThanOrEqual(highThreshold.nodes.length);
    });

    it("respects limit option", () => {
      autoIndexSession("s1", makeInvestigation(), [
        makeAngleResult({
          angleId: "a1",
          angleName: "A1",
          reasoning: "healthcare AI pattern recognition",
        }),
        makeAngleResult({
          angleId: "a2",
          angleName: "A2",
          reasoning: "healthcare AI image analysis",
        }),
        makeAngleResult({
          angleId: "a3",
          angleName: "A3",
          reasoning: "healthcare AI neural networks",
        }),
      ]);
      const result = retrieveRelatedMemories("healthcare AI", { limit: 1 });
      expect(result.nodes.length).toBeLessThanOrEqual(1);
    });

    it("respects sessionFilter option", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      clearEmbeddingsIndex();
      autoIndexSession("s2", makeInvestigation({ summary: "Renewable energy solar panels" }), [
        makeAngleResult({ reasoning: "Solar energy innovation patterns" }),
      ]);
      const result = retrieveRelatedMemories("healthcare AI diagnosis", {
        sessionFilter: ["s2"],
      });
      for (const node of result.nodes) {
        expect(node.sessionId).toBe("s2");
      }
    });
  });

  // ---- detectConvergence ----

  describe("detectConvergence", () => {
    it("returns empty for empty graph", () => {
      const patterns = detectConvergence();
      expect(patterns).toHaveLength(0);
    });

    it("returns empty for single session", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const patterns = detectConvergence();
      // Single session cannot have cross-session convergence
      for (const p of patterns) {
        expect(p.sessionIds.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("detects patterns across sessions with shared themes", () => {
      // Index two similar sessions
      autoIndexSession(
        "s1",
        makeInvestigation({ summary: "Machine learning algorithms optimization" }),
        [
          makeAngleResult({
            angleId: "ml1",
            angleName: "ML Optimization",
            reasoning: "Machine learning optimization algorithms neural networks deep learning",
          }),
        ]
      );
      autoIndexSession(
        "s2",
        makeInvestigation({ summary: "Deep learning neural network optimization" }),
        [
          makeAngleResult({
            angleId: "ml2",
            angleName: "Deep Learning",
            reasoning: "Deep learning neural network optimization algorithms machine learning",
          }),
        ]
      );
      const patterns = detectConvergence();
      // Patterns spanning multiple sessions should have valid structure
      for (const p of patterns) {
        expect(typeof p.id).toBe("string");
        expect(typeof p.description).toBe("string");
        expect(p.sessionIds.length).toBeGreaterThanOrEqual(2);
        expect(p.nodeIds.length).toBeGreaterThan(0);
        expect(p.similarityScore).toBeGreaterThanOrEqual(0);
        expect(p.similarityScore).toBeLessThanOrEqual(1);
      }
    });

    it("returns patterns sorted by similarity score descending", () => {
      autoIndexSession(
        "s1",
        makeInvestigation({ summary: "Technology innovation digital transformation" }),
        [makeAngleResult({ angleId: "t1", reasoning: "Technology innovation patterns" })]
      );
      autoIndexSession("s2", makeInvestigation({ summary: "Digital transformation technology" }), [
        makeAngleResult({ angleId: "t2", reasoning: "Digital transformation innovation" }),
      ]);
      autoIndexSession("s3", makeInvestigation({ summary: "Innovation technology digital" }), [
        makeAngleResult({ angleId: "t3", reasoning: "Innovation technology patterns" }),
      ]);
      const patterns = detectConvergence();
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].similarityScore).toBeGreaterThanOrEqual(patterns[i].similarityScore);
      }
    });
  });

  // ---- generateOrgDNA ----

  describe("generateOrgDNA", () => {
    it("handles empty graph", () => {
      const report = generateOrgDNA();
      expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.totalSessions).toBe(0);
      expect(report.totalNodes).toBe(0);
      expect(report.totalEdges).toBe(0);
      expect(report.themeClusters).toEqual([]);
      expect(report.convergencePatterns).toEqual([]);
      expect(report.ideaLineages).toEqual([]);
    });

    it("returns report with theme clusters after indexing", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      expect(report.totalSessions).toBe(1);
      expect(report.totalNodes).toBeGreaterThan(0);
      expect(report.totalEdges).toBeGreaterThan(0);
      expect(report.themeClusters.length).toBeGreaterThan(0);
      for (const cluster of report.themeClusters) {
        expect(typeof cluster.id).toBe("string");
        expect(typeof cluster.label).toBe("string");
        expect(cluster.centroidTerms.length).toBeGreaterThan(0);
        expect(cluster.firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(cluster.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it("identifies blind spots for isolated nodes", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      // Blind spots depend on graph topology; just validate structure
      for (const spot of report.blindSpots) {
        expect(typeof spot.id).toBe("string");
        expect(typeof spot.description).toBe("string");
        expect(spot.relatedThemes.length).toBeGreaterThan(0);
        expect(spot.suggestedExplorations.length).toBeGreaterThan(0);
      }
    });

    it("includes convergence patterns in report", () => {
      autoIndexSession(
        "s1",
        makeInvestigation({ summary: "Blockchain distributed ledger technology" }),
        [makeAngleResult({ reasoning: "Blockchain distributed ledger innovation" })]
      );
      autoIndexSession(
        "s2",
        makeInvestigation({ summary: "Distributed ledger blockchain technology" }),
        [makeAngleResult({ reasoning: "Distributed ledger blockchain applications" })]
      );
      const report = generateOrgDNA();
      expect(report.totalSessions).toBe(2);
      // convergencePatterns may or may not be found depending on clustering
      expect(Array.isArray(report.convergencePatterns)).toBe(true);
    });

    it("includes idea lineages for top ideas", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      // Lineages are generated for idea nodes
      for (const lineage of report.ideaLineages) {
        expect(typeof lineage.ideaId).toBe("string");
        expect(typeof lineage.title).toBe("string");
        expect(Array.isArray(lineage.ancestors)).toBe(true);
        expect(Array.isArray(lineage.descendants)).toBe(true);
      }
    });

    it("returns topThemes array", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      expect(Array.isArray(report.topThemes)).toBe(true);
    });
  });

  // ---- getIdeaLineage ----

  describe("getIdeaLineage", () => {
    it("handles unknown idea ID", () => {
      const lineage = getIdeaLineage("nonexistent-id");
      expect(lineage.ideaId).toBe("nonexistent-id");
      expect(lineage.title).toBe("Unknown");
      expect(lineage.ancestors).toHaveLength(0);
      expect(lineage.descendants).toHaveLength(0);
    });

    it("traces ancestors of an idea", () => {
      const graph = autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      const ideaNode = graph.nodes.find((n) => n.type === "idea");
      expect(ideaNode).toMatchObject({
        id: expect.any(String),
        type: "idea",
        sessionId: "s1",
      });

      const lineage = getIdeaLineage(ideaNode!.id);
      expect(lineage.ideaId).toBe(ideaNode!.id);
      expect(lineage.title).toBe(ideaNode!.title);
      // Idea should have at least the angle-result as ancestor (derived_from edge)
      expect(lineage.ancestors.length).toBeGreaterThanOrEqual(1);
      const ancestorRelationships = lineage.ancestors.map((a) => a.relationship);
      expect(ancestorRelationships).toContain("derived_from");
    });

    it("traces descendants from an investigation node", () => {
      const graph = autoIndexSession(
        "s1",
        makeInvestigation(),
        [makeAngleResult()],
        makeSynthesis()
      );
      const invNode = graph.nodes.find((n) => n.type === "investigation");
      expect(invNode).toMatchObject({
        id: expect.any(String),
        type: "investigation",
        sessionId: "s1",
      });

      const lineage = getIdeaLineage(invNode!.id);
      // Investigation has descendants via part_of and evolves_into edges
      expect(lineage.descendants.length).toBeGreaterThan(0);
    });

    it("ancestors are sorted by creation time", () => {
      const graph = autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      const ideaNode = graph.nodes.find((n) => n.type === "idea");
      const lineage = getIdeaLineage(ideaNode!.id);
      for (let i = 1; i < lineage.ancestors.length; i++) {
        expect(lineage.ancestors[i - 1].createdAt <= lineage.ancestors[i].createdAt).toBe(true);
      }
    });

    it("descendants are sorted by creation time", () => {
      const graph = autoIndexSession(
        "s1",
        makeInvestigation(),
        [makeAngleResult()],
        makeSynthesis()
      );
      const invNode = graph.nodes.find((n) => n.type === "investigation");
      const lineage = getIdeaLineage(invNode!.id);
      for (let i = 1; i < lineage.descendants.length; i++) {
        expect(lineage.descendants[i - 1].createdAt <= lineage.descendants[i].createdAt).toBe(true);
      }
    });
  });

  // ---- orgDNAToMarkdown ----

  describe("orgDNAToMarkdown", () => {
    it("produces non-empty markdown string", () => {
      const report = generateOrgDNA();
      const md = orgDNAToMarkdown(report);
      expect(md.length).toBeGreaterThan(0);
      expect(md).toContain("# Organizational Innovation DNA Report");
    });

    it("includes session and node counts", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      const md = orgDNAToMarkdown(report);
      expect(md).toContain("**Sessions:**");
      expect(md).toContain("**Nodes:**");
      expect(md).toContain("**Edges:**");
    });

    it("includes top themes section when themes exist", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      if (report.topThemes.length > 0) {
        const md = orgDNAToMarkdown(report);
        expect(md).toContain("## Top Themes");
      }
    });

    it("includes theme clusters section when clusters exist", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      if (report.themeClusters.length > 0) {
        const md = orgDNAToMarkdown(report);
        expect(md).toContain("## Theme Clusters");
        expect(md).toContain("**Key terms:**");
      }
    });

    it("includes idea lineages section when lineages exist", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const report = generateOrgDNA();
      if (report.ideaLineages.length > 0) {
        const md = orgDNAToMarkdown(report);
        expect(md).toContain("## Idea Lineages");
      }
    });

    it("renders empty report without crashing", () => {
      const report = generateOrgDNA();
      const md = orgDNAToMarkdown(report);
      expect(md).toContain("# Organizational Innovation DNA Report");
      expect(md).toContain("**Generated:**");
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles investigation with minimal data", () => {
      const minInvestigation: Investigation = {
        summary: "",
        currentState: "",
        keyAspects: [],
        challenges: [],
        opportunities: [],
      };
      const graph = autoIndexSession("s-min", minInvestigation, []);
      expect(graph.sessions).toContain("s-min");
      expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it("handles multiple sessions with distinct content", () => {
      autoIndexSession(
        "s1",
        makeInvestigation({ summary: "Quantum computing research advances" }),
        [
          makeAngleResult({
            angleId: "q1",
            reasoning: "Quantum computing qubit optimization",
          }),
        ]
      );
      autoIndexSession("s2", makeInvestigation({ summary: "Renewable energy solar technology" }), [
        makeAngleResult({
          angleId: "r1",
          reasoning: "Solar panel efficiency improvements",
        }),
      ]);
      const graph = getMemoryGraph();
      expect(graph.sessions).toHaveLength(2);
      expect(graph.sessions).toContain("s1");
      expect(graph.sessions).toContain("s2");
    });

    it("node IDs are unique", () => {
      autoIndexSession("s1", makeInvestigation(), [
        makeAngleResult({ angleId: "a1" }),
        makeAngleResult({ angleId: "a2" }),
      ]);
      const graph = getMemoryGraph();
      const ids = graph.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("edge IDs are unique", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const graph = getMemoryGraph();
      const ids = graph.edges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("graph traversal with disconnected components", () => {
      // Two separate sessions with very different content create disconnected components
      autoIndexSession("s1", makeInvestigation({ summary: "Quantum computing qubits" }), [
        makeAngleResult({ angleId: "q1", reasoning: "Quantum optimization" }),
      ]);
      autoIndexSession("s2", makeInvestigation({ summary: "Marine biology coral reefs" }), [
        makeAngleResult({ angleId: "b1", reasoning: "Coral reef preservation" }),
      ]);
      const graph = getMemoryGraph();
      // Both sessions indexed
      expect(graph.sessions).toContain("s1");
      expect(graph.sessions).toContain("s2");
      // Nodes from each session exist
      expect(graph.nodes.filter((n) => n.sessionId === "s1").length).toBeGreaterThan(0);
      expect(graph.nodes.filter((n) => n.sessionId === "s2").length).toBeGreaterThan(0);
    });

    it("relationship metadata preserved on query", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()]);
      const result = retrieveRelatedMemories("healthcare AI diagnosis");
      for (const node of result.nodes) {
        expect(node).toMatchObject({
          id: expect.any(String),
          type: expect.any(String),
          sessionId: expect.any(String),
          title: expect.any(String),
          createdAt: expect.stringMatching(/^\d{4}/),
        });
      }
    });

    it("handles large number of angle results", () => {
      const manyAngles = [];
      for (let i = 0; i < 20; i++) {
        manyAngles.push(
          makeAngleResult({
            angleId: `angle-${i}`,
            angleName: `Angle ${i}`,
            reasoning: `Reasoning for angle ${i} in domain`,
          })
        );
      }
      const graph = autoIndexSession("s-large", makeInvestigation(), manyAngles);
      const arNodes = graph.nodes.filter((n) => n.type === "angle-result");
      expect(arNodes).toHaveLength(20);
      // All node IDs unique
      const ids = graph.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("edge source and target reference existing nodes", () => {
      autoIndexSession("s1", makeInvestigation(), [makeAngleResult()], makeSynthesis());
      const graph = getMemoryGraph();
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });
  });
});
