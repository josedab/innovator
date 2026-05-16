/**
 * @module debt-tracker
 *
 * Innovation Debt Tracker — quantifies the cost of not innovating by
 * tracking deferred innovation decisions, monitoring competitive moves
 * matching shelved ideas, and generating innovation debt reports with
 * cost-of-delay estimates.
 */

import { z } from "zod";

// ---- Debt Categories ----

export const DebtCategorySchema = z.enum([
  "deferred-idea",
  "abandoned-prototype",
  "missed-market-window",
  "technical-capability-gap",
  "competitive-neglect",
  "customer-request-backlog",
]);

export type DebtCategory = z.infer<typeof DebtCategorySchema>;

export const DebtSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type DebtSeverity = z.infer<typeof DebtSeveritySchema>;

// ---- Debt Item ----

export const DebtItemSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  description: z.string().max(5000),
  category: DebtCategorySchema,
  severity: DebtSeveritySchema,
  /** Original idea or decision that was deferred. */
  originalIdeaId: z.string().max(200).optional(),
  /** When the idea was first proposed. */
  proposedAt: z.string(),
  /** When it was shelved/deferred. */
  deferredAt: z.string(),
  /** Reason for deferral. */
  deferralReason: z.string().max(2000),
  /** Estimated monthly cost of delay in USD. */
  monthlyCostOfDelay: z.number().min(0).optional(),
  /** Accumulated debt cost since deferral. */
  accumulatedCost: z.number().min(0),
  /** Related competitive moves detected. */
  competitiveMatches: z.array(z.string().max(200)).max(50),
  /** Current status. */
  status: z.enum(["active", "addressed", "accepted", "escalated"]),
  /** Tags for grouping. */
  tags: z.array(z.string().max(100)).max(20),
  updatedAt: z.string(),
});

export type DebtItem = z.infer<typeof DebtItemSchema>;

// ---- Debt Score ----

export const DebtScoreSchema = z.object({
  itemId: z.string().max(200),
  /** Raw debt score (0–100). */
  score: z.number().min(0).max(100),
  /** Components of the score. */
  components: z.object({
    ageWeightedSeverity: z.number().min(0).max(40),
    competitiveRisk: z.number().min(0).max(30),
    costOfDelay: z.number().min(0).max(30),
  }),
  /** Urgency classification. */
  urgency: z.enum(["low", "medium", "high", "critical"]),
  computedAt: z.string(),
});

export type DebtScore = z.infer<typeof DebtScoreSchema>;

// ---- Competitive Match ----

export const CompetitiveMatchSchema = z.object({
  id: z.string().max(200),
  debtItemId: z.string().max(200),
  /** Competitor that made a similar move. */
  competitorName: z.string().max(300),
  /** Description of the competitive move. */
  moveDescription: z.string().max(5000),
  /** How similar the competitor's move is to the shelved idea (0–1). */
  similarity: z.number().min(0).max(1),
  /** Estimated market impact. */
  marketImpact: z.enum(["minimal", "moderate", "significant", "transformative"]),
  /** When the competitive move was detected. */
  detectedAt: z.string(),
  /** Source of the detection (news, patent, product launch, etc.). */
  source: z.string().max(500),
});

export type CompetitiveMatch = z.infer<typeof CompetitiveMatchSchema>;

// ---- Debt Report ----

export const DebtReportSchema = z.object({
  id: z.string().max(200),
  /** Report period. */
  periodStart: z.string(),
  periodEnd: z.string(),
  /** Total active debt items. */
  totalItems: z.number().int().min(0),
  /** Total accumulated cost across all items. */
  totalAccumulatedCost: z.number().min(0),
  /** New competitive matches in period. */
  newCompetitiveMatches: z.number().int().min(0),
  /** Top debt items by score. */
  topItems: z
    .array(
      z.object({
        itemId: z.string().max(200),
        title: z.string().max(500),
        score: z.number().min(0).max(100),
        accumulatedCost: z.number().min(0),
        competitiveMatches: z.number().int().min(0),
      })
    )
    .max(20),
  /** Summary by category. */
  byCategory: z.record(
    z.string(),
    z.object({
      count: z.number().int().min(0),
      totalCost: z.number().min(0),
      averageAge: z.number().min(0),
    })
  ),
  /** Recommendations. */
  recommendations: z.array(z.string().max(1000)).max(20),
  generatedAt: z.string(),
});

export type DebtReport = z.infer<typeof DebtReportSchema>;

// ---- Config ----

export interface DebtTrackerConfig {
  /** LLM model for competitive matching. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
}
