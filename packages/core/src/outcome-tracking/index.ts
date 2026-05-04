/**
 * @module outcome-tracking
 *
 * Outcome Tracking & ROI Dashboard — tracks ideas from generation through
 * implementation to business outcome. Links ideas to external repos/PRDs/revenue
 * metrics and computes ROI per angle, session, and team member.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

/** Lifecycle stage of an outcome. */
export const OutcomeStageSchema = z.enum([
  "idea",
  "validated",
  "planned",
  "in-development",
  "shipped",
  "measured",
  "abandoned",
]);

/** External link type for connecting ideas to external systems. */
export const ExternalLinkTypeSchema = z.enum([
  "github-issue",
  "github-pr",
  "github-repo",
  "jira-ticket",
  "linear-issue",
  "prd",
  "figma",
  "notion",
  "confluence",
  "custom",
]);

/** An external link associated with an outcome. */
export const ExternalLinkSchema = z.object({
  id: z.string(),
  type: ExternalLinkTypeSchema,
  url: z.string().max(2000),
  title: z.string().max(500).optional(),
  status: z.string().max(100).optional(),
  lastSyncedAt: z.string().optional(),
});

/** Revenue/business metric for an outcome. */
export const RevenueMetricSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  value: z.number(),
  unit: z.string().max(50),
  measuredAt: z.string(),
  source: z.string().max(200).optional(),
});

/** A stage transition in the outcome's history. */
export const StageTransitionSchema = z.object({
  from: OutcomeStageSchema,
  to: OutcomeStageSchema,
  timestamp: z.string(),
  userId: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

/** Full outcome record linking an idea to business results. */
export const OutcomeRecordSchema = z.object({
  id: z.string(),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000).optional(),
  sessionId: z.string().optional(),
  angleId: z.string().max(100).optional(),
  teamMemberId: z.string().max(200).optional(),
  stage: OutcomeStageSchema,
  externalLinks: z.array(ExternalLinkSchema).max(20),
  revenueMetrics: z.array(RevenueMetricSchema).max(20),
  stageHistory: z.array(StageTransitionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  shippedAt: z.string().optional(),
  timeToValueDays: z.number().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  notes: z.string().max(5000).optional(),
});

// ---- Types ----

export type OutcomeStage = z.infer<typeof OutcomeStageSchema>;
export type ExternalLinkType = z.infer<typeof ExternalLinkTypeSchema>;
export type ExternalLink = z.infer<typeof ExternalLinkSchema>;
export type RevenueMetric = z.infer<typeof RevenueMetricSchema>;
export type StageTransition = z.infer<typeof StageTransitionSchema>;
export type OutcomeRecord = z.infer<typeof OutcomeRecordSchema>;

/** ROI summary for a single grouping (angle, session, or team member). */
export interface ROISummary {
  groupKey: string;
  totalIdeas: number;
  shippedIdeas: number;
  abandonedIdeas: number;
  shipRate: number;
  averageTimeToValueDays: number | null;
  totalRevenueImpact: number;
  topMetrics: Array<{ name: string; value: number; unit: string }>;
}

/** Time-series data point for ROI visualization. */
export interface ROITimeSeriesPoint {
  date: string;
  ideasCreated: number;
  ideasShipped: number;
  cumulativeRevenue: number;
}

/** Full ROI dashboard data. */
export interface ROIDashboard {
  totalOutcomes: number;
  byStage: Record<string, number>;
  overallShipRate: number;
  averageTimeToValueDays: number | null;
  totalRevenueImpact: number;
  byAngle: ROISummary[];
  bySession: ROISummary[];
  byTeamMember: ROISummary[];
  timeSeries: ROITimeSeriesPoint[];
  insights: string[];
}

// ---- In-Memory Store ----

const outcomes = new Map<string, OutcomeRecord>();

/** Create a new outcome record for an idea. */
export function createOutcome(params: {
  ideaTitle: string;
  ideaDescription?: string;
  sessionId?: string;
  angleId?: string;
  teamMemberId?: string;
  tags?: string[];
  notes?: string;
}): OutcomeRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  const outcome: OutcomeRecord = {
    id,
    ideaTitle: params.ideaTitle,
    ideaDescription: params.ideaDescription,
    sessionId: params.sessionId,
    angleId: params.angleId,
    teamMemberId: params.teamMemberId,
    stage: "idea",
    externalLinks: [],
    revenueMetrics: [],
    stageHistory: [],
    createdAt: now,
    updatedAt: now,
    tags: params.tags,
    notes: params.notes,
  };
  const parsed = OutcomeRecordSchema.parse(outcome);
  outcomes.set(id, parsed);
  return parsed;
}

/** Get an outcome by ID. */
export function getOutcome(id: string): OutcomeRecord | undefined {
  return outcomes.get(id);
}

/** List all outcomes, optionally filtered. */
export function listOutcomes(filter?: {
  stage?: OutcomeStage;
  angleId?: string;
  sessionId?: string;
  teamMemberId?: string;
}): OutcomeRecord[] {
  let list = Array.from(outcomes.values());
  if (filter?.stage) list = list.filter((o) => o.stage === filter.stage);
  if (filter?.angleId) list = list.filter((o) => o.angleId === filter.angleId);
  if (filter?.sessionId) list = list.filter((o) => o.sessionId === filter.sessionId);
  if (filter?.teamMemberId) list = list.filter((o) => o.teamMemberId === filter.teamMemberId);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Transition an outcome to a new stage. */
export function transitionOutcome(
  id: string,
  newStage: OutcomeStage,
  opts?: { userId?: string; note?: string }
): OutcomeRecord | undefined {
  const outcome = outcomes.get(id);
  if (!outcome) return undefined;

  const now = new Date().toISOString();
  const transition: StageTransition = {
    from: outcome.stage,
    to: newStage,
    timestamp: now,
    userId: opts?.userId,
    note: opts?.note,
  };

  outcome.stageHistory.push(transition);
  outcome.stage = newStage;
  outcome.updatedAt = now;

  if (newStage === "shipped" && !outcome.shippedAt) {
    outcome.shippedAt = now;
    const createdDate = new Date(outcome.createdAt).getTime();
    outcome.timeToValueDays = Math.round((Date.now() - createdDate) / (1000 * 60 * 60 * 24));
  }

  outcomes.set(id, outcome);
  return outcome;
}

/** Add an external link to an outcome. */
export function addExternalLink(
  outcomeId: string,
  link: { type: ExternalLinkType; url: string; title?: string; status?: string }
): OutcomeRecord | undefined {
  const outcome = outcomes.get(outcomeId);
  if (!outcome) return undefined;

  outcome.externalLinks.push({
    id: randomUUID(),
    type: link.type,
    url: link.url,
    title: link.title,
    status: link.status,
    lastSyncedAt: new Date().toISOString(),
  });
  outcome.updatedAt = new Date().toISOString();
  outcomes.set(outcomeId, outcome);
  return outcome;
}

/** Add a revenue metric to an outcome. */
export function addRevenueMetric(
  outcomeId: string,
  metric: { name: string; value: number; unit: string; source?: string }
): OutcomeRecord | undefined {
  const outcome = outcomes.get(outcomeId);
  if (!outcome) return undefined;

  outcome.revenueMetrics.push({
    id: randomUUID(),
    name: metric.name,
    value: metric.value,
    unit: metric.unit,
    measuredAt: new Date().toISOString(),
    source: metric.source,
  });
  outcome.updatedAt = new Date().toISOString();
  outcomes.set(outcomeId, outcome);
  return outcome;
}

/** Delete an outcome by ID. */
export function deleteOutcome(id: string): boolean {
  return outcomes.delete(id);
}

/** Build ROI summary grouped by a given key extractor. */
function buildGroupedROI(
  items: OutcomeRecord[],
  groupBy: (o: OutcomeRecord) => string
): ROISummary[] {
  const groups = new Map<string, OutcomeRecord[]>();
  for (const item of items) {
    const key = groupBy(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([groupKey, records]) => {
    const shipped = records.filter((r) => r.stage === "shipped" || r.stage === "measured");
    const abandoned = records.filter((r) => r.stage === "abandoned");
    const ttv = shipped.filter((r) => r.timeToValueDays != null).map((r) => r.timeToValueDays!);
    const totalRevenue = records.reduce(
      (sum, r) => sum + r.revenueMetrics.reduce((s, m) => s + m.value, 0),
      0
    );

    const allMetrics = records.flatMap((r) => r.revenueMetrics);
    const metricMap = new Map<string, { value: number; unit: string }>();
    for (const m of allMetrics) {
      const existing = metricMap.get(m.name);
      metricMap.set(m.name, {
        value: (existing?.value ?? 0) + m.value,
        unit: m.unit,
      });
    }

    return {
      groupKey,
      totalIdeas: records.length,
      shippedIdeas: shipped.length,
      abandonedIdeas: abandoned.length,
      shipRate: records.length > 0 ? Math.round((shipped.length / records.length) * 100) / 100 : 0,
      averageTimeToValueDays:
        ttv.length > 0 ? Math.round(ttv.reduce((a, b) => a + b, 0) / ttv.length) : null,
      totalRevenueImpact: totalRevenue,
      topMetrics: Array.from(metricMap.entries())
        .map(([name, { value, unit }]) => ({ name, value, unit }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    };
  });
}

/** Build the full ROI dashboard. */
export function buildROIDashboard(): ROIDashboard {
  const all = Array.from(outcomes.values());

  // Stage counts
  const byStage: Record<string, number> = {};
  for (const o of all) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
  }

  const shipped = all.filter((o) => o.stage === "shipped" || o.stage === "measured");
  const ttv = shipped.filter((o) => o.timeToValueDays != null).map((o) => o.timeToValueDays!);
  const totalRevenue = all.reduce(
    (sum, o) => sum + o.revenueMetrics.reduce((s, m) => s + m.value, 0),
    0
  );

  // Time-series: group by creation date
  const dateMap = new Map<string, { created: number; shipped: number; revenue: number }>();
  for (const o of all) {
    const date = o.createdAt.slice(0, 10);
    const entry = dateMap.get(date) ?? { created: 0, shipped: 0, revenue: 0 };
    entry.created++;
    dateMap.set(date, entry);
  }
  for (const o of shipped) {
    if (o.shippedAt) {
      const date = o.shippedAt.slice(0, 10);
      const entry = dateMap.get(date) ?? { created: 0, shipped: 0, revenue: 0 };
      entry.shipped++;
      entry.revenue += o.revenueMetrics.reduce((s, m) => s + m.value, 0);
      dateMap.set(date, entry);
    }
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  let cumulativeRevenue = 0;
  const timeSeries: ROITimeSeriesPoint[] = sortedDates.map((date) => {
    const entry = dateMap.get(date)!;
    cumulativeRevenue += entry.revenue;
    return {
      date,
      ideasCreated: entry.created,
      ideasShipped: entry.shipped,
      cumulativeRevenue,
    };
  });

  // Insights
  const insights: string[] = [];
  if (all.length === 0) {
    insights.push("No outcomes tracked yet. Create outcomes to start measuring ROI.");
  } else {
    const shipRate = Math.round((shipped.length / all.length) * 100);
    insights.push(`Overall ship rate: ${shipRate}% (${shipped.length}/${all.length})`);
    if (totalRevenue > 0) {
      insights.push(`Total revenue impact: ${totalRevenue.toLocaleString()}`);
    }
    const byAngle = buildGroupedROI(all, (o) => o.angleId ?? "unknown");
    const bestAngle = byAngle.sort((a, b) => b.shipRate - a.shipRate)[0];
    if (bestAngle && bestAngle.shippedIdeas > 0) {
      insights.push(
        `Best performing angle: ${bestAngle.groupKey} (${Math.round(bestAngle.shipRate * 100)}% ship rate)`
      );
    }
    if (ttv.length > 0) {
      const avgTtv = Math.round(ttv.reduce((a, b) => a + b, 0) / ttv.length);
      insights.push(`Average time-to-value: ${avgTtv} days`);
    }
  }

  return {
    totalOutcomes: all.length,
    byStage,
    overallShipRate: all.length > 0 ? Math.round((shipped.length / all.length) * 100) / 100 : 0,
    averageTimeToValueDays:
      ttv.length > 0 ? Math.round(ttv.reduce((a, b) => a + b, 0) / ttv.length) : null,
    totalRevenueImpact: totalRevenue,
    byAngle: buildGroupedROI(all, (o) => o.angleId ?? "unknown"),
    bySession: buildGroupedROI(all, (o) => o.sessionId ?? "unknown"),
    byTeamMember: buildGroupedROI(all, (o) => o.teamMemberId ?? "unknown"),
    timeSeries,
    insights,
  };
}

/** Clear all outcomes (for testing). */
export function clearOutcomes(): void {
  outcomes.clear();
}
