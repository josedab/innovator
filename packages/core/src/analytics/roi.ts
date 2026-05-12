/**
 * @module analytics/roi
 *
 * ROI calculator for innovation metrics — computes return on innovation
 * investment using configurable cost/value models.
 */

import { z } from "zod";
import { readEvents } from "./index.js";

// ---- Schemas ----

export const ROIConfigSchema = z.object({
  costPerSession: z.number().min(0).default(5),
  costPerHour: z.number().min(0).default(50),
  valuePerImplementedIdea: z.number().min(0).default(10000),
  valuePerExportedReport: z.number().min(0).default(500),
  implementationRate: z.number().min(0).max(1).default(0.1),
  currency: z.string().max(10).default("USD"),
});

export const ROIReportSchema = z.object({
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),
  investment: z.object({
    totalSessions: z.number(),
    totalHoursEstimated: z.number(),
    sessionCost: z.number(),
    timeCost: z.number(),
    totalCost: z.number(),
  }),
  returns: z.object({
    totalIdeas: z.number(),
    estimatedImplemented: z.number(),
    totalExports: z.number(),
    ideaValue: z.number(),
    exportValue: z.number(),
    totalValue: z.number(),
  }),
  roi: z.object({
    netValue: z.number(),
    roiPercent: z.number(),
    paybackSessions: z.number(),
    costPerIdea: z.number(),
    valuePerSession: z.number(),
  }),
  currency: z.string(),
  generatedAt: z.string(),
});

export type ROIConfig = z.infer<typeof ROIConfigSchema>;
export type ROIReport = z.infer<typeof ROIReportSchema>;

// ---- ROI Calculation ----

/**
 * Calculate ROI metrics for innovation activities.
 */
export function calculateROI(config?: Partial<ROIConfig>): ROIReport {
  const cfg = ROIConfigSchema.parse(config ?? {});
  const events = readEvents();

  if (events.length === 0) {
    const now = new Date().toISOString();
    return createEmptyReport(now, now, cfg.currency);
  }

  // Count key events
  const sessions = events.filter((e) => e.type === "pipeline_completed" || e.type === "pipeline_started");
  const ideaEvents = events.filter((e) => e.type === "angle_generated");
  const exportEvents = events.filter((e) => e.type === "session_exported");

  const totalSessions = sessions.length;
  const totalIdeas = ideaEvents.reduce((sum, e) => {
    const count = typeof e.data?.ideaCount === "number" ? e.data.ideaCount : 3;
    return sum + count;
  }, 0);
  const totalExports = exportEvents.length;

  // Estimate time (avg 5 min per session)
  const totalHoursEstimated = Math.round((totalSessions * 5) / 60 * 10) / 10;

  // Investment
  const sessionCost = totalSessions * cfg.costPerSession;
  const timeCost = totalHoursEstimated * cfg.costPerHour;
  const totalCost = sessionCost + timeCost;

  // Returns
  const estimatedImplemented = Math.round(totalIdeas * cfg.implementationRate);
  const ideaValue = estimatedImplemented * cfg.valuePerImplementedIdea;
  const exportValue = totalExports * cfg.valuePerExportedReport;
  const totalValue = ideaValue + exportValue;

  // ROI
  const netValue = totalValue - totalCost;
  const roiPercent = totalCost > 0 ? Math.round((netValue / totalCost) * 100) : 0;
  const costPerIdea = totalIdeas > 0 ? Math.round((totalCost / totalIdeas) * 100) / 100 : 0;
  const valuePerSession = totalSessions > 0 ? Math.round((totalValue / totalSessions) * 100) / 100 : 0;
  const netValuePerSession = valuePerSession - cfg.costPerSession;
  const paybackSessions = netValuePerSession > 0
    ? Math.ceil(cfg.costPerSession / netValuePerSession)
    : 0;

  const timestamps = events.map((e) => e.timestamp).sort();
  const periodStart = timestamps[0] ?? new Date().toISOString();
  const periodEnd = timestamps[timestamps.length - 1] ?? new Date().toISOString();

  return {
    period: { start: periodStart, end: periodEnd },
    investment: {
      totalSessions,
      totalHoursEstimated,
      sessionCost: Math.round(sessionCost * 100) / 100,
      timeCost: Math.round(timeCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    },
    returns: {
      totalIdeas,
      estimatedImplemented,
      totalExports,
      ideaValue: Math.round(ideaValue * 100) / 100,
      exportValue: Math.round(exportValue * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
    },
    roi: {
      netValue: Math.round(netValue * 100) / 100,
      roiPercent,
      paybackSessions: Math.max(0, paybackSessions),
      costPerIdea,
      valuePerSession,
    },
    currency: cfg.currency,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Export ROI report as markdown.
 */
export function roiToMarkdown(report: ROIReport): string {
  const { currency } = report;
  const fmt = (n: number) => `${currency} ${n.toLocaleString()}`;

  const lines = [
    "# Innovation ROI Report",
    "",
    `**Period:** ${report.period.start.split("T")[0]} — ${report.period.end.split("T")[0]}`,
    "",
    "## Investment",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Sessions | ${report.investment.totalSessions} |`,
    `| Estimated Hours | ${report.investment.totalHoursEstimated}h |`,
    `| Session Cost | ${fmt(report.investment.sessionCost)} |`,
    `| Time Cost | ${fmt(report.investment.timeCost)} |`,
    `| **Total Investment** | **${fmt(report.investment.totalCost)}** |`,
    "",
    "## Returns",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Ideas Generated | ${report.returns.totalIdeas} |`,
    `| Estimated Implemented | ${report.returns.estimatedImplemented} |`,
    `| Reports Exported | ${report.returns.totalExports} |`,
    `| Idea Value | ${fmt(report.returns.ideaValue)} |`,
    `| Export Value | ${fmt(report.returns.exportValue)} |`,
    `| **Total Value** | **${fmt(report.returns.totalValue)}** |`,
    "",
    "## ROI Metrics",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Net Value | ${fmt(report.roi.netValue)} |`,
    `| ROI | ${report.roi.roiPercent}% |`,
    `| Cost per Idea | ${fmt(report.roi.costPerIdea)} |`,
    `| Value per Session | ${fmt(report.roi.valuePerSession)} |`,
    `| Payback Period | ${report.roi.paybackSessions} sessions |`,
    "",
  ];

  return lines.join("\n");
}

function createEmptyReport(start: string, end: string, currency: string): ROIReport {
  return {
    period: { start, end },
    investment: { totalSessions: 0, totalHoursEstimated: 0, sessionCost: 0, timeCost: 0, totalCost: 0 },
    returns: { totalIdeas: 0, estimatedImplemented: 0, totalExports: 0, ideaValue: 0, exportValue: 0, totalValue: 0 },
    roi: { netValue: 0, roiPercent: 0, paybackSessions: 0, costPerIdea: 0, valuePerSession: 0 },
    currency,
    generatedAt: new Date().toISOString(),
  };
}
