export { ANALYTICS_EVENT_TYPES, AnalyticsEventSchema } from "./types.js";
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsSummary,
  AnalyticsInsight,
} from "./types.js";

export {
  trackEvent,
  readEvents,
  generateSummary,
  generateInsights,
  clearAnalytics,
} from "./analytics.js";

export {
  type TimeSeriesDataPoint,
  type TimeSeriesResult,
  type HeatmapCell,
  type LeaderboardEntry,
  type AnalyticsReport,
  getTimeSeries,
  getActivityHeatmap,
  getLeaderboard,
  generateReport,
  reportToMarkdown,
} from "./advanced.js";

export {
  ExecutiveReportSchema,
  FunnelStageSchema,
  generateExecutiveReport,
  executiveReportToMarkdown,
} from "./executive-report.js";
export type { ExecutiveReport, FunnelStage } from "./executive-report.js";

export {
  VelocityDataPointSchema,
  VelocityTrendSchema,
  HeatmapCellSchema,
  AngleHeatmapSchema,
  TeamPatternSchema,
  computeVelocityTrend,
  generateAngleHeatmap,
  analyzeTeamPatterns,
  velocityTrendToMarkdown,
} from "./velocity-heatmap.js";
export type {
  VelocityDataPoint,
  VelocityTrend,
  HeatmapCell as AngleHeatmapCell,
  AngleHeatmap,
  TeamPattern,
} from "./velocity-heatmap.js";

export {
  KPIMetricSchema,
  KPIDashboardSchema,
  computeKPIs,
  kpiDashboardToMarkdown,
} from "./kpi-dashboard.js";
export type { KPIMetric, KPIDashboard } from "./kpi-dashboard.js";

export {
  ReportScheduleSchema,
  GeneratedReportSchema,
  ReportScheduleInputSchema,
  createReportSchedule,
  getReportSchedule,
  listReportSchedules,
  deleteReportSchedule,
  generateScheduledReport,
  getDueSchedules,
  clearReportSchedules,
} from "./scheduled-reports.js";
export type { ReportSchedule, GeneratedReport, ReportScheduleInput } from "./scheduled-reports.js";
