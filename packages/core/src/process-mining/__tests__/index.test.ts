import { describe, it, expect } from "vitest";
import {
  mineProcess,
  analyticsToProcessEvents,
  processMiningToMarkdown,
  type ProcessEvent,
  type ProcessMiningConfig,
} from "../index.js";

// ---- Helpers ----

function makeEvent(
  caseId: string,
  activity: string,
  timestampMs: number,
  durationMs?: number
): ProcessEvent {
  return {
    id: `evt-${caseId}-${activity}-${timestampMs}`,
    caseId,
    activity,
    timestamp: new Date(timestampMs).toISOString(),
    durationMs,
  };
}

function makeLinearTrace(
  caseId: string,
  activities: string[],
  startMs: number = 1000000,
  intervalMs: number = 5000
): ProcessEvent[] {
  return activities.map((activity, i) =>
    makeEvent(caseId, activity, startMs + i * intervalMs, 1000)
  );
}

describe("process-mining", () => {
  // ---- mineProcess with Alpha algorithm ----
  describe("mineProcess (alpha)", () => {
    it("discovers nodes and edges from linear trace", () => {
      const events = [
        ...makeLinearTrace("case-1", [
          "start",
          "investigation",
          "generation",
          "synthesis",
          "complete",
        ]),
        ...makeLinearTrace("case-2", [
          "start",
          "investigation",
          "generation",
          "synthesis",
          "complete",
        ]),
      ];

      const result = mineProcess(events);

      expect(result.processMap.nodes).toHaveLength(5);
      expect(result.processMap.edges.length).toBeGreaterThan(0);
      expect(result.statistics.totalCases).toBe(2);
      expect(result.statistics.totalEvents).toBe(10);
      expect(result.statistics.uniqueActivities).toBe(5);
    });

    it("identifies start and end activities", () => {
      const events = makeLinearTrace("case-1", ["A", "B", "C"]);
      const result = mineProcess(events);

      const nodeA = result.processMap.nodes.find((n) => n.activity === "A")!;
      const nodeC = result.processMap.nodes.find((n) => n.activity === "C")!;
      expect(nodeA.isStart).toBe(true);
      expect(nodeC.isEnd).toBe(true);
    });

    it("computes edge frequencies and probabilities", () => {
      const events = [
        ...makeLinearTrace("case-1", ["A", "B", "C"]),
        ...makeLinearTrace("case-2", ["A", "B", "C"]),
        ...makeLinearTrace("case-3", ["A", "C"]),
      ];
      const result = mineProcess(events);

      const abEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "B");
      const acEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "C");
      expect(abEdge).toBeDefined();
      expect(abEdge!.frequency).toBe(2);
      expect(acEdge).toBeDefined();
      expect(acEdge!.frequency).toBe(1);
      // Probabilities should sum to ~1 for same source
      expect(abEdge!.probability + acEdge!.probability).toBeCloseTo(1, 1);
    });

    it("computes average activity duration", () => {
      const events = [
        makeEvent("c1", "A", 1000, 100),
        makeEvent("c1", "B", 2000, 200),
        makeEvent("c2", "A", 3000, 300),
        makeEvent("c2", "B", 4000, 400),
      ];
      const result = mineProcess(events);

      const nodeA = result.processMap.nodes.find((n) => n.activity === "A")!;
      expect(nodeA.averageDurationMs).toBe(200); // (100 + 300) / 2
    });

    it("respects minFrequency config", () => {
      const events = [
        ...makeLinearTrace("c1", ["A", "B", "C"]),
        ...makeLinearTrace("c2", ["A", "B", "C"]),
        ...makeLinearTrace("c3", ["A", "D"]), // D only once
      ];
      const result = mineProcess(events, { minFrequency: 2 });

      const adEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "D");
      expect(adEdge).toBeUndefined(); // frequency 1 < minFrequency 2
    });
  });

  // ---- mineProcess with Inductive algorithm ----
  describe("mineProcess (inductive)", () => {
    it("applies stricter frequency filtering", () => {
      const events = [
        ...makeLinearTrace("c1", ["A", "B", "C"]),
        ...makeLinearTrace("c2", ["A", "B", "C"]),
        ...makeLinearTrace("c3", ["A", "D"]),
      ];
      const result = mineProcess(events, { algorithm: "inductive" });

      // Inductive mining uses minFrequency >= 2
      const adEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "D");
      expect(adEdge).toBeUndefined();
    });

    it("produces valid process map", () => {
      const events = [
        ...makeLinearTrace("c1", ["start", "process", "end"]),
        ...makeLinearTrace("c2", ["start", "process", "end"]),
      ];
      const result = mineProcess(events, { algorithm: "inductive" });
      expect(result.processMap.nodes.length).toBeGreaterThan(0);
      expect(result.processMap.edges.length).toBeGreaterThan(0);
    });
  });

  // ---- Bottleneck detection ----
  describe("bottleneck detection", () => {
    it("identifies slowest transitions", () => {
      const events = [
        makeEvent("c1", "A", 1000, 100),
        makeEvent("c1", "B", 20000, 100), // 18900ms wait after A
        makeEvent("c1", "C", 21000, 100),
        makeEvent("c2", "A", 50000, 100),
        makeEvent("c2", "B", 70000, 100), // 19900ms wait after A
        makeEvent("c2", "C", 71000, 100),
      ];
      const result = mineProcess(events, { bottleneckThresholdMs: 5000 });

      expect(result.bottlenecks.length).toBeGreaterThan(0);
      const bottleneck = result.bottlenecks.find((b) => b.activity === "B");
      expect(bottleneck).toBeDefined();
      expect(bottleneck!.averageWaitMs).toBeGreaterThan(5000);
    });

    it("reports severity levels", () => {
      const events = [
        makeEvent("c1", "A", 1000, 0),
        makeEvent("c1", "B", 200000, 0), // Very long wait
      ];
      const result = mineProcess(events, { bottleneckThresholdMs: 1000 });

      if (result.bottlenecks.length > 0) {
        expect(["low", "medium", "high", "critical"]).toContain(result.bottlenecks[0].severity);
        expect(result.bottlenecks[0].recommendation).toBeTruthy();
      }
    });

    it("no bottlenecks for fast transitions", () => {
      const events = makeLinearTrace("c1", ["A", "B", "C"], 1000, 100);
      const result = mineProcess(events, { bottleneckThresholdMs: 5000 });
      expect(result.bottlenecks).toHaveLength(0);
    });
  });

  // ---- Transition analysis ----
  describe("transitions", () => {
    it("analyzes transition frequencies and durations", () => {
      const events = [
        ...makeLinearTrace("c1", ["A", "B", "C"], 0, 10000),
        ...makeLinearTrace("c2", ["A", "B", "C"], 100000, 10000),
      ];
      const result = mineProcess(events);

      expect(result.transitions.length).toBeGreaterThan(0);
      const ab = result.transitions.find((t) => t.from === "A" && t.to === "B");
      expect(ab).toBeDefined();
      expect(ab!.frequency).toBe(2);
      expect(ab!.averageDurationMs).toBeGreaterThan(0);
      expect(ab!.medianDurationMs).toBeGreaterThan(0);
    });
  });

  // ---- Conformance checking ----
  describe("conformance", () => {
    it("detects deviations from expected sequence", () => {
      const events = [
        // Out of order: generation before investigation
        makeEvent("c1", "generation", 1000),
        makeEvent("c1", "investigation", 2000),
        makeEvent("c1", "synthesis", 3000),
      ];
      const result = mineProcess(events);

      expect(result.conformance.deviations.length).toBeGreaterThan(0);
      expect(result.conformance.fitnessScore).toBeLessThan(1);
    });

    it("perfect conformance for correct sequence", () => {
      const events = makeLinearTrace("c1", ["investigation", "generation", "synthesis"]);
      const result = mineProcess(events);
      expect(result.conformance.fitnessScore).toBe(1);
    });
  });

  // ---- Case duration statistics ----
  describe("statistics", () => {
    it("computes average and median case duration", () => {
      const events = [
        ...makeLinearTrace("c1", ["A", "B"], 0, 10000),
        ...makeLinearTrace("c2", ["A", "B"], 100000, 20000),
      ];
      const result = mineProcess(events);

      expect(result.statistics.averageCaseDurationMs).toBeGreaterThan(0);
      expect(result.statistics.medianCaseDurationMs).toBeGreaterThan(0);
    });
  });

  // ---- analyticsToProcessEvents ----
  describe("analyticsToProcessEvents", () => {
    it("converts analytics events to process events", () => {
      const analytics = [
        {
          id: "e1",
          type: "pipeline_started",
          timestamp: "2025-01-01T00:00:00Z",
          data: { sessionId: "sess-1" },
        },
        {
          id: "e2",
          type: "investigation_completed",
          timestamp: "2025-01-01T00:01:00Z",
          data: { sessionId: "sess-1", durationMs: 5000 },
        },
        {
          id: "e3",
          type: "synthesis_completed",
          timestamp: "2025-01-01T00:02:00Z",
          data: { sessionId: "sess-1" },
        },
      ];

      const processEvents = analyticsToProcessEvents(analytics);
      expect(processEvents).toHaveLength(3);
      expect(processEvents[0].activity).toBe("start");
      expect(processEvents[1].activity).toBe("investigation");
      expect(processEvents[1].durationMs).toBe(5000);
    });

    it("filters out unmapped event types", () => {
      const analytics = [
        { id: "e1", type: "unknown_event", timestamp: "2025-01-01T00:00:00Z" },
        { id: "e2", type: "pipeline_started", timestamp: "2025-01-01T00:00:00Z" },
      ];
      expect(analyticsToProcessEvents(analytics)).toHaveLength(1);
    });

    it("uses sessionId as caseId", () => {
      const analytics = [
        {
          id: "e1",
          type: "pipeline_started",
          timestamp: "2025-01-01T00:00:00Z",
          data: { sessionId: "my-session" },
        },
      ];
      const events = analyticsToProcessEvents(analytics);
      expect(events[0].caseId).toBe("my-session");
    });
  });

  // ---- processMiningToMarkdown ----
  describe("processMiningToMarkdown", () => {
    it("includes process map and statistics", () => {
      const events = [
        ...makeLinearTrace("c1", ["start", "investigation", "generation"]),
        ...makeLinearTrace("c2", ["start", "investigation", "generation"]),
      ];
      const result = mineProcess(events);
      const md = processMiningToMarkdown(result);

      expect(md).toContain("# Innovation Process Mining");
      expect(md).toContain("**Cases:** 2");
      expect(md).toContain("**Events:** 6");
      expect(md).toContain("## Process Map");
    });

    it("includes bottleneck section when present", () => {
      const events = [makeEvent("c1", "A", 1000, 0), makeEvent("c1", "B", 200000, 0)];
      const result = mineProcess(events, { bottleneckThresholdMs: 1000 });
      const md = processMiningToMarkdown(result);

      if (result.bottlenecks.length > 0) {
        expect(md).toContain("## Bottlenecks");
      }
    });
  });

  // ---- Edge cases ----
  describe("edge cases", () => {
    it("empty event log returns zeroed result", () => {
      const result = mineProcess([]);

      expect(result.processMap.nodes).toHaveLength(0);
      expect(result.processMap.edges).toHaveLength(0);
      expect(result.transitions).toHaveLength(0);
      expect(result.bottlenecks).toHaveLength(0);
      expect(result.statistics.totalCases).toBe(0);
      expect(result.statistics.totalEvents).toBe(0);
      expect(result.conformance.fitnessScore).toBe(1);
    });

    it("single-event trace", () => {
      const events = [makeEvent("c1", "A", 1000)];
      const result = mineProcess(events);

      expect(result.processMap.nodes).toHaveLength(1);
      expect(result.processMap.edges).toHaveLength(0);
      expect(result.statistics.totalCases).toBe(1);
      expect(result.statistics.totalEvents).toBe(1);
    });

    it("cyclic traces (loops)", () => {
      const events = [
        makeEvent("c1", "A", 1000),
        makeEvent("c1", "B", 2000),
        makeEvent("c1", "A", 3000), // loop back to A
        makeEvent("c1", "B", 4000),
        makeEvent("c1", "C", 5000),
      ];
      const result = mineProcess(events);

      expect(result.processMap.nodes).toHaveLength(3);
      // Should have A→B, B→A, and B→C edges
      const baEdge = result.processMap.edges.find((e) => e.source === "B" && e.target === "A");
      expect(baEdge).toBeDefined();
    });

    it("parallel activities in different cases", () => {
      const events = [
        makeEvent("c1", "A", 1000),
        makeEvent("c1", "B", 2000),
        makeEvent("c2", "A", 1500),
        makeEvent("c2", "C", 2500),
      ];
      const result = mineProcess(events);

      expect(result.statistics.totalCases).toBe(2);
      const abEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "B");
      const acEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "C");
      expect(abEdge).toBeDefined();
      expect(acEdge).toBeDefined();
    });

    it("footprint matrix symmetry: if A>B exists, check for B>A independently", () => {
      const events = [...makeLinearTrace("c1", ["A", "B"]), ...makeLinearTrace("c2", ["B", "A"])];
      const result = mineProcess(events);

      const abEdge = result.processMap.edges.find((e) => e.source === "A" && e.target === "B");
      const baEdge = result.processMap.edges.find((e) => e.source === "B" && e.target === "A");
      expect(abEdge).toBeDefined();
      expect(baEdge).toBeDefined();
    });
  });
});
