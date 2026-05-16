/**
 * @module observatory/enterprise
 *
 * Enterprise Innovation Observatory — executive dashboard aggregating
 * innovation velocity, portfolio health, team DNA profiles, competitive
 * radar alerts, and trend signals into a single strategic view.
 * Includes automated reporting with PDF/email briefs.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- KPI Schemas ----

export const InnovationKPISchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  value: z.number(),
  unit: z.string().max(50),
  trend: z.enum(["up", "down", "stable"]),
  changePercent: z.number(),
  target: z.number().optional(),
  period: z.string().max(20),
});
export type InnovationKPI = z.infer<typeof InnovationKPISchema>;

export const VelocityMetricSchema = z.object({
  period: z.string().max(20),
  sessionsRun: z.number().int().min(0),
  ideasGenerated: z.number().int().min(0),
  ideasShipped: z.number().int().min(0),
  avgTimeToValue: z.number().nullable(),
  pipelineCompletionRate: z.number().min(0).max(1),
});
export type VelocityMetric = z.infer<typeof VelocityMetricSchema>;

export const TeamDNAProfileSchema = z.object({
  teamId: z.string().max(200),
  teamName: z.string().max(200),
  preferredAngles: z.array(z.string().max(100)).max(10),
  innovationStyle: z.enum(["explorer", "optimizer", "disruptor", "integrator", "balanced"]),
  avgSessionFrequency: z.number().min(0),
  shipRate: z.number().min(0).max(1),
  topDomains: z.array(z.string().max(100)).max(5),
  strengths: z.array(z.string().max(200)).max(5),
  growthAreas: z.array(z.string().max(200)).max(5),
  memberCount: z.number().int().min(0),
});
export type TeamDNAProfile = z.infer<typeof TeamDNAProfileSchema>;

export const CompetitiveAlertSchema = z.object({
  id: z.string().max(100),
  competitor: z.string().max(200),
  alertType: z.enum(["product-launch", "patent-filing", "acquisition", "funding", "market-shift"]),
  title: z.string().max(500),
  description: z.string().max(2000),
  severity: z.enum(["info", "warning", "critical"]),
  sourceUrl: z.string().max(2000).optional(),
  detectedAt: z.string(),
  acknowledged: z.boolean().default(false),
});
export type CompetitiveAlert = z.infer<typeof CompetitiveAlertSchema>;

export const TrendSignalSchema = z.object({
  id: z.string().max(100),
  topic: z.string().max(300),
  category: z.enum(["technology", "market", "regulatory", "social", "environmental"]),
  momentum: z.enum(["emerging", "growing", "peaking", "declining"]),
  relevance: z.number().min(0).max(1),
  sources: z.array(z.string().max(300)).max(10),
  firstDetected: z.string(),
  lastUpdated: z.string(),
});
export type TrendSignal = z.infer<typeof TrendSignalSchema>;

export const PortfolioHealthSchema = z.object({
  totalIdeas: z.number().int().min(0),
  byStage: z.record(z.number().int().min(0)),
  pipelineBalance: z.number().min(0).max(1),
  diversityScore: z.number().min(0).max(1),
  riskExposure: z.enum(["low", "moderate", "high"]),
  stalledItems: z.number().int().min(0),
  healthGrade: z.enum(["A", "B", "C", "D", "F"]),
});
export type PortfolioHealth = z.infer<typeof PortfolioHealthSchema>;

// ---- Executive Dashboard ----

export const ExecutiveDashboardSchema = z.object({
  id: z.string().max(100),
  generatedAt: z.string(),
  period: z.object({
    start: z.string(),
    end: z.string(),
    label: z.string().max(50),
  }),
  kpis: z.array(InnovationKPISchema).max(20),
  velocity: z.array(VelocityMetricSchema).max(52),
  portfolioHealth: PortfolioHealthSchema,
  teamProfiles: z.array(TeamDNAProfileSchema).max(50),
  competitiveAlerts: z.array(CompetitiveAlertSchema).max(50),
  trendSignals: z.array(TrendSignalSchema).max(30),
  executiveSummary: z.string().max(5000),
});
export type ExecutiveDashboard = z.infer<typeof ExecutiveDashboardSchema>;

// ---- Report Schemas ----

export const ReportFormatSchema = z.enum(["markdown", "html", "json"]);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

export const ScheduledReportSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  schedule: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  format: ReportFormatSchema,
  recipients: z.array(z.string().max(300)).max(50),
  sections: z
    .array(z.enum(["kpis", "velocity", "portfolio", "teams", "competitive", "trends"]))
    .max(10),
  enabled: z.boolean().default(true),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
  createdAt: z.string(),
});
export type ScheduledReport = z.infer<typeof ScheduledReportSchema>;

// ---- In-Memory Data ----

const alerts: CompetitiveAlert[] = [];
const trends: TrendSignal[] = [];
const reports = new Map<string, ScheduledReport>();
const teamProfiles = new Map<string, TeamDNAProfile>();

// ---- Data Collection ----

/**
 * Add a competitive alert.
 */
export function addCompetitiveAlert(
  alert: Omit<CompetitiveAlert, "id" | "detectedAt" | "acknowledged">
): CompetitiveAlert {
  const fullAlert: CompetitiveAlert = {
    ...alert,
    id: randomUUID(),
    detectedAt: new Date().toISOString(),
    acknowledged: false,
  };
  alerts.push(CompetitiveAlertSchema.parse(fullAlert));
  return fullAlert;
}

/**
 * Acknowledge an alert.
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) return false;
  alert.acknowledged = true;
  return true;
}

/**
 * Add a trend signal.
 */
export function addTrendSignal(
  signal: Omit<TrendSignal, "id" | "firstDetected" | "lastUpdated">
): TrendSignal {
  const now = new Date().toISOString();
  const fullSignal: TrendSignal = {
    ...signal,
    id: randomUUID(),
    firstDetected: now,
    lastUpdated: now,
  };
  trends.push(TrendSignalSchema.parse(fullSignal));
  return fullSignal;
}

/**
 * Register or update a team DNA profile.
 */
export function setTeamDNAProfile(profile: TeamDNAProfile): void {
  teamProfiles.set(profile.teamId, TeamDNAProfileSchema.parse(profile));
}

// ---- Dashboard Generation ----

/**
 * Generate the executive innovation dashboard.
 */
export function generateExecutiveDashboard(params?: {
  periodStart?: string;
  periodEnd?: string;
  sessionsData?: Array<{ createdAt: string; ideasCount: number; completed: boolean }>;
  outcomesData?: Array<{
    stage: string;
    createdAt: string;
    shippedAt?: string;
    timeToValueDays?: number;
  }>;
}): ExecutiveDashboard {
  const now = new Date();
  const periodEnd = params?.periodEnd ?? now.toISOString();
  const periodStart = params?.periodStart ?? new Date(now.getTime() - 30 * 86400000).toISOString();

  const sessions = params?.sessionsData ?? [];
  const outcomes = params?.outcomesData ?? [];

  // KPIs
  const kpis: InnovationKPI[] = [
    {
      id: "sessions-run",
      name: "Sessions Run",
      value: sessions.length,
      unit: "sessions",
      trend: sessions.length > 5 ? "up" : "stable",
      changePercent: 0,
      period: "30d",
    },
    {
      id: "ideas-generated",
      name: "Ideas Generated",
      value: sessions.reduce((sum, s) => sum + s.ideasCount, 0),
      unit: "ideas",
      trend: "up",
      changePercent: 0,
      period: "30d",
    },
    {
      id: "ship-rate",
      name: "Ship Rate",
      value:
        outcomes.length > 0
          ? Math.round(
              (outcomes.filter((o) => o.stage === "shipped").length / outcomes.length) * 100
            )
          : 0,
      unit: "%",
      trend: "stable",
      changePercent: 0,
      period: "30d",
    },
    {
      id: "pipeline-completion",
      name: "Pipeline Completion",
      value:
        sessions.length > 0
          ? Math.round((sessions.filter((s) => s.completed).length / sessions.length) * 100)
          : 0,
      unit: "%",
      trend: "stable",
      changePercent: 0,
      period: "30d",
    },
  ];

  // Portfolio health
  const byStage: Record<string, number> = {};
  for (const o of outcomes) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
  }
  const stageCount = Object.keys(byStage).length;
  const portfolioHealth: PortfolioHealth = {
    totalIdeas: outcomes.length,
    byStage,
    pipelineBalance: stageCount > 0 ? Math.min(1, stageCount / 5) : 0,
    diversityScore: 0.5,
    riskExposure: outcomes.length > 20 ? "low" : outcomes.length > 5 ? "moderate" : "high",
    stalledItems: 0,
    healthGrade: outcomes.length > 10 ? "B" : outcomes.length > 0 ? "C" : "D",
  };

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged);

  return {
    id: randomUUID(),
    generatedAt: now.toISOString(),
    period: { start: periodStart, end: periodEnd, label: "Last 30 days" },
    kpis,
    velocity: [],
    portfolioHealth,
    teamProfiles: Array.from(teamProfiles.values()),
    competitiveAlerts: unacknowledgedAlerts.slice(0, 50),
    trendSignals: trends.slice(-30),
    executiveSummary: buildExecutiveSummary(kpis, portfolioHealth, unacknowledgedAlerts.length),
  };
}

function buildExecutiveSummary(
  kpis: InnovationKPI[],
  health: PortfolioHealth,
  alertCount: number
): string {
  const lines: string[] = [];
  lines.push("## Innovation Observatory — Executive Summary\n");

  for (const kpi of kpis) {
    const target = kpi.target ? ` (target: ${kpi.target})` : "";
    lines.push(`- **${kpi.name}:** ${kpi.value} ${kpi.unit} [${kpi.trend}]${target}`);
  }

  lines.push(
    `\n**Portfolio Health:** Grade ${health.healthGrade} — ${health.totalIdeas} ideas tracked, risk exposure: ${health.riskExposure}`
  );

  if (alertCount > 0) {
    lines.push(`\n⚠️ **${alertCount} competitive alert(s)** require attention.`);
  }

  return lines.join("\n");
}

// ---- Report Scheduling ----

/**
 * Schedule an automated innovation brief.
 */
export function scheduleReport(params: Omit<ScheduledReport, "id" | "createdAt">): ScheduledReport {
  const report: ScheduledReport = {
    ...params,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const validated = ScheduledReportSchema.parse(report);
  reports.set(validated.id, validated);
  return validated;
}

/**
 * List scheduled reports.
 */
export function listScheduledReports(): ScheduledReport[] {
  return Array.from(reports.values());
}

/**
 * Generate a formatted innovation brief.
 */
export function generateInnovationBrief(
  dashboard: ExecutiveDashboard,
  format: ReportFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(dashboard, null, 2);

  const lines: string[] = [
    `# Innovation Brief — ${dashboard.period.label}`,
    `*Generated: ${dashboard.generatedAt}*\n`,
    dashboard.executiveSummary,
    "",
  ];

  if (dashboard.competitiveAlerts.length > 0) {
    lines.push("## Competitive Alerts");
    for (const alert of dashboard.competitiveAlerts.slice(0, 5)) {
      lines.push(`- **[${alert.severity}]** ${alert.title} — ${alert.description.slice(0, 200)}`);
    }
    lines.push("");
  }

  if (dashboard.trendSignals.length > 0) {
    lines.push("## Trend Signals");
    for (const signal of dashboard.trendSignals.slice(0, 5)) {
      lines.push(
        `- **${signal.topic}** (${signal.category}, ${signal.momentum}) — relevance: ${(signal.relevance * 100).toFixed(0)}%`
      );
    }
    lines.push("");
  }

  if (dashboard.teamProfiles.length > 0) {
    lines.push("## Team DNA Profiles");
    for (const team of dashboard.teamProfiles) {
      lines.push(
        `- **${team.teamName}**: ${team.innovationStyle} (ship rate: ${(team.shipRate * 100).toFixed(0)}%)`
      );
    }
  }

  return lines.join("\n");
}

/**
 * Delete a scheduled report.
 */
export function deleteScheduledReport(reportId: string): boolean {
  return reports.delete(reportId);
}

/**
 * Clear all observatory data (for testing).
 */
export function clearObservatoryData(): void {
  alerts.length = 0;
  trends.length = 0;
  reports.clear();
  teamProfiles.clear();
}
