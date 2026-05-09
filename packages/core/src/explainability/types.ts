import { z } from "zod";

// ---- Decision Point ----

export const XaiDecisionPointTypeSchema = z.enum([
  "investigation-trigger",
  "angle-selection",
  "idea-generation",
  "idea-scoring",
  "synthesis-ranking",
  "pattern-match",
  "constraint-application",
  "user-feedback",
]);

export type XaiDecisionPointType = z.infer<typeof XaiDecisionPointTypeSchema>;

export const XaiDecisionPointSchema = z.object({
  id: z.string(),
  type: XaiDecisionPointTypeSchema,
  timestamp: z.string(),
  description: z.string().max(2000),
  inputs: z.array(z.string().max(1000)).max(20),
  output: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(3000),
  alternativesConsidered: z
    .array(
      z.object({
        option: z.string().max(1000),
        reason: z.string().max(1000),
        rejected: z.boolean(),
      })
    )
    .max(10),
});

export type XaiDecisionPoint = z.infer<typeof XaiDecisionPointSchema>;

// ---- Reasoning Chain ----

export const ReasoningStepSchema = z.object({
  stepNumber: z.number().int().min(0),
  action: z.string().max(500),
  reasoning: z.string().max(2000),
  evidence: z.array(z.string().max(1000)).max(10),
  confidence: z.number().min(0).max(1),
  parentStepNumber: z.number().int().min(0).optional(),
});

export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

export const ReasoningChainSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  steps: z.array(ReasoningStepSchema).max(50),
  overallConfidence: z.number().min(0).max(1),
  triggerAspects: z.array(z.string().max(500)).max(20),
  patternsApplied: z.array(z.string().max(500)).max(20),
});

export type ReasoningChain = z.infer<typeof ReasoningChainSchema>;

// ---- Confidence Decomposition ----

export const XaiConfidenceDimensionSchema = z.object({
  dimension: z.string().max(200),
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  evidence: z.string().max(1000),
});

export type XaiConfidenceDimension = z.infer<typeof XaiConfidenceDimensionSchema>;

export const ConfidenceDecompositionSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  overallConfidence: z.number().min(0).max(1),
  dimensions: z.array(XaiConfidenceDimensionSchema).max(20),
});

export type ConfidenceDecomposition = z.infer<typeof ConfidenceDecompositionSchema>;

// ---- Counterfactual ----

export const CounterfactualSchema = z.object({
  id: z.string(),
  question: z.string().max(1000),
  originalOutcome: z.string().max(2000),
  alteredCondition: z.string().max(1000),
  predictedOutcome: z.string().max(2000),
  impactDelta: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  explanation: z.string().max(3000),
});

export type Counterfactual = z.infer<typeof CounterfactualSchema>;

// ---- Explainability Report ----

export const ExplainabilityReportSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  reasoningChain: ReasoningChainSchema,
  confidenceDecomposition: ConfidenceDecompositionSchema,
  counterfactuals: z.array(CounterfactualSchema).max(10),
  decisionPoints: z.array(XaiDecisionPointSchema).max(50),
  summary: z.string().max(5000),
});

export type ExplainabilityReport = z.infer<typeof ExplainabilityReportSchema>;

// ---- Config ----

export interface ExplainabilityConfig {
  counterfactualCount?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ExplainabilityProgress) => void;
}

export interface ExplainabilityProgress {
  stage: "tracing-reasoning" | "decomposing-confidence" | "generating-counterfactuals" | "complete";
  completedSteps: number;
  totalSteps: number;
}
