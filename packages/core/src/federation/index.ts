/**
 * @module federation
 *
 * Federated Innovation Networks — allows multiple Innovator instances to share
 * anonymized innovation patterns, trending angles, and cross-pollinate ideas
 * without exposing proprietary subjects.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const FederationPatternTypeSchema = z.enum([
  "trending-angle",
  "successful-combination",
  "domain-insight",
  "methodology",
  "anti-pattern",
]);

export const FederationPatternSchema = z.object({
  id: z.string(),
  type: FederationPatternTypeSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  anonymizedDomain: z.string().max(200),
  angleIds: z.array(z.string().max(100)).max(8),
  frequency: z.number().min(0),
  successRate: z.number().min(0).max(1),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  sourceNodeId: z.string().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

export const PeerNodeSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  endpoint: z.string().max(2000),
  publicKey: z.string().max(5000).optional(),
  trustLevel: z.enum(["untrusted", "verified", "trusted"]),
  lastSyncAt: z.string().optional(),
  patternsShared: z.number().default(0),
  patternsReceived: z.number().default(0),
});

export const FederationNodeSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  endpoint: z.string().max(2000).optional(),
  isPublic: z.boolean(),
  peers: z.array(PeerNodeSchema).max(100),
  localPatterns: z.array(FederationPatternSchema),
  receivedPatterns: z.array(FederationPatternSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  sharingEnabled: z.boolean().default(true),
});

export const NetworkDashboardSchema = z.object({
  totalNodes: z.number(),
  totalPatterns: z.number(),
  trendingAngles: z.array(
    z.object({
      angleId: z.string(),
      frequency: z.number(),
      trend: z.enum(["rising", "stable", "declining"]),
    })
  ),
  topPatterns: z.array(FederationPatternSchema).max(20),
  networkHealth: z.enum(["healthy", "degraded", "offline"]),
});

// ---- Types ----

export type FederationPatternType = z.infer<typeof FederationPatternTypeSchema>;
export type FederationPattern = z.infer<typeof FederationPatternSchema>;
export type PeerNode = z.infer<typeof PeerNodeSchema>;
export type FederationNode = z.infer<typeof FederationNodeSchema>;

export interface NetworkTrend {
  angleId: string;
  frequency: number;
  trend: "rising" | "stable" | "declining";
}

export interface NetworkDashboard {
  totalNodes: number;
  totalPatterns: number;
  trendingAngles: NetworkTrend[];
  topPatterns: FederationPattern[];
  networkHealth: "healthy" | "degraded" | "offline";
}

// ---- In-Memory Store ----

const nodes = new Map<string, FederationNode>();

// ---- Anonymization ----

const DOMAIN_ANONYMIZATION: Record<string, string> = {
  healthcare: "Regulated Services Sector",
  fintech: "Financial Technology Domain",
  edtech: "Knowledge Services Domain",
  climate: "Sustainability & Environment",
  saas: "Digital Platform Services",
  ai: "Intelligent Systems Domain",
  ecommerce: "Digital Commerce",
  logistics: "Supply Chain Operations",
};

function anonymizeDomain(domain: string): string {
  const lower = domain.toLowerCase();
  for (const [key, anon] of Object.entries(DOMAIN_ANONYMIZATION)) {
    if (lower.includes(key)) return anon;
  }
  return "General Innovation Domain";
}

function anonymizeText(text: string): string {
  // Remove potential PII, company names, specific numbers
  return text
    .replace(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g, "[Organization]")
    .replace(/\b\d{3,}\b/g, "[N]")
    .replace(/\b[\w.]+@[\w.]+\.\w+\b/g, "[email]")
    .replace(/https?:\/\/[^\s]+/g, "[url]");
}

// ---- Core Functions ----

/** Create a new federation node. */
export function createFederationNode(params: {
  name: string;
  description?: string;
  endpoint?: string;
  isPublic?: boolean;
}): FederationNode {
  const id = randomUUID();
  const now = new Date().toISOString();
  const node: FederationNode = {
    id,
    name: params.name,
    description: params.description,
    endpoint: params.endpoint,
    isPublic: params.isPublic ?? false,
    peers: [],
    localPatterns: [],
    receivedPatterns: [],
    createdAt: now,
    updatedAt: now,
    sharingEnabled: true,
  };
  nodes.set(id, node);
  return node;
}

/** Get a federation node by ID. */
export function getNode(id: string): FederationNode | undefined {
  return nodes.get(id);
}

/** List all federation nodes. */
export function listNodes(): FederationNode[] {
  return Array.from(nodes.values());
}

/** Extract anonymized patterns from local innovation data. */
export function extractPatterns(params: {
  nodeId: string;
  domain: string;
  angleResults: Array<{
    angleId: string;
    angleName: string;
    ideasCount: number;
    successRate?: number;
  }>;
  subject?: string;
}): FederationPattern[] {
  const node = nodes.get(params.nodeId);
  if (!node) return [];

  const now = new Date().toISOString();
  const patterns: FederationPattern[] = [];

  // Extract angle usage patterns
  for (const result of params.angleResults) {
    if (result.ideasCount > 0) {
      patterns.push({
        id: randomUUID(),
        type: "trending-angle",
        title: `${result.angleName} applied in ${anonymizeDomain(params.domain)}`,
        description: anonymizeText(
          `Innovation angle "${result.angleName}" generated ${result.ideasCount} ideas with ${Math.round((result.successRate ?? 0.5) * 100)}% quality rate.`
        ),
        anonymizedDomain: anonymizeDomain(params.domain),
        angleIds: [result.angleId],
        frequency: 1,
        successRate: result.successRate ?? 0.5,
        firstSeenAt: now,
        lastSeenAt: now,
        sourceNodeId: params.nodeId,
      });
    }
  }

  // Extract successful combinations
  if (params.angleResults.length >= 2) {
    const topAngles = params.angleResults
      .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0))
      .slice(0, 3);
    patterns.push({
      id: randomUUID(),
      type: "successful-combination",
      title: `Effective combination in ${anonymizeDomain(params.domain)}`,
      description: `Angles ${topAngles.map((a) => a.angleName).join(" + ")} produced high-quality results when combined.`,
      anonymizedDomain: anonymizeDomain(params.domain),
      angleIds: topAngles.map((a) => a.angleId),
      frequency: 1,
      successRate: topAngles.reduce((s, a) => s + (a.successRate ?? 0.5), 0) / topAngles.length,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceNodeId: params.nodeId,
    });
  }

  node.localPatterns.push(...patterns);
  node.updatedAt = now;
  nodes.set(params.nodeId, node);
  return patterns;
}

/** Publish local patterns for sharing with peers. */
export function publishPatterns(nodeId: string): FederationPattern[] {
  const node = nodes.get(nodeId);
  if (!node || !node.sharingEnabled) return [];
  return node.localPatterns;
}

/** Discover peers available for federation. */
export function discoverPeers(nodeId: string): PeerNode[] {
  const node = nodes.get(nodeId);
  if (!node) return [];

  // Return peers from all other public nodes
  const peers: PeerNode[] = [];
  for (const [id, otherNode] of nodes.entries()) {
    if (id === nodeId || !otherNode.isPublic) continue;
    peers.push({
      id: otherNode.id,
      name: otherNode.name,
      endpoint: otherNode.endpoint ?? "",
      trustLevel: "untrusted",
      patternsShared: otherNode.localPatterns.length,
      patternsReceived: 0,
    });
  }
  return peers;
}

/** Fetch patterns from a remote peer node. */
export function fetchRemotePatterns(nodeId: string, peerId: string): FederationPattern[] {
  const peer = nodes.get(peerId);
  if (!peer || !peer.sharingEnabled) return [];
  return peer.localPatterns.map((p) => ({ ...p, sourceNodeId: peerId }));
}

/** Merge received patterns into local node, deduplicating by title. */
export function mergePatterns(nodeId: string, patterns: FederationPattern[]): number {
  const node = nodes.get(nodeId);
  if (!node) return 0;

  const existingTitles = new Set(node.receivedPatterns.map((p) => p.title));
  let merged = 0;

  for (const pattern of patterns) {
    if (!existingTitles.has(pattern.title)) {
      node.receivedPatterns.push(pattern);
      existingTitles.add(pattern.title);
      merged++;
    } else {
      // Update frequency for existing patterns
      const existing = node.receivedPatterns.find((p) => p.title === pattern.title);
      if (existing) {
        existing.frequency++;
        existing.lastSeenAt = new Date().toISOString();
      }
    }
  }

  node.updatedAt = new Date().toISOString();
  nodes.set(nodeId, node);
  return merged;
}

/** Get the network dashboard with trends and health metrics. */
export function getNetworkDashboard(nodeId: string): NetworkDashboard {
  const node = nodes.get(nodeId);
  const allPatterns = node ? [...node.localPatterns, ...node.receivedPatterns] : [];

  // Compute angle frequency
  const angleFreq = new Map<string, number>();
  for (const p of allPatterns) {
    for (const angleId of p.angleIds) {
      angleFreq.set(angleId, (angleFreq.get(angleId) ?? 0) + p.frequency);
    }
  }

  const trendingAngles: NetworkTrend[] = Array.from(angleFreq.entries())
    .map(([angleId, frequency]) => ({
      angleId,
      frequency,
      trend: (frequency > 3
        ? "rising"
        : frequency > 1
          ? "stable"
          : "declining") as NetworkTrend["trend"],
    }))
    .sort((a, b) => b.frequency - a.frequency);

  const topPatterns = allPatterns.sort((a, b) => b.successRate - a.successRate).slice(0, 20);

  return {
    totalNodes: nodes.size,
    totalPatterns: allPatterns.length,
    trendingAngles,
    topPatterns,
    networkHealth: nodes.size > 0 ? "healthy" : "offline",
  };
}

/** Clear all federation data (for testing). */
export function clearFederation(): void {
  nodes.clear();
}

// ---- ActivityPub-Inspired Protocol ----

export const ActivityTypeSchema = z.enum([
  "Create",
  "Update",
  "Share",
  "Like",
  "Follow",
  "Announce",
]);

export const FederatedActivitySchema = z.object({
  "@context": z.string().default("https://www.w3.org/ns/activitystreams"),
  id: z.string().max(500),
  type: ActivityTypeSchema,
  actor: z.string().max(500),
  object: z.object({
    type: z.string().max(100),
    content: z.string().max(5000),
    attributedTo: z.string().max(500),
    published: z.string(),
    tags: z.array(z.string().max(100)).max(20).optional(),
  }),
  published: z.string(),
  to: z.array(z.string().max(500)).max(50).default([]),
});

export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type FederatedActivity = z.infer<typeof FederatedActivitySchema>;

const activityInbox = new Map<string, FederatedActivity[]>();
const activityOutbox = new Map<string, FederatedActivity[]>();

/** Create a federated activity for sharing patterns. */
export function createActivity(
  nodeId: string,
  type: ActivityType,
  content: string,
  tags?: string[]
): FederatedActivity {
  const activity: FederatedActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `urn:innovator:${nodeId}:${Date.now().toString(36)}`,
    type,
    actor: `urn:innovator:node:${nodeId}`,
    object: {
      type: "InnovationPattern",
      content,
      attributedTo: `urn:innovator:node:${nodeId}`,
      published: new Date().toISOString(),
      tags,
    },
    published: new Date().toISOString(),
    to: [],
  };

  const outbox = activityOutbox.get(nodeId) ?? [];
  outbox.push(activity);
  activityOutbox.set(nodeId, outbox);

  return activity;
}

/** Receive an activity into a node's inbox. */
export function receiveActivity(nodeId: string, activity: FederatedActivity): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;

  const inbox = activityInbox.get(nodeId) ?? [];
  inbox.push(activity);
  activityInbox.set(nodeId, inbox);

  return true;
}

/** Get a node's inbox. */
export function getInbox(nodeId: string): FederatedActivity[] {
  return activityInbox.get(nodeId) ?? [];
}

/** Get a node's outbox. */
export function getOutbox(nodeId: string): FederatedActivity[] {
  return activityOutbox.get(nodeId) ?? [];
}

// ---- Differential Privacy ----

export interface DifferentialPrivacyConfig {
  epsilon: number;
  delta: number;
  clippingBound: number;
}

const DEFAULT_DP_CONFIG: DifferentialPrivacyConfig = {
  epsilon: 1.0,
  delta: 1e-5,
  clippingBound: 10,
};

/** Add Laplace noise for differential privacy. */
function laplaceMechanism(value: number, sensitivity: number, epsilon: number): number {
  const scale = sensitivity / epsilon;
  // Laplace noise using inverse CDF
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + noise;
}

/** Apply differential privacy to a count statistic. */
export function privatizeCount(count: number, config?: Partial<DifferentialPrivacyConfig>): number {
  const cfg = { ...DEFAULT_DP_CONFIG, ...config };
  const clipped = Math.min(count, cfg.clippingBound);
  return Math.max(0, Math.round(laplaceMechanism(clipped, 1, cfg.epsilon)));
}

/** Apply differential privacy to a rate/proportion statistic. */
export function privatizeRate(
  rate: number,
  sampleSize: number,
  config?: Partial<DifferentialPrivacyConfig>
): number {
  const cfg = { ...DEFAULT_DP_CONFIG, ...config };
  const sensitivity = 1 / Math.max(1, sampleSize);
  const noisy = laplaceMechanism(rate, sensitivity, cfg.epsilon);
  return Math.max(0, Math.min(1, noisy));
}

/** Create a differentially-private summary of innovation patterns. */
export function createPrivateSummary(
  patterns: FederationPattern[],
  config?: Partial<DifferentialPrivacyConfig>
): {
  totalPatterns: number;
  avgSuccessRate: number;
  trendingAngles: Array<{ angleId: string; count: number }>;
  topDomains: Array<{ domain: string; count: number }>;
} {
  const cfg = { ...DEFAULT_DP_CONFIG, ...config };

  // Privatize total count
  const totalPatterns = privatizeCount(patterns.length, cfg);

  // Privatize average success rate
  const avgRate =
    patterns.length > 0 ? patterns.reduce((s, p) => s + p.successRate, 0) / patterns.length : 0;
  const avgSuccessRate = privatizeRate(avgRate, patterns.length, cfg);

  // Privatize angle counts
  const angleCounts = new Map<string, number>();
  for (const p of patterns) {
    for (const a of p.angleIds) {
      angleCounts.set(a, (angleCounts.get(a) ?? 0) + 1);
    }
  }

  const trendingAngles = Array.from(angleCounts.entries())
    .map(([angleId, count]) => ({
      angleId,
      count: privatizeCount(count, cfg),
    }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count);

  // Privatize domain counts
  const domainCounts = new Map<string, number>();
  for (const p of patterns) {
    domainCounts.set(p.anonymizedDomain, (domainCounts.get(p.anonymizedDomain) ?? 0) + 1);
  }

  const topDomains = Array.from(domainCounts.entries())
    .map(([domain, count]) => ({
      domain,
      count: privatizeCount(count, cfg),
    }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    totalPatterns,
    avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
    trendingAngles,
    topDomains,
  };
}

// ---- Global Innovation Pulse Dashboard ----

export const InnovationPulseSchema = z.object({
  timestamp: z.string(),
  networkSize: z.number(),
  totalActivities: z.number(),
  patternsSharedLast24h: z.number(),
  trendingTopics: z
    .array(
      z.object({
        topic: z.string().max(200),
        momentum: z.number().min(-1).max(1),
        nodeCount: z.number(),
      })
    )
    .max(20),
  methodologyEffectiveness: z
    .array(
      z.object({
        methodology: z.string().max(200),
        avgSuccessRate: z.number().min(0).max(1),
        usageCount: z.number(),
      })
    )
    .max(10),
  geographicSpread: z
    .array(
      z.object({
        region: z.string().max(100),
        nodeCount: z.number(),
      })
    )
    .max(20),
  healthScore: z.number().min(0).max(100),
});

export type InnovationPulse = z.infer<typeof InnovationPulseSchema>;

/** Generate the Global Innovation Pulse dashboard data. */
export function getInnovationPulse(): InnovationPulse {
  const allNodes = Array.from(nodes.values());
  const allPatterns: FederationPattern[] = [];
  for (const node of allNodes) {
    allPatterns.push(...node.localPatterns, ...node.receivedPatterns);
  }

  // Count activities in last 24h
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let recentActivities = 0;
  for (const activities of activityOutbox.values()) {
    recentActivities += activities.filter((a) => a.published >= dayAgo).length;
  }

  // Trending topics from pattern titles
  const topicCounts = new Map<string, { count: number; nodes: Set<string> }>();
  for (const pattern of allPatterns) {
    const topic = pattern.anonymizedDomain;
    const entry = topicCounts.get(topic) ?? { count: 0, nodes: new Set() };
    entry.count += pattern.frequency;
    if (pattern.sourceNodeId) entry.nodes.add(pattern.sourceNodeId);
    topicCounts.set(topic, entry);
  }

  const trendingTopics = Array.from(topicCounts.entries())
    .map(([topic, data]) => ({
      topic,
      momentum: Math.min(1, data.count / 10),
      nodeCount: privatizeCount(data.nodes.size),
    }))
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 20);

  // Methodology effectiveness
  const methodMap = new Map<string, { totalRate: number; count: number }>();
  for (const pattern of allPatterns) {
    if (pattern.type === "methodology") {
      const entry = methodMap.get(pattern.title) ?? { totalRate: 0, count: 0 };
      entry.totalRate += pattern.successRate;
      entry.count++;
      methodMap.set(pattern.title, entry);
    }
  }

  const methodologyEffectiveness = Array.from(methodMap.entries())
    .map(([methodology, data]) => ({
      methodology,
      avgSuccessRate: privatizeRate(data.totalRate / data.count, data.count),
      usageCount: privatizeCount(data.count),
    }))
    .sort((a, b) => b.avgSuccessRate - a.avgSuccessRate)
    .slice(0, 10);

  // Health score based on network activity
  const healthScore = Math.min(
    100,
    Math.round(
      (allNodes.length > 0 ? 30 : 0) +
        (allPatterns.length > 0 ? 30 : 0) +
        (recentActivities > 0 ? 40 : 0)
    )
  );

  return {
    timestamp: new Date().toISOString(),
    networkSize: privatizeCount(allNodes.length),
    totalActivities: privatizeCount(recentActivities),
    patternsSharedLast24h: privatizeCount(allPatterns.filter((p) => p.lastSeenAt >= dayAgo).length),
    trendingTopics,
    methodologyEffectiveness,
    geographicSpread: [],
    healthScore,
  };
}

// ---- Cross-Org Insights ----

export {
  type CrossOrgBenchmark,
  type IndustryTrend,
  type PrivacyBudget,
  type AggregateInsight,
  type DataResidencyConfig,
  DataResidencyConfigSchema,
  privatizeValue,
  getPrivacyBudget,
  generateBenchmarks,
  detectIndustryTrends,
  generateAggregateInsights,
  getAggregateInsights,
  setDataResidency,
  getDataResidency,
  checkDataResidencyCompliance,
  clearCrossOrgData,
} from "./cross-org-insights.js";

/** Innovation Genome Network — differential privacy, enrichment, gossip sync, analytics. */
export {
  applyDifferentialPrivacy,
  privatizePattern,
  generateGenomeInsights,
  enrichAngleSelection,
  createGossipDigest,
  gossipSync,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  wilsonConfidenceInterval,
  signPattern,
  verifyPatternSignature,
  publishSignedPattern,
  trackPrivacyBudget,
  getPrivacyBudgetSpent,
  isPrivacyBudgetExceeded,
  resetPrivacyBudgets,
} from "./genome.js";
export type {
  DiffPrivacyConfig,
  GenomeInsight,
  GossipDigest,
  GenomeAnalytics,
  PublishedPattern,
} from "./genome.js";

/** Privacy exchange — budget tracking, anonymized bundles, playbooks, and audit logs. */
export {
  PrivacyBudgetSchema as ExchangePrivacyBudgetSchema,
  PatternBundleSchema,
  PlaybookSchema as FederationPlaybookSchema,
  AuditEntrySchema as FederationAuditEntrySchema,
  initializePrivacyBudget as initializeExchangePrivacyBudget,
  getPrivacyBudget as getExchangePrivacyBudget,
  spendPrivacyBudget as spendExchangePrivacyBudget,
  hasPrivacyBudget as hasExchangePrivacyBudget,
  resetPrivacyBudget as resetExchangePrivacyBudget,
  extractAnonymizedBundle,
  getPatternBundle,
  listPatternBundles,
  createPlaybook as createFederationPlaybook,
  licensePlaybook as licenseFederationPlaybook,
  getPlaybook as getFederationPlaybook,
  listPlaybooks as listFederationPlaybooks,
  detectAnomalies as detectFederationExchangeAnomalies,
  logAuditEntry as logFederationAuditEntry,
  getAuditLog as getFederationAuditLog,
  clearFederationExchangeData,
} from "./privacy-exchange.js";
export type {
  PrivacyBudget as ExchangePrivacyBudget,
  PatternBundle,
  Playbook as FederationPlaybook,
  AuditEntry as FederationAuditEntry,
} from "./privacy-exchange.js";
