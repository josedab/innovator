/**
 * @module impact-tracker/integrations
 *
 * Project management integration connectors for idea-to-shipped tracking.
 * Connects to Jira, Linear, and GitHub to automatically detect when ideas
 * ship and compute ROI attribution.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Integration Configuration ----

export const IntegrationTypeSchema = z.enum(["jira", "linear", "github"]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const IntegrationConfigSchema = z.object({
  id: z.string(),
  type: IntegrationTypeSchema,
  name: z.string().max(200),
  enabled: z.boolean().default(true),
  baseUrl: z.string().max(2000).optional(),
  projectKey: z.string().max(100).optional(),
  apiToken: z.string().max(500).optional(),
  syncIntervalMs: z.number().int().positive().default(3600000),
  lastSyncAt: z.string().optional(),
  fieldMapping: z.record(z.string()).default({}),
});
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

// ---- Linked Items ----

export const LinkedItemStatusSchema = z.enum([
  "open",
  "in_progress",
  "in_review",
  "done",
  "closed",
  "cancelled",
]);
export type LinkedItemStatus = z.infer<typeof LinkedItemStatusSchema>;

export const LinkedItemSchema = z.object({
  id: z.string(),
  ideaId: z.string(),
  integrationId: z.string(),
  externalId: z.string().max(500),
  externalUrl: z.string().max(2000).optional(),
  type: z.enum(["issue", "story", "task", "epic", "pr", "project"]),
  title: z.string().max(500),
  status: LinkedItemStatusSchema,
  assignee: z.string().max(200).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type LinkedItem = z.infer<typeof LinkedItemSchema>;

// ---- ROI Attribution ----

export const ROIMetricSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  investmentHours: z.number().min(0).default(0),
  investmentCost: z.number().min(0).default(0),
  revenueGenerated: z.number().default(0),
  costSaved: z.number().default(0),
  usersImpacted: z.number().int().min(0).default(0),
  roi: z.number(),
  timeToShip: z.number().min(0).optional(),
  status: z.enum(["tracking", "shipped", "measuring", "closed"]),
  attributionConfidence: z.number().min(0).max(1).default(0.5),
  computedAt: z.string(),
});
export type ROIMetric = z.infer<typeof ROIMetricSchema>;

export const ROISummarySchema = z.object({
  totalIdeasTracked: z.number(),
  ideasShipped: z.number(),
  shipRate: z.number(),
  totalInvestment: z.number(),
  totalReturn: z.number(),
  aggregateROI: z.number(),
  avgTimeToShipDays: z.number(),
  topPerformers: z.array(
    z.object({
      ideaId: z.string(),
      title: z.string().max(500),
      roi: z.number(),
    })
  ),
  byIntegration: z.array(
    z.object({
      type: IntegrationTypeSchema,
      itemCount: z.number(),
      completedCount: z.number(),
    })
  ),
  computedAt: z.string(),
});
export type ROISummary = z.infer<typeof ROISummarySchema>;

// ---- In-Memory Stores ----

const integrations = new Map<string, IntegrationConfig>();
const linkedItems = new Map<string, LinkedItem>();
const roiMetrics = new Map<string, ROIMetric>();

// ---- Integration Management ----

/** Register a project management integration. */
export function registerIntegration(
  config: { type: IntegrationType; name: string } & Partial<
    Omit<IntegrationConfig, "id" | "type" | "name">
  >
): IntegrationConfig {
  const integration = IntegrationConfigSchema.parse({
    ...config,
    id: randomUUID(),
  });
  integrations.set(integration.id, integration);
  return integration;
}

/** Get a specific integration. */
export function getIntegration(id: string): IntegrationConfig | undefined {
  return integrations.get(id);
}

/** List all integrations. */
export function listIntegrations(): IntegrationConfig[] {
  return Array.from(integrations.values());
}

/** Update an integration config. */
export function updateIntegration(
  id: string,
  updates: Partial<Omit<IntegrationConfig, "id">>
): IntegrationConfig | undefined {
  const existing = integrations.get(id);
  if (!existing) return undefined;
  const updated = IntegrationConfigSchema.parse({ ...existing, ...updates });
  integrations.set(id, updated);
  return updated;
}

/** Remove an integration. */
export function removeIntegration(id: string): boolean {
  return integrations.delete(id);
}

// ---- Linked Item Management ----

/** Link an external item (Jira issue, Linear task, GitHub PR) to an idea. */
export function linkItem(item: Omit<LinkedItem, "id" | "createdAt" | "updatedAt">): LinkedItem {
  const linked = LinkedItemSchema.parse({
    ...item,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  linkedItems.set(linked.id, linked);
  return linked;
}

/** Update the status of a linked item. */
export function updateLinkedItemStatus(
  id: string,
  status: LinkedItemStatus,
  metadata?: Record<string, unknown>
): LinkedItem | undefined {
  const existing = linkedItems.get(id);
  if (!existing) return undefined;

  const updated: LinkedItem = {
    ...existing,
    status,
    updatedAt: new Date().toISOString(),
    completedAt:
      status === "done" || status === "closed" ? new Date().toISOString() : existing.completedAt,
    metadata: { ...existing.metadata, ...metadata },
  };
  linkedItems.set(id, updated);
  return updated;
}

/** Get all linked items for an idea. */
export function getLinkedItems(ideaId: string): LinkedItem[] {
  return Array.from(linkedItems.values()).filter((item) => item.ideaId === ideaId);
}

/** Get linked items by integration. */
export function getLinkedItemsByIntegration(integrationId: string): LinkedItem[] {
  return Array.from(linkedItems.values()).filter((item) => item.integrationId === integrationId);
}

// ---- Sync Simulation ----

/**
 * Sync linked items from an integration.
 * In a real implementation, this would call the Jira/Linear/GitHub API.
 * Here it updates the lastSyncAt timestamp and returns current items.
 */
export function syncIntegration(integrationId: string): {
  synced: number;
  updated: number;
  integration: IntegrationConfig | undefined;
} {
  const integration = integrations.get(integrationId);
  if (!integration) return { synced: 0, updated: 0, integration: undefined };

  const items = getLinkedItemsByIntegration(integrationId);

  // Update sync timestamp
  integration.lastSyncAt = new Date().toISOString();
  integrations.set(integrationId, integration);

  return {
    synced: items.length,
    updated: items.filter((i) => i.status === "done" || i.status === "closed").length,
    integration,
  };
}

// ---- ROI Attribution ----

/** Compute ROI for a specific idea based on its linked items and outcomes. */
export function computeROI(
  ideaId: string,
  financials: {
    investmentHours?: number;
    hourlyRate?: number;
    investmentCost?: number;
    revenueGenerated?: number;
    costSaved?: number;
    usersImpacted?: number;
  }
): ROIMetric {
  const items = getLinkedItems(ideaId);
  const completedItems = items.filter((i) => i.status === "done" || i.status === "closed");
  const isShipped = completedItems.length > 0;

  const hourlyRate = financials.hourlyRate ?? 100;
  const investmentHours = financials.investmentHours ?? 0;
  const investmentCost = financials.investmentCost ?? investmentHours * hourlyRate;
  const revenueGenerated = financials.revenueGenerated ?? 0;
  const costSaved = financials.costSaved ?? 0;
  const usersImpacted = financials.usersImpacted ?? 0;

  const totalReturn = revenueGenerated + costSaved;
  const roi = investmentCost > 0 ? ((totalReturn - investmentCost) / investmentCost) * 100 : 0;

  // Calculate time-to-ship
  let timeToShip: number | undefined;
  if (completedItems.length > 0) {
    const earliest = items.reduce(
      (min, i) => (i.createdAt < min ? i.createdAt : min),
      items[0].createdAt
    );
    const latestCompletion = completedItems.reduce(
      (max, i) => ((i.completedAt ?? "") > max ? (i.completedAt ?? "") : max),
      completedItems[0].completedAt ?? ""
    );
    if (latestCompletion) {
      timeToShip =
        (new Date(latestCompletion).getTime() - new Date(earliest).getTime()) /
        (1000 * 60 * 60 * 24);
    }
  }

  // Attribution confidence based on data quality
  const dataPoints = [
    investmentHours > 0,
    revenueGenerated > 0,
    costSaved > 0,
    usersImpacted > 0,
    items.length > 0,
  ].filter(Boolean).length;
  const attributionConfidence = Math.min(1, dataPoints / 5);

  const metric: ROIMetric = ROIMetricSchema.parse({
    ideaId,
    ideaTitle: items[0]?.title ?? ideaId,
    investmentHours,
    investmentCost,
    revenueGenerated,
    costSaved,
    usersImpacted,
    roi: +roi.toFixed(2),
    timeToShip: timeToShip ? +timeToShip.toFixed(1) : undefined,
    status: isShipped ? "shipped" : "tracking",
    attributionConfidence: +attributionConfidence.toFixed(2),
    computedAt: new Date().toISOString(),
  });

  roiMetrics.set(ideaId, metric);
  return metric;
}

/** Get ROI metric for an idea. */
export function getROIMetric(ideaId: string): ROIMetric | undefined {
  return roiMetrics.get(ideaId);
}

/** List all ROI metrics. */
export function listROIMetrics(): ROIMetric[] {
  return Array.from(roiMetrics.values()).sort((a, b) => b.roi - a.roi);
}

/** Generate an aggregate ROI summary across all tracked ideas. */
export function generateROISummary(): ROISummary {
  const metrics = listROIMetrics();
  const shipped = metrics.filter((m) => m.status === "shipped");
  const totalInvestment = metrics.reduce((s, m) => s + m.investmentCost, 0);
  const totalReturn = metrics.reduce((s, m) => s + m.revenueGenerated + m.costSaved, 0);

  const shippedWithTime = shipped.filter((m) => m.timeToShip !== undefined);
  const avgTimeToShip =
    shippedWithTime.length > 0
      ? shippedWithTime.reduce((s, m) => s + (m.timeToShip ?? 0), 0) / shippedWithTime.length
      : 0;

  // Integration breakdown
  const allItems = Array.from(linkedItems.values());
  const byIntegration: Map<string, { count: number; completed: number }> = new Map();
  for (const item of allItems) {
    const integration = integrations.get(item.integrationId);
    if (!integration) continue;
    const key = integration.type;
    const current = byIntegration.get(key) ?? { count: 0, completed: 0 };
    current.count++;
    if (item.status === "done" || item.status === "closed") current.completed++;
    byIntegration.set(key, current);
  }

  return ROISummarySchema.parse({
    totalIdeasTracked: metrics.length,
    ideasShipped: shipped.length,
    shipRate: metrics.length > 0 ? shipped.length / metrics.length : 0,
    totalInvestment: +totalInvestment.toFixed(2),
    totalReturn: +totalReturn.toFixed(2),
    aggregateROI:
      totalInvestment > 0
        ? +(((totalReturn - totalInvestment) / totalInvestment) * 100).toFixed(2)
        : 0,
    avgTimeToShipDays: +avgTimeToShip.toFixed(1),
    topPerformers: metrics
      .filter((m) => m.roi > 0)
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 10)
      .map((m) => ({ ideaId: m.ideaId, title: m.ideaTitle, roi: m.roi })),
    byIntegration: Array.from(byIntegration.entries()).map(([type, data]) => ({
      type: type as IntegrationType,
      itemCount: data.count,
      completedCount: data.completed,
    })),
    computedAt: new Date().toISOString(),
  });
}

// ---- Markdown Export ----

/** Export ROI summary as markdown. */
export function roiSummaryToMarkdown(summary: ROISummary): string {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  const lines: string[] = [
    "# Innovation ROI Summary",
    "",
    `**Ideas Tracked:** ${summary.totalIdeasTracked}`,
    `**Ideas Shipped:** ${summary.ideasShipped} (${(summary.shipRate * 100).toFixed(1)}%)`,
    `**Total Investment:** $${fmt(summary.totalInvestment)}`,
    `**Total Return:** $${fmt(summary.totalReturn)}`,
    `**Aggregate ROI:** ${summary.aggregateROI.toFixed(1)}%`,
    `**Avg Time to Ship:** ${summary.avgTimeToShipDays.toFixed(1)} days`,
    "",
  ];

  if (summary.topPerformers.length > 0) {
    lines.push("## Top Performers");
    lines.push("");
    lines.push("| Idea | ROI |");
    lines.push("|------|-----|");
    for (const tp of summary.topPerformers) {
      lines.push(`| ${tp.title} | ${tp.roi.toFixed(1)}% |`);
    }
    lines.push("");
  }

  if (summary.byIntegration.length > 0) {
    lines.push("## By Integration");
    lines.push("");
    lines.push("| Platform | Items | Completed |");
    lines.push("|----------|-------|-----------|");
    for (const bi of summary.byIntegration) {
      lines.push(`| ${bi.type} | ${bi.itemCount} | ${bi.completedCount} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Clear all integration data (for testing). */
export function clearIntegrationData(): void {
  integrations.clear();
  linkedItems.clear();
  roiMetrics.clear();
}
