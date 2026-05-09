import { z } from "zod";

// ---- Failure Categories ----

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

export type FailureCategory = z.infer<typeof FailureCategorySchema>;

// ---- Failure Pattern ----

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

export type FailurePattern = z.infer<typeof FailurePatternSchema>;

// ---- Match Result ----

export const FailureMatchSchema = z.object({
  pattern: FailurePatternSchema,
  similarityScore: z.number().min(0).max(1),
  matchedSymptoms: z.array(z.string().max(500)).max(20),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  mitigationAdvice: z.string().max(3000),
});

export type FailureMatch = z.infer<typeof FailureMatchSchema>;

// ---- Analysis Result ----

export const FailureAnalysisResultSchema = z.object({
  ideaTitle: z.string().max(500),
  matches: z.array(FailureMatchSchema).max(20),
  overallRiskScore: z.number().min(0).max(1),
  riskSummary: z.string().max(3000),
  recommendations: z.array(z.string().max(1000)).max(10),
});

export type FailureAnalysisResult = z.infer<typeof FailureAnalysisResultSchema>;

// ---- User-Reported Failure ----

export const UserReportedFailureSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(5000),
  category: FailureCategorySchema,
  lessonsLearned: z.array(z.string().max(1000)).max(10),
  reportedAt: z.string(),
  reportedBy: z.string().max(200).optional(),
});

export type UserReportedFailure = z.infer<typeof UserReportedFailureSchema>;

// ---- Config ----

export interface FailureLibraryConfig {
  maxMatches?: number;
  minSimilarity?: number;
  categories?: FailureCategory[];
  model?: string;
  signal?: AbortSignal;
}
