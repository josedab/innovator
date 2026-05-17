/**
 * @module observability/metrics
 *
 * Prometheus-compatible metrics collector.
 * Tracks counters, gauges, and histograms for pipeline operations,
 * LLM latency, token usage, and error rates. Renders to Prometheus
 * text exposition format for scraping at /api/metrics.
 */

import type { PrometheusMetric, MetricType } from "./types.js";

interface MetricDefinition {
  name: string;
  type: MetricType;
  help: string;
}

interface MetricValue {
  labels: Record<string, string>;
  value: number;
  buckets?: Map<number, number>;
}

const definitions = new Map<string, MetricDefinition>();
const values = new Map<string, MetricValue[]>();
// Fast label lookup: metric name → (serialized labels → MetricValue)
const labelIndex = new Map<string, Map<string, MetricValue>>();

const DEFAULT_HISTOGRAM_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];

// ---- Registration ----

function ensureMetric(name: string, type: MetricType, help: string): void {
  if (!definitions.has(name)) {
    definitions.set(name, { name, type, help });
    values.set(name, []);
    labelIndex.set(name, new Map());
  }
}

function serializeLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  let result = "";
  for (const k of keys) {
    result += `${k}\0${labels[k]}\0`;
  }
  return result;
}

function findOrCreateValue(name: string, labels: Record<string, string>): MetricValue {
  const index = labelIndex.get(name);
  const labelKey = serializeLabels(labels);

  if (index) {
    const existing = index.get(labelKey);
    if (existing) return existing;
  }

  const list = values.get(name) ?? [];
  const newValue: MetricValue = { labels, value: 0 };
  list.push(newValue);
  values.set(name, list);
  if (index) {
    index.set(labelKey, newValue);
  }
  return newValue;
}

// ---- Counter ----

/** Increment a counter metric. */
export function incrementCounter(
  name: string,
  help: string,
  labels: Record<string, string> = {},
  amount = 1
): void {
  ensureMetric(name, "counter", help);
  const val = findOrCreateValue(name, labels);
  val.value += amount;
}

// ---- Gauge ----

/** Set a gauge metric value. */
export function setGauge(
  name: string,
  help: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  ensureMetric(name, "gauge", help);
  const val = findOrCreateValue(name, labels);
  val.value = value;
}

// ---- Histogram ----

/** Observe a histogram value. */
export function observeHistogram(
  name: string,
  help: string,
  value: number,
  labels: Record<string, string> = {},
  buckets = DEFAULT_HISTOGRAM_BUCKETS
): void {
  ensureMetric(name, "histogram", help);
  const val = findOrCreateValue(name, labels);
  val.value += 1; // count
  if (!val.buckets) {
    val.buckets = new Map<number, number>();
    for (const b of buckets) val.buckets.set(b, 0);
    val.buckets.set(Infinity, 0);
  }
  for (const [bucket] of val.buckets) {
    if (value <= bucket) {
      val.buckets.set(bucket, (val.buckets.get(bucket) ?? 0) + 1);
    }
  }
}

// ---- Pre-defined Innovator Metrics ----

/** Record a pipeline stage execution. */
export function recordPipelineExecution(
  stage: string,
  durationMs: number,
  model: string,
  success: boolean,
  tokenCount = 0,
  costUsd = 0
): void {
  incrementCounter("innovator_pipeline_executions_total", "Total pipeline stage executions", {
    stage,
    model,
    status: success ? "success" : "error",
  });

  observeHistogram(
    "innovator_pipeline_duration_ms",
    "Pipeline stage duration in milliseconds",
    durationMs,
    { stage, model }
  );

  if (tokenCount > 0) {
    incrementCounter(
      "innovator_llm_tokens_total",
      "Total LLM tokens consumed",
      { stage, model, direction: "total" },
      tokenCount
    );
  }

  if (costUsd > 0) {
    incrementCounter(
      "innovator_llm_cost_usd_total",
      "Total LLM cost in USD",
      { stage, model },
      costUsd
    );
  }

  if (!success) {
    incrementCounter("innovator_pipeline_errors_total", "Total pipeline stage errors", {
      stage,
      model,
    });
  }
}

/** Record LLM request latency. */
export function recordLLMLatency(provider: string, model: string, latencyMs: number): void {
  observeHistogram(
    "innovator_llm_request_duration_ms",
    "LLM request duration in milliseconds",
    latencyMs,
    { provider, model }
  );
}

/** Record active pipeline count (gauge). */
export function setActivePipelines(count: number): void {
  setGauge("innovator_active_pipelines", "Number of currently running pipelines", count);
}

/** Record idea generation count. */
export function recordIdeasGenerated(angle: string, count: number): void {
  incrementCounter("innovator_ideas_generated_total", "Total ideas generated", { angle }, count);
}

// ---- Prometheus Text Format ----

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

/** Render all metrics in Prometheus text exposition format. */
export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  for (const [name, def] of definitions) {
    lines.push(`# HELP ${name} ${def.help}`);
    lines.push(`# TYPE ${name} ${def.type}`);

    const metricValues = values.get(name) ?? [];
    for (const mv of metricValues) {
      if (def.type === "histogram" && mv.buckets) {
        for (const [bucket, count] of mv.buckets) {
          const le = bucket === Infinity ? "+Inf" : String(bucket);
          lines.push(`${name}_bucket${formatLabels({ ...mv.labels, le })} ${count}`);
        }
        lines.push(`${name}_count${formatLabels(mv.labels)} ${mv.value}`);
      } else {
        lines.push(`${name}${formatLabels(mv.labels)} ${mv.value}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/** Get all metrics as structured objects. */
export function getAllMetrics(): PrometheusMetric[] {
  const result: PrometheusMetric[] = [];
  for (const [name, def] of definitions) {
    const metricValues = values.get(name) ?? [];
    for (const mv of metricValues) {
      result.push({
        name,
        type: def.type,
        help: def.help,
        labels: mv.labels,
        value: mv.value,
      });
    }
  }
  return result;
}

/** Clear all metrics (for testing). */
export function clearMetrics(): void {
  definitions.clear();
  values.clear();
  labelIndex.clear();
}
