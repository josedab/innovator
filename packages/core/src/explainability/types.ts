import { z } from "zod";

// ---- Decision Point ----

/** Validates the type of decision point in the innovation pipeline (e.g., angle selection, idea scoring). */
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

/** A category of decision made during the innovation pipeline. */
export type XaiDecisionPointType = z.infer<typeof XaiDecisionPointTypeSchema>;

/**
 * Validates a single explainable decision point, capturing inputs, output, confidence,
 * reasoning, and alternatives that were considered and rejected.
 */
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

/** A recorded decision point with full reasoning trace for explainability. */
export type XaiDecisionPoint = z.infer<typeof XaiDecisionPointSchema>;

// ---- Reasoning Chain ----

/** Validates a single step in a reasoning chain, with evidence, confidence, and optional parent linkage. */
export const ReasoningStepSchema = z.object({
  stepNumber: z.number().int().min(0),
  action: z.string().max(500),
  reasoning: z.string().max(2000),
  evidence: z.array(z.string().max(1000)).max(10),
  confidence: z.number().min(0).max(1),
  parentStepNumber: z.number().int().min(0).optional(),
});

/** One step in a reasoning chain, optionally linked to a parent step for branching logic. */
export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

/**
 * Validates a full reasoning chain for an idea, linking sequential reasoning steps
 * with the trigger aspects and patterns that influenced the outcome.
 */
export const ReasoningChainSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  steps: z.array(ReasoningStepSchema).max(50),
  overallConfidence: z.number().min(0).max(1),
  triggerAspects: z.array(z.string().max(500)).max(20),
  patternsApplied: z.array(z.string().max(500)).max(20),
});

/** The complete chain of reasoning steps that led to an idea's generation or scoring. */
export type ReasoningChain = z.infer<typeof ReasoningChainSchema>;

// ---- Confidence Decomposition ----

/** Validates a single dimension contributing to an idea's confidence score (e.g., feasibility, novelty). */
export const XaiConfidenceDimensionSchema = z.object({
  dimension: z.string().max(200),
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  evidence: z.string().max(1000),
});

/** A weighted dimension (with evidence) contributing to overall confidence. */
export type XaiConfidenceDimension = z.infer<typeof XaiConfidenceDimensionSchema>;

/**
 * Validates a confidence decomposition breaking an idea's overall score into
 * weighted dimensions with individual evidence and scores.
 * @see {@link XaiConfidenceDimension}
 */
export const ConfidenceDecompositionSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  overallConfidence: z.number().min(0).max(1),
  dimensions: z.array(XaiConfidenceDimensionSchema).max(20),
});

/** Breakdown of an idea's confidence into individual scored and weighted dimensions. */
export type ConfidenceDecomposition = z.infer<typeof ConfidenceDecompositionSchema>;

// ---- Counterfactual ----

/**
 * Validates a counterfactual analysis: "what if" a condition had been different?
 * Includes the original outcome, altered condition, predicted outcome, and impact delta (−1 to 1).
 */
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

/** A "what-if" scenario exploring how changing one condition would alter the outcome. */
export type Counterfactual = z.infer<typeof CounterfactualSchema>;

// ---- Explainability Report ----

/**
 * Validates a complete XAI report for an idea, combining reasoning chain,
 * confidence decomposition, counterfactuals, and all decision points.
 */
export const ExplainabilityReportSchema = z.object({
  ideaId: z.string(),
  ideaTitle: z.string().max(500),
  reasoningChain: ReasoningChainSchema,
  confidenceDecomposition: ConfidenceDecompositionSchema,
  counterfactuals: z.array(CounterfactualSchema).max(10),
  decisionPoints: z.array(XaiDecisionPointSchema).max(50),
  summary: z.string().max(5000),
});

/** Full explainability report providing transparency into how and why an idea was evaluated. */
export type ExplainabilityReport = z.infer<typeof ExplainabilityReportSchema>;

// ---- Config ----

/** Options for generating an explainability report, including counterfactual count and progress callbacks. */
export interface ExplainabilityConfig {
  counterfactualCount?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ExplainabilityProgress) => void;
}

/** Progress update emitted during explainability report generation, indicating the current analysis stage. */
export interface ExplainabilityProgress {
  stage: "tracing-reasoning" | "decomposing-confidence" | "generating-counterfactuals" | "complete";
  completedSteps: number;
  totalSteps: number;
}
