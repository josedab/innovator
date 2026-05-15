import { z } from "zod";

// ---- Time Capsule Status ----

/** Validates the lifecycle status of a time capsule. */
export const CapsuleStatusSchema = z.enum(["sealed", "scheduled", "opened", "expired"]);

/** Lifecycle status of a time capsule (sealed → scheduled → opened/expired). */
export type CapsuleStatus = z.infer<typeof CapsuleStatusSchema>;

// ---- Future Context Prediction ----

/**
 * Validates a predicted future context snapshot used to re-evaluate sealed ideas.
 * Covers market trends, technology shifts, regulatory changes, and consumer behavior.
 */
export const FutureContextSchema = z.object({
  predictedDate: z.string(),
  marketTrends: z.array(z.string().max(1000)).max(10),
  technologyShifts: z.array(z.string().max(1000)).max(10),
  competitiveLandscape: z.string().max(3000),
  regulatoryChanges: z.array(z.string().max(1000)).max(10),
  consumerBehavior: z.string().max(2000),
  confidenceLevel: z.number().min(0).max(1),
});

/** LLM-generated prediction of the landscape at a future date. */
export type FutureContext = z.infer<typeof FutureContextSchema>;

// ---- Original Snapshot ----

/**
 * Validates the immutable snapshot of an idea at the moment it is sealed.
 * Captures the idea's description, feasibility, and optional score for later comparison.
 */
export const IdeaSnapshotSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  feasibility: z.enum(["low", "medium", "high"]),
  originalScore: z.number().min(0).max(10).optional(),
  capturedAt: z.string(),
  context: z.string().max(3000).optional(),
});

/** Frozen point-in-time snapshot of an idea when it was sealed into a capsule. */
export type IdeaSnapshot = z.infer<typeof IdeaSnapshotSchema>;

// ---- Re-evaluation ----

/**
 * Validates the result of re-evaluating a sealed idea against predicted future context.
 * Includes an updated score, delta, and an actionable recommendation.
 * @see FutureContextSchema
 */
export const ReEvaluationSchema = z.object({
  updatedScore: z.number().min(0).max(10),
  scoreDelta: z.number(),
  stillRelevant: z.boolean(),
  whatChanged: z.string().max(3000),
  newOpportunities: z.array(z.string().max(1000)).max(10),
  newRisks: z.array(z.string().max(1000)).max(10),
  recommendation: z.enum(["pursue-now", "continue-waiting", "pivot", "abandon"]),
  reasoning: z.string().max(3000),
});

/** Outcome of re-evaluating a sealed idea against the predicted future context. */
export type ReEvaluation = z.infer<typeof ReEvaluationSchema>;

// ---- Time Capsule ----

/**
 * Validates a complete time capsule record, combining the sealed idea snapshot
 * with its schedule, status, and optional future context / re-evaluation results.
 */
export const TimeCapsuleSchema = z.object({
  id: z.string(),
  ideaSnapshot: IdeaSnapshotSchema,
  openDate: z.string(),
  createdAt: z.string(),
  status: CapsuleStatusSchema,
  futureContext: FutureContextSchema.optional(),
  reEvaluation: ReEvaluationSchema.optional(),
  openedAt: z.string().optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(100)).max(20).default([]),
  createdBy: z.string().max(200).optional(),
});

/** A sealed idea snapshot scheduled to be re-evaluated at a future date. */
export type TimeCapsule = z.infer<typeof TimeCapsuleSchema>;

// ---- Opening Ceremony Result ----

/**
 * Validates the result of an opening ceremony — the event where a time capsule is unsealed.
 * Includes the original snapshot, predicted future context, re-evaluation, and a
 * side-by-side score comparison with a verdict.
 */
export const OpeningCeremonySchema = z.object({
  capsuleId: z.string(),
  ideaTitle: z.string().max(500),
  originalSnapshot: IdeaSnapshotSchema,
  futureContext: FutureContextSchema,
  reEvaluation: ReEvaluationSchema,
  sideByComparison: z.object({
    originalScore: z.number().min(0).max(10),
    updatedScore: z.number().min(0).max(10),
    keyDifferences: z.array(z.string().max(500)).max(10),
    verdict: z.string().max(2000),
  }),
  openedAt: z.string(),
});

/** Full result of a capsule opening ceremony with side-by-side past vs. future comparison. */
export type OpeningCeremony = z.infer<typeof OpeningCeremonySchema>;

// ---- Config ----

/** Configuration options for time capsule operations. */
export interface TimeCapsuleConfig {
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: TimeCapsuleProgress) => void;
}

/** Progress report emitted during a time capsule opening ceremony. */
export interface TimeCapsuleProgress {
  stage: "predicting-future" | "re-evaluating" | "comparing" | "complete";
  capsuleId: string;
}
