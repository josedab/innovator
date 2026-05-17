/**
 * @module telemetry
 *
 * Innovation Telemetry & Quality Metrics — idea diversity scoring,
 * prompt effectiveness tracking, and hallucination detection.
 * Measures and improves quality of generated innovations over time.
 */

import { z } from "zod";
import type { AngleResult } from "../types.js";

// ---- Schemas ----

export const DiversityScoreSchema = z.object({
  overallDiversity: z.number().min(0).max(1),
  lexicalDiversity: z.number().min(0).max(1),
  conceptualSpread: z.number().min(0).max(1),
  angleDistribution: z.number().min(0).max(1),
  uniqueThemes: z.number().min(0),
  totalIdeas: z.number().min(0),
  duplicateCount: z.number().min(0),
  recommendations: z.array(z.string().max(500)).max(10),
});

export const PromptEffectivenessSchema = z.object({
  promptId: z.string().max(200),
  angleId: z.string().max(100),
  ideasGenerated: z.number().min(0),
  averageIdeaLength: z.number().min(0),
  structureCompliance: z.number().min(0).max(1),
  jsonParseSuccess: z.boolean(),
  hallucinations: z.number().min(0),
  latencyMs: z.number().min(0),
  tokenEstimate: z.number().min(0),
  timestamp: z.string(),
});

export const HallucinationCheckSchema = z.object({
  text: z.string().max(10000),
  detections: z
    .array(
      z.object({
        type: z.enum([
          "fabricated-statistic",
          "false-citation",
          "impossible-claim",
          "temporal-error",
          "brand-confusion",
        ]),
        excerpt: z.string().max(1000),
        confidence: z.number().min(0).max(1),
        explanation: z.string().max(500),
      })
    )
    .max(50),
  hallucinationScore: z.number().min(0).max(1),
  isReliable: z.boolean(),
});

export const QualityTrendSchema = z.object({
  period: z.string().max(50),
  averageDiversity: z.number().min(0).max(1),
  averageEffectiveness: z.number().min(0).max(1),
  hallucinationRate: z.number().min(0).max(1),
  totalPipelines: z.number().min(0),
  trend: z.enum(["improving", "stable", "declining"]),
});

export type DiversityScore = z.infer<typeof DiversityScoreSchema>;
export type PromptEffectiveness = z.infer<typeof PromptEffectivenessSchema>;
export type HallucinationCheck = z.infer<typeof HallucinationCheckSchema>;
export type QualityTrend = z.infer<typeof QualityTrendSchema>;

// ---- In-Memory Stores ----

const MAX_LOG_ENTRIES = 5_000;
const effectivenessLog: PromptEffectiveness[] = [];
const hallucinationLog: HallucinationCheck[] = [];

// ---- Diversity Scoring ----

/**
 * Score the diversity of generated ideas across angles.
 * Measures lexical variety, conceptual spread, and angle distribution.
 */
export function scoreIdeaDiversity(angleResults: AngleResult[]): DiversityScore {
  const allIdeas = angleResults.flatMap((ar) => ar.ideas);
  const totalIdeas = allIdeas.length;

  if (totalIdeas === 0) {
    return {
      overallDiversity: 0,
      lexicalDiversity: 0,
      conceptualSpread: 0,
      angleDistribution: 0,
      uniqueThemes: 0,
      totalIdeas: 0,
      duplicateCount: 0,
      recommendations: ["No ideas to evaluate"],
    };
  }

  // Lexical diversity: ratio of unique words to total words
  const allText = allIdeas.map((i) => `${i.title} ${i.description}`).join(" ");
  const words = allText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const uniqueWords = new Set(words);
  const lexicalDiversity = words.length > 0 ? Math.min(uniqueWords.size / words.length, 1) : 0;

  // Conceptual spread: how different are idea titles from each other
  const titles = allIdeas.map((i) => i.title.toLowerCase());
  let pairwiseSim = 0;
  let pairCount = 0;
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      pairwiseSim += jaccardSimilarity(titles[i], titles[j]);
      pairCount++;
    }
  }
  const avgSimilarity = pairCount > 0 ? pairwiseSim / pairCount : 0;
  const conceptualSpread = 1 - avgSimilarity;

  // Angle distribution: how evenly are ideas distributed across angles
  const idealPerAngle = totalIdeas / Math.max(angleResults.length, 1);
  const deviations = angleResults.map((ar) => Math.abs(ar.ideas.length - idealPerAngle));
  const avgDeviation =
    deviations.length > 0 ? deviations.reduce((s, d) => s + d, 0) / deviations.length : 0;
  const angleDistribution = Math.max(0, 1 - avgDeviation / idealPerAngle);

  // Detect duplicates (high title similarity)
  let duplicateCount = 0;
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      if (jaccardSimilarity(titles[i], titles[j]) > 0.7) duplicateCount++;
    }
  }

  // Count unique themes from titles
  const themeWords = new Set<string>();
  for (const title of titles) {
    const significant = title.split(/\s+/).filter((w) => w.length > 4);
    for (const w of significant) themeWords.add(w);
  }
  const uniqueThemes = themeWords.size;

  // Build recommendations
  const recommendations: string[] = [];
  if (lexicalDiversity < 0.3)
    recommendations.push("Ideas use repetitive language — try different prompting approaches");
  if (conceptualSpread < 0.4)
    recommendations.push("Ideas are too similar — add more diverse innovation angles");
  if (angleDistribution < 0.5) recommendations.push("Ideas are unevenly distributed across angles");
  if (duplicateCount > 0) recommendations.push(`Found ${duplicateCount} near-duplicate idea pairs`);
  if (uniqueThemes < totalIdeas * 0.5)
    recommendations.push("Low thematic variety — consider broadening the subject scope");

  const overallDiversity =
    lexicalDiversity * 0.3 + conceptualSpread * 0.4 + angleDistribution * 0.3;

  return {
    overallDiversity: Math.round(overallDiversity * 1000) / 1000,
    lexicalDiversity: Math.round(lexicalDiversity * 1000) / 1000,
    conceptualSpread: Math.round(conceptualSpread * 1000) / 1000,
    angleDistribution: Math.round(angleDistribution * 1000) / 1000,
    uniqueThemes,
    totalIdeas,
    duplicateCount,
    recommendations,
  };
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ---- Prompt Effectiveness Tracking ----

/**
 * Record prompt effectiveness metrics for a generation call.
 */
export function recordPromptEffectiveness(
  metrics: Omit<PromptEffectiveness, "timestamp">
): PromptEffectiveness {
  const record: PromptEffectiveness = {
    ...metrics,
    timestamp: new Date().toISOString(),
  };
  effectivenessLog.push(record);
  // Evict oldest entries when exceeding capacity
  if (effectivenessLog.length > MAX_LOG_ENTRIES) {
    effectivenessLog.splice(0, effectivenessLog.length - MAX_LOG_ENTRIES);
  }
  return record;
}

/**
 * Get prompt effectiveness statistics grouped by angle.
 */
export function getPromptEffectivenessByAngle(): Map<
  string,
  {
    avgIdeas: number;
    avgLatency: number;
    parseSuccessRate: number;
    avgCompliance: number;
    totalCalls: number;
  }
> {
  const grouped = new Map<string, PromptEffectiveness[]>();
  for (const record of effectivenessLog) {
    const group = grouped.get(record.angleId) ?? [];
    group.push(record);
    grouped.set(record.angleId, group);
  }

  const result = new Map<
    string,
    {
      avgIdeas: number;
      avgLatency: number;
      parseSuccessRate: number;
      avgCompliance: number;
      totalCalls: number;
    }
  >();

  for (const [angleId, records] of grouped) {
    result.set(angleId, {
      avgIdeas: records.reduce((s, r) => s + r.ideasGenerated, 0) / records.length,
      avgLatency: records.reduce((s, r) => s + r.latencyMs, 0) / records.length,
      parseSuccessRate: records.filter((r) => r.jsonParseSuccess).length / records.length,
      avgCompliance: records.reduce((s, r) => s + r.structureCompliance, 0) / records.length,
      totalCalls: records.length,
    });
  }

  return result;
}

// ---- Hallucination Detection ----

// Common patterns indicating fabricated content
const FABRICATED_STAT_PATTERNS = [
  /\d{1,3}% of (?:companies|organizations|users|people|businesses)/i,
  /\$\d+(?:\.\d+)?\s*(?:billion|million|trillion)\s+market/i,
  /according to (?:a )?(?:recent )?(?:study|report|survey|research)/i,
  /(?:studies show|research indicates|data suggests|experts estimate)/i,
  /by 20\d{2},?\s+\d+%/i,
  /over \d+ (?:million|billion) (?:users|people|companies)/i,
];

const IMPOSSIBLE_CLAIM_PATTERNS = [
  /100% (?:success|accuracy|efficiency|guarantee)/i,
  /zero (?:risk|cost|effort|downside)/i,
  /unlimited (?:scalability|growth|potential)/i,
  /the only (?:solution|approach|method|way)/i,
  /(?:never|always) (?:fails|works|succeeds)/i,
];

const TEMPORAL_ERROR_PATTERNS = [
  /in 20[3-9]\d,?\s+(?:we saw|it was reported|data showed)/i,
  /last year.+20[0-1]\d/i,
];

/**
 * Check text for potential hallucinations using pattern matching.
 */
export function detectHallucinations(text: string): HallucinationCheck {
  const detections: HallucinationCheck["detections"] = [];

  // Check for fabricated statistics
  for (const pattern of FABRICATED_STAT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      detections.push({
        type: "fabricated-statistic",
        excerpt: match[0],
        confidence: 0.7,
        explanation: "Specific statistic that may be fabricated — verify against primary sources",
      });
    }
  }

  // Check for impossible claims
  for (const pattern of IMPOSSIBLE_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      detections.push({
        type: "impossible-claim",
        excerpt: match[0],
        confidence: 0.8,
        explanation: "Absolute claim that is likely exaggerated or fabricated",
      });
    }
  }

  // Check for temporal errors
  for (const pattern of TEMPORAL_ERROR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      detections.push({
        type: "temporal-error",
        excerpt: match[0],
        confidence: 0.6,
        explanation: "Temporal reference that appears inconsistent",
      });
    }
  }

  const hallucinationScore = Math.min(
    detections.reduce((s, d) => s + d.confidence * 0.2, 0),
    1
  );

  const result: HallucinationCheck = {
    text: text.slice(0, 10000),
    detections,
    hallucinationScore: Math.round(hallucinationScore * 1000) / 1000,
    isReliable: hallucinationScore < 0.3,
  };

  hallucinationLog.push(result);
  if (hallucinationLog.length > MAX_LOG_ENTRIES) {
    hallucinationLog.splice(0, hallucinationLog.length - MAX_LOG_ENTRIES);
  }
  return result;
}

/**
 * Detect hallucinations across all ideas in angle results.
 */
export function detectHallucinationsInResults(angleResults: AngleResult[]): {
  results: Map<string, HallucinationCheck>;
  overallScore: number;
} {
  const results = new Map<string, HallucinationCheck>();
  let totalScore = 0;
  let count = 0;

  for (const ar of angleResults) {
    for (const idea of ar.ideas) {
      const text = `${idea.title}. ${idea.description}. ${idea.potentialImpact}. ${idea.implementationHint}`;
      const check = detectHallucinations(text);
      results.set(idea.title, check);
      totalScore += check.hallucinationScore;
      count++;
    }
  }

  return {
    results,
    overallScore: count > 0 ? Math.round((totalScore / count) * 1000) / 1000 : 0,
  };
}

// ---- Quality Trends ----

/**
 * Compute quality trends from accumulated telemetry data.
 */
export function getQualityTrends(): QualityTrend {
  const totalPipelines = effectivenessLog.length;

  if (totalPipelines === 0) {
    return {
      period: "all-time",
      averageDiversity: 0,
      averageEffectiveness: 0,
      hallucinationRate: 0,
      totalPipelines: 0,
      trend: "stable",
    };
  }

  const avgEffectiveness =
    effectivenessLog.reduce((s, r) => s + r.structureCompliance, 0) / totalPipelines;

  const hallucinationRate =
    hallucinationLog.length > 0
      ? hallucinationLog.filter((h) => !h.isReliable).length / hallucinationLog.length
      : 0;

  // Determine trend by comparing recent vs older data
  const midpoint = Math.floor(effectivenessLog.length / 2);
  const recentAvg =
    effectivenessLog.slice(midpoint).reduce((s, r) => s + r.structureCompliance, 0) /
    Math.max(effectivenessLog.length - midpoint, 1);
  const olderAvg =
    effectivenessLog.slice(0, midpoint).reduce((s, r) => s + r.structureCompliance, 0) /
    Math.max(midpoint, 1);

  const trend =
    recentAvg > olderAvg + 0.05
      ? "improving"
      : recentAvg < olderAvg - 0.05
        ? "declining"
        : "stable";

  return {
    period: "all-time",
    averageDiversity: 0, // Populated when diversity scores are tracked
    averageEffectiveness: Math.round(avgEffectiveness * 1000) / 1000,
    hallucinationRate: Math.round(hallucinationRate * 1000) / 1000,
    totalPipelines,
    trend,
  };
}

/** Clear all telemetry data (for testing). */
export function clearTelemetry(): void {
  effectivenessLog.length = 0;
  hallucinationLog.length = 0;
  spanStore.length = 0;
  metricsStore.length = 0;
}

// ---- Span Tracing (OTel-compatible) ----

export const TelemetrySpanSchema = z.object({
  traceId: z.string().max(64),
  spanId: z.string().max(64),
  parentSpanId: z.string().max(64).optional(),
  operationName: z.string().max(200),
  startTime: z.string(),
  endTime: z.string().optional(),
  durationMs: z.number().min(0).optional(),
  status: z.enum(["ok", "error", "in_progress"]).default("in_progress"),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  events: z
    .array(
      z.object({
        name: z.string().max(200),
        timestamp: z.string(),
        attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      })
    )
    .default([]),
});

export type TelemetrySpan = z.infer<typeof TelemetrySpanSchema>;

const spanStore: TelemetrySpan[] = [];

function generateId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/**
 * Start a new telemetry span for tracking pipeline operations.
 */
export function startSpan(
  operationName: string,
  attributes?: Record<string, string | number | boolean>,
  parentSpanId?: string,
  traceId?: string
): TelemetrySpan {
  const span: TelemetrySpan = {
    traceId: traceId ?? generateId(),
    spanId: generateId(),
    parentSpanId,
    operationName,
    startTime: new Date().toISOString(),
    status: "in_progress",
    attributes: attributes ?? {},
    events: [],
  };
  spanStore.push(span);
  return span;
}

/**
 * End a telemetry span, recording its duration and final status.
 */
export function endSpan(
  spanId: string,
  status: "ok" | "error" = "ok",
  attributes?: Record<string, string | number | boolean>
): TelemetrySpan | undefined {
  const span = spanStore.find((s) => s.spanId === spanId);
  if (!span) return undefined;
  span.endTime = new Date().toISOString();
  span.durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
  span.status = status;
  if (attributes) {
    Object.assign(span.attributes, attributes);
  }
  return span;
}

/**
 * Add an event to an active span.
 */
export function addSpanEvent(
  spanId: string,
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = spanStore.find((s) => s.spanId === spanId);
  if (span) {
    span.events.push({ name, timestamp: new Date().toISOString(), attributes });
  }
}

/**
 * Get all recorded spans, optionally filtered by trace ID.
 */
export function getSpans(traceId?: string): TelemetrySpan[] {
  if (traceId) return spanStore.filter((s) => s.traceId === traceId);
  return [...spanStore];
}

// ---- Metrics Aggregation ----

export const PipelineMetricSchema = z.object({
  timestamp: z.string(),
  pipelineId: z.string().max(100),
  stage: z.enum(["investigate", "generate", "synthesize", "score", "full-pipeline"]),
  durationMs: z.number().min(0),
  tokenCount: z.number().min(0).default(0),
  estimatedCostUsd: z.number().min(0).default(0),
  ideaCount: z.number().min(0).default(0),
  angleId: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  averageIdeaScore: z.number().min(0).max(10).optional(),
  success: z.boolean().default(true),
});

export type PipelineMetric = z.infer<typeof PipelineMetricSchema>;

const metricsStore: PipelineMetric[] = [];

/**
 * Record a pipeline metric data point.
 */
export function recordPipelineMetric(metric: Omit<PipelineMetric, "timestamp">): PipelineMetric {
  const record: PipelineMetric = {
    ...metric,
    timestamp: new Date().toISOString(),
  };
  metricsStore.push(record);
  return record;
}

/**
 * Get aggregated metrics grouped by stage or angle.
 */
export function getAggregatedMetrics(groupBy: "stage" | "angle" | "model" = "stage"): Map<
  string,
  {
    count: number;
    avgDurationMs: number;
    totalTokens: number;
    totalCostUsd: number;
    avgIdeaCount: number;
    successRate: number;
  }
> {
  const grouped = new Map<string, PipelineMetric[]>();
  for (const metric of metricsStore) {
    const key =
      groupBy === "stage"
        ? metric.stage
        : groupBy === "angle"
          ? (metric.angleId ?? "unknown")
          : (metric.model ?? "unknown");
    const group = grouped.get(key) ?? [];
    group.push(metric);
    grouped.set(key, group);
  }

  const result = new Map<
    string,
    {
      count: number;
      avgDurationMs: number;
      totalTokens: number;
      totalCostUsd: number;
      avgIdeaCount: number;
      successRate: number;
    }
  >();

  for (const [key, records] of grouped) {
    result.set(key, {
      count: records.length,
      avgDurationMs: Math.round(records.reduce((s, r) => s + r.durationMs, 0) / records.length),
      totalTokens: records.reduce((s, r) => s + r.tokenCount, 0),
      totalCostUsd: Math.round(records.reduce((s, r) => s + r.estimatedCostUsd, 0) * 10000) / 10000,
      avgIdeaCount:
        Math.round((records.reduce((s, r) => s + r.ideaCount, 0) / records.length) * 10) / 10,
      successRate:
        Math.round((records.filter((r) => r.success).length / records.length) * 100) / 100,
    });
  }

  return result;
}

/**
 * Build a telemetry dashboard summary for the web UI.
 */
export function buildTelemetryDashboard(): {
  totalPipelines: number;
  totalSpans: number;
  recentSpans: TelemetrySpan[];
  stageMetrics: Record<
    string,
    {
      count: number;
      avgDurationMs: number;
      totalTokens: number;
      totalCostUsd: number;
      avgIdeaCount: number;
      successRate: number;
    }
  >;
  angleMetrics: Record<
    string,
    {
      count: number;
      avgDurationMs: number;
      totalTokens: number;
      totalCostUsd: number;
      avgIdeaCount: number;
      successRate: number;
    }
  >;
  qualityTrend: QualityTrend;
  timeSeries: Array<{
    timestamp: string;
    durationMs: number;
    tokenCount: number;
    ideaCount: number;
    stage: string;
  }>;
} {
  const stageMap = getAggregatedMetrics("stage");
  const angleMap = getAggregatedMetrics("angle");

  const stageMetrics: Record<
    string,
    {
      count: number;
      avgDurationMs: number;
      totalTokens: number;
      totalCostUsd: number;
      avgIdeaCount: number;
      successRate: number;
    }
  > = {};
  for (const [key, value] of stageMap) stageMetrics[key] = value;

  const angleMetrics: Record<
    string,
    {
      count: number;
      avgDurationMs: number;
      totalTokens: number;
      totalCostUsd: number;
      avgIdeaCount: number;
      successRate: number;
    }
  > = {};
  for (const [key, value] of angleMap) angleMetrics[key] = value;

  const timeSeries = metricsStore.slice(-100).map((m) => ({
    timestamp: m.timestamp,
    durationMs: m.durationMs,
    tokenCount: m.tokenCount,
    ideaCount: m.ideaCount,
    stage: m.stage,
  }));

  return {
    totalPipelines: metricsStore.filter((m) => m.stage === "full-pipeline").length,
    totalSpans: spanStore.length,
    recentSpans: spanStore.slice(-20),
    stageMetrics,
    angleMetrics,
    qualityTrend: getQualityTrends(),
    timeSeries,
  };
}

/**
 * Get all recorded metrics.
 */
export function getMetrics(): PipelineMetric[] {
  return [...metricsStore];
}
