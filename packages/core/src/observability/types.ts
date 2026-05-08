/**
 * @module observability/types
 *
 * Types for the observability stack — structured logging,
 * Prometheus metrics, health checks, and pipeline instrumentation.
 */

import { z } from "zod";

// ---- Log Levels ----

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error", "fatal"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

// ---- Structured Log Entry ----

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: LogLevelSchema,
  message: z.string().max(5000),
  service: z.string().max(100).default("innovator"),
  traceId: z.string().max(64).optional(),
  spanId: z.string().max(64).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// ---- Prometheus Metric Types ----

export const MetricTypeSchema = z.enum(["counter", "gauge", "histogram", "summary"]);
export type MetricType = z.infer<typeof MetricTypeSchema>;

export const PrometheusMetricSchema = z.object({
  name: z.string().max(200),
  type: MetricTypeSchema,
  help: z.string().max(500),
  labels: z.record(z.string(), z.string()).default({}),
  value: z.number(),
  buckets: z.array(z.number()).optional(),
});

export type PrometheusMetric = z.infer<typeof PrometheusMetricSchema>;

// ---- Health Check ----

export const HealthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const ComponentHealthSchema = z.object({
  name: z.string().max(100),
  status: HealthStatusSchema,
  latencyMs: z.number().min(0).optional(),
  message: z.string().max(500).optional(),
  lastCheck: z.string(),
});

export type ComponentHealth = z.infer<typeof ComponentHealthSchema>;

export const HealthReportSchema = z.object({
  status: HealthStatusSchema,
  uptime: z.number().min(0),
  version: z.string().max(50),
  components: z.array(ComponentHealthSchema),
  timestamp: z.string(),
});

export type HealthReport = z.infer<typeof HealthReportSchema>;

// ---- Pipeline Instrumentation ----

export const PipelineStageNameSchema = z.enum([
  "investigate",
  "generate",
  "synthesize",
  "score",
  "evolve",
  "validate",
  "full-pipeline",
]);
export type PipelineStageName = z.infer<typeof PipelineStageNameSchema>;

export const InstrumentedStageSchema = z.object({
  stage: PipelineStageNameSchema,
  startTime: z.string(),
  endTime: z.string().optional(),
  durationMs: z.number().min(0).optional(),
  tokenUsage: z
    .object({
      input: z.number().min(0).default(0),
      output: z.number().min(0).default(0),
    })
    .default({ input: 0, output: 0 }),
  model: z.string().max(100).optional(),
  error: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type InstrumentedStage = z.infer<typeof InstrumentedStageSchema>;
