import { describe, it, expect } from "vitest";
import { generateGrafanaDashboard } from "../observability/dashboard.js";
import type { GrafanaDashboard } from "../observability/dashboard.js";

describe("observability/dashboard", () => {
  it("generates a valid Grafana dashboard structure", () => {
    const dashboard = generateGrafanaDashboard();

    expect(dashboard.id).toBeNull();
    expect(dashboard.uid).toBe("innovator-overview");
    expect(dashboard.title).toBe("Innovator Pipeline Dashboard");
    expect(dashboard.schemaVersion).toBe(39);
    expect(dashboard.version).toBe(1);
    expect(dashboard.refresh).toBe("10s");
    expect(dashboard.timezone).toBe("browser");
  });

  it("includes required tags", () => {
    const dashboard = generateGrafanaDashboard();
    expect(dashboard.tags).toContain("innovator");
    expect(dashboard.tags).toContain("llm");
    expect(dashboard.tags).toContain("pipeline");
  });

  it("generates exactly 7 panels", () => {
    const dashboard = generateGrafanaDashboard();
    expect(dashboard.panels).toHaveLength(7);
  });

  it("each panel has unique id and valid gridPos", () => {
    const dashboard = generateGrafanaDashboard();
    const ids = dashboard.panels.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const panel of dashboard.panels) {
      expect(panel.gridPos).toBeDefined();
      expect(panel.gridPos.h).toBeGreaterThan(0);
      expect(panel.gridPos.w).toBeGreaterThan(0);
      expect(panel.gridPos.x).toBeGreaterThanOrEqual(0);
      expect(panel.gridPos.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("each panel has at least one target with expr and refId", () => {
    const dashboard = generateGrafanaDashboard();
    for (const panel of dashboard.panels) {
      expect(panel.targets.length).toBeGreaterThanOrEqual(1);
      for (const target of panel.targets) {
        expect(target.expr).toBeTruthy();
        expect(target.refId).toBeTruthy();
        expect(target.legendFormat).toBeDefined();
      }
    }
  });

  it("includes expected panel types", () => {
    const dashboard = generateGrafanaDashboard();
    const types = dashboard.panels.map((p) => p.type);
    expect(types).toContain("timeseries");
    expect(types).toContain("stat");
    expect(types).toContain("gauge");
  });

  it("panels reference valid Innovator metrics", () => {
    const dashboard = generateGrafanaDashboard();
    const allExprs = dashboard.panels.flatMap((p) => p.targets.map((t) => t.expr));
    const metricNames = [
      "innovator_pipeline_executions_total",
      "innovator_llm_request_duration_ms",
      "innovator_llm_tokens_total",
      "innovator_llm_cost_usd_total",
      "innovator_active_pipelines",
      "innovator_pipeline_errors_total",
      "innovator_ideas_generated_total",
    ];
    for (const metric of metricNames) {
      expect(allExprs.some((e) => e.includes(metric))).toBe(true);
    }
  });

  it("returns a new object on each call", () => {
    const d1 = generateGrafanaDashboard();
    const d2 = generateGrafanaDashboard();
    expect(d1).not.toBe(d2);
    expect(d1).toEqual(d2);
  });
});
