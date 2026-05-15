/**
 * @module analytics
 *
 * Innovation analytics: event tracking, time-series aggregation,
 * and AI-generated insights from usage patterns.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const ANALYTICS_DIR = join(homedir(), ".innovator", "analytics");
const EVENTS_FILE = join(ANALYTICS_DIR, "events.jsonl");
const INSIGHTS_FILE = join(ANALYTICS_DIR, "insights.json");

function ensureDir(): void {
  if (!existsSync(ANALYTICS_DIR)) mkdirSync(ANALYTICS_DIR, { recursive: true });
}

// ---- Types ----

export const ANALYTICS_EVENT_TYPES = [
  "pipeline_started",
  "pipeline_completed",
  "pipeline_failed",
  "investigation_completed",
  "angle_generated",
  "angle_failed",
  "synthesis_completed",
  "ideas_scored",
  "artifact_generated",
  "conversation_started",
  "conversation_message",
  "session_saved",
  "session_exported",
  "benchmark_completed",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const AnalyticsEventSchema = z.object({
  id: z.string(),
  type: z.enum(ANALYTICS_EVENT_TYPES),
  timestamp: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/** Aggregated analytics data for dashboard display. */
export interface AnalyticsSummary {
  totalPipelines: number;
  totalIdeas: number;
  totalAnglesUsed: number;
  successRate: number;
  averageDurationMs: number;
  ideasOverTime: Array<{ date: string; count: number }>;
  angleUsage: Array<{ angleId: string; count: number; successRate: number }>;
  subjectWordCloud: Array<{ word: string; count: number }>;
  sessionFrequency: Array<{ date: string; count: number }>;
  topModels: Array<{ model: string; count: number }>;
  recentEvents: AnalyticsEvent[];
}

/** AI-generated insight from analytics data. */
export interface AnalyticsInsight {
  id: string;
  type: "pattern" | "recommendation" | "anomaly";
  title: string;
  description: string;
  confidence: number;
  generatedAt: string;
}

// ---- Event Tracking ----

/**
 * Track an analytics event.
 */
export function trackEvent(
  type: AnalyticsEventType,
  data?: Record<string, unknown>
): AnalyticsEvent {
  ensureDir();
  const event: AnalyticsEvent = {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    appendFileSync(EVENTS_FILE, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // Analytics should never break the main flow
  }

  return event;
}

/**
 * Read all analytics events.
 */
export function readEvents(limit?: number): AnalyticsEvent[] {
  ensureDir();
  if (!existsSync(EVENTS_FILE)) return [];

  try {
    const lines = readFileSync(EVENTS_FILE, "utf-8").split("\n").filter(Boolean);

    const events: AnalyticsEvent[] = [];
    for (const line of lines) {
      try {
        events.push(AnalyticsEventSchema.parse(JSON.parse(line)));
      } catch {
        // Skip malformed lines
      }
    }

    // Sort newest first
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return limit ? events.slice(0, limit) : events;
  } catch {
    return [];
  }
}

// ---- Aggregation ----

/**
 * Generate an analytics summary from event data.
 */
export function generateSummary(events?: AnalyticsEvent[]): AnalyticsSummary {
  const allEvents = events ?? readEvents();

  const pipelineStarts = allEvents.filter((e) => e.type === "pipeline_started");
  const pipelineCompletes = allEvents.filter((e) => e.type === "pipeline_completed");
  const pipelineFails = allEvents.filter((e) => e.type === "pipeline_failed");
  const angleEvents = allEvents.filter((e) => e.type === "angle_generated");

  const totalPipelines = pipelineStarts.length;
  const successRate = totalPipelines > 0 ? pipelineCompletes.length / totalPipelines : 0;

  // Ideas over time (daily)
  const ideasByDate = new Map<string, number>();
  for (const e of angleEvents) {
    const date = e.timestamp.split("T")[0];
    const ideaCount = (e.data?.ideaCount as number) ?? 0;
    ideasByDate.set(date, (ideasByDate.get(date) ?? 0) + ideaCount);
  }

  // Angle usage
  const angleUsageMap = new Map<string, { total: number; success: number }>();
  for (const e of allEvents.filter(
    (e) => e.type === "angle_generated" || e.type === "angle_failed"
  )) {
    const angleId = (e.data?.angleId as string) ?? "unknown";
    const current = angleUsageMap.get(angleId) ?? { total: 0, success: 0 };
    current.total++;
    if (e.type === "angle_generated") current.success++;
    angleUsageMap.set(angleId, current);
  }

  // Subject word cloud
  const wordCounts = new Map<string, number>();
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "and",
    "or",
    "for",
    "to",
    "of",
    "in",
    "on",
    "with",
  ]);
  for (const e of pipelineStarts) {
    const subject = (e.data?.subject as string) ?? "";
    const words = subject
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  // Session frequency (daily)
  const sessionsByDate = new Map<string, number>();
  for (const e of pipelineStarts) {
    const date = e.timestamp.split("T")[0];
    sessionsByDate.set(date, (sessionsByDate.get(date) ?? 0) + 1);
  }

  // Model usage
  const modelCounts = new Map<string, number>();
  for (const e of pipelineStarts) {
    const model = (e.data?.model as string) ?? "default";
    modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
  }

  // Duration stats
  const durations = pipelineCompletes
    .map((e) => (e.data?.durationMs as number) ?? 0)
    .filter((d) => d > 0);
  const averageDurationMs =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  // Total ideas
  const totalIdeas = angleEvents.reduce((sum, e) => sum + ((e.data?.ideaCount as number) ?? 0), 0);

  return {
    totalPipelines,
    totalIdeas,
    totalAnglesUsed: angleEvents.length,
    successRate: +successRate.toFixed(3),
    averageDurationMs: Math.round(averageDurationMs),
    ideasOverTime: Array.from(ideasByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    angleUsage: Array.from(angleUsageMap.entries())
      .map(([angleId, data]) => ({
        angleId,
        count: data.total,
        successRate: +(data.success / data.total).toFixed(2),
      }))
      .sort((a, b) => b.count - a.count),
    subjectWordCloud: Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    sessionFrequency: Array.from(sessionsByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topModels: Array.from(modelCounts.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count),
    recentEvents: allEvents.slice(0, 20),
  };
}

// ---- Insights Engine ----

/**
 * Generate AI insights from analytics data (rule-based, no LLM dependency).
 */
export function generateInsights(summary?: AnalyticsSummary): AnalyticsInsight[] {
  const data = summary ?? generateSummary();
  const insights: AnalyticsInsight[] = [];
  const now = new Date().toISOString();

  // Pattern: Most productive angle
  if (data.angleUsage.length > 0) {
    const bestAngle = data.angleUsage[0];
    insights.push({
      id: randomUUID(),
      type: "pattern",
      title: "Most Used Angle",
      description: `"${bestAngle.angleId}" is your most frequently used angle (${bestAngle.count} times) with a ${Math.round(bestAngle.successRate * 100)}% success rate.`,
      confidence: 0.9,
      generatedAt: now,
    });
  }

  // Pattern: Usage gaps
  const allAngleIds = [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ];
  const usedAngles = new Set(data.angleUsage.map((a) => a.angleId));
  const unusedAngles = allAngleIds.filter((a) => !usedAngles.has(a));
  if (unusedAngles.length > 0 && data.totalPipelines > 5) {
    insights.push({
      id: randomUUID(),
      type: "recommendation",
      title: "Unexplored Angles",
      description: `You haven't tried these angles yet: ${unusedAngles.join(", ")}. Diversifying your approach could yield more novel ideas.`,
      confidence: 0.7,
      generatedAt: now,
    });
  }

  // Pattern: Success rate alert
  if (data.successRate < 0.7 && data.totalPipelines > 3) {
    insights.push({
      id: randomUUID(),
      type: "anomaly",
      title: "Low Success Rate",
      description: `Your pipeline success rate is ${Math.round(data.successRate * 100)}%. Consider checking your network connection or trying a different model.`,
      confidence: 0.8,
      generatedAt: now,
    });
  }

  // Pattern: Productivity trend
  if (data.sessionFrequency.length > 7) {
    const recent = data.sessionFrequency.slice(-7);
    const earlier = data.sessionFrequency.slice(-14, -7);
    const recentAvg = recent.reduce((s, d) => s + d.count, 0) / recent.length;
    const earlierAvg =
      earlier.length > 0 ? earlier.reduce((s, d) => s + d.count, 0) / earlier.length : 0;

    if (earlierAvg > 0 && recentAvg > earlierAvg * 1.5) {
      insights.push({
        id: randomUUID(),
        type: "pattern",
        title: "Increasing Activity",
        description: `Your innovation activity has increased ${Math.round((recentAvg / earlierAvg) * 100 - 100)}% in the last week compared to the previous week.`,
        confidence: 0.75,
        generatedAt: now,
      });
    }
  }

  // Pattern: Average duration
  if (data.averageDurationMs > 120_000) {
    insights.push({
      id: randomUUID(),
      type: "recommendation",
      title: "Long Pipeline Duration",
      description: `Average pipeline takes ${Math.round(data.averageDurationMs / 1000)}s. Consider using fewer angles or a faster model to speed up iterations.`,
      confidence: 0.65,
      generatedAt: now,
    });
  }

  // Pattern: Popular subjects
  if (data.subjectWordCloud.length > 0) {
    const topWords = data.subjectWordCloud.slice(0, 3).map((w) => w.word);
    insights.push({
      id: randomUUID(),
      type: "pattern",
      title: "Frequent Topics",
      description: `Your most explored topics include: ${topWords.join(", ")}. Consider exploring adjacent domains for cross-pollination.`,
      confidence: 0.7,
      generatedAt: now,
    });
  }

  return insights;
}

/**
 * Clear analytics data (for testing).
 */
export function clearAnalytics(): void {
  ensureDir();
  writeFileSync(EVENTS_FILE, "", "utf-8");
}

// ---- Re-exports ----

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
