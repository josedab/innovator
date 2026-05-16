/**
 * @module cross-org-benchmark/privacy-analytics
 *
 * Privacy budget tracking, trend analysis, and comparison UI data
 * for cross-organization innovation benchmarking.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const PrivacyBudgetEntrySchema = z.object({
  id: z.string(),
  orgId: z.string().max(200),
  epsilon: z.number().min(0),
  queryType: z.string().max(200),
  timestamp: z.string(),
});
export type PrivacyBudgetEntry = z.infer<typeof PrivacyBudgetEntrySchema>;

export const PrivacyBudgetSummarySchema = z.object({
  orgId: z.string(),
  totalEpsilon: z.number().min(0),
  maxEpsilon: z.number().min(0),
  remaining: z.number().min(0),
  entries: z.array(PrivacyBudgetEntrySchema),
  isExhausted: z.boolean(),
});
export type PrivacyBudgetSummary = z.infer<typeof PrivacyBudgetSummarySchema>;

export const BenchmarkTrendSchema = z.object({
  metric: z.string().max(200),
  dataPoints: z.array(
    z.object({
      period: z.string(),
      orgValue: z.number(),
      peerMedian: z.number(),
      peerP25: z.number(),
      peerP75: z.number(),
    })
  ),
  trend: z.enum(["improving", "stable", "declining"]),
  trendStrength: z.number().min(0).max(1),
});
export type BenchmarkTrend = z.infer<typeof BenchmarkTrendSchema>;

export const ComparisonUIDataSchema = z.object({
  orgId: z.string(),
  period: z.string(),
  metrics: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      percentile: z.number().min(0).max(100),
      peerMedian: z.number(),
      peerP25: z.number(),
      peerP75: z.number(),
      direction: z.enum(["higher-is-better", "lower-is-better"]),
    })
  ),
  trends: z.array(BenchmarkTrendSchema),
  industryRank: z
    .object({
      rank: z.number().int().min(1),
      total: z.number().int().min(1),
      label: z.string().max(100),
    })
    .optional(),
  recommendations: z.array(z.string().max(500)),
  privacyBudget: PrivacyBudgetSummarySchema,
  generatedAt: z.string(),
});
export type ComparisonUIData = z.infer<typeof ComparisonUIDataSchema>;

// ---- Privacy Budget Store ----

const budgetStore = new Map<string, PrivacyBudgetEntry[]>();
const MAX_EPSILON = 1.0; // ε ≤ 1.0 differential privacy

/** Record a privacy budget expenditure. */
export function recordBudgetExpenditure(
  orgId: string,
  epsilon: number,
  queryType: string
): PrivacyBudgetEntry {
  const entry: PrivacyBudgetEntry = {
    id: randomUUID(),
    orgId,
    epsilon,
    queryType,
    timestamp: new Date().toISOString(),
  };
  const list = budgetStore.get(orgId) ?? [];
  list.push(entry);
  budgetStore.set(orgId, list);
  return entry;
}

/** Get privacy budget summary for an organization. */
export function getPrivacyBudgetSummary(orgId: string): PrivacyBudgetSummary {
  const entries = budgetStore.get(orgId) ?? [];
  const totalEpsilon = entries.reduce((sum, e) => sum + e.epsilon, 0);
  return {
    orgId,
    totalEpsilon: +totalEpsilon.toFixed(4),
    maxEpsilon: MAX_EPSILON,
    remaining: +Math.max(0, MAX_EPSILON - totalEpsilon).toFixed(4),
    entries,
    isExhausted: totalEpsilon >= MAX_EPSILON,
  };
}

/** Check if an organization has sufficient privacy budget. */
export function hasBudget(orgId: string, requiredEpsilon: number): boolean {
  const summary = getPrivacyBudgetSummary(orgId);
  return summary.remaining >= requiredEpsilon;
}

// ---- Trend Analysis ----

/** Compute percentile rank of a value in a sorted array. */
function percentileRank(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 50;
  let count = 0;
  for (const v of sortedValues) {
    if (v < value) count++;
    else if (v === value) count += 0.5;
  }
  return Math.round((count / sortedValues.length) * 100);
}

/** Compute percentile value from sorted array. */
function percentileValue(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

/** Determine trend from data points. */
function determineTrend(values: number[]): { trend: BenchmarkTrend["trend"]; strength: number } {
  if (values.length < 2) return { trend: "stable", strength: 0 };

  const first = values.slice(0, Math.ceil(values.length / 2));
  const second = values.slice(Math.floor(values.length / 2));
  const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
  const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;

  const change = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;

  if (change > 0.05) return { trend: "improving", strength: Math.min(1, Math.abs(change)) };
  if (change < -0.05) return { trend: "declining", strength: Math.min(1, Math.abs(change)) };
  return { trend: "stable", strength: 0 };
}

/** Build comparison UI data from metrics submissions. */
export function buildComparisonUIData(
  orgId: string,
  orgMetrics: {
    sessionCount: number;
    ideaCount: number;
    averageIdeaScore: number;
    ideaVelocity: number;
  },
  peerMetrics: Array<{
    sessionCount: number;
    ideaCount: number;
    averageIdeaScore: number;
    ideaVelocity: number;
  }>
): ComparisonUIData {
  const sessionCounts = peerMetrics.map((p) => p.sessionCount).sort((a, b) => a - b);
  const ideaCounts = peerMetrics.map((p) => p.ideaCount).sort((a, b) => a - b);
  const scores = peerMetrics.map((p) => p.averageIdeaScore).sort((a, b) => a - b);
  const velocities = peerMetrics.map((p) => p.ideaVelocity).sort((a, b) => a - b);

  const metrics = [
    {
      name: "Sessions",
      value: orgMetrics.sessionCount,
      percentile: percentileRank(orgMetrics.sessionCount, sessionCounts),
      peerMedian: percentileValue(sessionCounts, 50),
      peerP25: percentileValue(sessionCounts, 25),
      peerP75: percentileValue(sessionCounts, 75),
      direction: "higher-is-better" as const,
    },
    {
      name: "Ideas Generated",
      value: orgMetrics.ideaCount,
      percentile: percentileRank(orgMetrics.ideaCount, ideaCounts),
      peerMedian: percentileValue(ideaCounts, 50),
      peerP25: percentileValue(ideaCounts, 25),
      peerP75: percentileValue(ideaCounts, 75),
      direction: "higher-is-better" as const,
    },
    {
      name: "Average Score",
      value: orgMetrics.averageIdeaScore,
      percentile: percentileRank(orgMetrics.averageIdeaScore, scores),
      peerMedian: percentileValue(scores, 50),
      peerP25: percentileValue(scores, 25),
      peerP75: percentileValue(scores, 75),
      direction: "higher-is-better" as const,
    },
    {
      name: "Ideas per Session",
      value: orgMetrics.ideaVelocity,
      percentile: percentileRank(orgMetrics.ideaVelocity, velocities),
      peerMedian: percentileValue(velocities, 50),
      peerP25: percentileValue(velocities, 25),
      peerP75: percentileValue(velocities, 75),
      direction: "higher-is-better" as const,
    },
  ];

  // Generate recommendations
  const recommendations: string[] = [];
  for (const m of metrics) {
    if (m.percentile < 25) {
      recommendations.push(
        `${m.name} is below 25th percentile. Consider increasing innovation activity.`
      );
    } else if (m.percentile > 90) {
      recommendations.push(`${m.name} is in the top 10%! Share your best practices with peers.`);
    }
  }

  // Compute rank
  const avgPercentile = metrics.reduce((sum, m) => sum + m.percentile, 0) / metrics.length;
  const totalOrgs = peerMetrics.length + 1;
  const rank = Math.max(1, Math.round(totalOrgs * (1 - avgPercentile / 100)));

  const budgetSummary = getPrivacyBudgetSummary(orgId);

  // Record budget expenditure for this comparison
  recordBudgetExpenditure(orgId, 0.1, "comparison");

  return {
    orgId,
    period: new Date().toISOString().slice(0, 7),
    metrics,
    trends: [],
    industryRank: {
      rank,
      total: totalOrgs,
      label:
        avgPercentile > 75
          ? "Leader"
          : avgPercentile > 50
            ? "Above Average"
            : avgPercentile > 25
              ? "Average"
              : "Developing",
    },
    recommendations,
    privacyBudget: budgetSummary,
    generatedAt: new Date().toISOString(),
  };
}

// ---- Laplace Mechanism Integration ----

/**
 * Apply Laplace noise for differential privacy.
 * @param value — the true value to privatize
 * @param sensitivity — the sensitivity of the query (max change from one record)
 * @param epsilon — privacy budget for this query
 */
export function laplaceMechanismNoise(value: number, sensitivity: number, epsilon: number): number {
  if (epsilon <= 0) throw new Error("Epsilon must be positive");
  const scale = sensitivity / epsilon;
  // Sample from Laplace distribution: -scale * sign(u) * ln(1 - 2|u|)
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + noise;
}

/** Apply Laplace noise to a set of metrics and track budget. */
export function privatizeMetrics(
  orgId: string,
  metrics: Record<string, number>,
  opts?: { epsilon?: number; sensitivity?: number }
): { privatized: Record<string, number>; epsilonSpent: number; budgetRemaining: number } {
  const epsilon = opts?.epsilon ?? 0.1;
  const sensitivity = opts?.sensitivity ?? 1;
  const totalEpsilon = epsilon * Object.keys(metrics).length;

  // Check budget
  const budget = getPrivacyBudgetSummary(orgId);
  if (budget.remaining < totalEpsilon) {
    throw new Error(
      `Insufficient privacy budget: need ${totalEpsilon.toFixed(4)}, have ${budget.remaining.toFixed(4)}`
    );
  }

  const privatized: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    privatized[key] = +laplaceMechanismNoise(value, sensitivity, epsilon).toFixed(4);
    recordBudgetExpenditure(orgId, epsilon, `privatize:${key}`);
  }

  const updatedBudget = getPrivacyBudgetSummary(orgId);

  return {
    privatized,
    epsilonSpent: +totalEpsilon.toFixed(4),
    budgetRemaining: updatedBudget.remaining,
  };
}

// ---- Automated Metric Collection ----

const metricsHistory = new Map<
  string,
  Array<{
    period: string;
    metrics: Record<string, number>;
    collectedAt: string;
  }>
>();

/** Collect and store metrics for an organization. */
export function collectOrgMetrics(
  orgId: string,
  metrics: Record<string, number>,
  period?: string
): void {
  const list = metricsHistory.get(orgId) ?? [];
  list.push({
    period: period ?? new Date().toISOString().slice(0, 7),
    metrics,
    collectedAt: new Date().toISOString(),
  });
  // Keep last 24 periods
  if (list.length > 24) list.splice(0, list.length - 24);
  metricsHistory.set(orgId, list);
}

/** Get historical metrics for an organization. */
export function getMetricsHistory(orgId: string): Array<{
  period: string;
  metrics: Record<string, number>;
  collectedAt: string;
}> {
  return metricsHistory.get(orgId) ?? [];
}

// ---- Historical Trend Computation ----

/** Compute benchmark trends from historical metric collections. */
export function computeBenchmarkTrends(
  orgId: string,
  metricNames: string[],
  peerHistories?: Map<string, Array<{ period: string; metrics: Record<string, number> }>>
): BenchmarkTrend[] {
  const orgHistory = metricsHistory.get(orgId) ?? [];
  if (orgHistory.length < 2) return [];

  return metricNames.map((metric) => {
    const orgValues = orgHistory
      .filter((h) => h.metrics[metric] != null)
      .map((h) => ({ period: h.period, value: h.metrics[metric] }));

    // Compute peer stats per period
    const dataPoints = orgValues.map((ov) => {
      const peerValues: number[] = [];
      if (peerHistories) {
        for (const [, history] of peerHistories) {
          const match = history.find((h) => h.period === ov.period);
          if (match?.metrics[metric] != null) peerValues.push(match.metrics[metric]);
        }
      }
      peerValues.sort((a, b) => a - b);
      return {
        period: ov.period,
        orgValue: ov.value,
        peerMedian: peerValues.length > 0 ? percentileValue(peerValues, 50) : ov.value,
        peerP25: peerValues.length > 0 ? percentileValue(peerValues, 25) : ov.value * 0.8,
        peerP75: peerValues.length > 0 ? percentileValue(peerValues, 75) : ov.value * 1.2,
      };
    });

    const values = orgValues.map((v) => v.value);
    const { trend, strength } = determineTrend(values);

    return { metric, dataPoints, trend, trendStrength: +strength.toFixed(3) };
  });
}

/** Clear all privacy analytics data (for testing). */
export function clearPrivacyAnalyticsData(): void {
  budgetStore.clear();
  metricsHistory.clear();
}
