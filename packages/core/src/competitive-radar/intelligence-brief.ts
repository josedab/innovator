/**
 * @module competitive-radar/intelligence-brief
 *
 * Automated weekly intelligence briefs, patent monitoring, and market change
 * tracking. Aggregates competitive signals, patent filings, and market
 * movements into structured intelligence reports.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { listCompetitors, checkForAlerts } from "./index.js";
import type { CompetitorProfile, CompetitiveAlert } from "./index.js";

// ---- Patent Monitoring ----

export const PatentStatusSchema = z.enum(["filed", "published", "granted", "expired", "abandoned"]);
export type PatentStatus = z.infer<typeof PatentStatusSchema>;

export const PatentEntrySchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  applicant: z.string().max(300),
  filingDate: z.string(),
  status: PatentStatusSchema,
  relevanceScore: z.number().min(0).max(100),
  abstract: z.string().max(2000),
  domain: z.string().max(200),
  threatLevel: z.enum(["low", "medium", "high"]).default("low"),
});
export type PatentEntry = z.infer<typeof PatentEntrySchema>;

// ---- Market Signals ----

export const MarketSignalTypeSchema = z.enum([
  "funding",
  "acquisition",
  "product_launch",
  "partnership",
  "regulation",
  "market_shift",
  "talent_move",
]);
export type MarketSignalType = z.infer<typeof MarketSignalTypeSchema>;

export const MarketSignalSchema = z.object({
  id: z.string(),
  type: MarketSignalTypeSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  source: z.string().max(500).optional(),
  date: z.string(),
  impactScore: z.number().min(0).max(100),
  relatedCompetitors: z.array(z.string().max(300)).max(10),
  actionRequired: z.boolean().default(false),
});
export type MarketSignal = z.infer<typeof MarketSignalSchema>;

// ---- Intelligence Brief ----

export const BriefSectionSchema = z.object({
  title: z.string().max(200),
  content: z.string().max(5000),
  priority: z.enum(["low", "medium", "high", "critical"]),
  relatedCompetitors: z.array(z.string().max(300)).max(10),
});
export type BriefSection = z.infer<typeof BriefSectionSchema>;

export const IntelligenceBriefSchema = z.object({
  id: z.string(),
  period: z.enum(["daily", "weekly", "monthly"]),
  generatedAt: z.string(),
  executiveSummary: z.string().max(3000),
  sections: z.array(BriefSectionSchema),
  patents: z.array(PatentEntrySchema),
  marketSignals: z.array(MarketSignalSchema),
  alerts: z.array(
    z.object({
      title: z.string().max(500),
      severity: z.string(),
      competitor: z.string().max(300),
    })
  ),
  recommendations: z.array(
    z.object({
      action: z.string().max(1000),
      priority: z.enum(["low", "medium", "high", "critical"]),
      rationale: z.string().max(2000),
    })
  ),
  overallThreatLevel: z.enum(["stable", "elevated", "high", "critical"]),
});
export type IntelligenceBrief = z.infer<typeof IntelligenceBriefSchema>;

// ---- In-Memory Stores ----

const patents = new Map<string, PatentEntry>();
const marketSignals = new Map<string, MarketSignal>();
const briefs = new Map<string, IntelligenceBrief>();

// ---- Patent Monitoring ----

/** Add a patent entry to track. */
export function addPatent(
  entry: Omit<PatentEntry, "id" | "threatLevel"> & { threatLevel?: PatentEntry["threatLevel"] }
): PatentEntry {
  const patent = PatentEntrySchema.parse({ ...entry, id: randomUUID() });
  patents.set(patent.id, patent);
  return patent;
}

/** List all tracked patents, optionally filtered by applicant. */
export function listPatents(filter?: {
  applicant?: string;
  minRelevance?: number;
  status?: PatentStatus;
}): PatentEntry[] {
  let results = Array.from(patents.values());
  if (filter?.applicant) {
    results = results.filter((p) =>
      p.applicant.toLowerCase().includes(filter.applicant!.toLowerCase())
    );
  }
  if (filter?.minRelevance !== undefined) {
    results = results.filter((p) => p.relevanceScore >= filter.minRelevance!);
  }
  if (filter?.status) {
    results = results.filter((p) => p.status === filter.status);
  }
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Remove a patent entry. */
export function removePatent(id: string): boolean {
  return patents.delete(id);
}

// ---- Market Signal Tracking ----

/** Add a market signal. */
export function addMarketSignal(
  signal: Omit<MarketSignal, "id" | "actionRequired"> & { actionRequired?: boolean }
): MarketSignal {
  const entry = MarketSignalSchema.parse({ ...signal, id: randomUUID() });
  marketSignals.set(entry.id, entry);
  return entry;
}

/** List market signals with optional filtering. */
export function listMarketSignals(filter?: {
  type?: MarketSignalType;
  minImpact?: number;
  actionRequired?: boolean;
  since?: string;
}): MarketSignal[] {
  let results = Array.from(marketSignals.values());
  if (filter?.type) {
    results = results.filter((s) => s.type === filter.type);
  }
  if (filter?.minImpact !== undefined) {
    results = results.filter((s) => s.impactScore >= filter.minImpact!);
  }
  if (filter?.actionRequired !== undefined) {
    results = results.filter((s) => s.actionRequired === filter.actionRequired);
  }
  if (filter?.since) {
    results = results.filter((s) => s.date >= filter.since!);
  }
  return results.sort((a, b) => b.impactScore - a.impactScore);
}

/** Remove a market signal. */
export function removeMarketSignal(id: string): boolean {
  return marketSignals.delete(id);
}

// ---- Intelligence Brief Generation ----

function createBriefSection(
  title: string,
  content: string,
  priority: BriefSection["priority"],
  relatedCompetitors: string[] = []
): BriefSection {
  return { title, content, priority, relatedCompetitors: relatedCompetitors.slice(0, 10) };
}

function buildHeuristicExecutiveSummary(
  period: IntelligenceBrief["period"],
  competitors: CompetitorProfile[],
  patentList: PatentEntry[],
  signals: MarketSignal[],
  alerts: CompetitiveAlert[]
): string {
  const highestThreat = competitors
    .slice()
    .sort((a, b) => threatRank(b.threatLevel) - threatRank(a.threatLevel))[0];
  const urgentSignals = signals.filter((signal) => signal.impactScore >= 75).length;
  return [
    `This ${period} brief covers ${competitors.length} tracked competitors, ${signals.length} market signal(s), ${patentList.length} relevant patent filing(s), and ${alerts.length} alert(s).`,
    highestThreat
      ? `${highestThreat.name} currently represents the strongest watch item based on its ${highestThreat.threatLevel} threat level and capabilities in ${highestThreat.capabilities.slice(0, 3).join(", ") || "core areas"}.`
      : "No competitor currently stands out as a dominant threat, so the focus should stay on broad market surveillance.",
    urgentSignals > 0
      ? `${urgentSignals} signal(s) exceeded the high-impact threshold, indicating the market is moving quickly enough to justify active response planning.`
      : "Signal volume remains manageable, so the team can focus on validating the next response bets instead of broad defensive action.",
  ].join(" ");
}

function threatRank(level: CompetitorProfile["threatLevel"]): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[level] ?? 0;
}

function buildHeuristicSections(
  competitors: CompetitorProfile[],
  patentList: PatentEntry[],
  signals: MarketSignal[],
  alerts: CompetitiveAlert[]
): BriefSection[] {
  const sections: BriefSection[] = [];

  if (competitors.length > 0) {
    const topCompetitors = competitors
      .slice()
      .sort((a, b) => threatRank(b.threatLevel) - threatRank(a.threatLevel))
      .slice(0, 3);
    sections.push(
      createBriefSection(
        "Competitive posture",
        topCompetitors
          .map(
            (competitor) =>
              `${competitor.name} is rated ${competitor.threatLevel} and shows strength in ${competitor.capabilities.slice(0, 3).join(", ") || "core execution"}; weaknesses include ${competitor.weaknesses.slice(0, 2).join(", ") || "limited disclosed weaknesses"}.`
          )
          .join(" "),
        topCompetitors.some((competitor) => competitor.threatLevel === "critical")
          ? "critical"
          : "high",
        topCompetitors.map((competitor) => competitor.name)
      )
    );
  }

  if (alerts.length > 0) {
    const highestSeverity = alerts.some((alert) => alert.severity === "critical")
      ? "critical"
      : alerts.some((alert) => alert.severity === "high")
        ? "high"
        : "medium";
    sections.push(
      createBriefSection(
        "Immediate alert coverage",
        alerts
          .slice(0, 5)
          .map(
            (alert) =>
              `${alert.competitor}: ${alert.title} (${alert.severity})${alert.actionRequired ? " — requires action" : ""}.`
          )
          .join(" "),
        highestSeverity,
        alerts.map((alert) => alert.competitor)
      )
    );
  }

  if (signals.length > 0) {
    const byType = new Map<MarketSignalType, number>();
    for (const signal of signals) {
      byType.set(signal.type, (byType.get(signal.type) ?? 0) + 1);
    }
    const leadingTypes = Array.from(byType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type.replace(/_/g, " ")} (${count})`);
    sections.push(
      createBriefSection(
        "Market movement",
        `Most notable movement came from ${leadingTypes.join(", ") || "general market activity"}. Top signal(s): ${signals
          .slice(0, 3)
          .map((signal) => `${signal.title} (${signal.impactScore})`)
          .join(", ")}.`,
        signals.some((signal) => signal.impactScore >= 85) ? "high" : "medium",
        signals.flatMap((signal) => signal.relatedCompetitors)
      )
    );
  }

  if (patentList.length > 0) {
    const topPatents = patentList.slice(0, 3);
    sections.push(
      createBriefSection(
        "Patent activity",
        topPatents
          .map(
            (patent) =>
              `${patent.applicant} ${patent.status} ${patent.title} with relevance ${patent.relevanceScore} and ${patent.threatLevel} threat.`
          )
          .join(" "),
        topPatents.some((patent) => patent.threatLevel === "high") ? "high" : "medium",
        topPatents.map((patent) => patent.applicant)
      )
    );
  }

  return sections.slice(0, 10);
}

function buildHeuristicRecommendations(
  competitors: CompetitorProfile[],
  patentList: PatentEntry[],
  signals: MarketSignal[],
  alerts: CompetitiveAlert[]
): IntelligenceBrief["recommendations"] {
  const recommendations = new Map<string, IntelligenceBrief["recommendations"][number]>();

  for (const alert of alerts.filter((entry) => entry.actionRequired)) {
    recommendations.set(`alert:${alert.id}`, {
      action: `Review response plan for ${alert.competitor}: ${alert.title}`,
      priority: alert.severity,
      rationale: alert.description,
    });
  }

  for (const patent of patentList.filter((entry) => entry.threatLevel === "high")) {
    recommendations.set(`patent:${patent.id}`, {
      action: `Assess IP exposure around ${patent.title}`,
      priority: "high",
      rationale: `${patent.applicant} has a ${patent.status} patent in ${patent.domain} with ${patent.relevanceScore} relevance.`,
    });
  }

  for (const signal of signals.filter((entry) => entry.actionRequired || entry.impactScore >= 80)) {
    recommendations.set(`signal:${signal.id}`, {
      action: `Prepare a response to ${signal.type.replace(/_/g, " ")}: ${signal.title}`,
      priority:
        signal.impactScore >= 90 ? "critical" : signal.impactScore >= 80 ? "high" : "medium",
      rationale: signal.description,
    });
  }

  if (recommendations.size === 0 && competitors.length > 0) {
    const highestThreat = competitors
      .slice()
      .sort((a, b) => threatRank(b.threatLevel) - threatRank(a.threatLevel))[0];
    recommendations.set("baseline-monitoring", {
      action: `Schedule deeper monitoring for ${highestThreat.name}`,
      priority: highestThreat.threatLevel === "critical" ? "critical" : "medium",
      rationale: `${highestThreat.name} is the highest-threat competitor currently tracked.`,
    });
  }

  if (recommendations.size === 0) {
    recommendations.set("bootstrap", {
      action: "Add competitor profiles to begin tracking",
      priority: "high",
      rationale: "Intelligence briefs require competitor data to produce actionable insights.",
    });
  }

  return Array.from(recommendations.values()).slice(0, 10);
}

function createHeuristicBrief(
  period: IntelligenceBrief["period"],
  competitors: CompetitorProfile[],
  patentList: PatentEntry[],
  signals: MarketSignal[],
  alerts: CompetitiveAlert[]
): IntelligenceBrief {
  const brief: IntelligenceBrief = {
    id: randomUUID(),
    period,
    generatedAt: new Date().toISOString(),
    executiveSummary: buildHeuristicExecutiveSummary(
      period,
      competitors,
      patentList,
      signals,
      alerts
    ),
    sections: buildHeuristicSections(competitors, patentList, signals, alerts),
    patents: patentList.slice(0, 20),
    marketSignals: signals.slice(0, 20),
    alerts: alerts.slice(0, 10).map((alert) => ({
      title: alert.title,
      severity: alert.severity,
      competitor: alert.competitor,
    })),
    recommendations: buildHeuristicRecommendations(competitors, patentList, signals, alerts),
    overallThreatLevel: computeThreatLevel(alerts, signals),
  };
  briefs.set(brief.id, brief);
  return brief;
}

/**
 * Generate a competitive intelligence brief.
 * Aggregates competitor data, patents, market signals, and alerts into
 * a structured report with executive summary and recommendations.
 */
export async function generateIntelligenceBrief(options?: {
  period?: "daily" | "weekly" | "monthly";
  domain?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<IntelligenceBrief> {
  const period = options?.period ?? "weekly";
  const competitors = listCompetitors();
  const allPatents = listPatents({ minRelevance: 30 });
  const signals = listMarketSignals({ minImpact: 30 });

  let alerts: CompetitiveAlert[] = [];
  try {
    alerts = await checkForAlerts({ model: options?.model });
  } catch {
    // Alerts may fail if no competitors are configured
  }

  if (competitors.length === 0 && allPatents.length === 0 && signals.length === 0) {
    return createEmptyBrief(period);
  }

  const prompt = buildBriefPrompt(
    period,
    competitors,
    allPatents,
    signals,
    alerts,
    options?.domain
  );

  try {
    const raw = await withRetry(
      () => generateText({ prompt, model: options?.model, signal: options?.signal }),
      { signal: options?.signal }
    );

    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));

    const brief: IntelligenceBrief = {
      id: randomUUID(),
      period,
      generatedAt: new Date().toISOString(),
      executiveSummary: parsed.executiveSummary ?? "Intelligence brief generated.",
      sections: (parsed.sections ?? []).slice(0, 10).map((s: Record<string, unknown>) => ({
        title: String(s.title ?? "Section"),
        content: String(s.content ?? ""),
        priority: ["low", "medium", "high", "critical"].includes(String(s.priority))
          ? (s.priority as BriefSection["priority"])
          : "medium",
        relatedCompetitors: Array.isArray(s.relatedCompetitors)
          ? s.relatedCompetitors.map(String).slice(0, 10)
          : [],
      })),
      patents: allPatents.slice(0, 20),
      marketSignals: signals.slice(0, 20),
      alerts: alerts.slice(0, 10).map((a) => ({
        title: a.title,
        severity: a.severity,
        competitor: a.competitor,
      })),
      recommendations: (parsed.recommendations ?? [])
        .slice(0, 10)
        .map((r: Record<string, unknown>) => ({
          action: String(r.action ?? "Review data"),
          priority: ["low", "medium", "high", "critical"].includes(String(r.priority))
            ? (r.priority as IntelligenceBrief["recommendations"][number]["priority"])
            : "medium",
          rationale: String(r.rationale ?? ""),
        })),
      overallThreatLevel: computeThreatLevel(alerts, signals),
    };

    briefs.set(brief.id, brief);
    return brief;
  } catch {
    return createHeuristicBrief(period, competitors, allPatents, signals, alerts);
  }
}

function buildBriefPrompt(
  period: string,
  competitors: CompetitorProfile[],
  patentList: PatentEntry[],
  signals: MarketSignal[],
  alerts: CompetitiveAlert[],
  domain?: string
): string {
  return `You are a competitive intelligence analyst. Generate a ${period} intelligence brief.

${domain ? `DOMAIN: ${wrapUserInput("DOMAIN", domain)}` : ""}

COMPETITORS (${competitors.length}):
${competitors
  .slice(0, 10)
  .map((c) => `- ${c.name}: ${c.description}`)
  .join("\n")}

RECENT PATENTS (${patentList.length}):
${patentList
  .slice(0, 10)
  .map((p) => `- "${p.title}" by ${p.applicant} (relevance: ${p.relevanceScore})`)
  .join("\n")}

MARKET SIGNALS (${signals.length}):
${signals
  .slice(0, 10)
  .map((s) => `- [${s.type}] ${s.title}: ${s.description}`)
  .join("\n")}

ACTIVE ALERTS (${alerts.length}):
${alerts
  .slice(0, 5)
  .map((a) => `- [${a.severity}] ${a.competitor}: ${a.title}`)
  .join("\n")}

Respond with valid JSON:
{
  "executiveSummary": "2-3 paragraph overview of the competitive landscape this ${period}",
  "sections": [
    { "title": "section name", "content": "analysis", "priority": "high|medium|low", "relatedCompetitors": ["name"] }
  ],
  "recommendations": [
    { "action": "specific action", "priority": "high|medium|low|critical", "rationale": "why" }
  ]
}`;
}

function computeThreatLevel(
  alerts: CompetitiveAlert[],
  signals: MarketSignal[]
): "stable" | "elevated" | "high" | "critical" {
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical").length;
  const highAlerts = alerts.filter((alert) => alert.severity === "high").length;
  const highSignals = signals.filter((signal) => signal.impactScore >= 80).length;
  const actionableSignals = signals.filter(
    (signal) => signal.actionRequired || signal.impactScore >= 90
  ).length;

  if (criticalAlerts > 0 || actionableSignals >= 2) return "critical";
  if (highAlerts >= 3 || highSignals >= 4) return "high";
  if (highAlerts >= 1 || highSignals >= 1 || actionableSignals >= 1) return "elevated";
  return "stable";
}

function createEmptyBrief(period: "daily" | "weekly" | "monthly"): IntelligenceBrief {
  const brief: IntelligenceBrief = {
    id: randomUUID(),
    period,
    generatedAt: new Date().toISOString(),
    executiveSummary:
      "No competitive data available for this period. Add competitors, patents, or market signals to generate meaningful briefs.",
    sections: [],
    patents: [],
    marketSignals: [],
    alerts: [],
    recommendations: [
      {
        action: "Add competitor profiles to begin tracking",
        priority: "high",
        rationale: "Intelligence briefs require competitor data to produce actionable insights.",
      },
    ],
    overallThreatLevel: "stable",
  };
  briefs.set(brief.id, brief);
  return brief;
}

/** Get a previously generated brief. */
export function getIntelligenceBrief(id: string): IntelligenceBrief | undefined {
  return briefs.get(id);
}

/** List all generated briefs. */
export function listIntelligenceBriefs(): IntelligenceBrief[] {
  return Array.from(briefs.values()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

// ---- Markdown Export ----

/** Export an intelligence brief as markdown. */
export function intelligenceBriefToMarkdown(brief: IntelligenceBrief): string {
  const lines: string[] = [
    `# ${brief.period.charAt(0).toUpperCase() + brief.period.slice(1)} Intelligence Brief`,
    "",
    `**Generated:** ${brief.generatedAt}`,
    `**Threat Level:** ${brief.overallThreatLevel.toUpperCase()}`,
    "",
    "## Executive Summary",
    "",
    brief.executiveSummary,
    "",
  ];

  if (brief.sections.length > 0) {
    lines.push("## Analysis");
    lines.push("");
    for (const section of brief.sections) {
      lines.push(`### ${section.title} [${section.priority.toUpperCase()}]`);
      lines.push("");
      lines.push(section.content);
      if (section.relatedCompetitors.length > 0) {
        lines.push(`*Related: ${section.relatedCompetitors.join(", ")}*`);
      }
      lines.push("");
    }
  }

  if (brief.alerts.length > 0) {
    lines.push("## Active Alerts");
    lines.push("");
    for (const alert of brief.alerts) {
      lines.push(`- **[${alert.severity}]** ${alert.competitor}: ${alert.title}`);
    }
    lines.push("");
  }

  if (brief.patents.length > 0) {
    lines.push("## Patent Activity");
    lines.push("");
    lines.push("| Title | Applicant | Status | Relevance |");
    lines.push("|-------|-----------|--------|-----------|");
    for (const p of brief.patents.slice(0, 10)) {
      lines.push(`| ${p.title} | ${p.applicant} | ${p.status} | ${p.relevanceScore}% |`);
    }
    lines.push("");
  }

  if (brief.marketSignals.length > 0) {
    lines.push("## Market Signals");
    lines.push("");
    for (const s of brief.marketSignals.slice(0, 10)) {
      lines.push(`- **[${s.type}]** ${s.title} (impact: ${s.impactScore})`);
      lines.push(`  ${s.description}`);
    }
    lines.push("");
  }

  if (brief.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (const r of brief.recommendations) {
      lines.push(`- **[${r.priority.toUpperCase()}]** ${r.action}`);
      if (r.rationale) lines.push(`  *${r.rationale}*`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Clear all intelligence data (for testing). */
export function clearIntelligenceData(): void {
  patents.clear();
  marketSignals.clear();
  briefs.clear();
}
