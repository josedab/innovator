import { z } from "zod";
import { listPortfolioItems } from "./index.js";
import type { PortfolioItem } from "./types.js";

// Dashboard data aggregation for portfolio analytics
export const DashboardMetricsSchema = z.object({
  totalInitiatives: z.number(),
  activeInitiatives: z.number(),
  completedInitiatives: z.number(),
  ideaVelocity: z.object({
    daily: z.number(),
    weekly: z.number(),
    monthly: z.number(),
  }),
  angleEffectiveness: z.array(
    z.object({
      angleId: z.string(),
      usageCount: z.number(),
      successRate: z.number(),
      avgScore: z.number(),
    })
  ),
  stageDistribution: z.record(z.number()),
  riskDistribution: z.record(z.number()),
  teamPatterns: z
    .array(
      z.object({
        memberId: z.string(),
        initiativeCount: z.number(),
        avgCompletionDays: z.number().nullable(),
        preferredAngles: z.array(z.string()),
      })
    )
    .optional(),
});
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

export const ExecutiveReportSchema = z.object({
  generatedAt: z.string(),
  period: z.string(),
  summary: z.string(),
  kpis: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      unit: z.string(),
      trend: z.enum(["up", "down", "stable"]),
      changePercent: z.number().optional(),
    })
  ),
  highlights: z.array(z.string()),
  risks: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type ExecutiveReport = z.infer<typeof ExecutiveReportSchema>;

const STAGES = ["ideation", "evaluation", "prototyping", "shipped", "abandoned"] as const;
const RISK_BUCKETS = ["low", "medium", "high"] as const;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number = 2): number {
  return Number(value.toFixed(digits));
}

function daysBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60 * 24);
}

function shippedAt(item: PortfolioItem): string | undefined {
  return item.transitions.find((transition) => transition.to === "shipped")?.timestamp;
}

function riskBucket(item: PortfolioItem): (typeof RISK_BUCKETS)[number] {
  const ageDays = daysBetween(item.createdAt, new Date().toISOString());
  let score = 0;

  if (item.stage === "evaluation" && ageDays > 21) score += 1;
  if (item.stage === "prototyping" && ageDays > 45) score += 2;
  if (item.stage === "abandoned") score += 2;
  if (item.impactScore != null && item.impactScore < 4) score += 1;
  if (item.stage === "ideation" && ageDays > 30) score += 1;

  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function getTeamPatterns(items: PortfolioItem[]): DashboardMetrics["teamPatterns"] {
  const teams = new Map<
    string,
    {
      initiativeCount: number;
      preferredAngles: Map<string, number>;
      completionDays: number[];
    }
  >();

  for (const item of items) {
    if (!item.assignee) continue;

    const team = teams.get(item.assignee) ?? {
      initiativeCount: 0,
      preferredAngles: new Map<string, number>(),
      completionDays: [],
    };

    team.initiativeCount += 1;
    team.preferredAngles.set(
      item.sourceAngle,
      (team.preferredAngles.get(item.sourceAngle) ?? 0) + 1
    );

    const completionTimestamp = shippedAt(item);
    if (completionTimestamp) {
      team.completionDays.push(daysBetween(item.createdAt, completionTimestamp));
    }

    teams.set(item.assignee, team);
  }

  if (teams.size === 0) return undefined;

  return Array.from(teams.entries())
    .map(([memberId, team]) => ({
      memberId,
      initiativeCount: team.initiativeCount,
      avgCompletionDays:
        team.completionDays.length > 0 ? round(average(team.completionDays), 1) : null,
      preferredAngles: Array.from(team.preferredAngles.entries())
        .sort(([, left], [, right]) => right - left)
        .slice(0, 3)
        .map(([angleId]) => angleId),
    }))
    .sort((left, right) => right.initiativeCount - left.initiativeCount);
}

// Function to aggregate dashboard metrics from in-memory initiative data
export function aggregateDashboardMetrics(): DashboardMetrics {
  const initiatives = listPortfolioItems();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const stageDistribution = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  const riskDistribution = Object.fromEntries(RISK_BUCKETS.map((bucket) => [bucket, 0]));
  const angleStats = new Map<
    string,
    { usageCount: number; shippedCount: number; scores: number[] }
  >();

  for (const initiative of initiatives) {
    stageDistribution[initiative.stage] = (stageDistribution[initiative.stage] ?? 0) + 1;
    riskDistribution[riskBucket(initiative)] = (riskDistribution[riskBucket(initiative)] ?? 0) + 1;

    const angle = angleStats.get(initiative.sourceAngle) ?? {
      usageCount: 0,
      shippedCount: 0,
      scores: [],
    };

    angle.usageCount += 1;
    if (initiative.stage === "shipped") angle.shippedCount += 1;
    if (initiative.impactScore != null) angle.scores.push(initiative.impactScore);
    angleStats.set(initiative.sourceAngle, angle);
  }

  const totalInitiatives = initiatives.length;
  const activeInitiatives = initiatives.filter(
    (initiative) => initiative.stage !== "shipped" && initiative.stage !== "abandoned"
  ).length;
  const completedInitiatives = initiatives.filter(
    (initiative) => initiative.stage === "shipped"
  ).length;

  const ideaVelocity = {
    daily: initiatives.filter(
      (initiative) => now - new Date(initiative.createdAt).getTime() <= dayMs
    ).length,
    weekly: initiatives.filter(
      (initiative) => now - new Date(initiative.createdAt).getTime() <= 7 * dayMs
    ).length,
    monthly: initiatives.filter(
      (initiative) => now - new Date(initiative.createdAt).getTime() <= 30 * dayMs
    ).length,
  };

  const angleEffectiveness = Array.from(angleStats.entries())
    .map(([angleId, stats]) => ({
      angleId,
      usageCount: stats.usageCount,
      successRate: stats.usageCount > 0 ? round(stats.shippedCount / stats.usageCount, 3) : 0,
      avgScore: stats.scores.length > 0 ? round(average(stats.scores)) : 0,
    }))
    .sort((left, right) => right.usageCount - left.usageCount || right.avgScore - left.avgScore);

  return DashboardMetricsSchema.parse({
    totalInitiatives,
    activeInitiatives,
    completedInitiatives,
    ideaVelocity,
    angleEffectiveness,
    stageDistribution,
    riskDistribution,
    teamPatterns: getTeamPatterns(initiatives),
  });
}

// Function to generate executive report
export function generateExecutiveReport(
  period: string = "Current portfolio snapshot"
): ExecutiveReport {
  const metrics = aggregateDashboardMetrics();
  const completionRate =
    metrics.totalInitiatives > 0 ? metrics.completedInitiatives / metrics.totalInitiatives : 0;
  const dominantStage = Object.entries(metrics.stageDistribution).sort(
    ([, left], [, right]) => right - left
  )[0];
  const topAngle = metrics.angleEffectiveness[0];
  const highRiskCount = metrics.riskDistribution.high ?? 0;
  const recommendations = suggestPortfolioRebalance(metrics);

  const highlights = [
    metrics.completedInitiatives > 0
      ? `${metrics.completedInitiatives} initiatives have already shipped into execution.`
      : "No initiatives have shipped yet — the portfolio remains in build-up mode.",
    dominantStage
      ? `${dominantStage[1]} initiatives currently sit in ${dominantStage[0]}.`
      : "No dominant lifecycle stage detected yet.",
    topAngle
      ? `${topAngle.angleId} leads the portfolio with a ${Math.round(topAngle.successRate * 100)}% success rate.`
      : "Angle usage data will populate as initiatives accumulate.",
  ];

  const risks = [
    highRiskCount > 0
      ? `${highRiskCount} initiatives are flagged as high risk based on age, stage, or low impact.`
      : "High-risk initiative count is currently at zero.",
    metrics.stageDistribution.ideation > metrics.activeInitiatives * 0.5 &&
    metrics.activeInitiatives > 2
      ? "The portfolio is ideation-heavy, which can slow conversion into prototypes and launches."
      : "Stage mix is reasonably balanced across the active pipeline.",
  ];

  return ExecutiveReportSchema.parse({
    generatedAt: new Date().toISOString(),
    period,
    summary: `Portfolio contains ${metrics.totalInitiatives} tracked initiatives with ${metrics.activeInitiatives} active efforts and a ${Math.round(completionRate * 100)}% completion rate.`,
    kpis: [
      {
        name: "Active initiatives",
        value: metrics.activeInitiatives,
        unit: "initiatives",
        trend: metrics.activeInitiatives >= metrics.completedInitiatives ? "up" : "stable",
      },
      {
        name: "Completion rate",
        value: round(completionRate * 100, 1),
        unit: "%",
        trend: completionRate >= 0.2 ? "up" : completionRate === 0 ? "down" : "stable",
      },
      {
        name: "Weekly idea velocity",
        value: metrics.ideaVelocity.weekly,
        unit: "ideas/week",
        trend:
          metrics.ideaVelocity.weekly >= 3
            ? "up"
            : metrics.ideaVelocity.weekly === 0
              ? "down"
              : "stable",
      },
      {
        name: "High-risk initiatives",
        value: highRiskCount,
        unit: "initiatives",
        trend: highRiskCount === 0 ? "stable" : "down",
      },
    ],
    highlights,
    risks,
    recommendations,
  });
}

// AI-powered portfolio rebalancing suggestion (template, not LLM-calling)
export function suggestPortfolioRebalance(metrics: DashboardMetrics): string[] {
  const suggestions: string[] = [];
  const total = metrics.totalInitiatives || 1;
  const ideationShare = (metrics.stageDistribution.ideation ?? 0) / total;
  const topAngle = metrics.angleEffectiveness[0];

  if (ideationShare > 0.5 && metrics.activeInitiatives > 2) {
    suggestions.push(
      "Shift review capacity toward evaluation so ideation backlog converts into validated opportunities."
    );
  }

  if ((metrics.riskDistribution.high ?? 0) > (metrics.riskDistribution.low ?? 0)) {
    suggestions.push(
      "De-risk the portfolio by pruning or accelerating high-risk initiatives before adding net-new work."
    );
  }

  if (topAngle && topAngle.usageCount / total > 0.6) {
    suggestions.push(
      `Diversify angle usage beyond ${topAngle.angleId} to reduce concentration risk and broaden discovery.`
    );
  }

  if (metrics.completedInitiatives / total < 0.15 && metrics.activeInitiatives >= 3) {
    suggestions.push(
      "Prioritize late-stage prototyping and shipping milestones to improve portfolio realization."
    );
  }

  const overloadedMember = metrics.teamPatterns?.find((pattern) => pattern.initiativeCount >= 5);
  if (overloadedMember) {
    suggestions.push(
      `Rebalance team ownership away from ${overloadedMember.memberId} to avoid delivery bottlenecks.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Portfolio mix is healthy; maintain the current balance while monitoring emerging risks weekly."
    );
  }

  return [...new Set(suggestions)];
}
