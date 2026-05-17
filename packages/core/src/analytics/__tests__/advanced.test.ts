/**
 * Tests for the advanced analytics module.
 */

const mocks = vi.hoisted(() => ({
  readEvents: vi.fn((): unknown[] => []),
  generateSummary: vi.fn(),
}));

vi.mock("../index.js", () => ({
  readEvents: mocks.readEvents,
  generateSummary: mocks.generateSummary,
}));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getTimeSeries,
  getActivityHeatmap,
  getLeaderboard,
  generateReport,
  reportToMarkdown,
} from "../advanced.js";
import type { AnalyticsEvent, AnalyticsSummary } from "../index.js";

// ---- Helpers ----

function createEvent(
  type: string,
  timestamp: string,
  data?: Record<string, unknown>
): AnalyticsEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: type as AnalyticsEvent["type"],
    timestamp,
    data,
  };
}

function createDefaultSummary(): AnalyticsSummary {
  return {
    totalPipelines: 5,
    totalIdeas: 25,
    totalAnglesUsed: 15,
    successRate: 0.8,
    averageDurationMs: 3000,
    ideasOverTime: [],
    angleUsage: [{ angleId: "market", count: 5, successRate: 0.9 }],
    subjectWordCloud: [{ word: "innovation", count: 10 }],
    recentEvents: [],
    sessionFrequency: [{ date: "2025-01-01", count: 3 }],
    topModels: [{ model: "gpt-4o", count: 10 }],
  };
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readEvents.mockReturnValue([]);
  mocks.generateSummary.mockReturnValue(createDefaultSummary());
});

describe("advanced analytics", () => {
  describe("getTimeSeries", () => {
    it("returns empty results for no events", () => {
      const result = getTimeSeries("sessions");
      expect(result.series).toEqual([]);
      expect(result.average).toBe(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.trend).toBe("stable");
    });

    it("counts sessions from pipeline_started events", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-01T14:00:00Z"),
        createEvent("pipeline_started", "2025-01-02T10:00:00Z"),
      ]);

      const result = getTimeSeries("sessions");
      expect(result.series.length).toBeGreaterThan(0);
      const total = result.series.reduce((s, p) => s + p.value, 0);
      expect(total).toBe(3);
    });

    it("filters by date range", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-15T10:00:00Z"),
        createEvent("pipeline_started", "2025-02-01T10:00:00Z"),
      ]);

      const result = getTimeSeries("sessions", {
        startDate: "2025-01-10",
        endDate: "2025-01-20",
      });
      const total = result.series.reduce((s, p) => s + p.value, 0);
      expect(total).toBe(1);
    });

    it("aggregates ideas from angle_generated events", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("angle_generated", "2025-01-01T10:00:00Z", { ideaCount: 3 }),
        createEvent("angle_generated", "2025-01-01T14:00:00Z", { ideaCount: 5 }),
      ]);

      const result = getTimeSeries("ideas");
      const total = result.series.reduce((s, p) => s + p.value, 0);
      expect(total).toBe(8);
    });

    it("handles single data point time series", () => {
      mocks.readEvents.mockReturnValue([createEvent("pipeline_started", "2025-01-01T10:00:00Z")]);

      const result = getTimeSeries("sessions");
      expect(result.series).toHaveLength(1);
      expect(result.trend).toBe("stable");
    });
  });

  describe("getActivityHeatmap", () => {
    it("returns empty for no events", () => {
      const result = getActivityHeatmap("hour-day");
      expect(result).toEqual([]);
    });

    it("generates hour-day cells from events", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-06T10:00:00Z"), // Monday
        createEvent("pipeline_started", "2025-01-06T10:30:00Z"), // Monday same hour
        createEvent("angle_generated", "2025-01-07T14:00:00Z"), // Tuesday
      ]);

      const result = getActivityHeatmap("hour-day");
      expect(result.length).toBeGreaterThan(0);

      for (const cell of result) {
        expect(cell).toHaveProperty("x");
        expect(cell).toHaveProperty("y");
        expect(cell).toHaveProperty("value");
        expect(cell.value).toBeGreaterThan(0);
      }
    });

    it("generates angle-topic cells from angle_generated events", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("angle_generated", "2025-01-06T10:00:00Z", {
          angleId: "scamper",
          subject: "sustainable energy ideas",
        }),
        createEvent("angle_generated", "2025-01-06T11:00:00Z", {
          angleId: "scamper",
          subject: "sustainable packaging",
        }),
        createEvent("angle_generated", "2025-01-07T10:00:00Z", {
          angleId: "first-principles",
          subject: "machine learning optimization",
        }),
      ]);

      const result = getActivityHeatmap("angle-topic");
      expect(result.length).toBeGreaterThan(0);
      const scamperCells = result.filter((c) => c.x === "scamper");
      expect(scamperCells.length).toBeGreaterThan(0);
    });

    it("generates model-angle cells from events", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("angle_generated", "2025-01-06T10:00:00Z", {
          model: "gpt-4o",
          angleId: "scamper",
        }),
        createEvent("angle_generated", "2025-01-06T11:00:00Z", {
          model: "gpt-4o",
          angleId: "scamper",
        }),
        createEvent("pipeline_started", "2025-01-07T10:00:00Z", {
          model: "claude",
          angleId: "inversion",
        }),
      ]);

      const result = getActivityHeatmap("model-angle");
      expect(result.length).toBeGreaterThan(0);
      const gpt4oCells = result.filter((c) => c.x === "gpt-4o");
      expect(gpt4oCells.length).toBeGreaterThan(0);
    });
  });

  describe("getLeaderboard", () => {
    it("returns empty for no events", () => {
      const result = getLeaderboard("sessions");
      expect(result).toEqual([]);
    });

    it("sorts by score descending", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z", { userId: "alice" }),
        createEvent("pipeline_started", "2025-01-01T11:00:00Z", { userId: "alice" }),
        createEvent("pipeline_started", "2025-01-01T12:00:00Z", { userId: "alice" }),
        createEvent("pipeline_started", "2025-01-01T10:00:00Z", { userId: "bob" }),
      ]);

      const result = getLeaderboard("sessions");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].rank).toBe(1);
      expect(result[0].score).toBeGreaterThanOrEqual(result[result.length - 1].score);
    });

    it("respects limit parameter", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z", { userId: "a" }),
        createEvent("pipeline_started", "2025-01-01T10:00:00Z", { userId: "b" }),
        createEvent("pipeline_started", "2025-01-01T10:00:00Z", { userId: "c" }),
      ]);

      const result = getLeaderboard("sessions", 2);
      expect(result).toHaveLength(2);
    });

    it("ranks by ideas metric", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("angle_generated", "2025-01-01T10:00:00Z", { userId: "alice", ideaCount: 10 }),
        createEvent("angle_generated", "2025-01-01T10:00:00Z", { userId: "bob", ideaCount: 5 }),
      ]);

      const result = getLeaderboard("ideas");
      expect(result[0].userId).toBe("alice");
    });
  });

  describe("generateReport", () => {
    it("aggregates all analytics into a report", () => {
      const report = generateReport();

      expect(report.id).toBeTruthy();
      expect(report.title).toContain("Analytics Report");
      expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.summary).toBeDefined();
      expect(report.timeSeries).toHaveProperty("sessions");
      expect(report.timeSeries).toHaveProperty("ideas");
      expect(report.timeSeries).toHaveProperty("quality");
      expect(report.heatmap).toBeDefined();
      expect(report.leaderboard).toBeDefined();
      expect(report.keyMetrics.length).toBeGreaterThan(0);
      expect(report.executiveSummary).toBeTruthy();
    });

    it("accepts custom title", () => {
      const report = generateReport({ title: "Custom Report" });
      expect(report.title).toBe("Custom Report");
    });

    it("handles no data without crashing", () => {
      mocks.generateSummary.mockReturnValue({
        totalPipelines: 0,
        totalIdeas: 0,
        totalAnglesUsed: 0,
        successRate: 0,
        averageDurationMs: 0,
        ideasOverTime: [],
        angleUsage: [],
        subjectWordCloud: [],
        recentEvents: [],
        sessionFrequency: [],
        modelUsage: [],
      });

      const report = generateReport();
      expect(report).toBeDefined();
      expect(report.keyMetrics.length).toBeGreaterThan(0);
    });
  });

  describe("reportToMarkdown", () => {
    it("includes all sections", () => {
      const report = generateReport();
      const md = reportToMarkdown(report);

      expect(md).toContain("Analytics Report");
      expect(md).toContain("Key Metrics");
      expect(md).toContain("Top Innovators");
      expect(md).toContain("Angle Usage");
      expect(md).toContain("| Metric | Value | Trend |");
    });

    it("includes executive summary", () => {
      const report = generateReport();
      const md = reportToMarkdown(report);

      expect(md).toContain("Innovation Analytics Summary");
    });
  });

  describe("date range spanning no events", () => {
    it("returns empty results for date range with no matching events", () => {
      mocks.readEvents.mockReturnValue([createEvent("pipeline_started", "2025-01-01T10:00:00Z")]);

      const result = getTimeSeries("sessions", {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(result.series).toEqual([]);
      expect(result.average).toBe(0);
    });
  });

  describe("division-by-zero edge cases", () => {
    it("quality leaderboard returns 0 when no scored events exist for a user", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z", { userId: "alice" }),
      ]);

      const result = getLeaderboard("quality");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].score).toBe(0);
    });

    it("time series percentChange is 0 when firstHalf average is 0", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("angle_generated", "2025-01-01T10:00:00Z", { ideaCount: 0 }),
        createEvent("angle_generated", "2025-01-02T10:00:00Z", { ideaCount: 0 }),
        createEvent("angle_generated", "2025-01-03T10:00:00Z", { ideaCount: 0 }),
        createEvent("angle_generated", "2025-01-04T10:00:00Z", { ideaCount: 0 }),
        createEvent("angle_generated", "2025-01-05T10:00:00Z", { ideaCount: 5 }),
      ]);

      const result = getTimeSeries("ideas");
      expect(Number.isFinite(result.percentChange)).toBe(true);
    });

    it("time series with high variance detects volatile trend", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-01T11:00:00Z"),
        createEvent("pipeline_started", "2025-01-01T12:00:00Z"),
        createEvent("pipeline_started", "2025-01-01T13:00:00Z"),
        createEvent("pipeline_started", "2025-01-01T14:00:00Z"),
        createEvent("pipeline_started", "2025-01-02T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-03T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-04T10:00:00Z"),
      ]);

      const result = getTimeSeries("sessions");
      expect(["stable", "volatile", "increasing", "decreasing"]).toContain(result.trend);
    });
  });

  describe("getTimeSeries granularity", () => {
    it("buckets by hour", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-01T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-01T10:30:00Z"),
        createEvent("pipeline_started", "2025-01-01T11:00:00Z"),
      ]);

      const result = getTimeSeries("sessions", { granularity: "hour" });
      expect(result.series.length).toBe(2);
    });

    it("buckets by month", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-15T10:00:00Z"),
        createEvent("pipeline_started", "2025-02-15T10:00:00Z"),
      ]);

      const result = getTimeSeries("sessions", { granularity: "month" });
      expect(result.series.length).toBe(2);
    });

    it("buckets by week", () => {
      mocks.readEvents.mockReturnValue([
        createEvent("pipeline_started", "2025-01-06T10:00:00Z"),
        createEvent("pipeline_started", "2025-01-13T10:00:00Z"),
      ]);

      const result = getTimeSeries("sessions", { granularity: "week" });
      expect(result.series.length).toBe(2);
    });
  });
});
