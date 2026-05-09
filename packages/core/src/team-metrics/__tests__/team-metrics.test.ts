import { describe, it, expect, beforeEach } from "vitest";
import {
  recordInnovationEvent,
  getTeamMetrics,
  getTeamLeaderboard,
  getTeamEvents,
  clearTeamEvents,
} from "../tracker.js";

describe("team-metrics", () => {
  beforeEach(() => {
    clearTeamEvents();
  });

  describe("event recording", () => {
    it("records an event with ID and timestamp", () => {
      const event = recordInnovationEvent({
        type: "idea-generated",
        userId: "user-1",
        teamId: "team-a",
        angleId: "scamper",
      });
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.type).toBe("idea-generated");
      expect(event.userId).toBe("user-1");
    });

    it("records events with quality scores", () => {
      const event = recordInnovationEvent({
        type: "idea-scored",
        userId: "user-1",
        teamId: "team-a",
        ideaId: "idea-1",
        qualityScore: 85,
      });
      expect(event.qualityScore).toBe(85);
    });

    it("records events with metadata", () => {
      const event = recordInnovationEvent({
        type: "idea-implemented",
        userId: "user-1",
        teamId: "team-a",
        metadata: { gitLink: "https://github.com/repo/pr/1" },
      });
      expect(event.metadata?.gitLink).toBe("https://github.com/repo/pr/1");
    });
  });

  describe("team metrics", () => {
    beforeEach(() => {
      // Seed test data
      recordInnovationEvent({ type: "session-start", userId: "user-1", teamId: "team-a" });
      recordInnovationEvent({
        type: "idea-generated",
        userId: "user-1",
        teamId: "team-a",
        angleId: "scamper",
      });
      recordInnovationEvent({
        type: "idea-generated",
        userId: "user-1",
        teamId: "team-a",
        angleId: "first-principles",
      });
      recordInnovationEvent({
        type: "idea-scored",
        userId: "user-1",
        teamId: "team-a",
        qualityScore: 80,
      });
      recordInnovationEvent({
        type: "idea-scored",
        userId: "user-1",
        teamId: "team-a",
        qualityScore: 90,
      });
      recordInnovationEvent({ type: "idea-implemented", userId: "user-1", teamId: "team-a" });
      recordInnovationEvent({ type: "session-completed", userId: "user-1", teamId: "team-a" });

      recordInnovationEvent({ type: "session-start", userId: "user-2", teamId: "team-a" });
      recordInnovationEvent({
        type: "idea-generated",
        userId: "user-2",
        teamId: "team-a",
        angleId: "what-if",
      });
      recordInnovationEvent({
        type: "idea-scored",
        userId: "user-2",
        teamId: "team-a",
        qualityScore: 70,
      });
    });

    it("computes weekly metrics", () => {
      const metrics = getTeamMetrics("team-a", "weekly");
      expect(metrics.teamId).toBe("team-a");
      expect(metrics.periodType).toBe("weekly");
      expect(metrics.ideasGenerated).toBe(3);
      expect(metrics.ideasImplemented).toBe(1);
      expect(metrics.sessionsStarted).toBe(2);
      expect(metrics.sessionsCompleted).toBe(1);
    });

    it("computes average quality score", () => {
      const metrics = getTeamMetrics("team-a");
      expect(metrics.avgQualityScore).toBe(80); // (80 + 90 + 70) / 3 = 80
    });

    it("computes implementation rate", () => {
      const metrics = getTeamMetrics("team-a");
      expect(metrics.implementationRate).toBeCloseTo(1 / 3, 1);
    });

    it("tracks top angles", () => {
      const metrics = getTeamMetrics("team-a");
      expect(metrics.topAngles.length).toBeGreaterThan(0);
      expect(metrics.topAngles.some((a) => a.angleId === "scamper")).toBe(true);
    });

    it("tracks member activity", () => {
      const metrics = getTeamMetrics("team-a");
      expect(metrics.memberActivity).toHaveLength(2);
      const user1 = metrics.memberActivity.find((m) => m.userId === "user-1");
      expect(user1!.ideas).toBe(2);
      expect(user1!.sessions).toBe(1);
    });

    it("returns zero metrics for unknown team", () => {
      const metrics = getTeamMetrics("unknown-team");
      expect(metrics.ideasGenerated).toBe(0);
      expect(metrics.sessionsStarted).toBe(0);
    });

    it("computes monthly metrics", () => {
      const metrics = getTeamMetrics("team-a", "monthly");
      expect(metrics.periodType).toBe("monthly");
      expect(metrics.ideasGenerated).toBe(3);
    });
  });

  describe("leaderboard", () => {
    beforeEach(() => {
      recordInnovationEvent({ type: "idea-generated", userId: "alice", teamId: "team-a" });
      recordInnovationEvent({ type: "idea-generated", userId: "alice", teamId: "team-a" });
      recordInnovationEvent({ type: "idea-generated", userId: "alice", teamId: "team-a" });
      recordInnovationEvent({
        type: "idea-scored",
        userId: "alice",
        teamId: "team-a",
        qualityScore: 90,
      });
      recordInnovationEvent({ type: "session-completed", userId: "alice", teamId: "team-a" });

      recordInnovationEvent({ type: "idea-generated", userId: "bob", teamId: "team-a" });
      recordInnovationEvent({
        type: "idea-scored",
        userId: "bob",
        teamId: "team-a",
        qualityScore: 60,
      });
    });

    it("ranks users by quality-weighted score", () => {
      const lb = getTeamLeaderboard("team-a");
      expect(lb).toHaveLength(2);
      expect(lb[0].rank).toBe(1);
      expect(lb[1].rank).toBe(2);
      // Alice: 3 ideas * (90/100) = 2.7; Bob: 1 idea * (60/100) = 0.6
      expect(lb[0].userId).toBe("alice");
      expect(lb[0].qualityWeightedScore).toBeGreaterThan(lb[1].qualityWeightedScore);
    });

    it("returns empty for unknown team", () => {
      expect(getTeamLeaderboard("unknown")).toHaveLength(0);
    });
  });

  describe("event retrieval", () => {
    it("returns events for a team", () => {
      recordInnovationEvent({ type: "session-start", userId: "user-1", teamId: "team-a" });
      recordInnovationEvent({ type: "idea-generated", userId: "user-1", teamId: "team-b" });

      const events = getTeamEvents("team-a");
      expect(events).toHaveLength(1);
      expect(events[0].teamId).toBe("team-a");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        recordInnovationEvent({ type: "idea-generated", userId: "user-1", teamId: "team-a" });
      }
      const events = getTeamEvents("team-a", 5);
      expect(events).toHaveLength(5);
    });

    it("returns events sorted by newest first", () => {
      recordInnovationEvent({ type: "session-start", userId: "user-1", teamId: "team-a" });
      recordInnovationEvent({ type: "idea-generated", userId: "user-1", teamId: "team-a" });

      const events = getTeamEvents("team-a");
      if (events.length > 1) {
        expect(new Date(events[0].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(events[1].timestamp).getTime()
        );
      }
    });
  });
});
