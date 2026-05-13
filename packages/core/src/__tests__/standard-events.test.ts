import { describe, it, expect, beforeEach } from "vitest";
import { EventAggregator } from "../analytics/standard-events.js";

describe("EventAggregator", () => {
  let agg: EventAggregator;

  beforeEach(() => {
    agg = new EventAggregator();
  });

  describe("record / getEvents", () => {
    it("records an event and assigns id + timestamp", () => {
      const event = agg.record({ type: "session_started", metadata: {} });
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.type).toBe("session_started");
    });

    it("returns events newest first", () => {
      agg.record({ type: "session_started", metadata: {} });
      agg.record({ type: "angle_generated", metadata: {} });
      const events = agg.getEvents();
      expect(events.length).toBe(2);
      expect(events[0].timestamp >= events[1].timestamp).toBe(true);
    });
  });

  describe("getTimeSeries", () => {
    it("buckets events by day", () => {
      agg.record({ type: "session_started", metadata: {} });
      agg.record({ type: "session_started", metadata: {} });
      const series = agg.getTimeSeries("session_started", "day");
      expect(series.length).toBeGreaterThanOrEqual(1);
      expect(series[0].count).toBe(2);
    });

    it("returns empty for unmatched event type", () => {
      agg.record({ type: "session_started", metadata: {} });
      const series = agg.getTimeSeries("debate_started", "day");
      expect(series).toHaveLength(0);
    });

    it("filters by date range using from/to", () => {
      agg.record({ type: "session_started", metadata: {} });
      const farFuture = "2099-01-01T00:00:00.000Z";
      const series = agg.getTimeSeries("session_started", "day", farFuture);
      expect(series).toHaveLength(0);
    });
  });

  describe("getVelocityMetrics", () => {
    it("computes velocity from sessions and ideas", () => {
      agg.record({ type: "session_started", metadata: {}, teamId: "t1" });
      agg.record({ type: "angle_generated", metadata: { ideaCount: 3 }, teamId: "t1" });
      agg.record({
        type: "idea_scored",
        metadata: {},
        teamId: "t1",
        quality: { overallScore: 8 },
      });

      const v = agg.getVelocityMetrics("t1");
      expect(v.totalSessions).toBe(1);
      expect(v.totalIdeas).toBe(3);
      expect(v.ideasPerSession).toBe(3);
      expect(v.qualityAvg).toBe(8);
    });

    it("returns zeros for no data", () => {
      const v = agg.getVelocityMetrics();
      expect(v.totalSessions).toBe(0);
      expect(v.totalIdeas).toBe(0);
      expect(v.qualityAvg).toBe(0);
    });

    it("filters by teamId", () => {
      agg.record({ type: "session_started", metadata: {}, teamId: "t1" });
      agg.record({ type: "session_started", metadata: {}, teamId: "t2" });
      const v = agg.getVelocityMetrics("t1");
      expect(v.totalSessions).toBe(1);
    });
  });

  describe("getAngleEffectiveness", () => {
    it("returns angle × domain cells", () => {
      agg.record({
        type: "angle_generated",
        metadata: { angleId: "biomimicry", domain: "fintech" },
        quality: { overallScore: 8 },
      });
      agg.record({
        type: "angle_generated",
        metadata: { angleId: "biomimicry", domain: "fintech" },
        quality: { overallScore: 6 },
      });
      const cells = agg.getAngleEffectiveness();
      expect(cells.length).toBeGreaterThanOrEqual(1);
      expect(cells[0].angle).toBe("biomimicry");
      expect(cells[0].avgQuality).toBe(7);
      expect(cells[0].count).toBe(2);
    });

    it("returns empty for no angle events", () => {
      agg.record({ type: "session_started", metadata: {} });
      expect(agg.getAngleEffectiveness()).toHaveLength(0);
    });
  });

  describe("getTeamLeaderboard", () => {
    it("ranks teams by composite innovation score", () => {
      agg.record({ type: "session_started", metadata: {}, teamId: "alpha" });
      agg.record({ type: "session_started", metadata: {}, teamId: "alpha" });
      agg.record({ type: "idea_implemented", metadata: {}, teamId: "alpha" });
      agg.record({ type: "session_started", metadata: {}, teamId: "beta" });

      const board = agg.getTeamLeaderboard();
      expect(board[0].teamId).toBe("alpha");
      expect(board[0].rank).toBe(1);
      expect(board[0].sessions).toBe(2);
      expect(board[0].implementations).toBe(1);
    });

    it("respects limit", () => {
      agg.record({ type: "session_started", metadata: {}, teamId: "a" });
      agg.record({ type: "session_started", metadata: {}, teamId: "b" });
      agg.record({ type: "session_started", metadata: {}, teamId: "c" });
      const board = agg.getTeamLeaderboard(2);
      expect(board.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for no events", () => {
      expect(agg.getTeamLeaderboard()).toHaveLength(0);
    });
  });

  describe("generateExecutiveSummary", () => {
    it("produces a summary with all fields", () => {
      agg.record({ type: "session_started", metadata: {} });
      agg.record({
        type: "angle_generated",
        metadata: { angleId: "first-principles", ideaCount: 2 },
      });

      const summary = agg.generateExecutiveSummary();
      expect(summary.generatedAt).toBeDefined();
      expect(summary.totalSessions).toBe(1);
      expect(summary.totalIdeas).toBe(2);
      expect(summary.topAngle).toBe("first-principles");
      expect(summary.summary).toContain("Innovation Portfolio Summary");
    });

    it("handles empty data gracefully", () => {
      const summary = agg.generateExecutiveSummary();
      expect(summary.totalSessions).toBe(0);
      expect(summary.totalIdeas).toBe(0);
      expect(summary.avgQuality).toBe(0);
      expect(summary.velocityTrend).toBe("stable");
    });

    it("detects velocity trend from session distribution", () => {
      // Even split → stable
      for (let i = 0; i < 4; i++) {
        agg.record({ type: "session_started", metadata: {} });
      }
      const summary = agg.generateExecutiveSummary();
      expect(["stable", "increasing", "decreasing"]).toContain(summary.velocityTrend);
    });
  });

  describe("clear", () => {
    it("removes all events", () => {
      agg.record({ type: "session_started", metadata: {} });
      agg.clear();
      expect(agg.getEvents()).toHaveLength(0);
    });
  });
});
