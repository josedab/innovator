import { z } from "zod";

// ---- Time Capsule Status ----

export const CapsuleStatusSchema = z.enum(["sealed", "scheduled", "opened", "expired"]);

export type CapsuleStatus = z.infer<typeof CapsuleStatusSchema>;

// ---- Future Context Prediction ----

export const FutureContextSchema = z.object({
  predictedDate: z.string(),
  marketTrends: z.array(z.string().max(1000)).max(10),
  technologyShifts: z.array(z.string().max(1000)).max(10),
  competitiveLandscape: z.string().max(3000),
  regulatoryChanges: z.array(z.string().max(1000)).max(10),
  consumerBehavior: z.string().max(2000),
  confidenceLevel: z.number().min(0).max(1),
});

export type FutureContext = z.infer<typeof FutureContextSchema>;

// ---- Original Snapshot ----

export const IdeaSnapshotSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  feasibility: z.enum(["low", "medium", "high"]),
  originalScore: z.number().min(0).max(10).optional(),
  capturedAt: z.string(),
  context: z.string().max(3000).optional(),
});

export type IdeaSnapshot = z.infer<typeof IdeaSnapshotSchema>;

// ---- Re-evaluation ----

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

export type ReEvaluation = z.infer<typeof ReEvaluationSchema>;

// ---- Time Capsule ----

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

export type TimeCapsule = z.infer<typeof TimeCapsuleSchema>;

// ---- Opening Ceremony Result ----

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

export type OpeningCeremony = z.infer<typeof OpeningCeremonySchema>;

// ---- Config ----

export interface TimeCapsuleConfig {
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: TimeCapsuleProgress) => void;
}

export interface TimeCapsuleProgress {
  stage: "predicting-future" | "re-evaluating" | "comparing" | "complete";
  capsuleId: string;
}
