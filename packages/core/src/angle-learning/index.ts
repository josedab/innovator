/**
 * @module angle-learning
 *
 * Angle Effectiveness Learning Loop. Instruments user events (export, rating,
 * dwell time, selection) per angle-idea pair. Computes per-angle quality scores,
 * trend analysis, domain-angle affinity matrix, and modifies angle selection
 * weights based on historical effectiveness.
 */

import { z } from "zod";

// ---- Schemas ----

export const AngleEventTypeSchema = z.enum([
  "export",
  "rating",
  "dwell-time",
  "selection",
  "dismiss",
  "bookmark",
  "share",
]);

export const AngleEventSchema = z.object({
  eventType: AngleEventTypeSchema,
  angleId: z.string().max(100),
  ideaTitle: z.string().max(500).optional(),
  domain: z.string().max(200).optional(),
  value: z.number().optional().describe("Rating value or dwell time in ms"),
  timestamp: z.string(),
  sessionId: z.string().max(100).optional(),
});

export const AngleQualityScoreSchema = z.object({
  angleId: z.string().max(100),
  overallScore: z.number().min(0).max(100),
  exportRate: z.number().min(0).max(1),
  averageRating: z.number().min(0).max(5),
  selectionRate: z.number().min(0).max(1),
  averageDwellTimeMs: z.number(),
  totalEvents: z.number(),
  trend: z.enum(["improving", "stable", "declining"]),
});

export const DomainAffinitySchema = z.object({
  domain: z.string().max(200),
  angleId: z.string().max(100),
  affinity: z.number().min(0).max(1),
  sampleSize: z.number(),
});

export const EffectivenessReportSchema = z.object({
  angleScores: z.array(AngleQualityScoreSchema).max(50),
  domainAffinityMatrix: z.array(DomainAffinitySchema).max(200),
  recommendedWeights: z.record(z.number()),
  lowPerformingPatterns: z.array(z.string().max(500)).max(20),
});

export type AngleEventType = z.infer<typeof AngleEventTypeSchema>;
export type AngleEvent = z.infer<typeof AngleEventSchema>;
export type AngleQualityScore = z.infer<typeof AngleQualityScoreSchema>;
export type DomainAffinity = z.infer<typeof DomainAffinitySchema>;
export type EffectivenessReport = z.infer<typeof EffectivenessReportSchema>;

// ---- In-Memory Store ----

const events: AngleEvent[] = [];
const abTestAssignments = new Map<string, "tuned" | "default">();

// ---- Event Recording ----

/**
 * Record an angle-related user event.
 */
export function recordAngleEvent(event: Omit<AngleEvent, "timestamp">): void {
  events.push({ ...event, timestamp: new Date().toISOString() });
}

/**
 * Get all recorded events, optionally filtered by angleId.
 */
export function getAngleEvents(angleId?: string): AngleEvent[] {
  if (!angleId) return [...events];
  return events.filter((e) => e.angleId === angleId);
}

// ---- Effectiveness Computation ----

/**
 * Compute effectiveness scores for all angles, optionally scoped to a domain.
 */
export function computeAngleEffectiveness(domain?: string): EffectivenessReport {
  const filtered = domain ? events.filter((e) => e.domain === domain) : events;

  // Group events by angleId
  const angleGroups = new Map<string, AngleEvent[]>();
  for (const event of filtered) {
    const group = angleGroups.get(event.angleId) ?? [];
    group.push(event);
    angleGroups.set(event.angleId, group);
  }

  const angleScores: AngleQualityScore[] = [];

  for (const [angleId, angleEvents] of angleGroups) {
    const exports = angleEvents.filter((e) => e.eventType === "export").length;
    const ratings = angleEvents.filter((e) => e.eventType === "rating" && e.value !== undefined);
    const selections = angleEvents.filter((e) => e.eventType === "selection").length;
    const dismissals = angleEvents.filter((e) => e.eventType === "dismiss").length;
    const dwellTimes = angleEvents.filter(
      (e) => e.eventType === "dwell-time" && e.value !== undefined
    );
    const total = angleEvents.length;

    const avgRating =
      ratings.length > 0 ? ratings.reduce((s, r) => s + (r.value ?? 0), 0) / ratings.length : 0;
    const exportRate = total > 0 ? exports / total : 0;
    const selectionRate = selections + dismissals > 0 ? selections / (selections + dismissals) : 0;
    const avgDwell =
      dwellTimes.length > 0
        ? dwellTimes.reduce((s, d) => s + (d.value ?? 0), 0) / dwellTimes.length
        : 0;

    // Compute composite score (0-100)
    const overallScore = Math.round(
      (avgRating / 5) * 30 +
        exportRate * 25 +
        selectionRate * 25 +
        Math.min(avgDwell / 30000, 1) * 20
    );

    // Compute trend from recent vs. older events
    const midpoint = Math.floor(angleEvents.length / 2);
    const recentRatings = angleEvents
      .slice(midpoint)
      .filter((e) => e.eventType === "rating" && e.value);
    const olderRatings = angleEvents
      .slice(0, midpoint)
      .filter((e) => e.eventType === "rating" && e.value);
    const recentAvg =
      recentRatings.length > 0
        ? recentRatings.reduce((s, r) => s + (r.value ?? 0), 0) / recentRatings.length
        : avgRating;
    const olderAvg =
      olderRatings.length > 0
        ? olderRatings.reduce((s, r) => s + (r.value ?? 0), 0) / olderRatings.length
        : avgRating;
    const trend =
      recentAvg > olderAvg + 0.3
        ? "improving"
        : recentAvg < olderAvg - 0.3
          ? "declining"
          : "stable";

    angleScores.push({
      angleId,
      overallScore,
      exportRate: Math.round(exportRate * 100) / 100,
      averageRating: Math.round(avgRating * 100) / 100,
      selectionRate: Math.round(selectionRate * 100) / 100,
      averageDwellTimeMs: Math.round(avgDwell),
      totalEvents: total,
      trend,
    });
  }

  // Domain-angle affinity matrix
  const domainAffinityMatrix: DomainAffinity[] = [];
  const domainAngleMap = new Map<string, Map<string, AngleEvent[]>>();

  for (const event of filtered) {
    if (!event.domain) continue;
    const domainMap = domainAngleMap.get(event.domain) ?? new Map();
    const angleList = domainMap.get(event.angleId) ?? [];
    angleList.push(event);
    domainMap.set(event.angleId, angleList);
    domainAngleMap.set(event.domain, domainMap);
  }

  for (const [dmn, angleMap] of domainAngleMap) {
    for (const [angleId, evts] of angleMap) {
      const positiveEvents = evts.filter(
        (e) =>
          e.eventType === "export" ||
          e.eventType === "selection" ||
          e.eventType === "bookmark" ||
          (e.eventType === "rating" && (e.value ?? 0) >= 4)
      ).length;
      const affinity = evts.length > 0 ? positiveEvents / evts.length : 0;
      domainAffinityMatrix.push({
        domain: dmn,
        angleId,
        affinity: Math.round(affinity * 100) / 100,
        sampleSize: evts.length,
      });
    }
  }

  // Recommended weights based on scores
  const recommendedWeights: Record<string, number> = {};
  const maxScore = Math.max(...angleScores.map((s) => s.overallScore), 1);
  for (const score of angleScores) {
    recommendedWeights[score.angleId] = Math.round((score.overallScore / maxScore) * 100) / 100;
  }

  // Low-performing patterns
  const lowPerformingPatterns = angleScores
    .filter((s) => s.overallScore < 30)
    .map((s) => `${s.angleId}: low effectiveness (score ${s.overallScore}/100, trend ${s.trend})`);

  return {
    angleScores: angleScores.sort((a, b) => b.overallScore - a.overallScore),
    domainAffinityMatrix,
    recommendedWeights,
    lowPerformingPatterns,
  };
}

/**
 * Get recommended angle weights for a specific domain, using
 * historical effectiveness to weight angle selection.
 */
export function getWeightedAngles(domain?: string): Record<string, number> {
  const report = computeAngleEffectiveness(domain);
  return report.recommendedWeights;
}

/**
 * Build prompt hints for low-performing angles to avoid common patterns.
 */
export function buildAvoidanceHints(angleId: string): string | null {
  const report = computeAngleEffectiveness();
  const score = report.angleScores.find((s) => s.angleId === angleId);

  if (!score || score.overallScore >= 50) return null;

  return (
    `IMPORTANT: This angle ("${angleId}") has historically underperformed (score: ${score.overallScore}/100, trend: ${score.trend}). ` +
    `Avoid generic or surface-level ideas. Focus on specific, actionable, and novel insights. ` +
    `Previous ideas from this angle had low export rates (${(score.exportRate * 100).toFixed(0)}%) and low user ratings.`
  );
}

// ---- A/B Testing ----

/**
 * Assign a session to an A/B test variant (tuned vs default angle weights).
 */
export function assignABVariant(sessionId: string): "tuned" | "default" {
  const existing = abTestAssignments.get(sessionId);
  if (existing) return existing;
  const variant = Math.random() < 0.5 ? "tuned" : "default";
  abTestAssignments.set(sessionId, variant);
  return variant;
}

/**
 * Get A/B test results comparing tuned vs default angle selection.
 */
export function getABTestResults(): {
  tuned: number;
  default: number;
  tunedCount: number;
  defaultCount: number;
} {
  let tunedTotal = 0,
    tunedCount = 0,
    defaultTotal = 0,
    defaultCount = 0;

  for (const [sessionId, variant] of abTestAssignments) {
    const sessionEvents = events.filter(
      (e) => e.sessionId === sessionId && e.eventType === "rating" && e.value
    );
    if (sessionEvents.length === 0) continue;
    const avg = sessionEvents.reduce((s, e) => s + (e.value ?? 0), 0) / sessionEvents.length;
    if (variant === "tuned") {
      tunedTotal += avg;
      tunedCount++;
    } else {
      defaultTotal += avg;
      defaultCount++;
    }
  }

  return {
    tuned: tunedCount > 0 ? Math.round((tunedTotal / tunedCount) * 100) / 100 : 0,
    default: defaultCount > 0 ? Math.round((defaultTotal / defaultCount) * 100) / 100 : 0,
    tunedCount,
    defaultCount,
  };
}

/** Clear all angle learning data (for testing). */
export function clearAngleLearning(): void {
  events.length = 0;
  abTestAssignments.clear();
}
