/**
 * @module analytics/kpi-dashboard
 *
 * KPI dashboard metric computation and Markdown export helpers
 * for innovation analytics dashboards.
 */

import { z } from "zod";
import type { AnalyticsEvent } from "./index.js";

export const KPIMetricSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  value: z.number(),
  unit: z.string().max(50),
  trend: z.enum(["up", "down", "stable"]),
  changePercent: z.number(),
  target: z.number().optional(),
  status: z.enum(["on-track", "at-risk", "behind"]),
});
export type KPIMetric = z.infer<typeof KPIMetricSchema>;

export const KPIDashboardSchema = z.object({
  metrics: z.array(KPIMetricSchema),
  period: z.object({ start: z.string(), end: z.string() }),
  generatedAt: z.string(),
});
export type KPIDashboard = z.infer<typeof KPIDashboardSchema>;

interface MetricSnapshot {
  sessions: number;
  completedSessions: number;
  ideas: number;
  avgQuality: number;
  activeUsers: number;
  exports: number;
}

function round(value: number, digits: number = 1): number {
  return Number(value.toFixed(digits));
}

function getIdeaCount(event: AnalyticsEvent): number {
  if (event.type !== "angle_generated") return 0;
  return typeof event.data?.ideaCount === "number"
    ? Math.max(0, Math.round(event.data.ideaCount))
    : 1;
}

function getQualityScore(event: AnalyticsEvent): number | undefined {
  const candidates = [
    event.data?.avgScore,
    event.data?.overallScore,
    event.data?.qualityScore,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.min(10, Math.max(0, candidate));
    }
  }

  return undefined;
}

function summarizeEvents(events: AnalyticsEvent[]): MetricSnapshot {
  const qualityScores = events
    .map((event) => getQualityScore(event))
    .filter((score): score is number => score != null);

  const activeUsers = new Set(
    events
      .map((event) => (typeof event.data?.userId === "string" ? event.data.userId : undefined))
      .filter((userId): userId is string => Boolean(userId)),
  );

  return {
    sessions: events.filter((event) => event.type === "pipeline_started").length,
    completedSessions: events.filter((event) => event.type === "pipeline_completed").length,
    ideas: events.reduce((sum, event) => sum + getIdeaCount(event), 0),
    avgQuality: qualityScores.length > 0
      ? round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length, 2)
      : 0,
    activeUsers: activeUsers.size,
    exports: events.filter((event) => event.type === "session_exported").length,
  };
}

function filterEventsByPeriod(
  events: AnalyticsEvent[],
  period: { start: string; end: string },
): AnalyticsEvent[] {
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  return events.filter((event) => {
    const timestamp = new Date(event.timestamp).getTime();
    return timestamp >= start && timestamp <= end;
  });
}

function getChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round(((current - previous) / previous) * 100);
}

function getTrend(changePercent: number): KPIMetric["trend"] {
  if (changePercent > 5) return "up";
  if (changePercent < -5) return "down";
  return "stable";
}

function getTargetStatus(value: number, target: number): KPIMetric["status"] {
  if (target <= 0) return value > 0 ? "on-track" : "behind";
  const ratio = value / target;
  if (ratio >= 1) return "on-track";
  if (ratio >= 0.8) return "at-risk";
  return "behind";
}

function buildMetric(
  id: string,
  name: string,
  unit: string,
  value: number,
  previousValue: number,
  target?: number,
): KPIMetric {
  const changePercent = getChange(value, previousValue);
  const trend = getTrend(changePercent);
  const status = target != null
    ? getTargetStatus(value, target)
    : value === 0
      ? "behind"
      : trend === "down"
        ? "at-risk"
        : "on-track";

  return KPIMetricSchema.parse({
    id,
    name,
    value: round(value, 2),
    unit,
    trend,
    changePercent,
    target,
    status,
  });
}

function derivePeriod(events: AnalyticsEvent[], period?: { start: string; end: string }) {
  if (period) return period;
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const now = new Date().toISOString();
  return {
    start: sorted[0]?.timestamp ?? now,
    end: sorted[sorted.length - 1]?.timestamp ?? now,
  };
}

/** Compute innovation KPI metrics from analytics events. */
export function computeKPIs(
  events: AnalyticsEvent[],
  period?: { start: string; end: string },
): KPIDashboard {
  const resolvedPeriod = derivePeriod(events, period);
  const currentEvents = filterEventsByPeriod(events, resolvedPeriod);
  const current = summarizeEvents(currentEvents);

  let previous = current;
  if (period) {
    const start = new Date(period.start).getTime();
    const end = new Date(period.end).getTime();
    const duration = Math.max(1, end - start);
    const previousPeriod = {
      start: new Date(start - duration).toISOString(),
      end: new Date(start - 1).toISOString(),
    };
    previous = summarizeEvents(filterEventsByPeriod(events, previousPeriod));
  }

  const currentSuccessRate = current.sessions > 0
    ? round((current.completedSessions / current.sessions) * 100, 2)
    : 0;
  const previousSuccessRate = previous.sessions > 0
    ? round((previous.completedSessions / previous.sessions) * 100, 2)
    : 0;

  const metrics = [
    buildMetric(
      "sessions-run",
      "Sessions Run",
      "sessions",
      current.sessions,
      previous.sessions,
      previous.sessions > 0 ? previous.sessions : undefined,
    ),
    buildMetric(
      "ideas-generated",
      "Ideas Generated",
      "ideas",
      current.ideas,
      previous.ideas,
      previous.ideas > 0 ? previous.ideas : undefined,
    ),
    buildMetric(
      "success-rate",
      "Success Rate",
      "%",
      currentSuccessRate,
      previousSuccessRate,
      80,
    ),
    buildMetric(
      "average-quality",
      "Average Quality",
      "/10",
      current.avgQuality,
      previous.avgQuality,
      7.5,
    ),
    buildMetric(
      "active-users",
      "Active Users",
      "users",
      current.activeUsers,
      previous.activeUsers,
      previous.activeUsers > 0 ? previous.activeUsers : undefined,
    ),
    buildMetric(
      "reports-exported",
      "Reports Exported",
      "exports",
      current.exports,
      previous.exports,
      previous.exports > 0 ? previous.exports : undefined,
    ),
  ];

  return KPIDashboardSchema.parse({
    metrics,
    period: resolvedPeriod,
    generatedAt: new Date().toISOString(),
  });
}

/** Export KPI dashboard data as Markdown. */
export function kpiDashboardToMarkdown(dashboard: KPIDashboard): string {
  return [
    "# Innovation KPI Dashboard",
    "",
    `**Period:** ${dashboard.period.start} → ${dashboard.period.end}`,
    `**Generated:** ${dashboard.generatedAt}`,
    "",
    "| KPI | Value | Trend | Change | Status | Target |",
    "|-----|-------|-------|--------|--------|--------|",
    ...dashboard.metrics.map((metric) => {
      const trendIcon = metric.trend === "up" ? "📈" : metric.trend === "down" ? "📉" : "➡️";
      const target = metric.target != null ? `${metric.target} ${metric.unit}` : "—";
      return `| ${metric.name} | ${metric.value} ${metric.unit} | ${trendIcon} | ${metric.changePercent > 0 ? "+" : ""}${metric.changePercent}% | ${metric.status} | ${target} |`;
    }),
  ].join("\n");
}
