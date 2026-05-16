/**
 * @module outcome-tracking/telemetry
 *
 * Innovation telemetry — tracks model effectiveness, team contribution
 * heatmaps, and outcome lifecycle events for end-to-end ROI measurement.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Telemetry Event Schemas ----

export const TelemetryEventTypeSchema = z.enum([
  "idea_created",
  "idea_validated",
  "idea_planned",
  "idea_in_development",
  "idea_shipped",
  "idea_measured",
  "idea_abandoned",
  "model_invoked",
  "model_succeeded",
  "model_failed",
  "team_contribution",
  "review_completed",
  "feedback_received",
]);

export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;

export const TelemetryEventSchema = z.object({
  id: z.string(),
  type: TelemetryEventTypeSchema,
  timestamp: z.string(),
  sessionId: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  angleId: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

// ---- Model Effectiveness ----

export interface ModelEffectivenessMetrics {
  model: string;
  totalInvocations: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
  ideasGenerated: number;
  ideasShipped: number;
  ideaShipRate: number;
  avgQualityScore: number;
}

// ---- Team Contribution Heatmap ----

export interface TeamHeatmapCell {
  userId: string;
  week: string;
  sessionsRun: number;
  ideasGenerated: number;
  ideasShipped: number;
  reviewsCompleted: number;
  intensity: number; // 0-1 normalized
}

export interface TeamContributionHeatmap {
  users: string[];
  weeks: string[];
  cells: TeamHeatmapCell[];
  topContributor: string | null;
  totalContributions: number;
}

// ---- In-Memory Store ----

const telemetryEvents: TelemetryEvent[] = [];

/** Record a telemetry event. */
export function recordTelemetryEvent(
  type: TelemetryEventType,
  opts?: {
    sessionId?: string;
    userId?: string;
    model?: string;
    angleId?: string;
    metadata?: Record<string, unknown>;
  }
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    sessionId: opts?.sessionId,
    userId: opts?.userId,
    model: opts?.model,
    angleId: opts?.angleId,
    metadata: opts?.metadata ?? {},
  };
  const validated = TelemetryEventSchema.parse(event);
  telemetryEvents.push(validated);

  // Keep bounded
  if (telemetryEvents.length > 10000) telemetryEvents.splice(0, telemetryEvents.length - 5000);

  return validated;
}

/** Get telemetry events with optional filtering. */
export function getTelemetryEvents(filter?: {
  type?: TelemetryEventType;
  userId?: string;
  model?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): TelemetryEvent[] {
  let events = [...telemetryEvents];
  if (filter?.type) events = events.filter((e) => e.type === filter.type);
  if (filter?.userId) events = events.filter((e) => e.userId === filter.userId);
  if (filter?.model) events = events.filter((e) => e.model === filter.model);
  if (filter?.fromDate) events = events.filter((e) => e.timestamp >= filter.fromDate!);
  if (filter?.toDate) events = events.filter((e) => e.timestamp <= filter.toDate!);
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return filter?.limit ? events.slice(0, filter.limit) : events;
}

/** Compute model effectiveness metrics across all tracked models. */
export function getModelEffectiveness(): ModelEffectivenessMetrics[] {
  const modelMap = new Map<
    string,
    {
      invocations: number;
      successes: number;
      failures: number;
      latencies: number[];
      ideas: number;
      shipped: number;
      qualities: number[];
    }
  >();

  for (const event of telemetryEvents) {
    if (!event.model) continue;
    const entry = modelMap.get(event.model) ?? {
      invocations: 0,
      successes: 0,
      failures: 0,
      latencies: [],
      ideas: 0,
      shipped: 0,
      qualities: [],
    };

    if (event.type === "model_invoked") entry.invocations++;
    if (event.type === "model_succeeded") {
      entry.successes++;
      const latency = event.metadata.latencyMs as number | undefined;
      if (latency != null) entry.latencies.push(latency);
      const quality = event.metadata.qualityScore as number | undefined;
      if (quality != null) entry.qualities.push(quality);
    }
    if (event.type === "model_failed") entry.failures++;
    if (event.type === "idea_created") entry.ideas++;
    if (event.type === "idea_shipped") entry.shipped++;

    modelMap.set(event.model, entry);
  }

  return Array.from(modelMap.entries()).map(([model, data]) => ({
    model,
    totalInvocations: data.invocations,
    successCount: data.successes,
    failureCount: data.failures,
    successRate: data.invocations > 0 ? data.successes / data.invocations : 0,
    avgLatencyMs:
      data.latencies.length > 0
        ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
        : 0,
    ideasGenerated: data.ideas,
    ideasShipped: data.shipped,
    ideaShipRate: data.ideas > 0 ? data.shipped / data.ideas : 0,
    avgQualityScore:
      data.qualities.length > 0
        ? +(data.qualities.reduce((a, b) => a + b, 0) / data.qualities.length).toFixed(2)
        : 0,
  }));
}

/** Build team contribution heatmap from telemetry events. */
export function buildTeamHeatmap(opts?: {
  fromDate?: string;
  toDate?: string;
}): TeamContributionHeatmap {
  const weekMap = new Map<string, Map<string, TeamHeatmapCell>>();
  const allUsers = new Set<string>();
  const allWeeks = new Set<string>();

  for (const event of telemetryEvents) {
    if (!event.userId) continue;
    if (opts?.fromDate && event.timestamp < opts.fromDate) continue;
    if (opts?.toDate && event.timestamp > opts.toDate) continue;

    const date = new Date(event.timestamp);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const week = weekStart.toISOString().slice(0, 10);

    allUsers.add(event.userId);
    allWeeks.add(week);

    if (!weekMap.has(week)) weekMap.set(week, new Map());
    const userMap = weekMap.get(week)!;

    if (!userMap.has(event.userId)) {
      userMap.set(event.userId, {
        userId: event.userId,
        week,
        sessionsRun: 0,
        ideasGenerated: 0,
        ideasShipped: 0,
        reviewsCompleted: 0,
        intensity: 0,
      });
    }

    const cell = userMap.get(event.userId)!;
    if (event.type === "idea_created") cell.ideasGenerated++;
    if (event.type === "idea_shipped") cell.ideasShipped++;
    if (event.type === "review_completed") cell.reviewsCompleted++;
    if (event.type === "team_contribution") cell.sessionsRun++;
  }

  // Normalize intensity
  const cells: TeamHeatmapCell[] = [];
  let maxActivity = 0;
  for (const [, userMap] of weekMap) {
    for (const [, cell] of userMap) {
      const activity = cell.sessionsRun + cell.ideasGenerated + cell.reviewsCompleted;
      if (activity > maxActivity) maxActivity = activity;
    }
  }
  for (const [, userMap] of weekMap) {
    for (const [, cell] of userMap) {
      const activity = cell.sessionsRun + cell.ideasGenerated + cell.reviewsCompleted;
      cell.intensity = maxActivity > 0 ? +(activity / maxActivity).toFixed(2) : 0;
      cells.push(cell);
    }
  }

  // Determine top contributor
  const userTotals = new Map<string, number>();
  for (const cell of cells) {
    const total =
      (userTotals.get(cell.userId) ?? 0) +
      cell.sessionsRun +
      cell.ideasGenerated +
      cell.ideasShipped;
    userTotals.set(cell.userId, total);
  }
  let topContributor: string | null = null;
  let topTotal = 0;
  for (const [userId, total] of userTotals) {
    if (total > topTotal) {
      topTotal = total;
      topContributor = userId;
    }
  }

  return {
    users: Array.from(allUsers).sort(),
    weeks: Array.from(allWeeks).sort(),
    cells,
    topContributor,
    totalContributions: cells.reduce(
      (sum, c) => sum + c.sessionsRun + c.ideasGenerated + c.ideasShipped,
      0
    ),
  };
}

// ---- Per-Angle ROI Chart Data ----

export interface AngleROIChartPoint {
  angleId: string;
  ideasGenerated: number;
  ideasShipped: number;
  shipRate: number;
  avgQualityScore: number;
  totalRevenue: number;
  costEstimate: number;
  roi: number;
}

/** Build per-angle ROI chart data from telemetry events. */
export function buildAngleROIChart(): AngleROIChartPoint[] {
  const angleMap = new Map<
    string,
    {
      generated: number;
      shipped: number;
      qualities: number[];
      revenue: number;
      cost: number;
    }
  >();

  for (const event of telemetryEvents) {
    if (!event.angleId) continue;
    const entry = angleMap.get(event.angleId) ?? {
      generated: 0,
      shipped: 0,
      qualities: [],
      revenue: 0,
      cost: 0,
    };

    if (event.type === "idea_created") entry.generated++;
    if (event.type === "idea_shipped") {
      entry.shipped++;
      const rev = event.metadata.revenue as number | undefined;
      if (rev != null) entry.revenue += rev;
    }
    if (event.type === "model_succeeded") {
      const q = event.metadata.qualityScore as number | undefined;
      if (q != null) entry.qualities.push(q);
      const cost = event.metadata.costUsd as number | undefined;
      if (cost != null) entry.cost += cost;
    }

    angleMap.set(event.angleId, entry);
  }

  return Array.from(angleMap.entries())
    .map(([angleId, d]) => {
      const avgQ =
        d.qualities.length > 0
          ? +(d.qualities.reduce((a, b) => a + b, 0) / d.qualities.length).toFixed(2)
          : 0;
      const roi = d.cost > 0 ? +(((d.revenue - d.cost) / d.cost) * 100).toFixed(1) : 0;
      return {
        angleId,
        ideasGenerated: d.generated,
        ideasShipped: d.shipped,
        shipRate: d.generated > 0 ? +(d.shipped / d.generated).toFixed(3) : 0,
        avgQualityScore: avgQ,
        totalRevenue: d.revenue,
        costEstimate: +d.cost.toFixed(2),
        roi,
      };
    })
    .sort((a, b) => b.roi - a.roi);
}

// ---- Executive Summary Export ----

export interface ExecutiveDashboardExport {
  title: string;
  generatedAt: string;
  period: { from: string; to: string };
  kpis: {
    totalIdeas: number;
    ideasShipped: number;
    overallShipRate: number;
    totalRevenue: number;
    avgTimeToValueDays: number | null;
    topPerformingModel: string | null;
    topPerformingAngle: string | null;
  };
  modelEffectiveness: ModelEffectivenessMetrics[];
  angleROI: AngleROIChartPoint[];
  teamHeatmap: TeamContributionHeatmap;
  insights: string[];
}

/** Build a full executive dashboard export for a given date range. */
export function buildExecutiveDashboardExport(opts?: {
  from?: string;
  to?: string;
  title?: string;
}): ExecutiveDashboardExport {
  const from = opts?.from ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = opts?.to ?? new Date().toISOString();
  const filtered = telemetryEvents.filter((e) => e.timestamp >= from && e.timestamp <= to);

  const totalIdeas = filtered.filter((e) => e.type === "idea_created").length;
  const ideasShipped = filtered.filter((e) => e.type === "idea_shipped").length;
  const revEvents = filtered.filter((e) => e.type === "idea_shipped" && e.metadata.revenue);
  const totalRevenue = revEvents.reduce((s, e) => s + ((e.metadata.revenue as number) ?? 0), 0);

  const shippedWithTtv = filtered.filter(
    (e) => e.type === "idea_shipped" && e.metadata.timeToValueDays != null
  );
  const avgTtv =
    shippedWithTtv.length > 0
      ? Math.round(
          shippedWithTtv.reduce((s, e) => s + ((e.metadata.timeToValueDays as number) ?? 0), 0) /
            shippedWithTtv.length
        )
      : null;

  const models = getModelEffectiveness();
  const topModel = models.sort((a, b) => b.successRate - a.successRate)[0]?.model ?? null;

  const angleChart = buildAngleROIChart();
  const topAngle = angleChart[0]?.angleId ?? null;

  const heatmap = buildTeamHeatmap({ fromDate: from, toDate: to });

  const insights: string[] = [];
  if (totalIdeas > 0)
    insights.push(
      `${totalIdeas} ideas created, ${ideasShipped} shipped (${Math.round((ideasShipped / totalIdeas) * 100)}% ship rate).`
    );
  if (totalRevenue > 0) insights.push(`Total revenue impact: $${totalRevenue.toLocaleString()}.`);
  if (topModel) insights.push(`Top performing model: ${topModel}.`);
  if (topAngle) insights.push(`Highest ROI angle: ${topAngle}.`);
  if (heatmap.topContributor) insights.push(`Top contributor: ${heatmap.topContributor}.`);

  return {
    title: opts?.title ?? "Innovation Telemetry — Executive Summary",
    generatedAt: new Date().toISOString(),
    period: { from, to },
    kpis: {
      totalIdeas,
      ideasShipped,
      overallShipRate: totalIdeas > 0 ? +(ideasShipped / totalIdeas).toFixed(3) : 0,
      totalRevenue,
      avgTimeToValueDays: avgTtv,
      topPerformingModel: topModel,
      topPerformingAngle: topAngle,
    },
    modelEffectiveness: models,
    angleROI: angleChart,
    teamHeatmap: heatmap,
    insights,
  };
}

/** Export an executive dashboard to Markdown format. */
export function exportDashboardToMarkdown(dashboard: ExecutiveDashboardExport): string {
  const lines: string[] = [
    `# ${dashboard.title}`,
    "",
    `_Generated: ${dashboard.generatedAt}_`,
    `_Period: ${dashboard.period.from.slice(0, 10)} → ${dashboard.period.to.slice(0, 10)}_`,
    "",
    "## Key Performance Indicators",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total Ideas | ${dashboard.kpis.totalIdeas} |`,
    `| Ideas Shipped | ${dashboard.kpis.ideasShipped} |`,
    `| Ship Rate | ${Math.round(dashboard.kpis.overallShipRate * 100)}% |`,
    `| Total Revenue | $${dashboard.kpis.totalRevenue.toLocaleString()} |`,
    `| Avg Time-to-Value | ${dashboard.kpis.avgTimeToValueDays ?? "N/A"} days |`,
    `| Top Model | ${dashboard.kpis.topPerformingModel ?? "N/A"} |`,
    `| Top Angle | ${dashboard.kpis.topPerformingAngle ?? "N/A"} |`,
    "",
  ];

  if (dashboard.modelEffectiveness.length > 0) {
    lines.push("## Model Effectiveness", "");
    lines.push("| Model | Invocations | Success Rate | Avg Latency | Ideas Shipped |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const m of dashboard.modelEffectiveness) {
      lines.push(
        `| ${m.model} | ${m.totalInvocations} | ${Math.round(m.successRate * 100)}% | ${m.avgLatencyMs}ms | ${m.ideasShipped} |`
      );
    }
    lines.push("");
  }

  if (dashboard.angleROI.length > 0) {
    lines.push("## Per-Angle ROI", "");
    lines.push("| Angle | Ideas | Shipped | Ship Rate | Revenue | ROI |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const a of dashboard.angleROI) {
      lines.push(
        `| ${a.angleId} | ${a.ideasGenerated} | ${a.ideasShipped} | ${Math.round(a.shipRate * 100)}% | $${a.totalRevenue} | ${a.roi}% |`
      );
    }
    lines.push("");
  }

  if (dashboard.insights.length > 0) {
    lines.push("## Insights", "");
    for (const insight of dashboard.insights) {
      lines.push(`- ${insight}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Export dashboard to CSV format. */
export function exportDashboardToCSV(dashboard: ExecutiveDashboardExport): string {
  const rows: string[] = ["metric,value"];
  rows.push(`total_ideas,${dashboard.kpis.totalIdeas}`);
  rows.push(`ideas_shipped,${dashboard.kpis.ideasShipped}`);
  rows.push(`ship_rate,${dashboard.kpis.overallShipRate}`);
  rows.push(`total_revenue,${dashboard.kpis.totalRevenue}`);
  rows.push(`avg_ttv_days,${dashboard.kpis.avgTimeToValueDays ?? ""}`);
  rows.push(`top_model,${dashboard.kpis.topPerformingModel ?? ""}`);
  rows.push(`top_angle,${dashboard.kpis.topPerformingAngle ?? ""}`);
  rows.push("");
  rows.push("model,invocations,success_rate,avg_latency_ms,ideas_shipped");
  for (const m of dashboard.modelEffectiveness) {
    rows.push(
      `${m.model},${m.totalInvocations},${m.successRate},${m.avgLatencyMs},${m.ideasShipped}`
    );
  }
  rows.push("");
  rows.push("angle,ideas_generated,ideas_shipped,ship_rate,revenue,roi");
  for (const a of dashboard.angleROI) {
    rows.push(
      `${a.angleId},${a.ideasGenerated},${a.ideasShipped},${a.shipRate},${a.totalRevenue},${a.roi}`
    );
  }
  return rows.join("\n");
}

/** Clear telemetry data (for testing). */
export function clearTelemetryData(): void {
  telemetryEvents.length = 0;
}
