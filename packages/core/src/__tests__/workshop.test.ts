import { describe, it, expect, beforeEach } from "vitest";

import {
  createWorkshop,
  getWorkshop,
  joinWorkshop,
  leaveWorkshop,
  advanceWorkshopPhase,
  submitWorkshopIdea,
  castWorkshopVote,
  pauseTimer,
  resumeTimer,
  extendTimer,
  generateWorkshopSummary,
  deleteWorkshop,
  clearWorkshops,
  listWorkshops,
} from "../canvas/workshop.js";

function makeWorkshop(overrides: Record<string, unknown> = {}) {
  return createWorkshop({
    title: "Test Workshop",
    subject: "AI Innovation",
    canvasId: "canvas-1",
    facilitatorId: "facilitator-1",
    facilitatorName: "Alice",
    ...overrides,
  });
}

describe("canvas/workshop", () => {
  beforeEach(() => {
    clearWorkshops();
  });

  // ---- Full lifecycle ----

  describe("workshop lifecycle", () => {
    it("create → join → advance → vote → summarize", () => {
      const ws = makeWorkshop();
      expect(ws.phase).toBe("lobby");
      expect(ws.participants).toHaveLength(1);
      expect(ws.facilitatorId).toBe("facilitator-1");

      // Join
      const p = joinWorkshop(ws.id, "user-2", "Bob");
      expect(p).toBeDefined();
      expect(p!.role).toBe("participant");

      // Advance to brainstorm
      const advanced = advanceWorkshopPhase(ws.id, "facilitator-1");
      expect(advanced).toBeDefined();
      expect(advanced!.phase).toBe("brainstorm");

      // Submit idea
      expect(submitWorkshopIdea(ws.id, "user-2", "New idea")).toBe(true);

      // Advance through to vote phase
      advanceWorkshopPhase(ws.id, "facilitator-1"); // cluster
      advanceWorkshopPhase(ws.id, "facilitator-1"); // vote

      const wsAfter = getWorkshop(ws.id)!;
      expect(wsAfter.phase).toBe("vote");

      // Cast vote
      expect(castWorkshopVote(ws.id, "user-2", "node-1")).toBe(true);

      // Advance to discuss → prioritize → completed
      advanceWorkshopPhase(ws.id, "facilitator-1");
      advanceWorkshopPhase(ws.id, "facilitator-1");
      advanceWorkshopPhase(ws.id, "facilitator-1");

      const final = getWorkshop(ws.id)!;
      expect(final.phase).toBe("completed");

      // Summarize
      const summary = generateWorkshopSummary(ws.id);
      expect(summary).toBeDefined();
      expect(summary!.totalParticipants).toBe(2);
      expect(summary!.totalIdeas).toBe(1);
      expect(summary!.totalVotes).toBe(1);
    });
  });

  // ---- Duplicate join ----

  describe("joinWorkshop", () => {
    it("reconnects existing user instead of duplicating", () => {
      const ws = makeWorkshop();
      joinWorkshop(ws.id, "user-2", "Bob");
      leaveWorkshop(ws.id, "user-2");

      // Rejoin
      const p = joinWorkshop(ws.id, "user-2", "Bob");
      expect(p).toBeDefined();
      expect(p!.connected).toBe(true);
      expect(getWorkshop(ws.id)!.participants).toHaveLength(2); // not 3
    });

    it("returns undefined for non-existent workshop", () => {
      expect(joinWorkshop("missing", "u1", "X")).toBeUndefined();
    });

    it("returns undefined when at capacity", () => {
      const ws = makeWorkshop({ config: { maxParticipants: 1 } });
      const result = joinWorkshop(ws.id, "user-2", "Bob");
      expect(result).toBeUndefined();
    });
  });

  // ---- Non-facilitator phase advance denial ----

  describe("advanceWorkshopPhase", () => {
    it("denies non-facilitator from advancing phase", () => {
      const ws = makeWorkshop();
      joinWorkshop(ws.id, "user-2", "Bob");
      const result = advanceWorkshopPhase(ws.id, "user-2");
      expect(result).toBeUndefined();
      expect(getWorkshop(ws.id)!.phase).toBe("lobby");
    });

    it("returns undefined when already completed", () => {
      const ws = makeWorkshop();
      // Advance through all phases
      for (let i = 0; i < 6; i++) {
        advanceWorkshopPhase(ws.id, "facilitator-1");
      }
      expect(getWorkshop(ws.id)!.phase).toBe("completed");
      expect(advanceWorkshopPhase(ws.id, "facilitator-1")).toBeUndefined();
    });

    it("records phase history when advancing", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1");
      const updated = getWorkshop(ws.id)!;
      expect(updated.phaseHistory).toHaveLength(1);
      expect(updated.phaseHistory[0].phase).toBe("lobby");
    });
  });

  // ---- Wrong-phase vote rejection ----

  describe("castWorkshopVote", () => {
    it("rejects vote in wrong phase (brainstorm)", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1"); // brainstorm
      expect(castWorkshopVote(ws.id, "facilitator-1", "node-1")).toBe(false);
    });

    it("rejects vote from observer", () => {
      const ws = makeWorkshop();
      joinWorkshop(ws.id, "obs-1", "Observer", "observer");
      // Advance to vote phase
      advanceWorkshopPhase(ws.id, "facilitator-1"); // brainstorm
      advanceWorkshopPhase(ws.id, "facilitator-1"); // cluster
      advanceWorkshopPhase(ws.id, "facilitator-1"); // vote
      expect(castWorkshopVote(ws.id, "obs-1", "node-1")).toBe(false);
    });

    it("enforces vote limit", () => {
      const ws = makeWorkshop({ config: { votesPerPerson: 1 } });
      advanceWorkshopPhase(ws.id, "facilitator-1"); // brainstorm
      advanceWorkshopPhase(ws.id, "facilitator-1"); // cluster
      advanceWorkshopPhase(ws.id, "facilitator-1"); // vote

      expect(castWorkshopVote(ws.id, "facilitator-1", "n1")).toBe(true);
      expect(castWorkshopVote(ws.id, "facilitator-1", "n2")).toBe(false);
    });
  });

  // ---- Timer operations ----

  describe("timer pause/resume/extend", () => {
    it("pauseTimer sets paused state", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1"); // brainstorm (300s timer)
      expect(pauseTimer(ws.id, "facilitator-1")).toBe(true);
      const updated = getWorkshop(ws.id)!;
      expect(updated.timer.paused).toBe(true);
      expect(updated.timer.remainingSeconds).toBeLessThanOrEqual(300);
    });

    it("resumeTimer after pause resets timing", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1");
      pauseTimer(ws.id, "facilitator-1");
      expect(resumeTimer(ws.id, "facilitator-1")).toBe(true);
      expect(getWorkshop(ws.id)!.timer.paused).toBe(false);
    });

    it("extendTimer adds seconds", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1");
      const before = getWorkshop(ws.id)!.timer.durationSeconds;
      extendTimer(ws.id, "facilitator-1", 60);
      expect(getWorkshop(ws.id)!.timer.durationSeconds).toBe(before + 60);
    });

    it("pauseTimer denied for non-facilitator", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1");
      expect(pauseTimer(ws.id, "user-2")).toBe(false);
    });

    it("resumeTimer fails when not paused", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1");
      expect(resumeTimer(ws.id, "facilitator-1")).toBe(false);
    });
  });

  // ---- generateWorkshopSummary ----

  describe("generateWorkshopSummary", () => {
    it("returns undefined for non-existent workshop", () => {
      expect(generateWorkshopSummary("missing")).toBeUndefined();
    });

    it("returns summary with 0 ideas when no ideas submitted", () => {
      const ws = makeWorkshop();
      const summary = generateWorkshopSummary(ws.id);
      expect(summary).toBeDefined();
      expect(summary!.totalIdeas).toBe(0);
      expect(summary!.totalVotes).toBe(0);
      expect(summary!.topIdeas).toHaveLength(0);
    });
  });

  // ---- submitWorkshopIdea ----

  describe("submitWorkshopIdea", () => {
    it("rejects idea submission outside brainstorm phase", () => {
      const ws = makeWorkshop();
      expect(submitWorkshopIdea(ws.id, "facilitator-1", "idea")).toBe(false);
    });

    it("increments ideasSubmitted count", () => {
      const ws = makeWorkshop();
      advanceWorkshopPhase(ws.id, "facilitator-1");
      submitWorkshopIdea(ws.id, "facilitator-1", "idea1");
      submitWorkshopIdea(ws.id, "facilitator-1", "idea2");
      const p = getWorkshop(ws.id)!.participants.find((p) => p.userId === "facilitator-1")!;
      expect(p.ideasSubmitted).toBe(2);
    });
  });

  // ---- deleteWorkshop ----

  describe("deleteWorkshop", () => {
    it("deletes existing workshop", () => {
      const ws = makeWorkshop();
      expect(deleteWorkshop(ws.id)).toBe(true);
      expect(getWorkshop(ws.id)).toBeUndefined();
    });

    it("returns false for non-existent workshop", () => {
      expect(deleteWorkshop("missing")).toBe(false);
    });
  });

  // ---- listWorkshops ----

  describe("listWorkshops", () => {
    it("lists workshops sorted by creation date descending", () => {
      makeWorkshop({ title: "First" });
      makeWorkshop({ title: "Second" });
      const list = listWorkshops();
      expect(list).toHaveLength(2);
    });
  });
});
