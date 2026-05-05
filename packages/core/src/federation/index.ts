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
  trendingAngles: z.array(z.object({
    angleId: z.string(),
    frequency: z.number(),
    trend: z.enum(["rising", "stable", "declining"]),
  })),
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
  angleResults: Array<{ angleId: string; angleName: string; ideasCount: number; successRate?: number }>;
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
export function fetchRemotePatterns(
  nodeId: string,
  peerId: string
): FederationPattern[] {
  const peer = nodes.get(peerId);
  if (!peer || !peer.sharingEnabled) return [];
  return peer.localPatterns.map((p) => ({ ...p, sourceNodeId: peerId }));
}

/** Merge received patterns into local node, deduplicating by title. */
export function mergePatterns(
  nodeId: string,
  patterns: FederationPattern[]
): number {
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
  const allPatterns = node
    ? [...node.localPatterns, ...node.receivedPatterns]
    : [];

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
      trend: (frequency > 3 ? "rising" : frequency > 1 ? "stable" : "declining") as NetworkTrend["trend"],
    }))
    .sort((a, b) => b.frequency - a.frequency);

  const topPatterns = allPatterns
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 20);

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
