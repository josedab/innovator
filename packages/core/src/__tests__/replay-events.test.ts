import { describe, it, expect, beforeEach } from "vitest";

import {
  emitReplayEvent,
  onReplayEvent,
  getReplayEvents,
  clearReplayEvents,
  createReplaySession,
  advanceReplaySession,
  pauseReplaySession,
  resumeReplaySession,
  setReplaySpeed,
  seekReplaySession,
  buildScoringOverlay,
  scoringOverlayToMarkdown,
} from "../replay/replay-events.js";

describe("replay/replay-events", () => {
  beforeEach(() => {
    clearReplayEvents();
  });

  describe("event emission", () => {
    it("emits and retrieves events", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("stage.started", "run-1", "sess-1", { stage: "investigation" });
      const events = getReplayEvents("run-1");
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("pipeline.started");
    });

    it("filters events by runId", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("pipeline.started", "run-2", "sess-2");
      expect(getReplayEvents("run-1")).toHaveLength(1);
      expect(getReplayEvents("run-2")).toHaveLength(1);
    });

    it("notifies listeners", () => {
      const events: string[] = [];
      const unsub = onReplayEvent((e) => events.push(e.type));
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("stage.completed", "run-1", "sess-1");
      expect(events).toEqual(["pipeline.started", "stage.completed"]);
      unsub();
      emitReplayEvent("pipeline.completed", "run-1", "sess-1");
      expect(events).toHaveLength(2); // unsubscribed
    });

    it("handles listener errors gracefully", () => {
      onReplayEvent(() => {
        throw new Error("listener error");
      });
      expect(() => emitReplayEvent("pipeline.started", "run-1", "sess-1")).not.toThrow();
    });
  });

  describe("replay sessions", () => {
    it("creates a session from events", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("stage.completed", "run-1", "sess-1");
      emitReplayEvent("pipeline.completed", "run-1", "sess-1");

      const session = createReplaySession("run-1");
      expect(session.totalEvents).toBe(3);
      expect(session.status).toBe("playing");
      expect(session.branchPoints.length).toBeGreaterThanOrEqual(1);
    });

    it("advances through events", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("stage.completed", "run-1", "sess-1");
      const session = createReplaySession("run-1");

      const result1 = advanceReplaySession(session);
      expect(result1).not.toBeNull();
      expect(result1!.event.type).toBe("pipeline.started");

      const result2 = advanceReplaySession(session);
      expect(result2!.event.type).toBe("stage.completed");

      const result3 = advanceReplaySession(session);
      expect(result3).toBeNull();
      expect(session.status).toBe("completed");
    });

    it("supports pause/resume", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("stage.completed", "run-1", "sess-1");
      const session = createReplaySession("run-1");

      pauseReplaySession(session);
      expect(session.status).toBe("paused");
      expect(advanceReplaySession(session)).toBeNull();

      resumeReplaySession(session);
      expect(session.status).toBe("playing");
      expect(advanceReplaySession(session)).not.toBeNull();
    });

    it("supports speed changes", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      const session = createReplaySession("run-1", "1x");
      setReplaySpeed(session, "4x");
      expect(session.speed).toBe("4x");
    });

    it("supports seeking", () => {
      emitReplayEvent("pipeline.started", "run-1", "sess-1");
      emitReplayEvent("stage.started", "run-1", "sess-1");
      emitReplayEvent("stage.completed", "run-1", "sess-1");
      const session = createReplaySession("run-1");

      advanceReplaySession(session);
      advanceReplaySession(session);
      seekReplaySession(session, 0);
      expect(session.currentEventIndex).toBe(0);
    });
  });

  describe("scoring overlay", () => {
    it("builds overlay from two branches", () => {
      const overlay = buildScoringOverlay(
        { runId: "a", label: "Branch A", scores: { novelty: 8, feasibility: 6, impact: 7 } },
        { runId: "b", label: "Branch B", scores: { novelty: 6, feasibility: 9, impact: 7 } }
      );

      expect(overlay.dimensions).toContain("novelty");
      expect(overlay.dimensions).toContain("feasibility");
      expect(overlay.branchA.totalScore).toBeCloseTo(7, 0);
      expect(overlay.branchB.totalScore).toBeCloseTo(7.33, 0);
      expect(overlay.delta["novelty"]).toBe(-2);
      expect(overlay.delta["feasibility"]).toBe(3);
    });

    it("detects a winner", () => {
      const overlay = buildScoringOverlay(
        { runId: "a", label: "A", scores: { s: 3 } },
        { runId: "b", label: "B", scores: { s: 9 } }
      );
      expect(overlay.winner).toBe("b");
    });

    it("returns undefined winner for tie", () => {
      const overlay = buildScoringOverlay(
        { runId: "a", label: "A", scores: { s: 5 } },
        { runId: "b", label: "B", scores: { s: 5 } }
      );
      expect(overlay.winner).toBeUndefined();
    });

    it("generates markdown report", () => {
      const overlay = buildScoringOverlay(
        { runId: "a", label: "Branch A", scores: { novelty: 8 } },
        { runId: "b", label: "Branch B", scores: { novelty: 6 } }
      );
      const md = scoringOverlayToMarkdown(overlay);
      expect(md).toContain("Scoring Overlay");
      expect(md).toContain("Branch A");
      expect(md).toContain("Branch B");
    });
  });
});
