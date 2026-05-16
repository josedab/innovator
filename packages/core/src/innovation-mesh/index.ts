/**
 * @module innovation-mesh
 *
 * Cross-Organizational Innovation Mesh — pattern extraction with DP noise,
 * mesh network sharing, and insights aggregation. Builds on federation-dp.
 */

import { randomUUID } from "node:crypto";
import type { MeshPattern, MeshNode, MeshInsights, MeshConfig } from "./types.js";
import { MeshPatternSchema, MeshNodeSchema, MeshInsightsSchema } from "./types.js";

export * from "./types.js";

// ---- In-Memory Mesh State ----

const meshNodes = new Map<string, MeshNode>();
const sharedPatterns: MeshPattern[] = [];

// ---- Laplace Noise for DP ----

function laplaceSample(scale: number): number {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

function addNoise(
  value: number,
  sensitivity: number,
  epsilon: number
): {
  noised: number;
  lower: number;
  upper: number;
} {
  const scale = sensitivity / epsilon;
  const noise = laplaceSample(scale);
  const noised = value + noise;
  const ci = scale * Math.log(2 / 0.05); // 95% CI
  return { noised, lower: noised - ci, upper: noised + ci };
}

// ---- Node Management ----

function ensureNode(config: MeshConfig): MeshNode {
  let node = meshNodes.get(config.nodeId);
  if (!node) {
    const now = new Date().toISOString();
    node = MeshNodeSchema.parse({
      id: config.nodeId,
      displayName: `Org-${config.nodeId.slice(0, 8)}`,
      sector: config.sector,
      patternsShared: 0,
      patternsReceived: 0,
      privacyBudgetRemaining: config.maxBudget ?? 10,
      privacyBudgetTotal: config.maxBudget ?? 10,
      joinedAt: now,
      lastActiveAt: now,
    });
    meshNodes.set(config.nodeId, node);
  }
  return node;
}

// ---- Pattern Extraction & Sharing ----

/**
 * Extract innovation patterns from local data and apply DP noise.
 */
export function extractPatterns(
  localData: Array<{
    topic: string;
    angleId?: string;
    successRate: number;
    sampleSize: number;
  }>,
  config: MeshConfig
): MeshPattern[] {
  const node = ensureNode(config);
  const epsilon = config.epsilon ?? 1.0;
  const now = new Date().toISOString();
  const epoch = new Date().toISOString().slice(0, 7); // YYYY-MM

  const patterns: MeshPattern[] = [];

  for (const data of localData) {
    if (node.privacyBudgetRemaining < epsilon) break;

    const { noised, lower, upper } = addNoise(data.successRate, 1, epsilon);

    const pattern = MeshPatternSchema.parse({
      id: randomUUID(),
      type: data.angleId ? "angle-effectiveness" : "topic-trending",
      topic: data.topic,
      angleId: data.angleId,
      value: Math.max(0, Math.min(1, noised)),
      confidence: { lower: Math.max(0, lower), upper: Math.min(1, upper) },
      contributingOrgs: 1,
      epsilonSpent: epsilon,
      epoch,
      createdAt: now,
    });

    patterns.push(pattern);
    node.privacyBudgetRemaining -= epsilon;
    node.patternsShared++;
  }

  node.lastActiveAt = now;
  meshNodes.set(config.nodeId, node);

  return patterns;
}

/**
 * Share patterns to the mesh (add to shared pool).
 */
export function sharePatterns(patterns: MeshPattern[]): void {
  sharedPatterns.push(...patterns);
}

/**
 * Receive patterns from the mesh relevant to a sector.
 */
export function receivePatterns(
  config: MeshConfig,
  options?: { topic?: string; limit?: number }
): MeshPattern[] {
  const node = ensureNode(config);
  const limit = options?.limit ?? 50;

  let relevant = sharedPatterns.filter((p) => p.contributingOrgs > 0);

  if (options?.topic) {
    relevant = relevant.filter((p) => p.topic.toLowerCase().includes(options.topic!.toLowerCase()));
  }

  const result = relevant.slice(0, limit);
  node.patternsReceived += result.length;
  node.lastActiveAt = new Date().toISOString();
  meshNodes.set(config.nodeId, node);

  return result;
}

// ---- Mesh Insights ----

/**
 * Get aggregated insights from all shared patterns in the mesh.
 */
export function getMeshInsights(): MeshInsights {
  // Aggregate trending topics with sector tracking
  const topicCounts = new Map<string, { momentum: number; sectors: Set<string>; count: number }>();
  for (const pattern of sharedPatterns) {
    const existing = topicCounts.get(pattern.topic) ?? {
      momentum: 0,
      sectors: new Set(),
      count: 0,
    };
    existing.count++;
    existing.momentum = Math.min(1, existing.count / 10);
    // Track which sectors contributed patterns for this topic
    for (const [, node] of meshNodes) {
      if (node.patternsShared > 0) {
        existing.sectors.add(node.sector);
      }
    }
    topicCounts.set(pattern.topic, existing);
  }

  const trendingTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([topic, data]) => ({
      topic,
      momentum: data.momentum,
      sectors: Array.from(data.sectors),
    }));

  // Aggregate angle effectiveness
  const angleEffectiveness = new Map<string, { total: number; count: number }>();
  for (const pattern of sharedPatterns) {
    if (pattern.angleId && pattern.type === "angle-effectiveness") {
      const existing = angleEffectiveness.get(pattern.angleId) ?? { total: 0, count: 0 };
      existing.total += pattern.value;
      existing.count++;
      angleEffectiveness.set(pattern.angleId, existing);
    }
  }

  const topAngles = Array.from(angleEffectiveness.entries())
    .map(([angleId, data]) => ({
      angleId,
      effectiveness: data.total / data.count,
      sampleSize: data.count,
    }))
    .sort((a, b) => b.effectiveness - a.effectiveness)
    .slice(0, 20);

  // Detect cross-sector opportunities: topics trending in multiple sectors
  const crossSectorOpportunities = trendingTopics
    .filter((t) => t.sectors.length >= 2)
    .flatMap((t) => {
      const opportunities: MeshInsights["crossSectorOpportunities"] = [];
      for (let i = 0; i < t.sectors.length; i++) {
        for (let j = i + 1; j < t.sectors.length; j++) {
          opportunities.push({
            fromSector: t.sectors[i],
            toSector: t.sectors[j],
            pattern: `"${t.topic}" is trending across both sectors — cross-pollination opportunity`,
            confidence: Math.min(1, t.momentum * 1.5),
          });
        }
      }
      return opportunities;
    })
    .slice(0, 20);

  // Detect anti-patterns: angles with consistently low effectiveness
  const antiPatterns = topAngles
    .filter((a) => a.effectiveness < 0.3 && a.sampleSize >= 3)
    .map((a) => ({
      description: `Angle "${a.angleId}" shows low effectiveness (${(a.effectiveness * 100).toFixed(0)}%) across ${a.sampleSize} organizations`,
      frequency: 1 - a.effectiveness,
    }))
    .slice(0, 20);

  return MeshInsightsSchema.parse({
    totalNodes: meshNodes.size,
    totalPatterns: sharedPatterns.length,
    trendingTopics,
    topAngles,
    crossSectorOpportunities,
    antiPatterns,
    generatedAt: new Date().toISOString(),
  });
}
