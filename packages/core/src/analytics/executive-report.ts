/**
 * @module analytics/executive-report
 *
 * Scheduled executive report generator with LLM-generated summaries.
 * Produces formatted reports suitable for PDF/email delivery.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readEvents } from "./analytics.js";
import { calculateROI } from "./roi.js";

// ---- Executive Report Schema ----

export const ExecutiveReportSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  period: z.object({
    start: z.string(),
    end: z.string(),
    label: z.string().max(100),
  }),
  highlights: z
    .array(
      z.object({
        icon: z.string().max(10),
        metric: z.string().max(200),
        value: z.string().max(200),
        trend: z.enum(["up", "down", "stable"]),
        changePercent: z.number().optional(),
      })
    )
    .max(10),
  sections: z
    .array(
      z.object({
        title: z.string().max(200),
        content: z.string().max(5000),
        chartType: z
          .enum([
            "velocity",
            "quality-distribution",
            "angle-effectiveness",
            "team-heatmap",
            "bias-tracker",
            "funnel",
            "roi",
            "none",
          ])
          .optional(),
        chartData: z.unknown().optional(),
      })
    )
    .max(10),
  roi: z.unknown().optional(),
  summary: z.string().max(5000),
  recommendations: z.array(z.string().max(500)).max(10),
  generatedAt: z.string(),
});
export type ExecutiveReport = z.infer<typeof ExecutiveReportSchema>;

// ---- Funnel Data ----

export const FunnelStageSchema = z.object({
  name: z.string().max(200),
  count: z.number().int().min(0),
  conversionRate: z.number().min(0).max(1).optional(),
});
export type FunnelStage = z.infer<typeof FunnelStageSchema>;

// ---- Report Generation ----

export function generateExecutiveReport(periodLabel: string = "Last 30 Days"): ExecutiveReport {
  const events = readEvents();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const periodEvents = events.filter((e) => new Date(e.timestamp) >= thirtyDaysAgo);

  // Calculate metrics
  const totalSessions = periodEvents.filter((e) => e.type === "pipeline_started").length;
  const completedSessions = periodEvents.filter((e) => e.type === "pipeline_completed").length;
  const totalIdeas = periodEvents
    .filter((e) => e.type === "angle_generated")
    .reduce((sum, e) => {
      const count = typeof e.data?.ideaCount === "number" ? e.data.ideaCount : 3;
      return sum + count;
    }, 0);
  const totalExports = periodEvents.filter((e) => e.type === "session_exported").length;

  const successRate = totalSessions > 0 ? completedSessions / totalSessions : 0;

  // Angle usage distribution
  const angleUsage = new Map<string, number>();
  for (const event of periodEvents) {
    if (event.type === "angle_generated" && typeof event.data?.angleId === "string") {
      const count = angleUsage.get(event.data.angleId) ?? 0;
      angleUsage.set(event.data.angleId, count + 1);
    }
  }

  // Build funnel data
  const funnel: FunnelStage[] = [
    { name: "Sessions Started", count: totalSessions },
    { name: "Sessions Completed", count: completedSessions, conversionRate: successRate },
    {
      name: "Ideas Generated",
      count: totalIdeas,
      conversionRate: totalIdeas > 0 && completedSessions > 0 ? 1 : 0,
    },
    {
      name: "Reports Exported",
      count: totalExports,
      conversionRate: completedSessions > 0 ? totalExports / completedSessions : 0,
    },
  ];

  // ROI
  const roi = calculateROI();

  // Build report
  return ExecutiveReportSchema.parse({
    id: `report-${randomUUID().slice(0, 12)}`,
    title: `Innovation Executive Report — ${periodLabel}`,
    period: {
      start: thirtyDaysAgo.toISOString(),
      end: now.toISOString(),
      label: periodLabel,
    },
    highlights: [
      {
        icon: "📊",
        metric: "Innovation Sessions",
        value: String(totalSessions),
        trend: totalSessions > 0 ? "up" : "stable",
      },
      {
        icon: "💡",
        metric: "Ideas Generated",
        value: String(totalIdeas),
        trend: totalIdeas > 0 ? "up" : "stable",
      },
      {
        icon: "✅",
        metric: "Success Rate",
        value: `${Math.round(successRate * 100)}%`,
        trend: successRate >= 0.8 ? "up" : successRate >= 0.5 ? "stable" : "down",
      },
      {
        icon: "💰",
        metric: "ROI",
        value: `${roi.roi.roiPercent}%`,
        trend: roi.roi.roiPercent > 0 ? "up" : "down",
      },
    ],
    sections: [
      {
        title: "Innovation Velocity",
        content: `${totalSessions} sessions started with ${completedSessions} completed (${Math.round(successRate * 100)}% success rate). ${totalIdeas} ideas generated across ${angleUsage.size} angles.`,
        chartType: "velocity",
        chartData: {
          sessions: totalSessions,
          completed: completedSessions,
          ideas: totalIdeas,
          exports: totalExports,
        },
      },
      {
        title: "Angle Effectiveness",
        content: `Top angles: ${
          Array.from(angleUsage.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([k, v]) => `${k} (${v})`)
            .join(", ") || "No angle data yet."
        }`,
        chartType: "angle-effectiveness",
        chartData: Object.fromEntries(angleUsage),
      },
      {
        title: "Innovation Funnel",
        content: `Funnel conversion: ${funnel.map((s) => `${s.name}: ${s.count}`).join(" → ")}`,
        chartType: "funnel",
        chartData: funnel,
      },
      {
        title: "ROI Analysis",
        content: `Total investment: ${roi.currency} ${roi.investment.totalCost}. Estimated value: ${roi.currency} ${roi.returns.totalValue}. Net ROI: ${roi.roi.roiPercent}%.`,
        chartType: "roi",
        chartData: roi,
      },
    ],
    roi,
    summary: `During this period, ${totalSessions} innovation sessions were conducted, generating ${totalIdeas} ideas across ${angleUsage.size} angles with a ${Math.round(successRate * 100)}% completion rate. ${totalExports} reports were exported for stakeholder review.`,
    recommendations: generateRecommendations(totalSessions, successRate, angleUsage, totalExports),
    generatedAt: now.toISOString(),
  });
}

function generateRecommendations(
  sessions: number,
  successRate: number,
  angleUsage: Map<string, number>,
  exports: number
): string[] {
  const recommendations: string[] = [];

  if (sessions === 0) {
    recommendations.push("Start your first innovation session to begin tracking insights.");
    return recommendations;
  }

  if (successRate < 0.7) {
    recommendations.push(
      "Session completion rate is below 70%. Consider simplifying pipeline configurations or providing clearer subjects."
    );
  }

  if (angleUsage.size < 3) {
    recommendations.push(
      "Diversify angle usage — try cross-domain, inversion, or constraints angles for broader perspectives."
    );
  }

  if (exports / Math.max(sessions, 1) < 0.3) {
    recommendations.push(
      "Export rate is low. Encourage teams to export and share results to increase adoption."
    );
  }

  if (sessions > 10 && angleUsage.size >= 3) {
    recommendations.push(
      "Innovation activity is healthy. Consider setting up scheduled pipelines for continuous innovation."
    );
  }

  return recommendations;
}

/** Format executive report as Markdown suitable for email/PDF. */
export function executiveReportToMarkdown(report: ExecutiveReport): string {
  const lines: string[] = [
    `# ${report.title}`,
    "",
    `**Period:** ${report.period.label}`,
    `**Generated:** ${new Date(report.generatedAt).toLocaleDateString()}`,
    "",
    "## Key Highlights",
    "",
  ];

  for (const h of report.highlights) {
    const arrow = h.trend === "up" ? "↑" : h.trend === "down" ? "↓" : "→";
    lines.push(`${h.icon} **${h.metric}:** ${h.value} ${arrow}`);
  }
  lines.push("");

  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
  }

  lines.push("## Executive Summary");
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join("\n");
}
