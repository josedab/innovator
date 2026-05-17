import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(process.cwd(), ".innovator-analytics-dashboard-test");

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const { trackEvent, clearAnalytics } = await import("../index.js");
const {
  computeVelocityTrend,
  generateAngleHeatmap,
  analyzeTeamPatterns,
  velocityTrendToMarkdown,
} = await import("../velocity-heatmap.js");
const { computeKPIs, kpiDashboardToMarkdown } = await import("../kpi-dashboard.js");
const {
  createReportSchedule,
  getReportSchedule,
  listReportSchedules,
  deleteReportSchedule,
  generateScheduledReport,
  getDueSchedules,
  clearReportSchedules,
} = await import("../scheduled-reports.js");
import type { AnalyticsEvent } from "../index.js";

function createEvent(
  type: AnalyticsEvent["type"],
  timestamp: string,
  data?: Record<string, unknown>,
): AnalyticsEvent {
  return {
    id: `${type}-${timestamp}`,
    type,
    timestamp,
    data,
  };
}

describe("analytics dashboard enhancements", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "analytics"), { recursive: true });
    clearAnalytics();
    clearReportSchedules();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("computes daily velocity trends", () => {
    const events: AnalyticsEvent[] = [
      createEvent("pipeline_started", "2025-01-01T09:00:00Z", { userId: "alice" }),
      createEvent("angle_generated", "2025-01-01T09:15:00Z", { userId: "alice", ideaCount: 2 }),
      createEvent("ideas_scored", "2025-01-01T09:30:00Z", { userId: "alice", avgScore: 7.5 }),
      createEvent("pipeline_started", "2025-01-02T10:00:00Z", { userId: "bob" }),
      createEvent("angle_generated", "2025-01-02T10:15:00Z", { userId: "bob", ideaCount: 4 }),
      createEvent("ideas_scored", "2025-01-02T10:30:00Z", { userId: "bob", avgScore: 8.5 }),
    ];

    const trend = computeVelocityTrend(events, "daily");

    expect(trend.dataPoints).toHaveLength(2);
    expect(trend.dataPoints[0].ideaCount).toBe(2);
    expect(trend.dataPoints[1].ideaCount).toBe(4);
    expect(trend.dataPoints[0].activeUsers).toBe(1);
    expect(trend.trendDirection).toBe("up");
    expect(trend.changePercent).toBeGreaterThan(0);
  });

  it("builds angle effectiveness heatmaps", () => {
    const heatmap = generateAngleHeatmap([
      createEvent("angle_generated", "2025-01-01T09:00:00Z", { angleId: "scamper", domain: "health" }),
      createEvent("ideas_scored", "2025-01-01T09:10:00Z", { angleId: "scamper", domain: "health", avgScore: 8 }),
      createEvent("angle_failed", "2025-01-02T09:00:00Z", { angleId: "scamper", domain: "health" }),
      createEvent("angle_generated", "2025-01-03T09:00:00Z", { angleId: "inversion", domain: "finance" }),
    ]);

    expect(heatmap.angles).toContain("scamper");
    expect(heatmap.domains).toContain("health");
    const scamper = heatmap.cells.find((cell) => cell.angleId === "scamper" && cell.domain === "health");
    expect(scamper).toBeDefined();
    expect(scamper?.sampleSize).toBe(2);
    expect(scamper?.avgIdeaQuality).toBe(8);
    expect(scamper?.effectivenessScore).toBeGreaterThan(0);
  });

  it("analyzes team patterns", () => {
    const patterns = analyzeTeamPatterns([
      createEvent("pipeline_started", "2025-01-01T09:00:00Z", { userId: "alice", displayName: "Alice" }),
      createEvent("angle_generated", "2025-01-01T09:15:00Z", { userId: "alice", angleId: "scamper", ideaCount: 3 }),
      createEvent("angle_generated", "2025-01-01T10:15:00Z", { userId: "alice", angleId: "scamper", ideaCount: 1 }),
      createEvent("ideas_scored", "2025-01-01T10:20:00Z", { userId: "alice", avgScore: 8.2 }),
      createEvent("pipeline_started", "2025-01-02T14:00:00Z", { userId: "bob", displayName: "Bob" }),
      createEvent("angle_generated", "2025-01-02T14:15:00Z", { userId: "bob", angleId: "inversion", ideaCount: 1 }),
    ]);

    expect(patterns).toHaveLength(2);
    expect(patterns[0].displayName).toBe("Alice");
    expect(patterns[0].favoriteAngles).toContain("scamper");
    expect(patterns[0].peakHours).toContain(9);
    expect(patterns[0].innovationVelocity).toBeGreaterThan(0);
  });

  it("exports velocity trends as markdown", () => {
    const markdown = velocityTrendToMarkdown(
      computeVelocityTrend([
        createEvent("pipeline_started", "2025-01-01T09:00:00Z", { userId: "alice" }),
        createEvent("angle_generated", "2025-01-01T09:15:00Z", { userId: "alice", ideaCount: 2 }),
      ], "daily"),
    );

    expect(markdown).toContain("Innovation Velocity Trend");
    expect(markdown).toContain("| Period | Ideas | Sessions | Avg Quality | Active Users |");
  });

  it("computes KPI dashboards with trends", () => {
    const events: AnalyticsEvent[] = [
      createEvent("pipeline_started", "2024-12-28T09:00:00Z", { userId: "alice" }),
      createEvent("pipeline_completed", "2024-12-28T09:45:00Z", { userId: "alice" }),
      createEvent("angle_generated", "2024-12-28T09:15:00Z", { userId: "alice", ideaCount: 2 }),
      createEvent("ideas_scored", "2024-12-28T09:30:00Z", { userId: "alice", avgScore: 6.5 }),
      createEvent("pipeline_started", "2025-01-03T09:00:00Z", { userId: "alice" }),
      createEvent("pipeline_completed", "2025-01-03T09:45:00Z", { userId: "alice" }),
      createEvent("angle_generated", "2025-01-03T09:15:00Z", { userId: "alice", ideaCount: 5 }),
      createEvent("ideas_scored", "2025-01-03T09:30:00Z", { userId: "alice", avgScore: 8.5 }),
      createEvent("session_exported", "2025-01-03T10:00:00Z", { userId: "alice" }),
    ];

    const dashboard = computeKPIs(events, {
      start: "2025-01-01T00:00:00Z",
      end: "2025-01-07T23:59:59Z",
    });

    expect(dashboard.metrics).toHaveLength(6);
    const ideasMetric = dashboard.metrics.find((metric) => metric.id === "ideas-generated");
    expect(ideasMetric?.trend).toBe("up");
    expect(ideasMetric?.status).toBe("on-track");

    const markdown = kpiDashboardToMarkdown(dashboard);
    expect(markdown).toContain("Innovation KPI Dashboard");
    expect(markdown).toContain("| KPI | Value | Trend | Change | Status | Target |");
  });

  it("manages report schedules and generates reports", () => {
    trackEvent("pipeline_started", { userId: "alice", displayName: "Alice", subject: "AI ops" });
    trackEvent("pipeline_completed", { userId: "alice", durationMs: 1200 });
    trackEvent("angle_generated", { userId: "alice", angleId: "scamper", domain: "ops", ideaCount: 3 });
    trackEvent("ideas_scored", { userId: "alice", angleId: "scamper", domain: "ops", avgScore: 8.1 });
    trackEvent("session_exported", { userId: "alice" });

    const schedule = createReportSchedule({
      name: "Weekly Team Dashboard",
      frequency: "weekly",
      recipients: ["team@example.com"],
      reportType: "team",
      format: "markdown",
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(getReportSchedule(schedule.id)?.name).toBe("Weekly Team Dashboard");
    expect(listReportSchedules()).toHaveLength(1);
    expect(getDueSchedules().map((item) => item.id)).toContain(schedule.id);

    const report = generateScheduledReport(schedule.id);
    expect(report.scheduleId).toBe(schedule.id);
    expect(report.content).toContain("Weekly Team Dashboard");
    expect(report.content).toContain("Innovation KPI Dashboard");
    expect(getReportSchedule(schedule.id)?.lastGeneratedAt).toBeDefined();

    expect(deleteReportSchedule(schedule.id)).toBe(true);
    expect(listReportSchedules()).toEqual([]);
  });
});
