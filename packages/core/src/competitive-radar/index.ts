/**
 * @module competitive-radar
 *
 * Competitive Intelligence Radar — gap analysis and radar visualization
 * built on top of the competitive-autopilot module. Provides competitor
 * profiling, multi-competitor gap analysis, radar dashboard generation,
 * alert detection, and competitive context injection for investigation prompts.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import { getCompetitiveEvents } from "../competitive-autopilot/index.js";

// ---- Persistence Helpers ----

const RADAR_DIR = path.join(os.homedir(), ".innovator", "competitive-radar");

function ensureRadarDir(): void {
  fs.mkdirSync(RADAR_DIR, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureRadarDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ---- Zod Schemas ----

/** Threat level classification for competitors. */
export const RadarThreatLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RadarThreatLevel = z.infer<typeof RadarThreatLevelSchema>;

/** A recent competitive move by a competitor. */
export const RecentMoveSchema = z.object({
  date: z.string(),
  description: z.string().max(1000),
});

/** Competitor profile with capabilities and assessment. */
export const CompetitorProfileSchema = z.object({
  id: z.string(),
  name: z.string().max(300),
  website: z.string().max(2000).optional(),
  description: z.string().max(5000),
  capabilities: z.array(z.string().max(200)).max(50),
  strengths: z.array(z.string().max(500)).max(20),
  weaknesses: z.array(z.string().max(500)).max(20),
  recentMoves: z.array(RecentMoveSchema).max(50),
  threatLevel: RadarThreatLevelSchema,
  lastUpdated: z.string(),
});
export type CompetitorProfile = z.infer<typeof CompetitorProfileSchema>;

/** Gap status relative to a competitor. */
export const GapStatusSchema = z.enum(["ahead", "parity", "behind", "absent"]);
export type GapStatus = z.infer<typeof GapStatusSchema>;

/** Market demand level. */
export const MarketDemandSchema = z.enum(["low", "medium", "high"]);
export type MarketDemand = z.infer<typeof MarketDemandSchema>;

/** A single gap analysis item comparing a capability. */
export const GapAnalysisItemSchema = z.object({
  capability: z.string().max(200),
  ourStatus: GapStatusSchema,
  competitorStatus: z.string().max(500),
  opportunityScore: z.number().min(0).max(100),
  marketDemand: MarketDemandSchema,
  recommendation: z.string().max(1000),
});
export type GapAnalysisItem = z.infer<typeof GapAnalysisItemSchema>;

/** Overall competitive position. */
export const OverallPositionSchema = z.enum(["leading", "competitive", "trailing", "disrupted"]);
export type OverallPosition = z.infer<typeof OverallPositionSchema>;

/** Full gap analysis report for a competitor. */
export const GapAnalysisReportSchema = z.object({
  competitor: z.string().max(300),
  gaps: z.array(GapAnalysisItemSchema).max(50),
  overallPosition: OverallPositionSchema,
  topOpportunities: z.array(z.string().max(500)).max(10),
  urgentThreats: z.array(z.string().max(500)).max(10),
  summary: z.string().max(5000),
});
export type GapAnalysisReport = z.infer<typeof GapAnalysisReportSchema>;

/** An entry positioned within a radar quadrant. */
export const RadarEntrySchema = z.object({
  name: z.string().max(300),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  description: z.string().max(500).optional(),
});
export type RadarEntry = z.infer<typeof RadarEntrySchema>;

/** A quadrant in the radar visualization. */
export const RadarQuadrantSchema = z.object({
  name: z.string().max(200),
  entries: z.array(RadarEntrySchema).max(50),
});
export type RadarQuadrant = z.infer<typeof RadarQuadrantSchema>;

/** Alert types for significant competitor moves. */
export const AlertTypeSchema = z.enum([
  "new-feature",
  "pivot",
  "acquisition",
  "hire",
  "patent",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

/** Severity levels for alerts. */
export const AlertSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

/** A competitive alert for significant competitor activity. */
export const CompetitiveAlertSchema = z.object({
  id: z.string(),
  type: AlertTypeSchema,
  competitor: z.string().max(300),
  title: z.string().max(500),
  description: z.string().max(5000),
  severity: AlertSeveritySchema,
  detectedAt: z.string(),
  actionRequired: z.boolean(),
});
export type CompetitiveAlert = z.infer<typeof CompetitiveAlertSchema>;

/** Full radar dashboard with quadrants, competitors, and alerts. */
export const RadarDashboardSchema = z.object({
  quadrants: z.array(RadarQuadrantSchema).max(8),
  competitors: z.array(CompetitorProfileSchema).max(50),
  alerts: z.array(CompetitiveAlertSchema).max(100),
  lastScanned: z.string(),
  trendAnalysis: z.string().max(5000),
});
export type RadarDashboard = z.infer<typeof RadarDashboardSchema>;

// ---- Persistence Paths ----

const COMPETITORS_FILE = path.join(RADAR_DIR, "competitors.json");
const ALERTS_FILE = path.join(RADAR_DIR, "alerts.json");

// ---- Competitor Management ----

function loadCompetitors(): CompetitorProfile[] {
  return readJsonFile<CompetitorProfile[]>(COMPETITORS_FILE, []);
}

function saveCompetitors(profiles: CompetitorProfile[]): void {
  writeJsonFile(COMPETITORS_FILE, profiles);
}

/** Register a new competitor profile. */
export function addCompetitor(profile: CompetitorProfile): CompetitorProfile {
  const validated = CompetitorProfileSchema.parse(profile);
  const competitors = loadCompetitors();
  const existing = competitors.findIndex((c) => c.id === validated.id);
  if (existing !== -1) {
    throw new Error(`Competitor with id "${validated.id}" already exists`);
  }
  competitors.push(validated);
  saveCompetitors(competitors);
  return validated;
}

/** Update an existing competitor profile. */
export function updateCompetitor(
  id: string,
  updates: Partial<Omit<CompetitorProfile, "id">>
): CompetitorProfile {
  const competitors = loadCompetitors();
  const index = competitors.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new Error(`Competitor "${id}" not found`);
  }
  const updated = CompetitorProfileSchema.parse({
    ...competitors[index],
    ...updates,
    id,
    lastUpdated: updates.lastUpdated ?? new Date().toISOString(),
  });
  competitors[index] = updated;
  saveCompetitors(competitors);
  return updated;
}

/** Retrieve a competitor profile by ID. */
export function getCompetitor(id: string): CompetitorProfile | undefined {
  return loadCompetitors().find((c) => c.id === id);
}

/** List all registered competitor profiles. */
export function listCompetitors(): CompetitorProfile[] {
  return loadCompetitors();
}

// ---- Gap Analysis ----

/** Run gap analysis comparing our capabilities against a single competitor. */
export async function runGapAnalysis(
  competitorId: string,
  ourCapabilities: string[],
  model?: string
): Promise<GapAnalysisReport> {
  const competitor = getCompetitor(competitorId);
  if (!competitor) {
    throw new Error(`Competitor "${competitorId}" not found`);
  }

  const allCapabilities = Array.from(
    new Set([...ourCapabilities, ...competitor.capabilities])
  );

  const prompt = `You are a competitive intelligence analyst performing a gap analysis.

Compare our capabilities against a competitor.

${wrapUserInput("OUR_CAPABILITIES", ourCapabilities.join(", "))}
${wrapUserInput("COMPETITOR_NAME", competitor.name)}
${wrapUserInput("COMPETITOR_CAPABILITIES", competitor.capabilities.join(", "))}
${wrapUserInput("COMPETITOR_STRENGTHS", competitor.strengths.join(", "))}
${wrapUserInput("COMPETITOR_WEAKNESSES", competitor.weaknesses.join(", "))}
ALL CAPABILITIES TO ANALYZE: ${allCapabilities.join(", ")}

Respond with JSON:
{
  "gaps": [
    {
      "capability": "capability name",
      "ourStatus": "ahead" | "parity" | "behind" | "absent",
      "competitorStatus": "description of their status",
      "opportunityScore": 0-100,
      "marketDemand": "low" | "medium" | "high",
      "recommendation": "what to do"
    }
  ],
  "overallPosition": "leading" | "competitive" | "trailing" | "disrupted",
  "topOpportunities": ["opportunity 1", "opportunity 2"],
  "urgentThreats": ["threat 1", "threat 2"],
  "summary": "brief overall analysis"
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, model })
  );

  const parsed = (() => {
    try {
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as {
        gaps: GapAnalysisItem[];
        overallPosition: OverallPosition;
        topOpportunities: string[];
        urgentThreats: string[];
        summary: string;
      };
    } catch {
      return undefined;
    }
  })();

  const report: GapAnalysisReport = {
    competitor: competitor.name,
    gaps: parsed?.gaps ?? [],
    overallPosition: parsed?.overallPosition ?? "competitive",
    topOpportunities: parsed?.topOpportunities ?? [],
    urgentThreats: parsed?.urgentThreats ?? [],
    summary: parsed?.summary ?? "Gap analysis could not be completed.",
  };

  return GapAnalysisReportSchema.parse(report);
}

/** Run gap analysis across multiple competitors simultaneously. */
export async function runMultiCompetitorGapAnalysis(
  competitorIds: string[],
  ourCapabilities: string[],
  model?: string
): Promise<GapAnalysisReport[]> {
  const reports = await Promise.all(
    competitorIds.map((id) => runGapAnalysis(id, ourCapabilities, model))
  );
  return reports;
}

/** Convert a gap analysis report to a readable markdown string. */
export function gapReportToMarkdown(report: GapAnalysisReport): string {
  const lines: string[] = [];
  lines.push(`# Gap Analysis: ${report.competitor}`);
  lines.push("");
  lines.push(`**Overall Position:** ${report.overallPosition}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(report.summary);
  lines.push("");

  if (report.topOpportunities.length > 0) {
    lines.push(`## Top Opportunities`);
    report.topOpportunities.forEach((o) => lines.push(`- ${o}`));
    lines.push("");
  }

  if (report.urgentThreats.length > 0) {
    lines.push(`## Urgent Threats`);
    report.urgentThreats.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  if (report.gaps.length > 0) {
    lines.push(`## Capability Gaps`);
    lines.push("");
    lines.push("| Capability | Our Status | Competitor Status | Opportunity | Market Demand | Recommendation |");
    lines.push("|------------|-----------|-------------------|-------------|---------------|----------------|");
    report.gaps.forEach((g) => {
      lines.push(
        `| ${g.capability} | ${g.ourStatus} | ${g.competitorStatus} | ${g.opportunityScore} | ${g.marketDemand} | ${g.recommendation} |`
      );
    });
    lines.push("");
  }

  return lines.join("\n");
}

// ---- Radar Dashboard ----

const DEFAULT_QUADRANTS = [
  "Technology & Innovation",
  "Market & Growth",
  "Product & Features",
  "Talent & Operations",
];

/** Generate radar dashboard with quadrant positioning of competitors. */
export async function generateRadarDashboard(options?: {
  model?: string;
  quadrantNames?: string[];
}): Promise<RadarDashboard> {
  const competitors = loadCompetitors();
  const quadrantNames = options?.quadrantNames ?? DEFAULT_QUADRANTS;
  const alerts = loadAlerts();

  if (competitors.length === 0) {
    return RadarDashboardSchema.parse({
      quadrants: quadrantNames.map((name) => ({ name, entries: [] })),
      competitors: [],
      alerts,
      lastScanned: new Date().toISOString(),
      trendAnalysis: "No competitors registered. Add competitors to generate radar analysis.",
    });
  }

  const prompt = `You are a competitive intelligence analyst building a radar visualization.

Given these competitors and quadrant categories, position each competitor in the relevant quadrants.

COMPETITORS:
${competitors.map((c) => `- ${c.name}: ${c.description} (threat: ${c.threatLevel}, capabilities: ${c.capabilities.join(", ")})`).join("\n")}

QUADRANTS: ${quadrantNames.join(", ")}

For each quadrant, assign competitor entries with x (0-1, left=low impact, right=high impact) and y (0-1, bottom=low urgency, top=high urgency) positions.

Also provide a trend analysis summarizing the competitive landscape.

Respond with JSON:
{
  "quadrants": [
    {
      "name": "quadrant name",
      "entries": [
        { "name": "competitor name", "x": 0.5, "y": 0.7, "description": "brief note" }
      ]
    }
  ],
  "trendAnalysis": "overall trend summary"
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, model: options?.model })
  );

  const parsed = (() => {
    try {
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as {
        quadrants: RadarQuadrant[];
        trendAnalysis: string;
      };
    } catch {
      return undefined;
    }
  })();

  const dashboard: RadarDashboard = {
    quadrants: parsed?.quadrants ?? quadrantNames.map((name) => ({ name, entries: [] })),
    competitors,
    alerts,
    lastScanned: new Date().toISOString(),
    trendAnalysis: parsed?.trendAnalysis ?? "Trend analysis unavailable.",
  };

  return RadarDashboardSchema.parse(dashboard);
}

// ---- Alerts ----

function loadAlerts(): CompetitiveAlert[] {
  return readJsonFile<CompetitiveAlert[]>(ALERTS_FILE, []);
}

function saveAlerts(alerts: CompetitiveAlert[]): void {
  writeJsonFile(ALERTS_FILE, alerts);
}

/** Scan recent competitive events and generate alerts for significant moves. */
export async function checkForAlerts(options?: {
  model?: string;
  since?: string;
}): Promise<CompetitiveAlert[]> {
  const since = options?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentEvents = getCompetitiveEvents({ since });

  if (recentEvents.length === 0) {
    return [];
  }

  const prompt = `You are a competitive intelligence analyst. Review these recent competitive events and identify significant moves that warrant alerts.

EVENTS:
${recentEvents
  .map(
    (e) =>
      `- [${e.source}] ${e.competitorName}: ${e.title} (significance: ${e.significanceScore}, threat: ${e.threatLevel})`
  )
  .join("\n")}

For each significant event, classify it and determine severity.

Respond with JSON:
{
  "alerts": [
    {
      "type": "new-feature" | "pivot" | "acquisition" | "hire" | "patent",
      "competitor": "competitor name",
      "title": "alert title",
      "description": "what happened and why it matters",
      "severity": "low" | "medium" | "high" | "critical",
      "actionRequired": true/false
    }
  ]
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, model: options?.model })
  );

  const parsed = (() => {
    try {
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as {
        alerts: Array<Omit<CompetitiveAlert, "id" | "detectedAt">>;
      };
    } catch {
      return undefined;
    }
  })();

  const newAlerts: CompetitiveAlert[] = (parsed?.alerts ?? []).map((a) =>
    CompetitiveAlertSchema.parse({
      ...a,
      id: randomUUID(),
      detectedAt: new Date().toISOString(),
    })
  );

  if (newAlerts.length > 0) {
    const existing = loadAlerts();
    saveAlerts([...existing, ...newAlerts]);
  }

  return newAlerts;
}

/** Convert a radar dashboard to a readable markdown string. */
export function radarDashboardToMarkdown(dashboard: RadarDashboard): string {
  const lines: string[] = [];
  lines.push("# Competitive Radar Dashboard");
  lines.push("");
  lines.push(`*Last scanned: ${dashboard.lastScanned}*`);
  lines.push("");

  lines.push("## Trend Analysis");
  lines.push(dashboard.trendAnalysis);
  lines.push("");

  if (dashboard.quadrants.length > 0) {
    lines.push("## Radar Quadrants");
    lines.push("");
    for (const quadrant of dashboard.quadrants) {
      lines.push(`### ${quadrant.name}`);
      if (quadrant.entries.length === 0) {
        lines.push("*No entries*");
      } else {
        lines.push("| Competitor | Position (x,y) | Notes |");
        lines.push("|------------|----------------|-------|");
        for (const entry of quadrant.entries) {
          lines.push(
            `| ${entry.name} | (${entry.x.toFixed(2)}, ${entry.y.toFixed(2)}) | ${entry.description ?? ""} |`
          );
        }
      }
      lines.push("");
    }
  }

  if (dashboard.competitors.length > 0) {
    lines.push("## Competitors");
    lines.push("");
    lines.push("| Name | Threat Level | Capabilities | Last Updated |");
    lines.push("|------|-------------|-------------|--------------|");
    for (const c of dashboard.competitors) {
      lines.push(
        `| ${c.name} | ${c.threatLevel} | ${c.capabilities.slice(0, 3).join(", ")}${c.capabilities.length > 3 ? "..." : ""} | ${c.lastUpdated} |`
      );
    }
    lines.push("");
  }

  if (dashboard.alerts.length > 0) {
    lines.push("## Active Alerts");
    lines.push("");
    for (const alert of dashboard.alerts) {
      const icon = alert.severity === "critical" ? "🔴" : alert.severity === "high" ? "🟠" : alert.severity === "medium" ? "🟡" : "🟢";
      lines.push(`- ${icon} **[${alert.type}]** ${alert.title} — ${alert.competitor} (${alert.severity})${alert.actionRequired ? " ⚠️ Action Required" : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---- Competitive Context Injection ----

/** Generate relevant competitive context for injection into investigation prompts. */
export async function getCompetitiveContext(
  subject: string,
  options?: { model?: string }
): Promise<string> {
  const competitors = loadCompetitors();
  const recentEvents = getCompetitiveEvents({});
  const alerts = loadAlerts();

  if (competitors.length === 0 && recentEvents.length === 0) {
    return "";
  }

  const prompt = `You are a competitive intelligence analyst. Given a subject being investigated, produce a brief competitive context summary that would be useful background for the investigation.

${wrapUserInput("SUBJECT", subject)}

COMPETITORS:
${competitors
  .map(
    (c) =>
      `- ${c.name} (${c.threatLevel}): ${c.description}. Capabilities: ${c.capabilities.join(", ")}`
  )
  .join("\n")}

RECENT EVENTS (last 10):
${recentEvents
  .slice(0, 10)
  .map((e) => `- ${e.competitorName}: ${e.title} (${e.threatLevel})`)
  .join("\n")}

ACTIVE ALERTS:
${alerts
  .slice(-5)
  .map((a) => `- [${a.type}] ${a.competitor}: ${a.title}`)
  .join("\n") || "None"}

Produce a concise 2-4 paragraph competitive context summary relevant to the subject. Focus only on information directly relevant to the subject being investigated.`;

  const raw = await withRetry(() =>
    generateText({ prompt, model: options?.model })
  );

  return raw.trim();
}

/** Clear all competitor data (for testing). */
export function clearCompetitorData(): void {
  saveCompetitors([]);
}
