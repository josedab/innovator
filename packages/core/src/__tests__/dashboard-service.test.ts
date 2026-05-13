import { describe, it, expect, beforeEach } from "vitest";
import { DashboardService } from "../analytics/dashboard-service.js";
import { getEventAggregator } from "../analytics/standard-events.js";

describe("DashboardService", () => {
  let svc: DashboardService;

  beforeEach(() => {
    getEventAggregator().clear();
    svc = new DashboardService();
  });

  describe("getOverview", () => {
    it("returns overview with expected fields", () => {
      const overview = svc.getOverview();
      expect(overview).toHaveProperty("totalSessions");
      expect(overview).toHaveProperty("totalIdeas");
      expect(overview).toHaveProperty("avgQuality");
      expect(overview).toHaveProperty("topAngles");
      expect(overview).toHaveProperty("trendDirection");
      expect(overview).toHaveProperty("successRate");
      expect(overview).toHaveProperty("avgDurationMs");
      expect(overview).toHaveProperty("recentEvents");
    });

    it("reflects zero state when no events recorded", () => {
      const overview = svc.getOverview();
      expect(overview.avgQuality).toBe(0);
    });
  });

  describe("getVelocityChart", () => {
    it("returns chart data structure", () => {
      const chart = svc.getVelocityChart("day");
      expect(chart).toHaveProperty("granularity", "day");
      expect(chart).toHaveProperty("sessions");
      expect(chart).toHaveProperty("ideas");
      expect(chart).toHaveProperty("quality");
      expect(chart).toHaveProperty("velocity");
    });
  });

  describe("getQualityHeatmap", () => {
    it("returns heatmap structure", () => {
      const heatmap = svc.getQualityHeatmap();
      expect(heatmap).toHaveProperty("cells");
      expect(heatmap).toHaveProperty("angles");
      expect(heatmap).toHaveProperty("domains");
    });

    it("populates cells when angle events exist", () => {
      const agg = getEventAggregator();
      agg.record({
        type: "angle_generated",
        metadata: { angleId: "bio", domain: "health" },
        quality: { overallScore: 9 },
      });
      const heatmap = svc.getQualityHeatmap();
      expect(heatmap.cells.length).toBeGreaterThanOrEqual(1);
      expect(heatmap.angles).toContain("bio");
      expect(heatmap.domains).toContain("health");
    });
  });

  describe("getTeamComparison", () => {
    it("filters by team ids", () => {
      const agg = getEventAggregator();
      agg.record({ type: "session_started", metadata: {}, teamId: "t1" });
      agg.record({ type: "session_started", metadata: {}, teamId: "t2" });
      const comparison = svc.getTeamComparison(["t1"]);
      expect(comparison.teams.every((t) => t.teamId === "t1")).toBe(true);
    });

    it("returns all teams when empty array passed", () => {
      const agg = getEventAggregator();
      agg.record({ type: "session_started", metadata: {}, teamId: "t1" });
      agg.record({ type: "session_started", metadata: {}, teamId: "t2" });
      const comparison = svc.getTeamComparison([]);
      expect(comparison.teams.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getDrillDown", () => {
    it("returns drill-down for a session", () => {
      const agg = getEventAggregator();
      agg.record({ type: "session_started", metadata: {}, sessionId: "sess-1" });
      agg.record({
        type: "angle_generated",
        metadata: { angleId: "fp", ideaCount: 2 },
        sessionId: "sess-1",
      });
      const dd = svc.getDrillDown("sess-1");
      expect(dd.sessionId).toBe("sess-1");
      expect(dd.ideaCount).toBe(2);
      expect(dd.angles).toContain("fp");
    });

    it("returns zero-state for unknown session", () => {
      const dd = svc.getDrillDown("unknown");
      expect(dd.events).toHaveLength(0);
      expect(dd.ideaCount).toBe(0);
    });
  });

  describe("getROISummary", () => {
    it("returns ROI summary with funnel stages", () => {
      const roi = svc.getROISummary();
      expect(roi).toHaveProperty("totalIdeas");
      expect(roi).toHaveProperty("implementedCount");
      expect(roi).toHaveProperty("roi");
      expect(roi).toHaveProperty("implementationRate");
      expect(roi.funnelStages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("generateReport", () => {
    it("returns a markdown string", () => {
      const report = svc.generateReport({ title: "Test Report" });
      expect(typeof report).toBe("string");
      expect(report.length).toBeGreaterThan(0);
    });
  });

  describe("generateExecutiveSummary", () => {
    it("returns structured executive summary", () => {
      const es = svc.generateExecutiveSummary("Q1 2025");
      expect(es.period).toBe("Q1 2025");
      expect(es).toHaveProperty("highlights");
      expect(es).toHaveProperty("risks");
      expect(es).toHaveProperty("recommendations");
      expect(es).toHaveProperty("metrics");
    });

    it("recommends starting sessions when none exist", () => {
      const es = svc.generateExecutiveSummary("Q1 2025");
      expect(es.recommendations.some((r) => r.includes("Start innovation sessions"))).toBe(true);
    });

    it("reports highlights when data exists", () => {
      const agg = getEventAggregator();
      agg.record({ type: "session_started", metadata: {} });
      agg.record({ type: "angle_generated", metadata: { ideaCount: 5 } });
      const es = svc.generateExecutiveSummary("Q2 2025");
      expect(es.highlights.length).toBeGreaterThanOrEqual(1);
    });
  });
});
