import { z } from "zod";

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
