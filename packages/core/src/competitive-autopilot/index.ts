/**
 * @module competitive-autopilot
 *
 * Competitive Intelligence Auto-Pilot — continuous monitoring of competitor
 * GitHub repos, product launches, patent filings, and job postings with
 * auto-triggered innovation sessions. Provides data source connectors,
 * significance scoring, semantic matching, and competitive landscape dashboard.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Competitive data source types. */
export const CompetitiveSourceSchema = z.enum([
  "github-repo",
  "product-hunt",
  "crunchbase",
  "google-patents",
  "linkedin-jobs",
  "custom",
]);
export type CompetitiveSource = z.infer<typeof CompetitiveSourceSchema>;

/** Threat/opportunity classification. */
export const ThreatLevelSchema = z.enum(["critical", "high", "medium", "low", "informational"]);
export type ThreatLevel = z.infer<typeof ThreatLevelSchema>;

/** Event classification. */
export const EventClassificationSchema = z.enum(["threat", "opportunity", "neutral"]);
export type EventClassification = z.infer<typeof EventClassificationSchema>;

/** A competitive event detected by a data source connector. */
export const CompetitiveEventSchema = z.object({
  id: z.string(),
  source: CompetitiveSourceSchema,
  title: z.string().max(500),
  description: z.string().max(5000),
  url: z.string().max(2000).optional(),
  competitorName: z.string().max(300),
  significanceScore: z.number().min(0).max(1),
  threatLevel: ThreatLevelSchema,
  classification: EventClassificationSchema,
  domains: z.array(z.string().max(200)).max(10),
  detectedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type CompetitiveEvent = z.infer<typeof CompetitiveEventSchema>;

/** Data source connector configuration. */
export const ConnectorConfigSchema = z.object({
  id: z.string().max(200),
  source: CompetitiveSourceSchema,
  name: z.string().max(300),
  enabled: z.boolean().default(true),
  pollIntervalMinutes: z.number().int().min(5).max(10080).default(60),
  filters: z.object({
    competitors: z.array(z.string().max(300)).max(50),
    keywords: z.array(z.string().max(200)).max(50).optional(),
    domains: z.array(z.string().max(200)).max(20).optional(),
  }),
  credentials: z.record(z.string().max(1000)).optional(),
  lastPolledAt: z.string().optional(),
});
export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

/** Auto-trigger rule for launching innovation sessions. */
export const AutoTriggerRuleSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(300),
  condition: z.object({
    minSignificance: z.number().min(0).max(1).default(0.7),
    threatLevels: z.array(ThreatLevelSchema).min(1),
    sources: z.array(CompetitiveSourceSchema).optional(),
    domains: z.array(z.string().max(200)).optional(),
  }),
  action: z.enum(["investigate", "full-pipeline", "alert-only"]),
  enabled: z.boolean().default(true),
  triggerCount: z.number().int().min(0).default(0),
  lastTriggeredAt: z.string().optional(),
});
export type AutoTriggerRule = z.infer<typeof AutoTriggerRuleSchema>;

/** Triggered innovation session reference. */
export const TriggeredSessionSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  ruleId: z.string(),
  action: z.string(),
  subject: z.string().max(5000),
  triggeredAt: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
});
export type TriggeredSession = z.infer<typeof TriggeredSessionSchema>;

/** Competitive landscape entry. */
export const LandscapeEntrySchema = z.object({
  competitorName: z.string().max(300),
  eventCount: z.number().int().min(0),
  recentEvents: z.array(CompetitiveEventSchema).max(10),
  overallThreatLevel: ThreatLevelSchema,
  primaryClassification: EventClassificationSchema,
  activeDomains: z.array(z.string().max(200)).max(20),
  lastActivity: z.string(),
});
export type LandscapeEntry = z.infer<typeof LandscapeEntrySchema>;

/** Timeline entry for dashboard. */
export const TimelineEntrySchema = z.object({
  date: z.string(),
  events: z.array(CompetitiveEventSchema).max(50),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

// ---- In-Memory Stores ----

const connectors = new Map<string, ConnectorConfig>();
const events: CompetitiveEvent[] = [];
const triggerRules = new Map<string, AutoTriggerRule>();
const triggeredSessions: TriggeredSession[] = [];

// ---- Connector Management ----

/** Register a data source connector. */
export function registerConnector(config: ConnectorConfig): ConnectorConfig {
  const validated = ConnectorConfigSchema.parse(config);
  connectors.set(validated.id, validated);
  return validated;
}

/** Get a connector by ID. */
export function getConnector(connectorId: string): ConnectorConfig | undefined {
  return connectors.get(connectorId);
}

/** List all connectors. */
export function listConnectors(): ConnectorConfig[] {
  return [...connectors.values()];
}

/** Enable/disable a connector. */
export function toggleConnector(connectorId: string, enabled: boolean): void {
  const connector = connectors.get(connectorId);
  if (!connector) throw new Error(`Connector ${connectorId} not found`);
  connector.enabled = enabled;
}

// ---- Event Processing ----

/** Score the significance of a competitive event using heuristics + LLM. */
export async function scoreCompetitiveEvent(
  event: Omit<CompetitiveEvent, "id" | "significanceScore" | "threatLevel" | "classification">,
  userDomains: string[],
  options?: { model?: string; signal?: AbortSignal }
): Promise<CompetitiveEvent> {
  const prompt = `You are a competitive intelligence analyst. Score this competitive event.

${wrapUserInput("EVENT", event.title)}
${wrapUserInput("DESCRIPTION", event.description)}
SOURCE: ${event.source}
COMPETITOR: ${event.competitorName}
USER DOMAINS: ${userDomains.join(", ")}

Respond with JSON:
{
  "significanceScore": 0-1 (how significant to the user),
  "threatLevel": "critical" | "high" | "medium" | "low" | "informational",
  "classification": "threat" | "opportunity" | "neutral",
  "domains": ["relevant domains"]
}`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const parsed = (() => {
    try {
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as {
        significanceScore: number;
        threatLevel: ThreatLevel;
        classification: EventClassification;
        domains: string[];
      };
    } catch {
      return undefined;
    }
  })();

  const scored: CompetitiveEvent = {
    id: randomUUID(),
    ...event,
    significanceScore: parsed?.significanceScore ?? 0.5,
    threatLevel: parsed?.threatLevel ?? "medium",
    classification: parsed?.classification ?? "neutral",
    domains: parsed?.domains ?? event.domains,
    detectedAt: event.detectedAt || new Date().toISOString(),
  };

  events.push(scored);
  return scored;
}

/** Record a pre-scored competitive event directly. */
export function recordCompetitiveEvent(event: CompetitiveEvent): CompetitiveEvent {
  const validated = CompetitiveEventSchema.parse(event);
  events.push(validated);
  return validated;
}

/** Get all competitive events. */
export function getCompetitiveEvents(filters?: {
  source?: CompetitiveSource;
  threatLevel?: ThreatLevel;
  competitorName?: string;
  since?: string;
}): CompetitiveEvent[] {
  let result = [...events];
  if (filters?.source) result = result.filter((e) => e.source === filters.source);
  if (filters?.threatLevel) result = result.filter((e) => e.threatLevel === filters.threatLevel);
  if (filters?.competitorName)
    result = result.filter((e) => e.competitorName === filters.competitorName);
  if (filters?.since) result = result.filter((e) => e.detectedAt >= filters.since!);
  return result.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

// ---- Auto-Trigger Rules ----

/** Register an auto-trigger rule. */
export function registerAutoTriggerRule(rule: AutoTriggerRule): AutoTriggerRule {
  const validated = AutoTriggerRuleSchema.parse(rule);
  triggerRules.set(validated.id, validated);
  return validated;
}

/** List auto-trigger rules. */
export function listAutoTriggerRules(): AutoTriggerRule[] {
  return [...triggerRules.values()];
}

/** Evaluate events against auto-trigger rules and generate sessions. */
export function evaluateTriggerRules(newEvents: CompetitiveEvent[]): TriggeredSession[] {
  const sessions: TriggeredSession[] = [];

  for (const rule of triggerRules.values()) {
    if (!rule.enabled) continue;

    for (const event of newEvents) {
      const matches =
        event.significanceScore >= rule.condition.minSignificance &&
        rule.condition.threatLevels.includes(event.threatLevel) &&
        (!rule.condition.sources || rule.condition.sources.includes(event.source)) &&
        (!rule.condition.domains || rule.condition.domains.some((d) => event.domains.includes(d)));

      if (matches) {
        const session: TriggeredSession = {
          id: randomUUID(),
          eventId: event.id,
          ruleId: rule.id,
          action: rule.action,
          subject: `Competitive response: ${event.title} by ${event.competitorName}`,
          triggeredAt: new Date().toISOString(),
          status: "pending",
        };

        sessions.push(session);
        triggeredSessions.push(session);
        rule.triggerCount++;
        rule.lastTriggeredAt = session.triggeredAt;
      }
    }
  }

  return sessions;
}

/** Get all triggered sessions. */
export function getTriggeredSessions(): TriggeredSession[] {
  return [...triggeredSessions];
}

// ---- Competitive Landscape Dashboard ----

/** Generate a competitive landscape overview. */
export function generateLandscape(): LandscapeEntry[] {
  const competitorMap = new Map<string, CompetitiveEvent[]>();

  for (const event of events) {
    const existing = competitorMap.get(event.competitorName) ?? [];
    existing.push(event);
    competitorMap.set(event.competitorName, existing);
  }

  const landscape: LandscapeEntry[] = [];
  for (const [name, competitorEvents] of competitorMap) {
    const sorted = competitorEvents.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    const avgSignificance =
      competitorEvents.reduce((sum, e) => sum + e.significanceScore, 0) / competitorEvents.length;

    let overallThreat: ThreatLevel = "low";
    if (avgSignificance > 0.8) overallThreat = "critical";
    else if (avgSignificance > 0.6) overallThreat = "high";
    else if (avgSignificance > 0.4) overallThreat = "medium";

    const classificationCounts = { threat: 0, opportunity: 0, neutral: 0 };
    competitorEvents.forEach((e) => classificationCounts[e.classification]++);
    const primaryClassification =
      classificationCounts.threat > classificationCounts.opportunity ? "threat" : "opportunity";

    const allDomains = [...new Set(competitorEvents.flatMap((e) => e.domains))];

    landscape.push({
      competitorName: name,
      eventCount: competitorEvents.length,
      recentEvents: sorted.slice(0, 10),
      overallThreatLevel: overallThreat,
      primaryClassification:
        classificationCounts.threat === 0 && classificationCounts.opportunity === 0
          ? "neutral"
          : primaryClassification,
      activeDomains: allDomains.slice(0, 20),
      lastActivity: sorted[0]?.detectedAt ?? "",
    });
  }

  return landscape.sort((a, b) => b.eventCount - a.eventCount);
}

/** Generate a timeline of competitive events. */
export function generateTimeline(days: number = 30): TimelineEntry[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const timeline: TimelineEntry[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now - (i + 1) * dayMs);
    const dayEnd = new Date(now - i * dayMs);
    const dateStr = dayStart.toISOString().split("T")[0];

    const dayEvents = events.filter((e) => {
      const ts = new Date(e.detectedAt).getTime();
      return ts >= dayStart.getTime() && ts < dayEnd.getTime();
    });

    if (dayEvents.length > 0) {
      timeline.push({ date: dateStr, events: dayEvents.slice(0, 50) });
    }
  }

  return timeline;
}

// ---- Store Management ----

/** Clear all competitive autopilot data (for testing). */
export function clearCompetitiveAutopilotData(): void {
  connectors.clear();
  events.length = 0;
  triggerRules.clear();
  triggeredSessions.length = 0;
}
