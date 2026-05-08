/**
 * @module observability/dashboard
 *
 * Grafana dashboard template generator.
 * Produces JSON dashboard definitions that can be imported directly
 * into Grafana for monitoring Innovator pipeline metrics.
 */

export interface GrafanaDashboard {
  id: null;
  uid: string;
  title: string;
  tags: string[];
  timezone: string;
  schemaVersion: number;
  version: number;
  refresh: string;
  panels: GrafanaPanel[];
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: string;
  gridPos: { h: number; w: number; x: number; y: number };
  targets: GrafanaTarget[];
  fieldConfig?: Record<string, unknown>;
}

export interface GrafanaTarget {
  expr: string;
  legendFormat: string;
  refId: string;
}

/** Generate a Grafana dashboard JSON for Innovator metrics. */
export function generateGrafanaDashboard(): GrafanaDashboard {
  return {
    id: null,
    uid: "innovator-overview",
    title: "Innovator Pipeline Dashboard",
    tags: ["innovator", "llm", "pipeline"],
    timezone: "browser",
    schemaVersion: 39,
    version: 1,
    refresh: "10s",
    panels: [
      {
        id: 1,
        title: "Pipeline Executions (rate)",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 0, y: 0 },
        targets: [
          {
            expr: "rate(innovator_pipeline_executions_total[5m])",
            legendFormat: "{{stage}} ({{status}})",
            refId: "A",
          },
        ],
      },
      {
        id: 2,
        title: "LLM Latency (p95)",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 12, y: 0 },
        targets: [
          {
            expr: "histogram_quantile(0.95, rate(innovator_llm_request_duration_ms_bucket[5m]))",
            legendFormat: "{{provider}} / {{model}}",
            refId: "A",
          },
        ],
      },
      {
        id: 3,
        title: "Token Usage (rate)",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 0, y: 8 },
        targets: [
          {
            expr: "rate(innovator_llm_tokens_total[5m])",
            legendFormat: "{{stage}} / {{model}}",
            refId: "A",
          },
        ],
      },
      {
        id: 4,
        title: "LLM Cost (cumulative)",
        type: "stat",
        gridPos: { h: 8, w: 6, x: 12, y: 8 },
        targets: [
          {
            expr: "sum(innovator_llm_cost_usd_total)",
            legendFormat: "Total Cost (USD)",
            refId: "A",
          },
        ],
      },
      {
        id: 5,
        title: "Active Pipelines",
        type: "gauge",
        gridPos: { h: 8, w: 6, x: 18, y: 8 },
        targets: [
          {
            expr: "innovator_active_pipelines",
            legendFormat: "Active",
            refId: "A",
          },
        ],
      },
      {
        id: 6,
        title: "Error Rate",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 0, y: 16 },
        targets: [
          {
            expr: "rate(innovator_pipeline_errors_total[5m]) / rate(innovator_pipeline_executions_total[5m])",
            legendFormat: "{{stage}}",
            refId: "A",
          },
        ],
      },
      {
        id: 7,
        title: "Ideas Generated (rate)",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 12, y: 16 },
        targets: [
          {
            expr: "rate(innovator_ideas_generated_total[5m])",
            legendFormat: "{{angle}}",
            refId: "A",
          },
        ],
      },
    ],
  };
}
