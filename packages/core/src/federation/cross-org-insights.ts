/**
 * @module federation/cross-org-insights
 *
 * Cross-organization benchmarking, trend aggregation, and
 * privacy-preserving innovation insights. Uses differential privacy
 * for safe cross-org comparison.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Types ----

export interface CrossOrgBenchmark {
  id: string;
  metric: string;
  orgValue: number;
  networkAvg: number;
  networkMedian: number;
  percentile: number;
  trend: "above-average" | "average" | "below-average";
  recommendation?: string;
  generatedAt: string;
}

export interface IndustryTrend {
  id: string;
  trendName: string;
  description: string;
  momentum: number;
  adoptionRate: number;
  relevantAngles: string[];
  evidenceCount: number;
  firstDetected: string;
  lastUpdated: string;
  confidence: number;
}

export interface PrivacyBudget {
  orgId: string;
  epsilon: number;
  delta: number;
  queriesRemaining: number;
  resetAt: string;
}

export interface AggregateInsight {
  id: string;
  type: "trend" | "benchmark" | "opportunity" | "risk";
  title: string;
  description: string;
  affectedOrgs: number;
  confidence: number;
  actionable: boolean;
  suggestedActions: string[];
  metadata: Record<string, unknown>;
  generatedAt: string;
}

export const DataResidencyConfigSchema = z.object({
  orgId: z.string().max(100),
  region: z.enum(["us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "ap-northeast"]),
  allowCrossRegion: z.boolean().default(false),
  retentionDays: z.number().int().min(30).max(3650).default(365),
  encryptionRequired: z.boolean().default(true),
  auditTrailEnabled: z.boolean().default(true),
});

export type DataResidencyConfig = z.infer<typeof DataResidencyConfigSchema>;

// ---- In-Memory Stores ----

const benchmarks = new Map<string, CrossOrgBenchmark[]>();
const trends = new Map<string, IndustryTrend>();
const privacyBudgets = new Map<string, PrivacyBudget>();
const residencyConfigs = new Map<string, DataResidencyConfig>();
const insights: AggregateInsight[] = [];

// ---- Differential Privacy Utilities ----

/**
 * Add Laplace noise for differential privacy.
 */
function addLaplaceNoise(value: number, sensitivity: number, epsilon: number): number {
  const scale = sensitivity / epsilon;
  // Laplace distribution: -scale * sign(u) * ln(1 - 2*|u|) where u is uniform(-0.5, 0.5)
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Math.max(0, value + noise);
}

/**
 * Privatize a count using differential privacy.
 */
export function privatizeValue(
  value: number,
  orgId: string,
  epsilon: number = 1.0
): { privatized: number; budgetRemaining: number } {
  const budget = getPrivacyBudget(orgId);

  if (budget.queriesRemaining <= 0) {
    throw new Error("Privacy budget exhausted. Wait for reset.");
  }

  budget.queriesRemaining--;
  budget.epsilon = Math.max(0.01, budget.epsilon - epsilon * 0.1);

  const privatized = Math.round(addLaplaceNoise(value, 1, epsilon));

  return { privatized, budgetRemaining: budget.queriesRemaining };
}

// ---- Privacy Budget Management ----

export function getPrivacyBudget(orgId: string): PrivacyBudget {
  const existing = privacyBudgets.get(orgId);
  if (existing) {
    // Reset if expired
    if (new Date(existing.resetAt) < new Date()) {
      return resetPrivacyBudget(orgId);
    }
    return existing;
  }
  return resetPrivacyBudget(orgId);
}

function resetPrivacyBudget(orgId: string): PrivacyBudget {
  const budget: PrivacyBudget = {
    orgId,
    epsilon: 10.0,
    delta: 1e-5,
    queriesRemaining: 100,
    resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  privacyBudgets.set(orgId, budget);
  return budget;
}

// ---- Cross-Org Benchmarking ----

/**
 * Generate benchmarks comparing an org's metrics against the network.
 */
export function generateBenchmarks(
  orgId: string,
  orgMetrics: Record<string, number>,
  networkMetrics?: Array<Record<string, number>>
): CrossOrgBenchmark[] {
  const results: CrossOrgBenchmark[] = [];

  // Use provided network data or generate synthetic
  const networkData = networkMetrics ?? generateSyntheticNetworkData();

  for (const [metric, orgValue] of Object.entries(orgMetrics)) {
    const networkValues = networkData
      .map((n) => n[metric])
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);

    if (networkValues.length === 0) continue;

    const networkAvg = networkValues.reduce((s, v) => s + v, 0) / networkValues.length;
    const networkMedian = networkValues[Math.floor(networkValues.length / 2)];
    const belowCount = networkValues.filter((v) => v <= orgValue).length;
    const percentile = Math.round((belowCount / networkValues.length) * 100);

    let trend: CrossOrgBenchmark["trend"] = "average";
    let recommendation: string | undefined;

    if (percentile >= 75) {
      trend = "above-average";
      recommendation = `Strong performance in ${metric}. Consider sharing your approach with the network.`;
    } else if (percentile <= 25) {
      trend = "below-average";
      recommendation = `Below network average for ${metric}. Review top-performing organizations' approaches.`;
    }

    results.push({
      id: randomUUID(),
      metric,
      orgValue: Math.round(addLaplaceNoise(orgValue, 1, 2) * 10) / 10,
      networkAvg: Math.round(networkAvg * 10) / 10,
      networkMedian: Math.round(networkMedian * 10) / 10,
      percentile,
      trend,
      recommendation,
      generatedAt: new Date().toISOString(),
    });
  }

  benchmarks.set(orgId, results);
  return results;
}

function generateSyntheticNetworkData(): Array<Record<string, number>> {
  // Generate realistic-looking network data for demo
  return Array.from({ length: 20 }, () => ({
    sessionsPerMonth: Math.floor(Math.random() * 100) + 10,
    avgIdeaQuality: Math.random() * 4 + 5,
    anglesDiversity: Math.random() * 0.6 + 0.3,
    innovationVelocity: Math.floor(Math.random() * 30) + 5,
    collaborationRate: Math.random() * 0.5 + 0.3,
  }));
}

// ---- Industry Trend Detection ----

/**
 * Detect industry-level trends from aggregated network data.
 */
export function detectIndustryTrends(
  patterns: Array<{
    angleId: string;
    domain: string;
    frequency: number;
    successRate: number;
    timestamp: string;
  }>
): IndustryTrend[] {
  const domainAngles = new Map<
    string,
    {
      count: number;
      successSum: number;
      angles: Set<string>;
      timestamps: string[];
    }
  >();

  for (const p of patterns) {
    const key = p.domain;
    const entry = domainAngles.get(key) ?? {
      count: 0,
      successSum: 0,
      angles: new Set(),
      timestamps: [],
    };
    entry.count += p.frequency;
    entry.successSum += p.successRate * p.frequency;
    entry.angles.add(p.angleId);
    entry.timestamps.push(p.timestamp);
    domainAngles.set(key, entry);
  }

  const detectedTrends: IndustryTrend[] = [];

  for (const [domain, data] of domainAngles) {
    if (data.count < 5) continue;

    const avgSuccess = data.successSum / data.count;
    const timestamps = data.timestamps.sort();
    const momentum = Math.min(1, data.count / 50);

    const trend: IndustryTrend = {
      id: randomUUID(),
      trendName: `${domain} Innovation`,
      description: `Increasing innovation activity in ${domain} using ${[...data.angles].join(", ")} angles.`,
      momentum,
      adoptionRate: Math.min(1, data.count / 30),
      relevantAngles: [...data.angles],
      evidenceCount: data.count,
      firstDetected: timestamps[0],
      lastUpdated: timestamps[timestamps.length - 1],
      confidence: Math.min(0.95, 0.5 + avgSuccess * 0.3 + momentum * 0.2),
    };

    trends.set(trend.id, trend);
    detectedTrends.push(trend);
  }

  return detectedTrends.sort((a, b) => b.momentum - a.momentum);
}

// ---- Aggregate Insights ----

/**
 * Generate privacy-preserving aggregate insights across the network.
 */
export function generateAggregateInsights(networkData: {
  totalOrgs: number;
  totalSessions: number;
  topAngles: Array<{ angleId: string; count: number }>;
  avgQuality: number;
}): AggregateInsight[] {
  const newInsights: AggregateInsight[] = [];
  const now = new Date().toISOString();

  // Trend insight: most popular angles
  if (networkData.topAngles.length > 0) {
    const topAngle = networkData.topAngles[0];
    newInsights.push({
      id: randomUUID(),
      type: "trend",
      title: `"${topAngle.angleId}" is the most popular angle across the network`,
      description: `Used by ${Math.round(addLaplaceNoise(topAngle.count, 1, 1))} organizations. Consider trying it if you haven't.`,
      affectedOrgs: Math.round(addLaplaceNoise(networkData.totalOrgs * 0.6, 1, 1)),
      confidence: 0.85,
      actionable: true,
      suggestedActions: [
        `Try the "${topAngle.angleId}" angle in your next session`,
        "Compare your results with network benchmarks",
      ],
      metadata: { angleId: topAngle.angleId },
      generatedAt: now,
    });
  }

  // Benchmark insight
  if (networkData.avgQuality > 0) {
    newInsights.push({
      id: randomUUID(),
      type: "benchmark",
      title: "Network Innovation Quality Benchmark",
      description: `Average idea quality across the network is ${addLaplaceNoise(networkData.avgQuality, 0.5, 2).toFixed(1)}/10. How does your team compare?`,
      affectedOrgs: networkData.totalOrgs,
      confidence: 0.75,
      actionable: true,
      suggestedActions: [
        "Run a self-assessment against these benchmarks",
        "Focus on angles that produce higher-quality ideas",
      ],
      metadata: { avgQuality: networkData.avgQuality },
      generatedAt: now,
    });
  }

  insights.push(...newInsights);
  if (insights.length > 100) insights.splice(0, insights.length - 100);

  return newInsights;
}

export function getAggregateInsights(): AggregateInsight[] {
  return [...insights];
}

// ---- Data Residency ----

export function setDataResidency(config: DataResidencyConfig): DataResidencyConfig {
  const validated = DataResidencyConfigSchema.parse(config);
  residencyConfigs.set(validated.orgId, validated);
  return validated;
}

export function getDataResidency(orgId: string): DataResidencyConfig | undefined {
  return residencyConfigs.get(orgId);
}

export function checkDataResidencyCompliance(orgId: string): {
  compliant: boolean;
  violations: string[];
} {
  const config = residencyConfigs.get(orgId);
  const violations: string[] = [];

  if (!config) {
    violations.push("No data residency configuration set");
    return { compliant: false, violations };
  }

  if (!config.encryptionRequired) {
    violations.push("Encryption not enforced for data at rest");
  }

  if (!config.auditTrailEnabled) {
    violations.push("Audit trail not enabled");
  }

  if (config.retentionDays > 730 && config.region.startsWith("eu")) {
    violations.push("EU data retention exceeds recommended 2-year limit");
  }

  return { compliant: violations.length === 0, violations };
}

export function clearCrossOrgData(): void {
  benchmarks.clear();
  trends.clear();
  privacyBudgets.clear();
  residencyConfigs.clear();
  insights.length = 0;
}
