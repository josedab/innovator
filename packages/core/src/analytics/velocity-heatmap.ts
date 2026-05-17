/**
 * @module analytics/velocity-heatmap
 *
 * Innovation velocity trends, angle effectiveness heatmaps,
 * and team innovation pattern analysis for dashboard views.
 */

import { z } from "zod";
import type { AnalyticsEvent } from "./index.js";

/** Innovation velocity — ideas per time period. */
export const VelocityDataPointSchema = z.object({
  period: z.string().max(20),
  ideaCount: z.number().int().min(0),
  sessionCount: z.number().int().min(0),
  avgQualityScore: z.number().min(0).max(10),
  activeUsers: z.number().int().min(0),
});
export type VelocityDataPoint = z.infer<typeof VelocityDataPointSchema>;

export const VelocityTrendSchema = z.object({
  granularity: z.enum(["daily", "weekly", "monthly"]),
  dataPoints: z.array(VelocityDataPointSchema),
  trendDirection: z.enum(["up", "down", "stable"]),
  changePercent: z.number(),
  period: z.object({ start: z.string(), end: z.string() }),
});
export type VelocityTrend = z.infer<typeof VelocityTrendSchema>;

/** Angle effectiveness heatmap — angle × domain grid. */
export const HeatmapCellSchema = z.object({
  angleId: z.string().max(100),
  domain: z.string().max(200),
  effectivenessScore: z.number().min(0).max(1),
  sampleSize: z.number().int().min(0),
  avgIdeaQuality: z.number().min(0).max(10),
});
export type HeatmapCell = z.infer<typeof HeatmapCellSchema>;

export const AngleHeatmapSchema = z.object({
  cells: z.array(HeatmapCellSchema),
  angles: z.array(z.string()),
  domains: z.array(z.string()),
  generatedAt: z.string(),
});
export type AngleHeatmap = z.infer<typeof AngleHeatmapSchema>;

/** Team innovation pattern analysis. */
export const TeamPatternSchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  sessionsCount: z.number().int().min(0),
  totalIdeas: z.number().int().min(0),
  avgQualityScore: z.number().min(0).max(10),
  favoriteAngles: z.array(z.string().max(100)).max(5),
  peakHours: z.array(z.number().int().min(0).max(23)).max(5),
  innovationVelocity: z.number().min(0),
});
export type TeamPattern = z.infer<typeof TeamPatternSchema>;

function round(value: number, digits: number = 2): number {
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

function getUserId(event: AnalyticsEvent): string | undefined {
  return typeof event.data?.userId === "string" && event.data.userId.length > 0
    ? event.data.userId
    : undefined;
}

function getDisplayName(event: AnalyticsEvent): string | undefined {
  return typeof event.data?.displayName === "string" && event.data.displayName.length > 0
    ? event.data.displayName
    : undefined;
}

function getAngleId(event: AnalyticsEvent): string | undefined {
  return typeof event.data?.angleId === "string" && event.data.angleId.length > 0
    ? event.data.angleId
    : undefined;
}

function getDomain(event: AnalyticsEvent): string {
  if (typeof event.data?.domain === "string" && event.data.domain.length > 0) {
    return event.data.domain;
  }
  return "general";
}

function getIsoWeekKey(timestamp: string): string {
  const date = new Date(timestamp);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getBucketKey(timestamp: string, granularity: VelocityTrend["granularity"]): string {
  const date = new Date(timestamp);
  switch (granularity) {
    case "daily":
      return date.toISOString().slice(0, 10);
    case "weekly":
      return getIsoWeekKey(timestamp);
    case "monthly":
      return date.toISOString().slice(0, 7);
  }
}

function computeDirection(values: number[]): Pick<VelocityTrend, "trendDirection" | "changePercent"> {
  if (values.length === 0) {
    return { trendDirection: "stable", changePercent: 0 };
  }

  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const first = values.slice(0, midpoint);
  const second = values.slice(midpoint);
  const firstAvg = first.reduce((sum, value) => sum + value, 0) / first.length;
  const secondAvg = second.length > 0
    ? second.reduce((sum, value) => sum + value, 0) / second.length
    : firstAvg;

  let changePercent = 0;
  if (firstAvg === 0) {
    changePercent = secondAvg > 0 ? 100 : 0;
  } else {
    changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
  }

  if (changePercent > 10) {
    return { trendDirection: "up", changePercent: round(changePercent, 1) };
  }
  if (changePercent < -10) {
    return { trendDirection: "down", changePercent: round(changePercent, 1) };
  }
  return { trendDirection: "stable", changePercent: round(changePercent, 1) };
}

/** Compute innovation velocity trend data from analytics events. */
export function computeVelocityTrend(
  events: AnalyticsEvent[],
  granularity: VelocityTrend["granularity"] = "weekly",
): VelocityTrend {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const now = new Date().toISOString();

  if (sorted.length === 0) {
    return VelocityTrendSchema.parse({
      granularity,
      dataPoints: [],
      trendDirection: "stable",
      changePercent: 0,
      period: { start: now, end: now },
    });
  }

  const buckets = new Map<string, {
    ideaCount: number;
    sessionCount: number;
    qualitySum: number;
    qualityCount: number;
    activeUsers: Set<string>;
  }>();

  for (const event of sorted) {
    const bucket = getBucketKey(event.timestamp, granularity);
    const entry = buckets.get(bucket) ?? {
      ideaCount: 0,
      sessionCount: 0,
      qualitySum: 0,
      qualityCount: 0,
      activeUsers: new Set<string>(),
    };

    if (event.type === "pipeline_started") {
      entry.sessionCount += 1;
    }

    entry.ideaCount += getIdeaCount(event);

    const qualityScore = getQualityScore(event);
    if (qualityScore != null) {
      entry.qualitySum += qualityScore;
      entry.qualityCount += 1;
    }

    const userId = getUserId(event);
    if (userId) entry.activeUsers.add(userId);

    buckets.set(bucket, entry);
  }

  const dataPoints = Array.from(buckets.entries())
    .map(([period, entry]) => VelocityDataPointSchema.parse({
      period,
      ideaCount: entry.ideaCount,
      sessionCount: entry.sessionCount,
      avgQualityScore: entry.qualityCount > 0
        ? round(entry.qualitySum / entry.qualityCount)
        : 0,
      activeUsers: entry.activeUsers.size,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const { trendDirection, changePercent } = computeDirection(
    dataPoints.map((point) => point.ideaCount),
  );

  return VelocityTrendSchema.parse({
    granularity,
    dataPoints,
    trendDirection,
    changePercent,
    period: {
      start: sorted[0]?.timestamp ?? now,
      end: sorted[sorted.length - 1]?.timestamp ?? now,
    },
  });
}

/** Build an angle × domain effectiveness heatmap from analytics events. */
export function generateAngleHeatmap(events: AnalyticsEvent[]): AngleHeatmap {
  const cells = new Map<string, {
    angleId: string;
    domain: string;
    attempts: number;
    successes: number;
    qualitySum: number;
    qualityCount: number;
  }>();

  for (const event of events) {
    if (!["angle_generated", "angle_failed", "ideas_scored"].includes(event.type)) {
      continue;
    }

    const angleId = getAngleId(event);
    if (!angleId) continue;

    const domain = getDomain(event);
    const key = `${angleId}::${domain}`;
    const entry = cells.get(key) ?? {
      angleId,
      domain,
      attempts: 0,
      successes: 0,
      qualitySum: 0,
      qualityCount: 0,
    };

    if (event.type === "angle_generated" || event.type === "angle_failed") {
      entry.attempts += 1;
    }
    if (event.type === "angle_generated") {
      entry.successes += 1;
    }

    const qualityScore = getQualityScore(event);
    if (qualityScore != null) {
      entry.qualitySum += qualityScore;
      entry.qualityCount += 1;
    }

    cells.set(key, entry);
  }

  const normalizedCells = Array.from(cells.values())
    .map((entry) => {
      const sampleSize = entry.attempts > 0 ? entry.attempts : entry.qualityCount;
      const avgIdeaQuality = entry.qualityCount > 0
        ? round(entry.qualitySum / entry.qualityCount)
        : 0;
      const successRate = sampleSize > 0 ? entry.successes / sampleSize : 0;
      const qualityComponent = entry.qualityCount > 0 ? avgIdeaQuality / 10 : successRate;
      const effectivenessScore = sampleSize > 0
        ? Math.min(1, Math.max(0, round(successRate * 0.4 + qualityComponent * 0.6, 3)))
        : 0;

      return HeatmapCellSchema.parse({
        angleId: entry.angleId,
        domain: entry.domain,
        effectivenessScore,
        sampleSize,
        avgIdeaQuality,
      });
    })
    .sort((a, b) => a.angleId.localeCompare(b.angleId) || a.domain.localeCompare(b.domain));

  return AngleHeatmapSchema.parse({
    cells: normalizedCells,
    angles: Array.from(new Set(normalizedCells.map((cell) => cell.angleId))).sort(),
    domains: Array.from(new Set(normalizedCells.map((cell) => cell.domain))).sort(),
    generatedAt: new Date().toISOString(),
  });
}

/** Analyze user-level innovation behavior patterns from analytics events. */
export function analyzeTeamPatterns(events: AnalyticsEvent[]): TeamPattern[] {
  const patterns = new Map<string, {
    userId: string;
    displayName?: string;
    sessionsCount: number;
    totalIdeas: number;
    qualitySum: number;
    qualityCount: number;
    angleCounts: Map<string, number>;
    hourCounts: Map<number, number>;
    activeDays: Set<string>;
  }>();

  for (const event of events) {
    const userId = getUserId(event);
    if (!userId) continue;

    const entry = patterns.get(userId) ?? {
      userId,
      sessionsCount: 0,
      totalIdeas: 0,
      qualitySum: 0,
      qualityCount: 0,
      angleCounts: new Map<string, number>(),
      hourCounts: new Map<number, number>(),
      activeDays: new Set<string>(),
    };

    const displayName = getDisplayName(event);
    if (displayName) entry.displayName = displayName;

    if (event.type === "pipeline_started") {
      entry.sessionsCount += 1;
    }
    if (event.type === "angle_generated") {
      entry.totalIdeas += getIdeaCount(event);
      const angleId = getAngleId(event);
      if (angleId) {
        entry.angleCounts.set(angleId, (entry.angleCounts.get(angleId) ?? 0) + 1);
      }
    }

    const qualityScore = getQualityScore(event);
    if (qualityScore != null) {
      entry.qualitySum += qualityScore;
      entry.qualityCount += 1;
    }

    const hour = new Date(event.timestamp).getUTCHours();
    entry.hourCounts.set(hour, (entry.hourCounts.get(hour) ?? 0) + 1);
    entry.activeDays.add(event.timestamp.slice(0, 10));

    patterns.set(userId, entry);
  }

  return Array.from(patterns.values())
    .map((entry) => TeamPatternSchema.parse({
      userId: entry.userId,
      displayName: entry.displayName ?? entry.userId,
      sessionsCount: entry.sessionsCount,
      totalIdeas: entry.totalIdeas,
      avgQualityScore: entry.qualityCount > 0
        ? round(entry.qualitySum / entry.qualityCount)
        : 0,
      favoriteAngles: Array.from(entry.angleCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([angleId]) => angleId),
      peakHours: Array.from(entry.hourCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 5)
        .map(([hour]) => hour),
      innovationVelocity: round(
        entry.totalIdeas / Math.max(1, entry.activeDays.size),
      ),
    }))
    .sort((a, b) => b.innovationVelocity - a.innovationVelocity || b.totalIdeas - a.totalIdeas);
}

/** Export velocity trend analytics as Markdown. */
export function velocityTrendToMarkdown(trend: VelocityTrend): string {
  const lines = [
    "# Innovation Velocity Trend",
    "",
    `**Granularity:** ${trend.granularity}`,
    `**Trend:** ${trend.trendDirection} (${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%)`,
    `**Period:** ${trend.period.start} → ${trend.period.end}`,
    "",
    "| Period | Ideas | Sessions | Avg Quality | Active Users |",
    "|--------|-------|----------|-------------|--------------|",
    ...trend.dataPoints.map((point) =>
      `| ${point.period} | ${point.ideaCount} | ${point.sessionCount} | ${point.avgQualityScore.toFixed(2)} | ${point.activeUsers} |`,
    ),
  ];

  if (trend.dataPoints.length === 0) {
    lines.push("No velocity data available.");
  }

  return lines.join("\n");
}
