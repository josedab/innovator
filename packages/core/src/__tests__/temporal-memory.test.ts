import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadTemporalGraph,
  ingestSession,
  detectRecurrences,
  searchNodes,
  getConceptTimeline,
  getNeighbors,
  computeVelocity,
  deleteSessionData,
  temporalMemoryToMarkdown,
} from "../temporal-memory/temporal-memory.js";
import type { SessionIngestion } from "../temporal-memory/types.js";

function makeSession(overrides: Partial<SessionIngestion> = {}): SessionIngestion {
  return {
    sessionId: "session-1",
    subject: "AI Ethics",
    investigation: {
      summary: "Investigation of AI ethics challenges",
      keyAspects: [
        { title: "Bias in AI", description: "Algorithmic bias and fairness" },
        { title: "Transparency", description: "Explainability requirements" },
      ],
      challenges: ["Lack of regulation", "Bias amplification"],
      opportunities: ["Ethical AI frameworks", "Audit tools"],
    },
    ideas: [
      { title: "Bias Detection Tool", description: "Automated bias scanner", angleId: "first-principles" },
      { title: "Ethics Dashboard", description: "Real-time monitoring", angleId: "what-if" },
    ],
    themes: ["fairness", "transparency"],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("temporal-memory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "temporal-memory-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates empty graph on first load", () => {
    const graph = loadTemporalGraph(tempDir);
    expect(graph.version).toBe(1);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("ingests a session and creates nodes/edges", () => {
    const result = ingestSession(makeSession(), tempDir);
    expect(result.nodesCreated).toBeGreaterThan(0);
    expect(result.edgesCreated).toBeGreaterThan(0);

    const graph = loadTemporalGraph(tempDir);
    // Should have: session, 2 concepts, 2 challenges, 2 opportunities, 2 ideas, 2 angles, 2 themes = ~12 nodes
    expect(graph.nodes.length).toBeGreaterThanOrEqual(8);
    expect(graph.edges.length).toBeGreaterThanOrEqual(6);
  });

  it("detects recurrences across sessions", () => {
    ingestSession(makeSession({ sessionId: "s1" }), tempDir);
    ingestSession(makeSession({ sessionId: "s2" }), tempDir);

    const graph = loadTemporalGraph(tempDir);
    const recurrences = detectRecurrences(graph, 2);
    expect(recurrences.length).toBeGreaterThan(0);
    expect(recurrences[0].count).toBeGreaterThanOrEqual(2);
  });

  it("increments occurrence count on duplicate ingestion", () => {
    ingestSession(makeSession({ sessionId: "s1" }), tempDir);
    ingestSession(makeSession({ sessionId: "s2" }), tempDir);

    const graph = loadTemporalGraph(tempDir);
    const biasNode = graph.nodes.find((n) => n.label === "Bias in AI");
    expect(biasNode?.occurrenceCount).toBe(2);
    expect(biasNode?.sessionIds).toHaveLength(2);
  });

  it("searches nodes by text", () => {
    ingestSession(makeSession(), tempDir);
    const graph = loadTemporalGraph(tempDir);
    const results = searchNodes(graph, "bias");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label.toLowerCase()).toContain("bias");
  });

  it("searches with time range filter", () => {
    ingestSession(makeSession(), tempDir);
    const graph = loadTemporalGraph(tempDir);
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();

    const results = searchNodes(graph, "bias", { timeRange: { from: past, to: future } });
    expect(results.length).toBeGreaterThan(0);

    const emptyResults = searchNodes(graph, "bias", {
      timeRange: { from: "2099-01-01", to: "2099-12-31" },
    });
    expect(emptyResults).toHaveLength(0);
  });

  it("builds concept timeline", () => {
    ingestSession(makeSession(), tempDir);
    const graph = loadTemporalGraph(tempDir);
    const timeline = getConceptTimeline(graph, "Bias in AI");
    expect(timeline.length).toBeGreaterThan(0);
    // Timeline should be sorted by timestamp
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].timestamp >= timeline[i - 1].timestamp).toBe(true);
    }
  });

  it("gets neighbors within hops", () => {
    ingestSession(makeSession(), tempDir);
    const graph = loadTemporalGraph(tempDir);
    const sessionNode = graph.nodes.find((n) => n.type === "session");
    expect(sessionNode).toBeDefined();

    const neighbors = getNeighbors(graph, sessionNode!.id, 1);
    expect(neighbors.nodes.length).toBeGreaterThan(1);
    expect(neighbors.edges.length).toBeGreaterThan(0);
  });

  it("computes innovation velocity", () => {
    ingestSession(makeSession(), tempDir);
    const graph = loadTemporalGraph(tempDir);
    const velocity = computeVelocity(graph, 1);
    expect(velocity.ideasPerMonth).toBeGreaterThanOrEqual(0);
    expect(velocity.activeConcepts).toBeGreaterThanOrEqual(0);
  });

  it("deletes session data", () => {
    ingestSession(makeSession({ sessionId: "s1" }), tempDir);
    ingestSession(
      makeSession({
        sessionId: "s2",
        subject: "Different Topic",
        ideas: [{ title: "Unique Idea", description: "Unique", angleId: "scamper" }],
      }),
      tempDir
    );

    const removed = deleteSessionData("s2", tempDir);
    expect(removed).toBeGreaterThan(0);

    const graph = loadTemporalGraph(tempDir);
    const s2Nodes = graph.nodes.filter((n) => n.sessionIds.includes("s2"));
    // All remaining nodes with s2 should also have s1
    for (const node of s2Nodes) {
      expect(node.sessionIds).toContain("s1");
    }
  });

  it("records outcome causality", () => {
    ingestSession(
      makeSession({ outcome: { status: "shipped", reasoning: "Successful launch" } }),
      tempDir
    );

    const graph = loadTemporalGraph(tempDir);
    const outcomeNode = graph.nodes.find((n) => n.type === "outcome");
    expect(outcomeNode).toBeDefined();
    expect(outcomeNode!.metadata?.status).toBe("shipped");

    const causalEdge = graph.edges.find((e) => e.target === outcomeNode!.id && e.type === "caused");
    expect(causalEdge).toBeDefined();
  });

  it("formats as markdown", () => {
    ingestSession(makeSession(), tempDir);
    const graph = loadTemporalGraph(tempDir);
    const md = temporalMemoryToMarkdown(graph);
    expect(md).toContain("Temporal Innovation Memory");
    expect(md).toContain("Node Types");
  });
});
