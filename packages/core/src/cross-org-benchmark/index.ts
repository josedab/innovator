/**
 * @module cross-org-benchmark
 *
 * Cross-Org Benchmarking — anonymous innovation metrics comparison
 * across organizations. Aggregates and anonymizes innovation output
 * data to let teams benchmark ideation velocity, quality scores,
 * and framework usage against peers.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for anonymized organization metrics. */
export const OrgMetricsSchema = z.object({
  orgId: z.string().max(200).describe("Anonymous hash of organization ID"),
  periodStart: z.string(),
  periodEnd: z.string(),
  sessionCount: z.number().min(0),
  ideaCount: z.number().min(0),
  averageIdeaScore: z.number().min(0).max(10),
  anglesUsed: z.record(z.number()),
  uniqueSubjects: z.number().min(0),
  averageSessionDurationMs: z.number().min(0),
  topAngle: z.string().max(100),
  ideaVelocity: z.number().min(0).describe("Ideas per session"),
  qualityDistribution: z.object({
    low: z.number().min(0),
    medium: z.number().min(0),
    high: z.number().min(0),
  }),
  submittedAt: z.string(),
});

/** Schema for benchmark comparison result. */
export const BenchmarkComparisonSchema = z.object({
  orgId: z.string().max(200),
  period: z.string(),
  percentiles: z.object({
    sessionCount: z.number().min(0).max(100),
    ideaCount: z.number().min(0).max(100),
    averageScore: z.number().min(0).max(100),
    ideaVelocity: z.number().min(0).max(100),
    qualityRatio: z.number().min(0).max(100),
  }),
  peerStats: z.object({
    totalOrgs: z.number().min(0),
    medianSessionCount: z.number(),
    medianIdeaCount: z.number(),
    medianScore: z.number(),
    medianVelocity: z.number(),
  }),
  recommendations: z.array(z.string().max(500)).max(10),
  comparedAt: z.string(),
});

/** Schema for aggregate network stats. */
export const NetworkStatsSchema = z.object({
  totalOrganizations: z.number().min(0),
  totalSessions: z.number().min(0),
  totalIdeas: z.number().min(0),
  averageScore: z.number(),
  mostPopularAngle: z.string().max(100),
  ideaVelocityDistribution: z.object({
    p25: z.number(),
    p50: z.number(),
    p75: z.number(),
    p90: z.number(),
  }),
  updatedAt: z.string(),
});

// ---- Types ----

export type OrgMetrics = z.infer<typeof OrgMetricsSchema>;
export type BenchmarkComparison = z.infer<typeof BenchmarkComparisonSchema>;
export type NetworkStats = z.infer<typeof NetworkStatsSchema>;

// ---- In-Memory Store ----

const metricsStore: OrgMetrics[] = [];

// ---- Core Functions ----

/**
 * Anonymize and submit organization metrics for benchmarking.
 *
 * @param orgId - Organization identifier (will be hashed)
 * @param metrics - Raw metrics data
 * @returns The anonymized metrics record
 */
export function submitMetrics(
  orgId: string,
  metrics: Omit<OrgMetrics, "orgId" | "submittedAt">
): OrgMetrics {
  const anonymousId = anonymizeOrgId(orgId);
  const record: OrgMetrics = {
    ...metrics,
    orgId: anonymousId,
    submittedAt: new Date().toISOString(),
  };

  // Replace existing metrics for same org and period
  const existingIdx = metricsStore.findIndex(
    (m) => m.orgId === anonymousId && m.periodStart === metrics.periodStart
  );
  if (existingIdx >= 0) {
    metricsStore[existingIdx] = record;
  } else {
    metricsStore.push(record);
  }

  return record;
}

/**
 * Compare an organization's metrics against peers.
 *
 * @param orgId - Organization identifier (will be hashed)
 * @param periodStart - Start of comparison period
 * @returns Benchmark comparison with percentiles
 */
export function compareToPeers(
  orgId: string,
  periodStart?: string
): BenchmarkComparison | undefined {
  const anonymousId = anonymizeOrgId(orgId);
  const orgData = metricsStore.find(
    (m) => m.orgId === anonymousId && (!periodStart || m.periodStart === periodStart)
  );
  if (!orgData) return undefined;

  // Filter metrics from the same period
  const peerMetrics = metricsStore.filter(
    (m) => m.periodStart === orgData.periodStart
  );

  if (peerMetrics.length < 2) {
    return {
      orgId: anonymousId,
      period: orgData.periodStart,
      percentiles: {
        sessionCount: 50,
        ideaCount: 50,
        averageScore: 50,
        ideaVelocity: 50,
        qualityRatio: 50,
      },
      peerStats: {
        totalOrgs: peerMetrics.length,
        medianSessionCount: orgData.sessionCount,
        medianIdeaCount: orgData.ideaCount,
        medianScore: orgData.averageIdeaScore,
        medianVelocity: orgData.ideaVelocity,
      },
      recommendations: ["Not enough peer data for meaningful comparison"],
      comparedAt: new Date().toISOString(),
    };
  }

  // Compute percentiles
  const sessionCounts = peerMetrics.map((m) => m.sessionCount).sort((a, b) => a - b);
  const ideaCounts = peerMetrics.map((m) => m.ideaCount).sort((a, b) => a - b);
  const scores = peerMetrics.map((m) => m.averageIdeaScore).sort((a, b) => a - b);
  const velocities = peerMetrics.map((m) => m.ideaVelocity).sort((a, b) => a - b);
  const qualityRatios = peerMetrics
    .map((m) => m.qualityDistribution.high / Math.max(1, m.qualityDistribution.low + m.qualityDistribution.medium + m.qualityDistribution.high))
    .sort((a, b) => a - b);

  const orgQualityRatio = orgData.qualityDistribution.high /
    Math.max(1, orgData.qualityDistribution.low + orgData.qualityDistribution.medium + orgData.qualityDistribution.high);

  const percentiles = {
    sessionCount: computePercentile(sessionCounts, orgData.sessionCount),
    ideaCount: computePercentile(ideaCounts, orgData.ideaCount),
    averageScore: computePercentile(scores, orgData.averageIdeaScore),
    ideaVelocity: computePercentile(velocities, orgData.ideaVelocity),
    qualityRatio: computePercentile(qualityRatios, orgQualityRatio),
  };

  // Generate recommendations
  const recommendations: string[] = [];
  if (percentiles.ideaVelocity < 30) {
    recommendations.push("Your idea velocity is below average. Try using more angles per session or shorter investigation subjects.");
  }
  if (percentiles.averageScore < 30) {
    recommendations.push("Quality scores are below peers. Consider using angle recommendations and deeper investigations.");
  }
  if (percentiles.sessionCount < 30) {
    recommendations.push("Session frequency is low. Regular innovation cadences lead to better outcomes.");
  }
  if (percentiles.qualityRatio > 80) {
    recommendations.push("Excellent quality ratio! You're consistently producing high-scoring ideas.");
  }
  if (percentiles.ideaVelocity > 80) {
    recommendations.push("Outstanding idea velocity! Consider focusing on idea quality and follow-through.");
  }

  return {
    orgId: anonymousId,
    period: orgData.periodStart,
    percentiles,
    peerStats: {
      totalOrgs: peerMetrics.length,
      medianSessionCount: median(sessionCounts),
      medianIdeaCount: median(ideaCounts),
      medianScore: Math.round(median(scores) * 10) / 10,
      medianVelocity: Math.round(median(velocities) * 10) / 10,
    },
    recommendations,
    comparedAt: new Date().toISOString(),
  };
}

/**
 * Get aggregate network statistics.
 */
export function getNetworkStats(): NetworkStats {
  if (metricsStore.length === 0) {
    return {
      totalOrganizations: 0,
      totalSessions: 0,
      totalIdeas: 0,
      averageScore: 0,
      mostPopularAngle: "N/A",
      ideaVelocityDistribution: { p25: 0, p50: 0, p75: 0, p90: 0 },
      updatedAt: new Date().toISOString(),
    };
  }

  const uniqueOrgs = new Set(metricsStore.map((m) => m.orgId)).size;
  const totalSessions = metricsStore.reduce((s, m) => s + m.sessionCount, 0);
  const totalIdeas = metricsStore.reduce((s, m) => s + m.ideaCount, 0);
  const avgScore = metricsStore.reduce((s, m) => s + m.averageIdeaScore, 0) / metricsStore.length;

  // Most popular angle
  const angleCounts = new Map<string, number>();
  for (const m of metricsStore) {
    for (const [angle, count] of Object.entries(m.anglesUsed)) {
      angleCounts.set(angle, (angleCounts.get(angle) ?? 0) + count);
    }
  }
  const mostPopularAngle = Array.from(angleCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

  // Velocity distribution
  const velocities = metricsStore.map((m) => m.ideaVelocity).sort((a, b) => a - b);

  return {
    totalOrganizations: uniqueOrgs,
    totalSessions,
    totalIdeas,
    averageScore: Math.round(avgScore * 10) / 10,
    mostPopularAngle,
    ideaVelocityDistribution: {
      p25: percentileValue(velocities, 25),
      p50: percentileValue(velocities, 50),
      p75: percentileValue(velocities, 75),
      p90: percentileValue(velocities, 90),
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Export benchmark comparison as markdown.
 */
export function benchmarkToMarkdown(comparison: BenchmarkComparison): string {
  const lines: string[] = [
    "# Cross-Organization Innovation Benchmark",
    "",
    `**Period:** ${comparison.period}`,
    `**Peer Organizations:** ${comparison.peerStats.totalOrgs}`,
    "",
    "## Your Percentile Rankings",
    "",
    "| Metric | Percentile | Peer Median |",
    "|--------|-----------|-------------|",
    `| Sessions | ${comparison.percentiles.sessionCount}th | ${comparison.peerStats.medianSessionCount} |`,
    `| Ideas | ${comparison.percentiles.ideaCount}th | ${comparison.peerStats.medianIdeaCount} |`,
    `| Avg Score | ${comparison.percentiles.averageScore}th | ${comparison.peerStats.medianScore} |`,
    `| Velocity | ${comparison.percentiles.ideaVelocity}th | ${comparison.peerStats.medianVelocity} |`,
    `| Quality | ${comparison.percentiles.qualityRatio}th | — |`,
    "",
  ];

  if (comparison.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    for (const rec of comparison.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join("\n");
}

/**
 * Clear all benchmark data (for testing).
 */
export function clearBenchmarkData(): void {
  metricsStore.length = 0;
}

// ---- Differential Privacy ----

export interface DifferentialPrivacyConfig {
  epsilon: number;
  enabled: boolean;
}

let dpConfig: DifferentialPrivacyConfig = { epsilon: 1.0, enabled: true };

/** Configure differential privacy parameters. */
export function setDifferentialPrivacy(config: Partial<DifferentialPrivacyConfig>): void {
  dpConfig = { ...dpConfig, ...config };
}

/** Get current differential privacy configuration. */
export function getDifferentialPrivacy(): DifferentialPrivacyConfig {
  return { ...dpConfig };
}

/**
 * Submit metrics with differential privacy noise injection.
 * Uses the Laplace mechanism to add calibrated noise to numeric fields,
 * preserving aggregate accuracy while protecting individual org data.
 */
export function submitMetricsWithPrivacy(
  orgId: string,
  metrics: Omit<OrgMetrics, "orgId" | "submittedAt">
): OrgMetrics {
  if (!dpConfig.enabled) {
    return submitMetrics(orgId, metrics);
  }

  // Apply Laplace noise to numeric fields
  const noisyMetrics = {
    ...metrics,
    sessionCount: Math.max(0, Math.round(metrics.sessionCount + laplace(1 / dpConfig.epsilon))),
    ideaCount: Math.max(0, Math.round(metrics.ideaCount + laplace(1 / dpConfig.epsilon))),
    averageIdeaScore: Math.max(0, Math.min(10,
      Math.round((metrics.averageIdeaScore + laplace(0.5 / dpConfig.epsilon)) * 10) / 10)),
    uniqueSubjects: Math.max(0, Math.round(metrics.uniqueSubjects + laplace(1 / dpConfig.epsilon))),
    ideaVelocity: Math.max(0,
      Math.round((metrics.ideaVelocity + laplace(0.5 / dpConfig.epsilon)) * 10) / 10),
    qualityDistribution: {
      low: Math.max(0, Math.round(metrics.qualityDistribution.low + laplace(1 / dpConfig.epsilon))),
      medium: Math.max(0, Math.round(metrics.qualityDistribution.medium + laplace(1 / dpConfig.epsilon))),
      high: Math.max(0, Math.round(metrics.qualityDistribution.high + laplace(1 / dpConfig.epsilon))),
    },
  };

  return submitMetrics(orgId, noisyMetrics);
}

/**
 * Generate Laplace noise for differential privacy.
 * Uses the inverse CDF method: X = μ - b * sign(U) * ln(1 - 2|U|)
 * where U is uniform on (-0.5, 0.5).
 */
function laplace(scale: number): number {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

// ---- Helpers ----

function anonymizeOrgId(orgId: string): string {
  // Simple hash for anonymization
  let hash = 0;
  for (let i = 0; i < orgId.length; i++) {
    const char = orgId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `org-${Math.abs(hash).toString(36)}`;
}

function computePercentile(sortedValues: number[], value: number): number {
  if (sortedValues.length === 0) return 50;
  const below = sortedValues.filter((v) => v < value).length;
  return Math.round((below / sortedValues.length) * 100);
}

function percentileValue(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return Math.round((sortedValues[Math.max(0, index)] ?? 0) * 10) / 10;
}

function median(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 !== 0
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
}
