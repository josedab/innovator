import { z } from "zod";

// ---- Failure Categories ----

/** Validates the category of a known failure pattern (e.g. market misread, feature creep). */
export const FailureCategorySchema = z.enum([
  "pivot-failure",
  "timing-mistake",
  "market-misread",
  "technical-debt-trap",
  "scaling-premature",
  "feature-creep",
  "team-misalignment",
  "funding-misjudgment",
  "competitive-blindspot",
  "regulatory-oversight",
  "user-adoption-gap",
  "integration-breakdown",
]);

/** Classification category for a failure pattern in the library. */
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

// ---- Failure Pattern ----

/**
 * Validates a curated failure pattern entry in the library.
 * Describes symptoms, root cause, real-world examples, and prevention strategies
 * along with severity and frequency ratings.
 */
export const FailurePatternSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  category: FailureCategorySchema,
  description: z.string().max(3000),
  symptoms: z.array(z.string().max(500)).max(20),
  rootCause: z.string().max(2000),
  realWorldExamples: z.array(z.string().max(1000)).max(10),
  preventionStrategies: z.array(z.string().max(1000)).max(10),
  severity: z.enum(["low", "medium", "high", "critical"]),
  frequency: z.enum(["rare", "occasional", "common", "very-common"]),
  tags: z.array(z.string().max(100)).max(20),
});

/** A documented failure pattern with symptoms, root cause, and prevention strategies. */
export type FailurePattern = z.infer<typeof FailurePatternSchema>;

// ---- Match Result ----

/**
 * Validates the result of matching an idea against a known failure pattern.
 * Includes a similarity score, matched symptoms, risk level, and mitigation advice.
 * @see FailurePatternSchema
 */
export const FailureMatchSchema = z.object({
  pattern: FailurePatternSchema,
  similarityScore: z.number().min(0).max(1),
  matchedSymptoms: z.array(z.string().max(500)).max(20),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  mitigationAdvice: z.string().max(3000),
});

/** A single failure pattern match with similarity score and mitigation advice. */
export type FailureMatch = z.infer<typeof FailureMatchSchema>;

// ---- Analysis Result ----

/**
 * Validates the full failure analysis for an idea, aggregating all matched patterns
 * into an overall risk score with a summary and actionable recommendations.
 */
export const FailureAnalysisResultSchema = z.object({
  ideaTitle: z.string().max(500),
  matches: z.array(FailureMatchSchema).max(20),
  overallRiskScore: z.number().min(0).max(1),
  riskSummary: z.string().max(3000),
  recommendations: z.array(z.string().max(1000)).max(10),
});

/** Aggregated risk assessment of an idea against the failure library. */
export type FailureAnalysisResult = z.infer<typeof FailureAnalysisResultSchema>;

// ---- User-Reported Failure ----

/**
 * Validates a user-contributed failure report that extends the built-in library.
 * Captures the failure description, category, and lessons learned.
 */
export const UserReportedFailureSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(5000),
  category: FailureCategorySchema,
  lessonsLearned: z.array(z.string().max(1000)).max(10),
  reportedAt: z.string(),
  reportedBy: z.string().max(200).optional(),
});

/** A failure report submitted by a user to enrich the failure library. */
export type UserReportedFailure = z.infer<typeof UserReportedFailureSchema>;

// ---- Config ----

/** Configuration options for failure library analysis. */
export interface FailureLibraryConfig {
  maxMatches?: number;
  minSimilarity?: number;
  categories?: FailureCategory[];
  model?: string;
  signal?: AbortSignal;
}
