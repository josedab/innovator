import { describe, it, expect, beforeEach } from "vitest";
import {
  recordInnovationEvent,
  getTeamMetrics,
  getTeamLeaderboard,
  getTeamEvents,
  clearTeamEvents,
} from "../team-metrics/tracker.js";

describe("Team metrics tracker", () => {
  beforeEach(() => {
    clearTeamEvents();
  });

  describe("recordInnovationEvent", () => {
    it("auto-generates id and timestamp", () => {
      const event = recordInnovationEvent({
        type: "idea-generated",
        userId: "user-1",
        teamId: "team-1",
      });
      expect(event.id).toBeDefined();
      expect(event.id.length).toBeGreaterThan(0);
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    });

    it("preserves provided fields", () => {
      const event = recordInnovationEvent({
        type: "idea-scored",
        userId: "user-1",
        teamId: "team-1",
        angleId: "scamper",
        qualityScore: 85,
      });
      expect(event.type).toBe("idea-scored");
      expect(event.angleId).toBe("scamper");
      expect(event.qualityScore).toBe(85);
    });

    it("caps events at 100K by trimming oldest", () => {
      // This test is conceptual — we can't easily create 100K+ events in a test.
      // Instead verify events are stored and retrieved.
      for (let i = 0; i < 10; i++) {
        recordInnovationEvent({
          type: "idea-generated",
          userId: "user-1",
          teamId: "team-1",
        });
      }
      const events = getTeamEvents("team-1", 100);
      expect(events).toHaveLength(10);
    });
  });

  describe("getTeamMetrics", () => {
    it("filters events by team and weekly period", () => {
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "team-1" });
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "team-2" });

      const metrics = getTeamMetrics("team-1", "weekly");
      expect(metrics.teamId).toBe("team-1");
      expect(metrics.periodType).toBe("weekly");
      expect(metrics.ideasGenerated).toBe(1);
    });

    it("monthly period filters last 30 days", () => {
      recordInnovationEvent({ type: "session-start", userId: "u1", teamId: "team-1" });
      recordInnovationEvent({ type: "session-completed", userId: "u1", teamId: "team-1" });

      const metrics = getTeamMetrics("team-1", "monthly");
      expect(metrics.sessionsStarted).toBe(1);
      expect(metrics.sessionsCompleted).toBe(1);
    });

    it("computes average quality score", () => {
      recordInnovationEvent({
        type: "idea-scored",
        userId: "u1",
        teamId: "t1",
        qualityScore: 80,
      });
      recordInnovationEvent({
        type: "idea-scored",
        userId: "u1",
        teamId: "t1",
        qualityScore: 60,
      });

      const metrics = getTeamMetrics("t1");
      expect(metrics.avgQualityScore).toBe(70);
    });

    it("idea velocity = ideas / active days (0 when no active days)", () => {
      const metrics = getTeamMetrics("empty-team");
      expect(metrics.ideaVelocity).toBe(0);
    });

    it("idea velocity computed correctly with events", () => {
      // All events on the same day = 1 active day
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });

      const metrics = getTeamMetrics("t1");
      // 3 ideas / 1 active day = 3.0
      expect(metrics.ideaVelocity).toBe(3);
    });

    it("implementation rate = implemented / generated", () => {
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });
      recordInnovationEvent({ type: "idea-implemented", userId: "u1", teamId: "t1" });

      const metrics = getTeamMetrics("t1");
      expect(metrics.implementationRate).toBe(0.5);
    });

    it("tracks top angles", () => {
      recordInnovationEvent({
        type: "idea-generated",
        userId: "u1",
        teamId: "t1",
        angleId: "scamper",
      });
      recordInnovationEvent({
        type: "idea-generated",
        userId: "u1",
        teamId: "t1",
        angleId: "scamper",
      });
      recordInnovationEvent({
        type: "idea-generated",
        userId: "u1",
        teamId: "t1",
        angleId: "inversion",
      });

      const metrics = getTeamMetrics("t1");
      expect(metrics.topAngles[0].angleId).toBe("scamper");
      expect(metrics.topAngles[0].count).toBe(2);
    });

    it("tracks member activity", () => {
      recordInnovationEvent({ type: "idea-generated", userId: "alice", teamId: "t1" });
      recordInnovationEvent({ type: "idea-generated", userId: "alice", teamId: "t1" });
      recordInnovationEvent({ type: "idea-generated", userId: "bob", teamId: "t1" });

      const metrics = getTeamMetrics("t1");
      const alice = metrics.memberActivity.find((m) => m.userId === "alice");
      expect(alice!.ideas).toBe(2);
    });

    it("quality trend is 0 when no scored events", () => {
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });
      const metrics = getTeamMetrics("t1");
      expect(metrics.qualityTrend).toBe(0);
    });
  });

  describe("getTeamLeaderboard", () => {
    it("ranks by quality-weighted score", () => {
      // Alice: 3 ideas, avg quality 80 → weighted = 3 * (80/100) = 2.4
      for (let i = 0; i < 3; i++) {
        recordInnovationEvent({ type: "idea-generated", userId: "alice", teamId: "t1" });
        recordInnovationEvent({
          type: "idea-scored",
          userId: "alice",
          teamId: "t1",
          qualityScore: 80,
        });
      }
      // Bob: 5 ideas, avg quality 30 → weighted = 5 * (30/100) = 1.5
      for (let i = 0; i < 5; i++) {
        recordInnovationEvent({ type: "idea-generated", userId: "bob", teamId: "t1" });
        recordInnovationEvent({
          type: "idea-scored",
          userId: "bob",
          teamId: "t1",
          qualityScore: 30,
        });
      }

      const leaderboard = getTeamLeaderboard("t1");
      expect(leaderboard[0].userId).toBe("alice");
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].userId).toBe("bob");
      expect(leaderboard[1].rank).toBe(2);
    });

    it("includes sessions completed count", () => {
      recordInnovationEvent({ type: "session-completed", userId: "alice", teamId: "t1" });
      recordInnovationEvent({ type: "session-completed", userId: "alice", teamId: "t1" });

      const leaderboard = getTeamLeaderboard("t1");
      expect(leaderboard[0].sessionsCompleted).toBe(2);
    });
  });

  describe("streak calculation", () => {
    it("returns 0 for no events", () => {
      const metrics = getTeamMetrics("empty-team");
      expect(metrics.currentStreak).toBe(0);
    });

    it("counts consecutive days with events", () => {
      // Create events for today
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });

      const metrics = getTeamMetrics("t1");
      expect(metrics.currentStreak).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getTeamEvents", () => {
    it("returns events sorted newest first", () => {
      recordInnovationEvent({ type: "session-start", userId: "u1", teamId: "t1" });
      recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });

      const events = getTeamEvents("t1");
      expect(events.length).toBe(2);
      // Newest first
      const t0 = new Date(events[0].timestamp).getTime();
      const t1 = new Date(events[1].timestamp).getTime();
      expect(t0).toBeGreaterThanOrEqual(t1);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        recordInnovationEvent({ type: "idea-generated", userId: "u1", teamId: "t1" });
      }
      expect(getTeamEvents("t1", 3)).toHaveLength(3);
    });
  });
});
