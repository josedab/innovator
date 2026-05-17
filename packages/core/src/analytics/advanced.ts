/**
 * @module analytics/advanced
 *
 * Advanced analytics features: time-series analysis, heatmaps,
 * leaderboards, drill-down views, and report generation.
 */

import { randomUUID } from "node:crypto";
import type { AnalyticsSummary } from "./index.js";
import { readEvents, generateSummary } from "./index.js";

// ---- Time Series Analysis ----

export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TimeSeriesResult {
  series: TimeSeriesDataPoint[];
  trend: "increasing" | "decreasing" | "stable" | "volatile";
  average: number;
  min: number;
  max: number;
  percentChange: number;
}

/**
 * Generate time-series data for a metric over a date range.
 */
export function getTimeSeries(
  metric: "sessions" | "ideas" | "angles" | "duration" | "quality",
  options?: {
    startDate?: string;
    endDate?: string;
    granularity?: "hour" | "day" | "week" | "month";
  }
): TimeSeriesResult {
  const events = readEvents();
  const granularity = options?.granularity ?? "day";

  const dataPoints = new Map<string, number[]>();

  for (const event of events) {
    if (options?.startDate && event.timestamp < options.startDate) continue;
    if (options?.endDate && event.timestamp > options.endDate) continue;

    const bucket = getBucket(event.timestamp, granularity);
    const values = dataPoints.get(bucket) ?? [];

    switch (metric) {
      case "sessions":
        if (event.type === "pipeline_started") values.push(1);
        break;
      case "ideas":
        if (event.type === "angle_generated") values.push((event.data?.ideaCount as number) ?? 0);
        break;
      case "angles":
        if (event.type === "angle_generated") values.push(1);
        break;
      case "duration":
        if (event.type === "pipeline_completed")
          values.push((event.data?.durationMs as number) ?? 0);
        break;
      case "quality":
        if (event.type === "ideas_scored") values.push((event.data?.avgScore as number) ?? 0);
        break;
    }

    dataPoints.set(bucket, values);
  }

  const sparse: TimeSeriesDataPoint[] = [...dataPoints.entries()]
    .map(([timestamp, values]) => ({
      timestamp,
      value: values.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Fill gaps with zero-value data points so charts are continuous
  const series = fillTimeSeriesGaps(sparse, granularity);

  const allValues = series.map((s) => s.value);
  const average =
    allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;
  const min = allValues.length > 0 ? Math.min(...allValues) : 0;
  const max = allValues.length > 0 ? Math.max(...allValues) : 0;

  // Calculate trend
  let trend: TimeSeriesResult["trend"] = "stable";
  let percentChange = 0;
  if (series.length >= 4) {
    const halfLen = Math.floor(series.length / 2);
    const firstHalf = series.slice(0, halfLen).reduce((s, p) => s + p.value, 0) / halfLen;
    const secondHalf =
      series.slice(halfLen).reduce((s, p) => s + p.value, 0) / (series.length - halfLen);
    percentChange = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

    if (percentChange > 20) trend = "increasing";
    else if (percentChange < -20) trend = "decreasing";
    else {
      const variance = allValues.reduce((s, v) => s + (v - average) ** 2, 0) / allValues.length;
      const cv = average > 0 ? Math.sqrt(variance) / average : 0;
      trend = cv > 0.5 ? "volatile" : "stable";
    }
  }

  return { series, trend, average, min, max, percentChange: Math.round(percentChange) };
}

function getBucket(timestamp: string, granularity: "hour" | "day" | "week" | "month"): string {
  const d = new Date(timestamp);
  switch (granularity) {
    case "hour":
      return `${d.toISOString().slice(0, 13)}:00`;
    case "day":
      return d.toISOString().slice(0, 10);
    case "week": {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().slice(0, 10);
    }
    case "month":
      return d.toISOString().slice(0, 7);
  }
}

/** Convert a bucket timestamp string back to a UTC Date for iteration. */
function bucketToDate(bucket: string, granularity: "hour" | "day" | "week" | "month"): Date {
  switch (granularity) {
    case "hour":
      // Format: "2025-01-01T10:00" → needs Z suffix for UTC
      return new Date(bucket.length === 16 ? `${bucket}:00Z` : `${bucket}Z`);
    case "day":
    case "week":
      // Format: "2025-01-01" → midnight UTC
      return new Date(`${bucket}T00:00:00Z`);
    case "month":
      // Format: "2025-01" → first day midnight UTC
      return new Date(`${bucket}-01T00:00:00Z`);
  }
}

/** Advance a Date by one granularity unit (mutates and returns the date). */
function advanceBucket(d: Date, granularity: "hour" | "day" | "week" | "month"): Date {
  switch (granularity) {
    case "hour":
      d.setUTCHours(d.getUTCHours() + 1);
      break;
    case "day":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "week":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "month":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  return d;
}

/**
 * Fill gaps in a sorted time series with zero-value data points so
 * the series is continuous across the full date range.
 */
function fillTimeSeriesGaps(
  sparse: TimeSeriesDataPoint[],
  granularity: "hour" | "day" | "week" | "month"
): TimeSeriesDataPoint[] {
  if (sparse.length <= 1) return sparse;

  const existing = new Map(sparse.map((p) => [p.timestamp, p]));
  const filled: TimeSeriesDataPoint[] = [];

  // Parse the bucket timestamp into a proper UTC Date
  const cursor = bucketToDate(sparse[0].timestamp, granularity);
  const endBucket = sparse[sparse.length - 1].timestamp;

  // Safety limit to prevent infinite loops with bad data
  const maxIterations = 10_000;
  let iterations = 0;

  while (iterations < maxIterations) {
    const bucket = getBucket(cursor.toISOString(), granularity);
    if (bucket > endBucket) break;
    filled.push(existing.get(bucket) ?? { timestamp: bucket, value: 0 });
    advanceBucket(cursor, granularity);
    iterations++;
  }

  return filled;
}

// ---- Heatmap Data ----

export interface HeatmapCell {
  x: string;
  y: string;
  value: number;
}

/**
 * Generate heatmap data showing activity patterns.
 */
export function getActivityHeatmap(
  type: "hour-day" | "angle-topic" | "model-angle"
): HeatmapCell[] {
  const events = readEvents();
  const cells = new Map<string, number>();

  for (const event of events) {
    if (event.type !== "pipeline_started" && event.type !== "angle_generated") continue;

    let x: string, y: string;
    const d = new Date(event.timestamp);

    switch (type) {
      case "hour-day":
        x = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
        y = `${String(d.getHours()).padStart(2, "0")}:00`;
        break;
      case "angle-topic": {
        x = (event.data?.angleId as string) ?? "unknown";
        const subject = (event.data?.subject as string) ?? "";
        y = subject.split(/\s+/)[0]?.toLowerCase() ?? "unknown";
        break;
      }
      case "model-angle":
        x = (event.data?.model as string) ?? "default";
        y = (event.data?.angleId as string) ?? "unknown";
        break;
    }

    const key = `${x}\0${y}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }

  return [...cells.entries()].map(([key, value]) => {
    const sepIdx = key.indexOf("\0");
    const x = key.slice(0, sepIdx);
    const y = key.slice(sepIdx + 1);
    return { x, y, value };
  });
}

// ---- Leaderboard ----

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName?: string;
  score: number;
  metric: string;
  details: Record<string, number>;
}

/**
 * Generate a leaderboard ranking users by innovation metrics.
 */
export function getLeaderboard(
  metric: "sessions" | "ideas" | "quality" | "diversity" | "streaks",
  limit: number = 10
): LeaderboardEntry[] {
  const events = readEvents();
  const userMetrics = new Map<string, Record<string, number>>();

  for (const event of events) {
    const userId = (event.data?.userId as string) ?? "anonymous";
    const metrics = userMetrics.get(userId) ?? {
      sessions: 0,
      ideas: 0,
      qualitySum: 0,
      qualityCount: 0,
      anglesUsed: 0,
      uniqueAngles: 0,
      streakDays: 0,
    };

    switch (event.type) {
      case "pipeline_started":
        metrics.sessions++;
        break;
      case "angle_generated":
        metrics.ideas += (event.data?.ideaCount as number) ?? 0;
        metrics.anglesUsed++;
        break;
      case "ideas_scored": {
        const score = (event.data?.avgScore as number) ?? 0;
        metrics.qualitySum += score;
        metrics.qualityCount++;
        break;
      }
    }

    userMetrics.set(userId, metrics);
  }

  const entries: LeaderboardEntry[] = [...userMetrics.entries()]
    .map(([userId, m]) => {
      let score: number;
      switch (metric) {
        case "sessions":
          score = m.sessions;
          break;
        case "ideas":
          score = m.ideas;
          break;
        case "quality":
          score = m.qualityCount > 0 ? m.qualitySum / m.qualityCount : 0;
          break;
        case "diversity":
          score = m.anglesUsed;
          break;
        case "streaks":
          score = m.sessions;
          break; // Simplified
      }

      return {
        rank: 0,
        userId,
        score: Math.round(score * 100) / 100,
        metric,
        details: m,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  return entries;
}

// ---- Report Generation ----

export interface AnalyticsReport {
  id: string;
  title: string;
  generatedAt: string;
  period: { start: string; end: string };
  summary: AnalyticsSummary;
  timeSeries: Record<string, TimeSeriesResult>;
  heatmap: HeatmapCell[];
  leaderboard: LeaderboardEntry[];
  executiveSummary: string;
  keyMetrics: Array<{
    name: string;
    value: number | string;
    change?: number;
    trend?: "up" | "down" | "stable";
  }>;
}

/**
 * Generate a comprehensive analytics report.
 */
export function generateReport(options?: {
  startDate?: string;
  endDate?: string;
  title?: string;
}): AnalyticsReport {
  const summary = generateSummary();

  const sessionsSeries = getTimeSeries("sessions", {
    startDate: options?.startDate,
    endDate: options?.endDate,
  });
  const ideasSeries = getTimeSeries("ideas", {
    startDate: options?.startDate,
    endDate: options?.endDate,
  });
  const qualitySeries = getTimeSeries("quality", {
    startDate: options?.startDate,
    endDate: options?.endDate,
  });

  const heatmap = getActivityHeatmap("hour-day");
  const leaderboard = getLeaderboard("ideas", 5);

  const keyMetrics = [
    {
      name: "Total Sessions",
      value: summary.totalPipelines,
      change: sessionsSeries.percentChange,
      trend:
        sessionsSeries.trend === "increasing"
          ? ("up" as const)
          : sessionsSeries.trend === "decreasing"
            ? ("down" as const)
            : ("stable" as const),
    },
    {
      name: "Total Ideas Generated",
      value: summary.totalIdeas,
      change: ideasSeries.percentChange,
      trend: ideasSeries.trend === "increasing" ? ("up" as const) : ("stable" as const),
    },
    {
      name: "Success Rate",
      value: `${Math.round(summary.successRate * 100)}%`,
    },
    {
      name: "Avg Duration",
      value: `${Math.round(summary.averageDurationMs / 1000)}s`,
    },
    {
      name: "Angles Used",
      value: summary.totalAnglesUsed,
    },
    {
      name: "Idea Quality Trend",
      value: qualitySeries.average > 0 ? qualitySeries.average.toFixed(1) : "N/A",
      trend:
        qualitySeries.trend === "increasing"
          ? ("up" as const)
          : qualitySeries.trend === "decreasing"
            ? ("down" as const)
            : ("stable" as const),
    },
  ];

  const executiveSummary = generateExecutiveSummary(summary, keyMetrics);

  return {
    id: randomUUID(),
    title: options?.title ?? "Innovation Analytics Report",
    generatedAt: new Date().toISOString(),
    period: {
      start: options?.startDate ?? summary.sessionFrequency[0]?.date ?? new Date().toISOString(),
      end: options?.endDate ?? new Date().toISOString(),
    },
    summary,
    timeSeries: { sessions: sessionsSeries, ideas: ideasSeries, quality: qualitySeries },
    heatmap,
    leaderboard,
    executiveSummary,
    keyMetrics,
  };
}

function generateExecutiveSummary(
  summary: AnalyticsSummary,
  metrics: AnalyticsReport["keyMetrics"]
): string {
  const lines: string[] = [];

  lines.push(`## Innovation Analytics Summary`);
  lines.push("");
  lines.push(
    `Over the reporting period, **${summary.totalPipelines} innovation sessions** were conducted, generating **${summary.totalIdeas} ideas** across **${summary.totalAnglesUsed} angle applications**.`
  );
  lines.push("");

  if (summary.successRate >= 0.9) {
    lines.push("Pipeline reliability is excellent with a success rate above 90%.");
  } else if (summary.successRate >= 0.7) {
    lines.push("Pipeline reliability is good but there's room for improvement.");
  } else {
    lines.push("⚠️ Pipeline success rate is below 70% — investigation recommended.");
  }

  const topAngle = summary.angleUsage[0];
  if (topAngle) {
    lines.push("");
    lines.push(`The most popular angle is **${topAngle.angleId}** (used ${topAngle.count} times).`);
  }

  const topTopic = summary.subjectWordCloud[0];
  if (topTopic) {
    lines.push(
      `The most explored topic area is **"${topTopic.word}"** (${topTopic.count} mentions).`
    );
  }

  const sessionTrend = metrics.find((m) => m.name === "Total Sessions");
  if (sessionTrend?.change) {
    const direction = sessionTrend.change > 0 ? "increased" : "decreased";
    lines.push("");
    lines.push(
      `Session activity has ${direction} by ${Math.abs(sessionTrend.change)}% compared to the previous period.`
    );
  }

  return lines.join("\n");
}

/**
 * Export report as Markdown.
 */
export function reportToMarkdown(report: AnalyticsReport): string {
  const lines: string[] = [
    `# ${report.title}`,
    "",
    `*Generated: ${new Date(report.generatedAt).toLocaleDateString()}*`,
    `*Period: ${report.period.start} to ${report.period.end}*`,
    "",
    report.executiveSummary,
    "",
    "## Key Metrics",
    "",
    "| Metric | Value | Trend |",
    "|--------|-------|-------|",
    ...report.keyMetrics.map((m) => {
      const trendIcon = m.trend === "up" ? "📈" : m.trend === "down" ? "📉" : "➡️";
      const changeStr = m.change ? ` (${m.change > 0 ? "+" : ""}${m.change}%)` : "";
      return `| ${m.name} | ${m.value}${changeStr} | ${trendIcon} |`;
    }),
    "",
    "## Top Innovators",
    "",
    ...report.leaderboard.map((e) => `${e.rank}. **${e.userId}** — ${e.score} ideas`),
    "",
    "## Angle Usage",
    "",
    ...report.summary.angleUsage.map(
      (a) => `- **${a.angleId}**: ${a.count} uses (${Math.round(a.successRate * 100)}% success)`
    ),
  ];

  return lines.join("\n");
}
