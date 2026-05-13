/**
 * @module learning-loop/pipeline-instrumenter
 *
 * Pipeline Instrumenter — records timing and quality metrics for each stage
 * of the innovation pipeline (investigation, generation, synthesis, debate).
 * Provides per-session event logs and aggregate performance statistics.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const PipelineStageSchema = z.enum(["investigation", "generation", "synthesis", "debate"]);

export const QualityMetricsSchema = z.object({
  relevance: z.number().min(0).max(10).optional(),
  novelty: z.number().min(0).max(10).optional(),
  feasibility: z.number().min(0).max(10).optional(),
  overallScore: z.number().min(0).max(10).optional(),
});

export const PipelineEventSchema = z.object({
  id: z.string().max(200),
  sessionId: z.string().max(200),
  stage: PipelineStageSchema,
  timestamp: z.string(),
  duration: z.number().min(0).optional(),
  inputSummary: z.string().max(2000),
  outputSummary: z.string().max(2000).optional(),
  qualityMetrics: QualityMetricsSchema.optional(),
  angleId: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
});

export const AggregateOptionsSchema = z.object({
  stage: PipelineStageSchema.optional(),
  sessionId: z.string().max(200).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const AggregateMetricsSchema = z.object({
  stage: z.string().max(100),
  eventCount: z.number().min(0),
  averageDuration: z.number().min(0),
  minDuration: z.number().min(0),
  maxDuration: z.number().min(0),
  qualityDistribution: z.object({
    averageRelevance: z.number().min(0).max(10).optional(),
    averageNovelty: z.number().min(0).max(10).optional(),
    averageFeasibility: z.number().min(0).max(10).optional(),
    averageOverall: z.number().min(0).max(10).optional(),
  }),
});

export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;
export type AggregateOptions = z.infer<typeof AggregateOptionsSchema>;
export type AggregateMetrics = z.infer<typeof AggregateMetricsSchema>;

// ---- Pipeline Instrumenter ----

export class PipelineInstrumenter {
  private events = new Map<string, PipelineEvent>();
  private sessionIndex = new Map<string, string[]>();

  /**
   * Record the start of a pipeline stage. Returns the event ID
   * which must be passed to `endStage()` when the stage completes.
   */
  startStage(
    sessionId: string,
    stage: PipelineStage,
    input: string,
    options?: { angleId?: string; model?: string }
  ): string {
    const id = `evt-${randomUUID().slice(0, 8)}`;
    const event: PipelineEvent = {
      id,
      sessionId,
      stage,
      timestamp: new Date().toISOString(),
      inputSummary: input.slice(0, 2000),
      angleId: options?.angleId,
      model: options?.model,
    };

    this.events.set(id, event);

    const sessionEvents = this.sessionIndex.get(sessionId) ?? [];
    sessionEvents.push(id);
    this.sessionIndex.set(sessionId, sessionEvents);

    return id;
  }

  /**
   * Record the end of a pipeline stage with output and optional quality metrics.
   */
  endStage(
    eventId: string,
    output: string,
    qualityMetrics?: QualityMetrics
  ): PipelineEvent | undefined {
    const event = this.events.get(eventId);
    if (!event) return undefined;

    const startTime = new Date(event.timestamp).getTime();
    const duration = Date.now() - startTime;

    const updated: PipelineEvent = {
      ...event,
      duration,
      outputSummary: output.slice(0, 2000),
      qualityMetrics,
    };

    this.events.set(eventId, updated);
    return updated;
  }

  /** Get all pipeline events for a session, ordered by timestamp. */
  getSessionEvents(sessionId: string): PipelineEvent[] {
    const eventIds = this.sessionIndex.get(sessionId) ?? [];
    const events: PipelineEvent[] = [];
    for (const id of eventIds) {
      const event = this.events.get(id);
      if (event) events.push(event);
    }
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return events;
  }

  /** Compute aggregate metrics across events, optionally filtered. */
  getAggregateMetrics(options: AggregateOptions = {}): AggregateMetrics[] {
    const { stage, sessionId, fromDate, toDate } = options;
    const fromMs = fromDate ? new Date(fromDate).getTime() : 0;
    const toMs = toDate ? new Date(toDate).getTime() : Infinity;

    // Filter events
    const filtered: PipelineEvent[] = [];
    for (const event of this.events.values()) {
      if (stage && event.stage !== stage) continue;
      if (sessionId && event.sessionId !== sessionId) continue;
      const ts = new Date(event.timestamp).getTime();
      if (ts < fromMs || ts > toMs) continue;
      filtered.push(event);
    }

    // Group by stage
    const grouped = new Map<string, PipelineEvent[]>();
    for (const event of filtered) {
      const group = grouped.get(event.stage) ?? [];
      group.push(event);
      grouped.set(event.stage, group);
    }

    const results: AggregateMetrics[] = [];
    for (const [stageName, events] of grouped) {
      const durations = events.filter((e) => e.duration !== undefined).map((e) => e.duration!);
      const avgDuration =
        durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;
      const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
      const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

      // Quality aggregation
      const withQuality = events.filter((e) => e.qualityMetrics);
      const avg = (vals: number[]) =>
        vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : undefined;

      const qualityDistribution = {
        averageRelevance: avg(
          withQuality
            .map((e) => e.qualityMetrics!.relevance)
            .filter((v): v is number => v !== undefined)
        ),
        averageNovelty: avg(
          withQuality
            .map((e) => e.qualityMetrics!.novelty)
            .filter((v): v is number => v !== undefined)
        ),
        averageFeasibility: avg(
          withQuality
            .map((e) => e.qualityMetrics!.feasibility)
            .filter((v): v is number => v !== undefined)
        ),
        averageOverall: avg(
          withQuality
            .map((e) => e.qualityMetrics!.overallScore)
            .filter((v): v is number => v !== undefined)
        ),
      };

      results.push({
        stage: stageName,
        eventCount: events.length,
        averageDuration: Math.round(avgDuration),
        minDuration: Math.round(minDuration),
        maxDuration: Math.round(maxDuration),
        qualityDistribution,
      });
    }

    return results;
  }

  /** Get total event count. */
  get size(): number {
    return this.events.size;
  }
}

// ---- Singleton ----

let instance: PipelineInstrumenter | undefined;

/** Get or create the shared PipelineInstrumenter instance. */
export function getInstrumenter(): PipelineInstrumenter {
  if (!instance) {
    instance = new PipelineInstrumenter();
  }
  return instance;
}
