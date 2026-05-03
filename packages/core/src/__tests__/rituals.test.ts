import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  createRitual,
  getRitual,
  clearRituals,
  isRitualDue,
  getNextAngles,
  getNextBacklogSubject,
  recordExecution,
  compileDigest,
  addParticipant,
  addBacklogItem,
  setRitualEnabled,
} from "../rituals/index.js";
import type { Participant } from "../rituals/index.js";

const baseParticipant: Participant = {
  id: "p1",
  name: "Alice",
  role: "facilitator",
  sessionsAttended: 0,
  ideasContributed: 0,
};

function createTestRitual(
  cadence: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" = "weekly"
) {
  return createRitual({
    name: "Test Ritual",
    description: "A test ritual",
    cadence,
    participants: [{ ...baseParticipant }],
    angleRotation: ["scamper", "first-principles", "cross-domain"],
  });
}

describe("rituals", () => {
  beforeEach(() => {
    clearRituals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isRitualDue", () => {
    it("returns true when never executed", () => {
      const ritual = createTestRitual("daily");
      expect(isRitualDue(ritual.id)).toBe(true);
    });

    it("returns false when disabled", () => {
      const ritual = createTestRitual("daily");
      setRitualEnabled(ritual.id, false);
      expect(isRitualDue(ritual.id)).toBe(false);
    });

    it("returns false for nonexistent ritual", () => {
      expect(isRitualDue("nonexistent")).toBe(false);
    });

    it("daily: due after 24 hours", () => {
      const ritual = createTestRitual("daily");
      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });
      // Not due immediately
      expect(isRitualDue(ritual.id)).toBe(false);

      // Advance 24 hours
      vi.setSystemTime(new Date("2025-06-16T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(true);
    });

    it("weekly: due after 7 days", () => {
      const ritual = createTestRitual("weekly");
      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });
      expect(isRitualDue(ritual.id)).toBe(false);

      vi.setSystemTime(new Date("2025-06-22T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(true);
    });

    it("biweekly: due after 14 days", () => {
      const ritual = createTestRitual("biweekly");
      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });

      vi.setSystemTime(new Date("2025-06-28T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(false);

      vi.setSystemTime(new Date("2025-06-29T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(true);
    });

    it("monthly: due after 30 days", () => {
      const ritual = createTestRitual("monthly");
      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });

      vi.setSystemTime(new Date("2025-07-14T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(false);

      vi.setSystemTime(new Date("2025-07-15T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(true);
    });

    it("quarterly: due after 90 days", () => {
      const ritual = createTestRitual("quarterly");
      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });

      vi.setSystemTime(new Date("2025-09-12T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(false);

      vi.setSystemTime(new Date("2025-09-13T12:00:00Z"));
      expect(isRitualDue(ritual.id)).toBe(true);
    });
  });

  describe("angle rotation", () => {
    it("returns next angles in rotation order", () => {
      const ritual = createTestRitual();
      const angles = getNextAngles(ritual.id, 2);
      expect(angles).toEqual(["scamper", "first-principles"]);
    });

    it("wraps around when index exceeds array length", () => {
      const ritual = createTestRitual();
      // Advance rotation to the end
      recordExecution(ritual.id, {
        subject: "s1",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });
      recordExecution(ritual.id, {
        subject: "s2",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });
      // currentAngleIndex is now 2
      recordExecution(ritual.id, {
        subject: "s3",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });
      // Now index wraps to 0 (3 % 3 = 0)
      const angles = getNextAngles(ritual.id, 2);
      expect(angles).toEqual(["scamper", "first-principles"]);
    });

    it("returns empty array for nonexistent ritual", () => {
      expect(getNextAngles("nonexistent")).toEqual([]);
    });
  });

  describe("getNextBacklogSubject", () => {
    it("returns highest priority item first", () => {
      const ritual = createTestRitual();
      addBacklogItem(ritual.id, "Low priority", "low", "user1");
      addBacklogItem(ritual.id, "High priority", "high", "user1");
      addBacklogItem(ritual.id, "Medium priority", "medium", "user1");

      const next = getNextBacklogSubject(ritual.id);
      expect(next?.subject).toBe("High priority");
    });

    it("skips completed items", () => {
      const ritual = createTestRitual();
      addBacklogItem(ritual.id, "Completed", "high", "user1");
      addBacklogItem(ritual.id, "Pending", "medium", "user1");

      // Complete the first item by recording an execution with matching subject
      recordExecution(ritual.id, {
        subject: "Completed",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });

      const next = getNextBacklogSubject(ritual.id);
      expect(next?.subject).toBe("Pending");
    });

    it("returns undefined for empty backlog", () => {
      const ritual = createTestRitual();
      expect(getNextBacklogSubject(ritual.id)).toBeUndefined();
    });

    it("returns undefined for nonexistent ritual", () => {
      expect(getNextBacklogSubject("nonexistent")).toBeUndefined();
    });
  });

  describe("recordExecution", () => {
    it("records execution and updates lastExecutedAt", () => {
      const ritual = createTestRitual();
      const exec = recordExecution(ritual.id, {
        subject: "Test subject",
        anglesUsed: ["scamper"],
        participantIds: ["p1"],
        ideaCount: 5,
        topIdeas: ["Idea 1"],
      });

      expect(exec).not.toBeNull();
      expect(exec?.subject).toBe("Test subject");

      const updated = getRitual(ritual.id)!;
      expect(updated.lastExecutedAt).toBeTruthy();
      expect(updated.executions).toHaveLength(1);
    });

    it("advances angle rotation index", () => {
      const ritual = createTestRitual();
      expect(getRitual(ritual.id)!.currentAngleIndex).toBe(0);

      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });

      expect(getRitual(ritual.id)!.currentAngleIndex).toBe(1);
    });

    it("updates participant stats", () => {
      const ritual = createTestRitual();
      recordExecution(ritual.id, {
        subject: "test",
        anglesUsed: [],
        participantIds: ["p1"],
        ideaCount: 0,
        topIdeas: [],
      });

      const participant = getRitual(ritual.id)!.participants[0];
      expect(participant.sessionsAttended).toBe(1);
    });

    it("marks matching backlog item as completed", () => {
      const ritual = createTestRitual();
      addBacklogItem(ritual.id, "Topic A", "high", "user1");

      recordExecution(ritual.id, {
        subject: "Topic A",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 0,
        topIdeas: [],
      });

      const item = getRitual(ritual.id)!.subjectBacklog[0];
      expect(item.completed).toBe(true);
    });

    it("returns null for nonexistent ritual", () => {
      expect(
        recordExecution("nonexistent", {
          subject: "test",
          anglesUsed: [],
          participantIds: [],
          ideaCount: 0,
          topIdeas: [],
        })
      ).toBeNull();
    });
  });

  describe("compileDigest", () => {
    it("compiles digest with recent executions", () => {
      const ritual = createTestRitual();
      addParticipant(ritual.id, {
        id: "p2",
        name: "Bob",
        role: "participant",
        sessionsAttended: 0,
        ideasContributed: 0,
      });

      recordExecution(ritual.id, {
        subject: "Topic 1",
        anglesUsed: ["scamper"],
        participantIds: ["p1", "p2"],
        ideaCount: 5,
        topIdeas: ["Idea A", "Idea B"],
      });

      const digest = compileDigest(ritual.id, 30);
      expect(digest).not.toBeNull();
      expect(digest?.totalSessions).toBe(1);
      expect(digest?.totalIdeas).toBe(5);
      expect(digest?.topIdeas).toHaveLength(2);
      expect(digest?.participationStats.length).toBeGreaterThan(0);
    });

    it("filters by date cutoff", () => {
      const ritual = createTestRitual();
      recordExecution(ritual.id, {
        subject: "Old session",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 3,
        topIdeas: [],
      });

      // Move time forward by 40 days
      vi.setSystemTime(new Date("2025-07-25T12:00:00Z"));

      recordExecution(ritual.id, {
        subject: "Recent session",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 7,
        topIdeas: [],
      });

      const digest = compileDigest(ritual.id, 30);
      // Only recent session should be included
      expect(digest?.totalSessions).toBe(1);
      expect(digest?.totalIdeas).toBe(7);
    });

    it("returns null for nonexistent ritual", () => {
      expect(compileDigest("nonexistent")).toBeNull();
    });

    it("includes trends when multiple sessions", () => {
      const ritual = createTestRitual();
      recordExecution(ritual.id, {
        subject: "S1",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 5,
        topIdeas: [],
      });
      recordExecution(ritual.id, {
        subject: "S2",
        anglesUsed: [],
        participantIds: [],
        ideaCount: 10,
        topIdeas: [],
      });

      const digest = compileDigest(ritual.id, 30);
      expect(digest?.trends.length).toBeGreaterThan(0);
      expect(digest?.trends[0]).toContain("Average");
    });

    it("includes next backlog subject", () => {
      const ritual = createTestRitual();
      addBacklogItem(ritual.id, "Next Topic", "high", "user1");

      const digest = compileDigest(ritual.id, 30);
      expect(digest?.nextSubject).toBe("Next Topic");
    });
  });
});
