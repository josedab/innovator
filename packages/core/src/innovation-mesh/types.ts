/**
 * @module innovation-mesh
 *
 * Cross-Organizational Innovation Mesh — enables multiple organizations
 * to share anonymized innovation patterns through federated learning with
 * differential privacy. Builds on the federation-dp module.
 */

import { z } from "zod";

// ---- Mesh Pattern ----

export const MeshPatternSchema = z.object({
  id: z.string().max(200),
  /** Type of innovation pattern. */
  type: z.enum([
    "angle-effectiveness",
    "topic-trending",
    "methodology-success",
    "cross-pollination",
    "anti-pattern",
    "emerging-domain",
  ]),
  /** Topic or domain. */
  topic: z.string().max(300),
  /** Angle or methodology ID. */
  angleId: z.string().max(100).optional(),
  /** Noised metric value (after DP noise). */
  value: z.number(),
  /** Confidence interval. */
  confidence: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  /** Number of organizations contributing. */
  contributingOrgs: z.number().int().min(0),
  /** Privacy budget spent for this pattern. */
  epsilonSpent: z.number().min(0),
  /** Period covered. */
  epoch: z.string().max(50),
  createdAt: z.string(),
});

export type MeshPattern = z.infer<typeof MeshPatternSchema>;

// ---- Mesh Node (Organization) ----

export const MeshNodeSchema = z.object({
  id: z.string().max(200),
  /** Organization display name (anonymized in shared data). */
  displayName: z.string().max(300),
  /** Sector/industry. */
  sector: z.string().max(200),
  /** Total patterns shared. */
  patternsShared: z.number().int().min(0),
  /** Total patterns received. */
  patternsReceived: z.number().int().min(0),
  /** Privacy budget remaining. */
  privacyBudgetRemaining: z.number().min(0),
  /** Total privacy budget. */
  privacyBudgetTotal: z.number().min(0),
  joinedAt: z.string(),
  lastActiveAt: z.string(),
});

export type MeshNode = z.infer<typeof MeshNodeSchema>;

// ---- Mesh Insights ----

export const MeshInsightsSchema = z.object({
  /** Total nodes in the mesh. */
  totalNodes: z.number().int().min(0),
  /** Total patterns in the mesh. */
  totalPatterns: z.number().int().min(0),
  /** Trending topics across the mesh. */
  trendingTopics: z
    .array(
      z.object({
        topic: z.string().max(300),
        momentum: z.number().min(0).max(1),
        sectors: z.array(z.string().max(200)).max(20),
      })
    )
    .max(50),
  /** Most effective angles across organizations. */
  topAngles: z
    .array(
      z.object({
        angleId: z.string().max(100),
        effectiveness: z.number().min(0).max(1),
        sampleSize: z.number().int().min(0),
      })
    )
    .max(20),
  /** Cross-sector opportunities. */
  crossSectorOpportunities: z
    .array(
      z.object({
        fromSector: z.string().max(200),
        toSector: z.string().max(200),
        pattern: z.string().max(500),
        confidence: z.number().min(0).max(1),
      })
    )
    .max(20),
  /** Known anti-patterns. */
  antiPatterns: z
    .array(
      z.object({
        description: z.string().max(500),
        frequency: z.number().min(0).max(1),
      })
    )
    .max(20),
  generatedAt: z.string(),
});

export type MeshInsights = z.infer<typeof MeshInsightsSchema>;

// ---- Config ----

export interface MeshConfig {
  /** This organization's node ID. */
  nodeId: string;
  /** Sector/industry. */
  sector: string;
  /** Differential privacy epsilon per query. */
  epsilon?: number;
  /** Total privacy budget. */
  maxBudget?: number;
}
