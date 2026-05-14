/**
 * @module federation-dp
 *
 * Differential Privacy layer for the Innovation Federation Protocol.
 * Adds ε-differential privacy to all shared aggregates, pattern
 * recommendation engine, and privacy budget tracking.
 */

import { z } from "zod";

// ---- DP Config ----

export const DPConfigSchema = z.object({
  /** Privacy budget parameter (lower = more private). Recommended: 0.1–1.0. */
  epsilon: z.number().min(0.01).max(10).default(1.0),
  /** Sensitivity of the data (maximum impact of a single record). */
  sensitivity: z.number().min(0).max(100).default(1),
  /** Maximum privacy budget spent before refusing to share. */
  maxBudgetSpent: z.number().min(0).default(10),
});

export type DPConfig = z.infer<typeof DPConfigSchema>;

// ---- Privacy Budget ----

export const PrivacyBudgetSchema = z.object({
  totalSpent: z.number().min(0),
  maxBudget: z.number().min(0),
  queriesProcessed: z.number().int().min(0),
  lastQueryAt: z.string().optional(),
  budgetHistory: z.array(z.object({
    timestamp: z.string(),
    epsilonSpent: z.number(),
    queryType: z.string().max(200),
  })).max(10000),
});

export type PrivacyBudget = z.infer<typeof PrivacyBudgetSchema>;

// ---- Anonymized Pattern ----

export const AnonymizedPatternSchema = z.object({
  id: z.string().max(200),
  type: z.enum([
    "angle-effectiveness",
    "topic-frequency",
    "methodology-success",
    "cross-angle-combination",
    "anti-pattern",
  ]),
  angleId: z.string().max(100).optional(),
  topicCategory: z.string().max(200),
  /** Noised metric value (after DP noise addition). */
  noisedValue: z.number(),
  /** Confidence interval lower bound. */
  ciLower: z.number(),
  /** Confidence interval upper bound. */
  ciUpper: z.number(),
  sampleSize: z.number().int().min(0),
  /** Epoch/period this aggregate covers. */
  epoch: z.string().max(50),
  createdAt: z.string(),
});

export type AnonymizedPattern = z.infer<typeof AnonymizedPatternSchema>;

// ---- Pattern Recommendation ----

export const PatternRecommendationSchema = z.object({
  id: z.string().max(200),
  /** Recommended angle or methodology. */
  recommendedAngle: z.string().max(100),
  /** Topic/domain this recommendation applies to. */
  topicCategory: z.string().max(200),
  /** Evidence: how many organizations contributed to this pattern. */
  contributingOrgs: z.number().int().min(0),
  /** Effectiveness score (noised). */
  effectivenessScore: z.number().min(0).max(1),
  /** Confidence level. */
  confidence: z.enum(["low", "medium", "high"]),
  /** Human-readable explanation. */
  explanation: z.string().max(2000),
  createdAt: z.string(),
});

export type PatternRecommendation = z.infer<typeof PatternRecommendationSchema>;

// ---- Federation Network Stats ----

export interface FederationNetworkStats {
  totalNodes: number;
  totalPatterns: number;
  averageEpsilon: number;
  trendingAngles: Array<{
    angleId: string;
    topicCategory: string;
    effectivenessScore: number;
    trend: "rising" | "stable" | "declining";
  }>;
  antiPatterns: Array<{
    angleId: string;
    topicCategory: string;
    warningReason: string;
  }>;
}
