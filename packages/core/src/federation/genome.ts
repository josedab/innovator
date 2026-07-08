/**
 * @module federation/genome
 *
 * Innovation Genome Network — the enrichment and intelligence layer
 * on top of the federation protocol. Adds differential privacy,
 * pipeline enrichment, gossip-based sync, and genome analytics.
 */

import { createHmac } from "node:crypto";
import type { FederationPattern } from "./federation.js";
import {
  getNode,
  listNodes,
  fetchRemotePatterns,
  mergePatterns,
  publishPatterns,
  getNetworkDashboard,
} from "./federation.js";

// ---- Differential Privacy ----

export interface DiffPrivacyConfig {
  epsilon: number;
  mechanism: "laplace" | "gaussian";
}

const DEFAULT_DP_CONFIG: DiffPrivacyConfig = {
  epsilon: 1.0,
  mechanism: "laplace",
};

/** Add Laplace noise for differential privacy. */
function laplaceMechanism(value: number, sensitivity: number, epsilon: number): number {
  const b = sensitivity / epsilon;
  // Laplace distribution via inverse CDF
  const u = Math.random() - 0.5;
  const noise = -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + noise;
}

/** Add Gaussian noise for differential privacy. */
function gaussianMechanism(
  value: number,
  sensitivity: number,
  epsilon: number,
  delta = 1e-5
): number {
  const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
  const u1 = Math.random();
  const u2 = Math.random();
  const noise = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2) * sigma;
  return value + noise;
}

/** Apply differential privacy to a numeric value. */
export function applyDifferentialPrivacy(
  value: number,
  sensitivity: number,
  config: DiffPrivacyConfig = DEFAULT_DP_CONFIG
): number {
  if (config.mechanism === "gaussian") {
    return gaussianMechanism(value, sensitivity, config.epsilon);
  }
  return laplaceMechanism(value, sensitivity, config.epsilon);
}

/** Apply differential privacy to a pattern's numeric fields. */
export function privatizePattern(
  pattern: FederationPattern,
  config: DiffPrivacyConfig = DEFAULT_DP_CONFIG
): FederationPattern {
  return {
    ...pattern,
    frequency: Math.max(0, Math.round(applyDifferentialPrivacy(pattern.frequency, 1, config))),
    successRate: Math.max(
      0,
      Math.min(1, applyDifferentialPrivacy(pattern.successRate, 0.1, config))
    ),
  };
}

// ---- Published Pattern with Cryptographic Signatures ----

export interface PublishedPattern {
  id: string;
  type: "angle-effectiveness" | "methodology-chain" | "domain-trend" | "anti-pattern";
  domainCategory: string;
  angleIds: string[];
  effectivenessScore: number;
  chainSequence?: string[];
  sampleSize: number;
  confidenceInterval: [number, number];
  timestamp: string;
  sourceNodeSignature: string;
  diffPrivacyBudget: number;
}

/** Compute a 95% confidence interval for a proportion using Wilson score. */
export function wilsonConfidenceInterval(
  successRate: number,
  sampleSize: number
): [number, number] {
  if (sampleSize <= 0) return [0, 1];
  const z = 1.96; // 95% CI
  const p = Math.max(0, Math.min(1, successRate));
  const n = Math.max(1, sampleSize);
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

  return [
    Math.max(0, Math.round(((centre - spread) / denominator) * 1000) / 1000),
    Math.min(1, Math.round(((centre + spread) / denominator) * 1000) / 1000),
  ];
}

/** Sign a pattern payload using HMAC-SHA256 (Ed25519 requires external dependencies). */
export function signPattern(
  pattern: Omit<PublishedPattern, "sourceNodeSignature">,
  secretKey: string
): string {
  const payload = JSON.stringify({
    id: pattern.id,
    type: pattern.type,
    domainCategory: pattern.domainCategory,
    angleIds: pattern.angleIds,
    effectivenessScore: pattern.effectivenessScore,
    timestamp: pattern.timestamp,
  });
  return createHmac("sha256", secretKey).update(payload).digest("hex");
}

/** Verify a pattern's signature. */
export function verifyPatternSignature(pattern: PublishedPattern, secretKey: string): boolean {
  const expectedSignature = signPattern(pattern, secretKey);
  return pattern.sourceNodeSignature === expectedSignature;
}

/** Convert a FederationPattern into a signed PublishedPattern. */
export function publishSignedPattern(
  pattern: FederationPattern,
  secretKey: string,
  dpConfig: DiffPrivacyConfig = DEFAULT_DP_CONFIG
): PublishedPattern {
  const privatized = privatizePattern(pattern, dpConfig);
  const ci = wilsonConfidenceInterval(privatized.successRate, privatized.frequency);

  const unsigned: Omit<PublishedPattern, "sourceNodeSignature"> = {
    id: privatized.id,
    type: privatized.type as PublishedPattern["type"],
    domainCategory: privatized.anonymizedDomain,
    angleIds: privatized.angleIds,
    effectivenessScore: Math.round(privatized.successRate * 1000) / 1000,
    chainSequence: privatized.type === "successful-combination" ? privatized.angleIds : undefined,
    sampleSize: privatized.frequency,
    confidenceInterval: ci,
    timestamp: privatized.lastSeenAt,
    diffPrivacyBudget: dpConfig.epsilon,
  };

  return {
    ...unsigned,
    sourceNodeSignature: signPattern(unsigned, secretKey),
  };
}

// ---- Privacy Budget Tracker ----

const privacyBudgets = new Map<string, number>();

/** Track cumulative privacy budget (ε) spent per node. */
export function trackPrivacyBudget(nodeId: string, epsilonSpent: number): number {
  const current = privacyBudgets.get(nodeId) ?? 0;
  const updated = current + epsilonSpent;
  privacyBudgets.set(nodeId, updated);
  return updated;
}

/** Get the total privacy budget spent for a node. */
export function getPrivacyBudgetSpent(nodeId: string): number {
  return privacyBudgets.get(nodeId) ?? 0;
}

/** Check if a node has exceeded its privacy budget. */
export function isPrivacyBudgetExceeded(nodeId: string, maxBudget: number): boolean {
  return getPrivacyBudgetSpent(nodeId) >= maxBudget;
}

/** Reset privacy budget tracking (for testing). */
export function resetPrivacyBudgets(): void {
  privacyBudgets.clear();
}

// ---- Pipeline Enrichment ----

export interface GenomeInsight {
  type: "angle-recommendation" | "methodology-chain" | "domain-trend" | "effectiveness-signal";
  content: string;
  confidence: number;
  sourcePatterns: number;
  angleIds: string[];
  domain: string;
}

/** Generate insights for a domain based on network patterns. */
export function generateGenomeInsights(nodeId: string, domainHint?: string): GenomeInsight[] {
  const dashboard = getNetworkDashboard(nodeId);
  const insights: GenomeInsight[] = [];

  // Angle recommendations from trending angles
  for (const trend of dashboard.trendingAngles.slice(0, 5)) {
    if (trend.trend === "rising") {
      insights.push({
        type: "angle-recommendation",
        content: `${trend.angleId} is trending with ${trend.frequency} uses across the network`,
        confidence: Math.min(0.9, 0.3 + trend.frequency * 0.1),
        sourcePatterns: trend.frequency,
        angleIds: [trend.angleId],
        domain: domainHint ?? "general",
      });
    }
  }

  // Methodology chains from successful-combination patterns
  const combos = dashboard.topPatterns.filter((p) => p.type === "successful-combination");
  for (const combo of combos.slice(0, 5)) {
    const domainMatch =
      !domainHint || combo.anonymizedDomain.toLowerCase().includes(domainHint.toLowerCase());
    if (domainMatch) {
      insights.push({
        type: "methodology-chain",
        content: `${combo.title}: ${combo.description}`,
        confidence: combo.successRate,
        sourcePatterns: combo.frequency,
        angleIds: combo.angleIds,
        domain: combo.anonymizedDomain,
      });
    }
  }

  // Domain trends
  if (domainHint) {
    const domainPatterns = dashboard.topPatterns.filter((p) =>
      p.anonymizedDomain.toLowerCase().includes(domainHint.toLowerCase())
    );
    if (domainPatterns.length > 0) {
      const avgSuccess =
        domainPatterns.reduce((s, p) => s + p.successRate, 0) / domainPatterns.length;
      insights.push({
        type: "domain-trend",
        content: `${domainPatterns.length} patterns found for "${domainHint}" with ${(avgSuccess * 100).toFixed(0)}% average success rate`,
        confidence: Math.min(0.95, 0.4 + domainPatterns.length * 0.05),
        sourcePatterns: domainPatterns.length,
        angleIds: [...new Set(domainPatterns.flatMap((p) => p.angleIds))],
        domain: domainHint,
      });
    }
  }

  // Effectiveness signals
  const highSuccess = dashboard.topPatterns.filter((p) => p.successRate > 0.7);
  for (const p of highSuccess.slice(0, 3)) {
    insights.push({
      type: "effectiveness-signal",
      content: `High-success pattern: ${p.title} (${(p.successRate * 100).toFixed(0)}% success)`,
      confidence: p.successRate,
      sourcePatterns: p.frequency,
      angleIds: p.angleIds,
      domain: p.anonymizedDomain,
    });
  }

  return insights.sort((a, b) => b.confidence - a.confidence);
}

/** Enrich pipeline angle selection based on network insights. */
export function enrichAngleSelection(
  nodeId: string,
  requestedAngles: string[],
  domainHint?: string
): {
  angles: string[];
  enrichments: string[];
  insightCount: number;
} {
  const insights = generateGenomeInsights(nodeId, domainHint);
  const enrichments: string[] = [];

  const recommendedAngles = new Set(requestedAngles);
  for (const insight of insights) {
    if (insight.type === "angle-recommendation" && insight.confidence > 0.5) {
      for (const angle of insight.angleIds) {
        if (!recommendedAngles.has(angle)) {
          recommendedAngles.add(angle);
          enrichments.push(
            `🌐 Network suggests adding "${angle}" (${(insight.confidence * 100).toFixed(0)}% confidence)`
          );
        }
      }
    }
  }

  return {
    angles: [...recommendedAngles],
    enrichments,
    insightCount: insights.length,
  };
}

// ---- Gossip Sync Protocol ----

export interface GossipDigest {
  nodeId: string;
  patternCount: number;
  latestTimestamp: string;
  checksum: string;
}

/** Create a digest of local patterns for gossip exchange. */
export function createGossipDigest(nodeId: string): GossipDigest | null {
  const node = getNode(nodeId);
  if (!node) return null;

  const patterns = node.localPatterns;
  const checksum =
    patterns.length > 0
      ? patterns
          .map((p) => p.id)
          .sort()
          .join(",")
          .slice(0, 64)
      : "";

  return {
    nodeId,
    patternCount: patterns.length,
    latestTimestamp:
      patterns.length > 0
        ? patterns.reduce(
            (latest, p) => (p.lastSeenAt > latest ? p.lastSeenAt : latest),
            patterns[0].lastSeenAt
          )
        : new Date().toISOString(),
    checksum,
  };
}

/** Simulate a gossip sync between two nodes. */
export function gossipSync(
  localNodeId: string,
  remoteNodeId: string,
  dpConfig: DiffPrivacyConfig = DEFAULT_DP_CONFIG
): {
  received: number;
  shared: number;
} {
  const localNode = getNode(localNodeId);
  const remoteNode = getNode(remoteNodeId);
  if (!localNode || !remoteNode) return { received: 0, shared: 0 };

  // Fetch and privatize remote patterns
  const remotePatterns = fetchRemotePatterns(localNodeId, remoteNodeId);
  const privatized = remotePatterns.map((p) => privatizePattern(p, dpConfig));
  const received = mergePatterns(localNodeId, privatized);

  // Share local patterns with remote
  const localPatterns = publishPatterns(localNodeId);
  const localPrivatized = localPatterns.map((p) => privatizePattern(p, dpConfig));
  const shared = mergePatterns(remoteNodeId, localPrivatized);

  return { received, shared };
}

// ---- Genome Analytics ----

export interface GenomeAnalytics {
  totalPatterns: number;
  totalNodes: number;
  topAngles: Array<{ angleId: string; frequency: number; avgSuccess: number }>;
  topDomains: Array<{ domain: string; patternCount: number; avgSuccess: number }>;
  methodologyChains: Array<{ angles: string[]; frequency: number; successRate: number }>;
  networkGrowth: { patternsLast7d: number; nodesLast7d: number };
}

/** Compute genome-level analytics across a node's view of the network. */
export function computeGenomeAnalytics(nodeId: string): GenomeAnalytics {
  const node = getNode(nodeId);
  const allPatterns = node ? [...node.localPatterns, ...node.receivedPatterns] : [];

  // Top angles
  const angleStats = new Map<string, { freq: number; totalSuccess: number; count: number }>();
  for (const p of allPatterns) {
    for (const angleId of p.angleIds) {
      const stats = angleStats.get(angleId) ?? { freq: 0, totalSuccess: 0, count: 0 };
      stats.freq += p.frequency;
      stats.totalSuccess += p.successRate;
      stats.count++;
      angleStats.set(angleId, stats);
    }
  }

  const topAngles = Array.from(angleStats.entries())
    .map(([angleId, stats]) => ({
      angleId,
      frequency: stats.freq,
      avgSuccess: stats.count > 0 ? Math.round((stats.totalSuccess / stats.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  // Top domains
  const domainStats = new Map<string, { count: number; totalSuccess: number }>();
  for (const p of allPatterns) {
    const stats = domainStats.get(p.anonymizedDomain) ?? { count: 0, totalSuccess: 0 };
    stats.count++;
    stats.totalSuccess += p.successRate;
    domainStats.set(p.anonymizedDomain, stats);
  }

  const topDomains = Array.from(domainStats.entries())
    .map(([domain, stats]) => ({
      domain,
      patternCount: stats.count,
      avgSuccess: stats.count > 0 ? Math.round((stats.totalSuccess / stats.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.patternCount - a.patternCount)
    .slice(0, 10);

  // Methodology chains
  const chains = allPatterns
    .filter((p) => p.type === "successful-combination" && p.angleIds.length >= 2)
    .map((p) => ({
      angles: p.angleIds,
      frequency: p.frequency,
      successRate: p.successRate,
    }))
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 10);

  return {
    totalPatterns: allPatterns.length,
    totalNodes: listNodes().length,
    topAngles,
    topDomains,
    methodologyChains: chains,
    networkGrowth: { patternsLast7d: allPatterns.length, nodesLast7d: listNodes().length },
  };
}

/** Format genome analytics as markdown. */
export function genomeAnalyticsToMarkdown(analytics: GenomeAnalytics): string {
  const lines = [
    "# Innovation Genome Analytics",
    "",
    `**Nodes:** ${analytics.totalNodes} | **Patterns:** ${analytics.totalPatterns}`,
    "",
    "## Top Angles",
    "",
    "| Angle | Frequency | Avg Success |",
    "|-------|-----------|-------------|",
    ...analytics.topAngles.map(
      (a) => `| ${a.angleId} | ${a.frequency} | ${(a.avgSuccess * 100).toFixed(0)}% |`
    ),
    "",
    "## Top Domains",
    "",
    "| Domain | Patterns | Avg Success |",
    "|--------|----------|-------------|",
    ...analytics.topDomains.map(
      (d) => `| ${d.domain} | ${d.patternCount} | ${(d.avgSuccess * 100).toFixed(0)}% |`
    ),
    "",
  ];

  if (analytics.methodologyChains.length > 0) {
    lines.push("## Effective Methodology Chains");
    lines.push("");
    for (const chain of analytics.methodologyChains) {
      lines.push(
        `- **${chain.angles.join(" → ")}** (success: ${(chain.successRate * 100).toFixed(0)}%, freq: ${chain.frequency})`
      );
    }
  }

  return lines.join("\n");
}
