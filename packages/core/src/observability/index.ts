/**
 * @module observability
 *
 * Observability stack for Innovator — structured JSON logging,
 * Prometheus metrics, health checks, pipeline instrumentation,
 * and Grafana dashboard templates.
 */

export { logger, log, setLogLevel, getLogLevel, getLogBuffer, clearLogBuffer } from "./logger.js";

export {
  incrementCounter,
  setGauge,
  observeHistogram,
  recordPipelineExecution,
  recordLLMLatency,
  setActivePipelines,
  recordIdeasGenerated,
  renderPrometheusMetrics,
  getAllMetrics,
  clearMetrics,
} from "./metrics.js";

export {
  registerHealthCheck,
  unregisterHealthCheck,
  getHealthReport,
  clearHealthChecks,
  createProviderHealthCheck,
  createStorageHealthCheck,
} from "./health.js";

export {
  beginStage,
  endStage,
  addStageEvent,
  getActiveStages,
  clearActiveStages,
} from "./instrumentation.js";

export { generateGrafanaDashboard } from "./dashboard.js";
export type { GrafanaDashboard, GrafanaPanel, GrafanaTarget } from "./dashboard.js";

export {
  LogLevelSchema,
  LogEntrySchema,
  MetricTypeSchema,
  PrometheusMetricSchema,
  HealthStatusSchema,
  ComponentHealthSchema,
  HealthReportSchema,
  PipelineStageNameSchema,
  InstrumentedStageSchema,
} from "./types.js";
export type {
  LogLevel,
  LogEntry,
  MetricType,
  PrometheusMetric,
  HealthStatus,
  ComponentHealth,
  HealthReport,
  PipelineStageName,
  InstrumentedStage,
} from "./types.js";
