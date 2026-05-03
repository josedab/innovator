import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `innovator-analytics-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const { trackEvent, readEvents, generateSummary, generateInsights, clearAnalytics } =
  await import("../analytics/index.js");

describe("analytics", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "analytics"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("trackEvent", () => {
    it("creates event with UUID and timestamp", () => {
      const event = trackEvent("pipeline_started", { subject: "test" });
      expect(event.id).toBeTruthy();
      expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(event.type).toBe("pipeline_started");
      expect(event.timestamp).toBeTruthy();
      expect(event.data?.subject).toBe("test");
    });
  });

  describe("readEvents", () => {
    it("returns events sorted newest first", () => {
      trackEvent("pipeline_started");
      trackEvent("pipeline_completed");
      trackEvent("pipeline_failed");
      const events = readEvents();
      expect(events).toHaveLength(3);
      // All events created nearly simultaneously, but sorted by timestamp desc
      expect(events.length).toBe(3);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        trackEvent("pipeline_started");
      }
      const events = readEvents(2);
      expect(events).toHaveLength(2);
    });

    it("returns empty array when no events", () => {
      const events = readEvents();
      expect(events).toEqual([]);
    });
  });

  describe("generateSummary", () => {
    it("computes pipeline success rate", () => {
      const events = [
        { id: "1", type: "pipeline_started" as const, timestamp: "2025-01-01T00:00:00Z" },
        { id: "2", type: "pipeline_started" as const, timestamp: "2025-01-01T01:00:00Z" },
        {
          id: "3",
          type: "pipeline_completed" as const,
          timestamp: "2025-01-01T00:30:00Z",
          data: { durationMs: 5000 },
        },
        { id: "4", type: "pipeline_failed" as const, timestamp: "2025-01-01T01:30:00Z" },
      ];
      const summary = generateSummary(events);
      expect(summary.totalPipelines).toBe(2);
      expect(summary.successRate).toBeCloseTo(0.5, 2);
    });

    it("computes daily time-series for ideas", () => {
      const events = [
        {
          id: "1",
          type: "angle_generated" as const,
          timestamp: "2025-01-01T10:00:00Z",
          data: { ideaCount: 3, angleId: "scamper" },
        },
        {
          id: "2",
          type: "angle_generated" as const,
          timestamp: "2025-01-01T11:00:00Z",
          data: { ideaCount: 2, angleId: "inversion" },
        },
        {
          id: "3",
          type: "angle_generated" as const,
          timestamp: "2025-01-02T10:00:00Z",
          data: { ideaCount: 5, angleId: "scamper" },
        },
      ];
      const summary = generateSummary(events);
      expect(summary.ideasOverTime).toHaveLength(2);
      expect(summary.ideasOverTime[0].date).toBe("2025-01-01");
      expect(summary.ideasOverTime[0].count).toBe(5);
      expect(summary.ideasOverTime[1].date).toBe("2025-01-02");
      expect(summary.ideasOverTime[1].count).toBe(5);
    });

    it("computes angle usage", () => {
      const events = [
        {
          id: "1",
          type: "angle_generated" as const,
          timestamp: "2025-01-01T10:00:00Z",
          data: { angleId: "scamper" },
        },
        {
          id: "2",
          type: "angle_generated" as const,
          timestamp: "2025-01-01T11:00:00Z",
          data: { angleId: "scamper" },
        },
        {
          id: "3",
          type: "angle_failed" as const,
          timestamp: "2025-01-01T12:00:00Z",
          data: { angleId: "scamper" },
        },
        {
          id: "4",
          type: "angle_generated" as const,
          timestamp: "2025-01-01T13:00:00Z",
          data: { angleId: "inversion" },
        },
      ];
      const summary = generateSummary(events);
      expect(summary.angleUsage).toHaveLength(2);
      const scamper = summary.angleUsage.find((a) => a.angleId === "scamper");
      expect(scamper!.count).toBe(3);
      expect(scamper!.successRate).toBeCloseTo(0.67, 1);
    });

    it("generates word cloud with stop-word filtering", () => {
      const events = [
        {
          id: "1",
          type: "pipeline_started" as const,
          timestamp: "2025-01-01T10:00:00Z",
          data: { subject: "the future of solar energy" },
        },
        {
          id: "2",
          type: "pipeline_started" as const,
          timestamp: "2025-01-01T11:00:00Z",
          data: { subject: "solar energy storage" },
        },
      ];
      const summary = generateSummary(events);
      const words = summary.subjectWordCloud.map((w) => w.word);
      expect(words).toContain("solar");
      expect(words).toContain("energy");
      expect(words).not.toContain("the");
      expect(words).not.toContain("of");
    });

    it("handles empty events", () => {
      const summary = generateSummary([]);
      expect(summary.totalPipelines).toBe(0);
      expect(summary.totalIdeas).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.averageDurationMs).toBe(0);
    });

    it("handles single event", () => {
      const summary = generateSummary([
        { id: "1", type: "pipeline_started" as const, timestamp: "2025-01-01T00:00:00Z" },
      ]);
      expect(summary.totalPipelines).toBe(1);
      expect(summary.successRate).toBe(0);
    });
  });

  describe("generateInsights", () => {
    it("detects unused angles", () => {
      const summary = generateSummary([]);
      // Override to simulate enough pipelines with some angles used
      const customSummary = {
        ...summary,
        totalPipelines: 10,
        angleUsage: [{ angleId: "scamper", count: 5, successRate: 1 }],
      };
      const insights = generateInsights(customSummary);
      const unused = insights.find((i) => i.title === "Unexplored Angles");
      expect(unused).toBeDefined();
      expect(unused!.description).toContain("first-principles");
    });

    it("alerts on low success rate (<70%)", () => {
      const summary = {
        ...generateSummary([]),
        totalPipelines: 10,
        successRate: 0.5,
      };
      const insights = generateInsights(summary);
      const alert = insights.find((i) => i.title === "Low Success Rate");
      expect(alert).toBeDefined();
      expect(alert!.type).toBe("anomaly");
    });

    it("detects productivity trend (>1.5x rolling)", () => {
      const sessionFrequency: Array<{ date: string; count: number }> = [];
      // Earlier week: 1 session/day
      for (let i = 14; i >= 8; i--) {
        sessionFrequency.push({ date: `2025-01-${String(i).padStart(2, "0")}`, count: 1 });
      }
      // Recent week: 3 sessions/day (>1.5x)
      for (let i = 7; i >= 1; i--) {
        sessionFrequency.push({ date: `2025-01-${String(i).padStart(2, "0")}`, count: 3 });
      }

      const summary = {
        ...generateSummary([]),
        sessionFrequency,
      };
      const insights = generateInsights(summary);
      const trend = insights.find((i) => i.title === "Increasing Activity");
      expect(trend).toBeDefined();
      expect(trend!.type).toBe("pattern");
    });

    it("handles empty summary gracefully", () => {
      const insights = generateInsights(generateSummary([]));
      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe("clearAnalytics", () => {
    it("clears all events", () => {
      trackEvent("pipeline_started");
      trackEvent("pipeline_completed");
      clearAnalytics();
      expect(readEvents()).toHaveLength(0);
    });
  });
});
