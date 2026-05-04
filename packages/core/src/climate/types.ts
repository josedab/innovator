import { z } from "zod";

/** The 12 dimensions of innovation culture. */
export const CLIMATE_DIMENSIONS = [
  "psychological-safety",
  "risk-tolerance",
  "resource-availability",
  "leadership-support",
  "collaboration",
  "autonomy",
  "experimentation",
  "diversity-inclusion",
  "learning-orientation",
  "customer-centricity",
  "speed-agility",
  "vision-alignment",
] as const;

export const ClimateDimensionSchema = z.enum(CLIMATE_DIMENSIONS);
export type ClimateDimension = z.infer<typeof ClimateDimensionSchema>;

/** Assessment for a single dimension. */
export const DimensionScoreSchema = z.object({
  dimension: ClimateDimensionSchema,
  score: z.number().min(1).max(10),
  maturityLevel: z.enum(["nascent", "developing", "established", "advanced", "leading"]),
  strengths: z.array(z.string().max(500)).max(5),
  gaps: z.array(z.string().max(500)).max(5),
  evidence: z.array(z.string().max(500)).max(5),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

/** Industry benchmark comparison. */
export const BenchmarkComparisonSchema = z.object({
  dimension: ClimateDimensionSchema,
  orgScore: z.number().min(1).max(10),
  industryAverage: z.number().min(1).max(10),
  topQuartile: z.number().min(1).max(10),
  percentileRank: z.number().min(0).max(100),
});
export type BenchmarkComparison = z.infer<typeof BenchmarkComparisonSchema>;

/** An intervention playbook for improving a dimension. */
export const InterventionSchema = z.object({
  id: z.string().max(100),
  dimension: ClimateDimensionSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  effort: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  timeframe: z.enum(["weeks", "months", "quarters"]),
  actions: z.array(z.string().max(500)).max(10),
});
export type Intervention = z.infer<typeof InterventionSchema>;

/** Full climate assessment result. */
export const ClimateAssessmentSchema = z.object({
  id: z.string().max(100),
  organizationName: z.string().max(200),
  industry: z.string().max(200),
  dimensionScores: z.array(DimensionScoreSchema),
  overallScore: z.number().min(1).max(10),
  overallMaturity: z.enum(["nascent", "developing", "established", "advanced", "leading"]),
  benchmarks: z.array(BenchmarkComparisonSchema),
  interventions: z.array(InterventionSchema),
  summary: z.string().max(5000),
  topStrengths: z.array(z.string().max(500)).max(5),
  topGaps: z.array(z.string().max(500)).max(5),
  createdAt: z.string(),
});
export type ClimateAssessment = z.infer<typeof ClimateAssessmentSchema>;

/** Survey response for climate assessment. */
export interface ClimateSurveyResponse {
  dimension: ClimateDimension;
  question: string;
  score: number;
  comment?: string;
}

/** Configuration for climate assessment. */
export interface ClimateAssessmentConfig {
  organizationName: string;
  industry: string;
  model?: string;
  signal?: AbortSignal;
}
