/**
 * Tests for the Innovation Memory & Learning Loop module.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadMemoryGraph,
  ingestConcepts,
  trackEvent,
  loadEvents,
  computeDomainProfile,
  generatePreSessionRecommendations,
  generateMidSessionNudges,
  findRelatedConcepts,
  getMemoryStats,
} from "../innovation-memory.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "innovator-memory-test-"));
});

afterEach(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("innovation-memory", () => {
  describe("loadMemoryGraph", () => {
    it("returns empty graph for fresh directory", () => {
      const graph = loadMemoryGraph(testDir);
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.totalSessions).toBe(0);
    });
  });

  describe("ingestConcepts", () => {
    it("ingests new concepts as nodes", () => {
      const graph = ingestConcepts(
        "session-1",
        [
          { label: "Machine Learning", type: "concept" },
          { label: "Natural Language Processing", type: "concept" },
        ],
        [],
        testDir
      );

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].label).toBe("Machine Learning");
      expect(graph.nodes[0].sessionIds).toContain("session-1");
      expect(graph.nodes[0].occurrenceCount).toBe(1);
    });

    it("increments occurrence count on re-ingestion", () => {
      ingestConcepts("s1", [{ label: "AI" }], [], testDir);
      const graph = ingestConcepts("s2", [{ label: "AI" }], [], testDir);

      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].occurrenceCount).toBe(2);
      expect(graph.nodes[0].sessionIds).toContain("s1");
      expect(graph.nodes[0].sessionIds).toContain("s2");
    });

    it("creates edges between concepts", () => {
      const graph = ingestConcepts(
        "s1",
        [{ label: "AI" }, { label: "Healthcare" }],
        [{ sourceLabel: "AI", targetLabel: "Healthcare", type: "related", weight: 0.8 }],
        testDir
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].type).toBe("related");
      expect(graph.edges[0].weight).toBe(0.8);
    });

    it("strengthens existing edges on re-ingestion", () => {
      ingestConcepts(
        "s1",
        [{ label: "AI" }, { label: "Healthcare" }],
        [{ sourceLabel: "AI", targetLabel: "Healthcare" }],
        testDir
      );
      const graph = ingestConcepts(
        "s2",
        [{ label: "AI" }, { label: "Healthcare" }],
        [{ sourceLabel: "AI", targetLabel: "Healthcare" }],
        testDir
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].weight).toBe(0.6); // 0.5 + 0.1
      expect(graph.edges[0].sessionIds).toHaveLength(2);
    });

    it("persists across loads", () => {
      ingestConcepts("s1", [{ label: "Test Concept" }], [], testDir);
      const graph = loadMemoryGraph(testDir);
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].label).toBe("Test Concept");
    });

    it("tracks total sessions", () => {
      ingestConcepts("s1", [{ label: "A" }], [], testDir);
      ingestConcepts("s2", [{ label: "B" }], [], testDir);
      const graph = loadMemoryGraph(testDir);
      expect(graph.totalSessions).toBe(2);
    });
  });

  describe("trackEvent and loadEvents", () => {
    it("tracks and loads events", () => {
      trackEvent({ type: "session.started", sessionId: "s1" }, testDir);
      trackEvent({ type: "angle.generated", sessionId: "s1", metadata: { angleId: "scamper" } }, testDir);

      const events = loadEvents(100, testDir);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("session.started");
      expect(events[1].type).toBe("angle.generated");
      expect(events[1].metadata?.angleId).toBe("scamper");
    });

    it("assigns ID and timestamp to events", () => {
      const event = trackEvent({ type: "session.completed" }, testDir);
      expect(event.id).toMatch(/^evt-/);
      expect(event.timestamp).toBeDefined();
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        trackEvent({ type: "session.started", sessionId: `s${i}` }, testDir);
      }

      const limited = loadEvents(3, testDir);
      expect(limited).toHaveLength(3);
    });

    it("returns empty for non-existent events file", () => {
      const events = loadEvents(100, testDir);
      expect(events).toHaveLength(0);
    });
  });

  describe("computeDomainProfile", () => {
    it("computes profile from events", () => {
      trackEvent({ type: "angle.generated", metadata: { domain: "Healthcare", angleId: "scamper", qualityScore: 80 } }, testDir);
      trackEvent({ type: "angle.generated", metadata: { domain: "Healthcare", angleId: "scamper", qualityScore: 90 } }, testDir);
      trackEvent({ type: "angle.generated", metadata: { domain: "Fintech", angleId: "inversion" } }, testDir);

      const profile = computeDomainProfile("Healthcare", testDir);
      expect(profile.domain).toBe("Healthcare");
      expect(profile.topAngles).toHaveLength(1);
      expect(profile.topAngles[0].angleId).toBe("scamper");
      expect(profile.topAngles[0].usageCount).toBe(2);
    });

    it("returns empty profile for unknown domain", () => {
      const profile = computeDomainProfile("Nonexistent", testDir);
      expect(profile.sessionCount).toBe(0);
      expect(profile.topAngles).toHaveLength(0);
    });
  });

  describe("generatePreSessionRecommendations", () => {
    it("returns empty for fresh memory", () => {
      const recs = generatePreSessionRecommendations("AI in healthcare", testDir);
      expect(recs).toHaveLength(0);
    });

    it("recommends prior exploration when concept matches", () => {
      ingestConcepts("s1", [{ label: "healthcare" }], [], testDir);
      ingestConcepts("s2", [{ label: "healthcare" }], [], testDir);

      const recs = generatePreSessionRecommendations("AI in healthcare", testDir);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].type).toBe("pre-session");
      expect(recs[0].title).toContain("healthcare");
    });
  });

  describe("generateMidSessionNudges", () => {
    it("returns empty for unrelated concepts", () => {
      const nudges = generateMidSessionNudges("s1", ["quantum computing"], testDir);
      expect(nudges).toHaveLength(0);
    });
  });

  describe("findRelatedConcepts", () => {
    it("finds concepts connected to a label", () => {
      ingestConcepts(
        "s1",
        [{ label: "AI" }, { label: "Healthcare" }, { label: "Robotics" }],
        [
          { sourceLabel: "AI", targetLabel: "Healthcare" },
          { sourceLabel: "AI", targetLabel: "Robotics" },
        ],
        testDir
      );

      const related = findRelatedConcepts("AI", 1, testDir);
      expect(related).toHaveLength(2);
      expect(related.map((n) => n.label)).toContain("Healthcare");
      expect(related.map((n) => n.label)).toContain("Robotics");
    });

    it("returns empty for unknown label", () => {
      expect(findRelatedConcepts("Nonexistent", 1, testDir)).toHaveLength(0);
    });
  });

  describe("getMemoryStats", () => {
    it("returns stats for populated graph", () => {
      ingestConcepts("s1", [{ label: "A" }, { label: "B" }], [{ sourceLabel: "A", targetLabel: "B" }], testDir);

      const stats = getMemoryStats(testDir);
      expect(stats.totalNodes).toBe(2);
      expect(stats.totalEdges).toBe(1);
      expect(stats.totalSessions).toBe(1);
      expect(stats.topConcepts).toHaveLength(2);
    });

    it("returns zero stats for empty graph", () => {
      const stats = getMemoryStats(testDir);
      expect(stats.totalNodes).toBe(0);
      expect(stats.totalEdges).toBe(0);
    });
  });
});
