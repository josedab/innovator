import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  recordTelemetryEvent,
  getTelemetryEvents,
  getModelEffectiveness,
  buildTeamHeatmap,
  buildAngleROIChart,
  buildExecutiveDashboardExport,
  exportDashboardToMarkdown,
  exportDashboardToCSV,
  clearTelemetryData,
} from "../outcome-tracking/telemetry.js";

describe("outcome-tracking/telemetry", () => {
  beforeEach(() => {
    clearTelemetryData();
  });

  it("records and retrieves telemetry events", () => {
    recordTelemetryEvent("idea_created", { userId: "u1", sessionId: "s1" });
    recordTelemetryEvent("model_invoked", { model: "gpt-4.1", userId: "u1" });

    const events = getTelemetryEvents();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("model_invoked");
    expect(events[1].type).toBe("idea_created");
  });

  it("filters telemetry events by type", () => {
    recordTelemetryEvent("idea_created", { userId: "u1" });
    recordTelemetryEvent("model_invoked", { model: "gpt-4.1" });
    recordTelemetryEvent("idea_created", { userId: "u2" });

    const filtered = getTelemetryEvents({ type: "idea_created" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.type === "idea_created")).toBe(true);
  });

  it("computes model effectiveness metrics", () => {
    recordTelemetryEvent("model_invoked", { model: "gpt-4.1" });
    recordTelemetryEvent("model_succeeded", {
      model: "gpt-4.1",
      metadata: { latencyMs: 1500, qualityScore: 8 },
    });
    recordTelemetryEvent("model_invoked", { model: "gpt-4.1" });
    recordTelemetryEvent("model_failed", { model: "gpt-4.1" });
    recordTelemetryEvent("idea_created", { model: "gpt-4.1" });
    recordTelemetryEvent("idea_shipped", { model: "gpt-4.1" });

    const metrics = getModelEffectiveness();
    expect(metrics).toHaveLength(1);
    const gpt = metrics[0];
    expect(gpt.model).toBe("gpt-4.1");
    expect(gpt.totalInvocations).toBe(2);
    expect(gpt.successCount).toBe(1);
    expect(gpt.failureCount).toBe(1);
    expect(gpt.successRate).toBe(0.5);
    expect(gpt.avgLatencyMs).toBe(1500);
    expect(gpt.ideasGenerated).toBe(1);
    expect(gpt.ideasShipped).toBe(1);
  });

  it("builds team contribution heatmap", () => {
    recordTelemetryEvent("idea_created", { userId: "alice" });
    recordTelemetryEvent("idea_created", { userId: "alice" });
    recordTelemetryEvent("idea_created", { userId: "bob" });
    recordTelemetryEvent("idea_shipped", { userId: "alice" });
    recordTelemetryEvent("review_completed", { userId: "bob" });

    const heatmap = buildTeamHeatmap();
    expect(heatmap.users).toContain("alice");
    expect(heatmap.users).toContain("bob");
    expect(heatmap.totalContributions).toBeGreaterThan(0);
    expect(heatmap.topContributor).toBe("alice");
  });

  it("limits events returned", () => {
    for (let i = 0; i < 10; i++) {
      recordTelemetryEvent("idea_created", { userId: `u${i}` });
    }
    const limited = getTelemetryEvents({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it("returns empty metrics when no events", () => {
    const metrics = getModelEffectiveness();
    expect(metrics).toEqual([]);
    const heatmap = buildTeamHeatmap();
    expect(heatmap.users).toEqual([]);
    expect(heatmap.totalContributions).toBe(0);
  });

  it("builds per-angle ROI chart", () => {
    recordTelemetryEvent("idea_created", { angleId: "scamper", model: "gpt-4.1" });
    recordTelemetryEvent("idea_created", { angleId: "scamper", model: "gpt-4.1" });
    recordTelemetryEvent("idea_shipped", { angleId: "scamper", metadata: { revenue: 5000 } });
    recordTelemetryEvent("model_succeeded", {
      angleId: "scamper",
      model: "gpt-4.1",
      metadata: { qualityScore: 8, costUsd: 0.5 },
    });
    recordTelemetryEvent("idea_created", { angleId: "first-principles" });

    const chart = buildAngleROIChart();
    expect(chart.length).toBe(2);
    const scamper = chart.find((c) => c.angleId === "scamper");
    expect(scamper?.ideasGenerated).toBe(2);
    expect(scamper?.ideasShipped).toBe(1);
    expect(scamper?.totalRevenue).toBe(5000);
  });

  it("builds executive dashboard export", () => {
    recordTelemetryEvent("idea_created", { userId: "u1", angleId: "scamper" });
    recordTelemetryEvent("idea_shipped", {
      userId: "u1",
      angleId: "scamper",
      metadata: { revenue: 1000 },
    });
    recordTelemetryEvent("model_invoked", { model: "gpt-4.1" });
    recordTelemetryEvent("model_succeeded", { model: "gpt-4.1", metadata: { latencyMs: 500 } });

    const dashboard = buildExecutiveDashboardExport({ title: "Test Report" });
    expect(dashboard.title).toBe("Test Report");
    expect(dashboard.kpis.totalIdeas).toBe(1);
    expect(dashboard.kpis.ideasShipped).toBe(1);
    expect(dashboard.kpis.totalRevenue).toBe(1000);
    expect(dashboard.insights.length).toBeGreaterThan(0);
  });

  it("exports dashboard to markdown", () => {
    recordTelemetryEvent("idea_created", { angleId: "scamper" });
    const dashboard = buildExecutiveDashboardExport();
    const md = exportDashboardToMarkdown(dashboard);
    expect(md).toContain("# Innovation Telemetry");
    expect(md).toContain("Key Performance Indicators");
  });

  it("exports dashboard to CSV", () => {
    recordTelemetryEvent("idea_created", { angleId: "scamper" });
    const dashboard = buildExecutiveDashboardExport();
    const csv = exportDashboardToCSV(dashboard);
    expect(csv).toContain("metric,value");
    expect(csv).toContain("total_ideas,1");
  });
});
