/**
 * @module outcome-tracking/connectors
 *
 * Integration connectors for bidirectional sync with external project
 * management tools (Jira, Linear, GitHub Projects) and attribution engine
 * for mapping shipped features back to originating innovation sessions.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Connector Schemas ----

export const ConnectorProviderSchema = z.enum([
  "github-projects",
  "jira",
  "linear",
  "asana",
  "trello",
]);
export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>;

export const SyncDirectionSchema = z.enum(["push", "pull", "bidirectional"]);
export type SyncDirection = z.infer<typeof SyncDirectionSchema>;

export const ConnectorConfigSchema = z.object({
  id: z.string().max(100),
  provider: ConnectorProviderSchema,
  name: z.string().max(200),
  baseUrl: z.string().max(2000).optional(),
  projectKey: z.string().max(200).optional(),
  syncDirection: SyncDirectionSchema.default("bidirectional"),
  fieldMapping: z.record(z.string().max(200)).default({}),
  enabled: z.boolean().default(true),
  lastSyncAt: z.string().optional(),
  syncIntervalMs: z.number().int().min(60000).default(300000),
  createdAt: z.string(),
});
export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

export const SyncEventSchema = z.object({
  id: z.string().max(100),
  connectorId: z.string().max(100),
  direction: SyncDirectionSchema,
  itemsSynced: z.number().int().min(0),
  itemsFailed: z.number().int().min(0),
  status: z.enum(["success", "partial", "failed"]),
  error: z.string().max(2000).optional(),
  timestamp: z.string(),
  durationMs: z.number().min(0),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

// ---- Attribution Schemas ----

export const AttributionSchema = z.object({
  id: z.string().max(100),
  outcomeId: z.string().max(100),
  sessionId: z.string().max(100),
  angleId: z.string().max(100).optional(),
  ideaTitle: z.string().max(500),
  shippedFeature: z.string().max(500),
  shippedAt: z.string().optional(),
  externalId: z.string().max(200).optional(),
  externalUrl: z.string().max(2000).optional(),
  revenueImpact: z.number().min(0).optional(),
  confidenceScore: z.number().min(0).max(1).default(1),
  createdAt: z.string(),
});
export type Attribution = z.infer<typeof AttributionSchema>;

export const AttributionReportSchema = z.object({
  totalAttributions: z.number().int().min(0),
  totalRevenueAttributed: z.number().min(0),
  bySession: z
    .array(
      z.object({
        sessionId: z.string(),
        attributionCount: z.number(),
        revenue: z.number(),
      })
    )
    .max(100),
  byAngle: z
    .array(
      z.object({
        angleId: z.string(),
        attributionCount: z.number(),
        revenue: z.number(),
        avgConfidence: z.number(),
      })
    )
    .max(50),
  topFeatures: z
    .array(
      z.object({
        feature: z.string(),
        ideaTitle: z.string(),
        revenue: z.number(),
      })
    )
    .max(20),
  generatedAt: z.string(),
});
export type AttributionReport = z.infer<typeof AttributionReportSchema>;

// ---- Cohort Analysis ----

export const CohortSchema = z.object({
  cohortId: z.string().max(100),
  period: z.string().max(20),
  totalIdeas: z.number().int().min(0),
  shippedIdeas: z.number().int().min(0),
  shipRate: z.number().min(0).max(1),
  avgTimeToValue: z.number().nullable(),
  totalRevenue: z.number().min(0),
  revenuePerIdea: z.number().min(0),
});
export type Cohort = z.infer<typeof CohortSchema>;

// ---- In-Memory Store ----

const connectors = new Map<string, ConnectorConfig>();
const syncHistory: SyncEvent[] = [];
const attributions = new Map<string, Attribution>();

// ---- Connector Management ----

/**
 * Register an integration connector.
 */
export function registerConnectorConfig(
  config: Omit<ConnectorConfig, "id" | "createdAt">
): ConnectorConfig {
  const connector: ConnectorConfig = {
    ...config,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const validated = ConnectorConfigSchema.parse(connector);
  connectors.set(validated.id, validated);
  return validated;
}

/**
 * Get a connector by ID.
 */
export function getConnectorConfig(id: string): ConnectorConfig | undefined {
  return connectors.get(id);
}

/**
 * List all registered connectors.
 */
export function listConnectorConfigs(): ConnectorConfig[] {
  return Array.from(connectors.values());
}

/**
 * Remove a connector.
 */
export function removeConnectorConfig(id: string): boolean {
  return connectors.delete(id);
}

/**
 * Simulate a sync operation with an external provider.
 */
export function simulateSync(connectorId: string, itemCount: number = 0): SyncEvent {
  const connector = connectors.get(connectorId);
  if (!connector) throw new ValidationError(`Connector "${connectorId}" not found`);
  if (!connector.enabled) throw new ValidationError(`Connector "${connectorId}" is disabled`);

  const event: SyncEvent = {
    id: randomUUID(),
    connectorId,
    direction: connector.syncDirection,
    itemsSynced: itemCount,
    itemsFailed: 0,
    status: "success",
    timestamp: new Date().toISOString(),
    durationMs: Math.random() * 2000 + 500,
  };

  connector.lastSyncAt = event.timestamp;
  syncHistory.push(event);

  // Keep bounded
  if (syncHistory.length > 1000) syncHistory.splice(0, syncHistory.length - 500);

  return event;
}

/**
 * Get sync history for a connector.
 */
export function getSyncHistory(connectorId?: string): SyncEvent[] {
  if (connectorId) {
    return syncHistory.filter((e) => e.connectorId === connectorId);
  }
  return [...syncHistory];
}

// ---- Attribution Engine ----

/**
 * Create an attribution linking a shipped feature back to its originating idea/session.
 */
export function createAttribution(params: {
  outcomeId: string;
  sessionId: string;
  angleId?: string;
  ideaTitle: string;
  shippedFeature: string;
  shippedAt?: string;
  externalId?: string;
  externalUrl?: string;
  revenueImpact?: number;
  confidenceScore?: number;
}): Attribution {
  const attribution: Attribution = {
    id: randomUUID(),
    outcomeId: params.outcomeId,
    sessionId: params.sessionId,
    angleId: params.angleId,
    ideaTitle: params.ideaTitle,
    shippedFeature: params.shippedFeature,
    shippedAt: params.shippedAt,
    externalId: params.externalId,
    externalUrl: params.externalUrl,
    revenueImpact: params.revenueImpact,
    confidenceScore: params.confidenceScore ?? 1,
    createdAt: new Date().toISOString(),
  };
  const validated = AttributionSchema.parse(attribution);
  attributions.set(validated.id, validated);
  return validated;
}

/**
 * Get all attributions.
 */
export function listAttributions(filter?: { sessionId?: string; angleId?: string }): Attribution[] {
  let list = Array.from(attributions.values());
  if (filter?.sessionId) list = list.filter((a) => a.sessionId === filter.sessionId);
  if (filter?.angleId) list = list.filter((a) => a.angleId === filter.angleId);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Generate an attribution report.
 */
export function generateAttributionReport(): AttributionReport {
  const all = Array.from(attributions.values());
  const totalRevenue = all.reduce((sum, a) => sum + (a.revenueImpact ?? 0), 0);

  // By session
  const sessionMap = new Map<string, { count: number; revenue: number }>();
  for (const a of all) {
    const existing = sessionMap.get(a.sessionId) ?? { count: 0, revenue: 0 };
    existing.count++;
    existing.revenue += a.revenueImpact ?? 0;
    sessionMap.set(a.sessionId, existing);
  }

  // By angle
  const angleMap = new Map<string, { count: number; revenue: number; confidenceSum: number }>();
  for (const a of all) {
    const key = a.angleId ?? "unknown";
    const existing = angleMap.get(key) ?? { count: 0, revenue: 0, confidenceSum: 0 };
    existing.count++;
    existing.revenue += a.revenueImpact ?? 0;
    existing.confidenceSum += a.confidenceScore;
    angleMap.set(key, existing);
  }

  return {
    totalAttributions: all.length,
    totalRevenueAttributed: totalRevenue,
    bySession: Array.from(sessionMap.entries()).map(([sessionId, data]) => ({
      sessionId,
      attributionCount: data.count,
      revenue: data.revenue,
    })),
    byAngle: Array.from(angleMap.entries()).map(([angleId, data]) => ({
      angleId,
      attributionCount: data.count,
      revenue: data.revenue,
      avgConfidence: data.count > 0 ? data.confidenceSum / data.count : 0,
    })),
    topFeatures: all
      .filter((a) => a.revenueImpact && a.revenueImpact > 0)
      .sort((a, b) => (b.revenueImpact ?? 0) - (a.revenueImpact ?? 0))
      .slice(0, 20)
      .map((a) => ({
        feature: a.shippedFeature,
        ideaTitle: a.ideaTitle,
        revenue: a.revenueImpact ?? 0,
      })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate cohort analysis grouping outcomes by creation month.
 */
export function generateCohortAnalysis(
  outcomes: Array<{
    createdAt: string;
    stage: string;
    timeToValueDays?: number;
    revenueMetrics: Array<{ value: number }>;
  }>
): Cohort[] {
  const cohorts = new Map<
    string,
    {
      total: number;
      shipped: number;
      ttv: number[];
      revenue: number;
    }
  >();

  for (const o of outcomes) {
    const month = o.createdAt.slice(0, 7); // YYYY-MM
    const existing = cohorts.get(month) ?? { total: 0, shipped: 0, ttv: [], revenue: 0 };
    existing.total++;
    if (o.stage === "shipped" || o.stage === "measured") {
      existing.shipped++;
      if (o.timeToValueDays != null) existing.ttv.push(o.timeToValueDays);
    }
    existing.revenue += o.revenueMetrics.reduce((s, m) => s + m.value, 0);
    cohorts.set(month, existing);
  }

  return Array.from(cohorts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      cohortId: `cohort-${period}`,
      period,
      totalIdeas: data.total,
      shippedIdeas: data.shipped,
      shipRate: data.total > 0 ? data.shipped / data.total : 0,
      avgTimeToValue:
        data.ttv.length > 0
          ? Math.round(data.ttv.reduce((a, b) => a + b, 0) / data.ttv.length)
          : null,
      totalRevenue: data.revenue,
      revenuePerIdea: data.total > 0 ? data.revenue / data.total : 0,
    }));
}

/**
 * Clear all connector and attribution data (for testing).
 */
export function clearConnectorData(): void {
  connectors.clear();
  syncHistory.length = 0;
  attributions.clear();
}
