import { z } from "zod";

/** A pairing of two angles for combinatorial analysis. */
export const AnglePairSchema = z.object({
  angleA: z.string().max(100),
  angleB: z.string().max(100),
});
export type AnglePair = z.infer<typeof AnglePairSchema>;

/** A synthesized idea from combining two or more angle perspectives. */
export const CombinatorialIdeaSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  implementationHint: z.string().max(2000),
  sourceAngles: z.array(z.string().max(100)).min(2),
  synergyScore: z.number().min(0).max(100),
  noveltyBoost: z.number().min(0).max(100),
  emergentProperties: z.array(z.string().max(500)).max(10),
});
export type CombinatorialIdea = z.infer<typeof CombinatorialIdeaSchema>;

/** Result of a single pairwise combination. */
export const PairwiseResultSchema = z.object({
  pair: AnglePairSchema,
  ideas: z.array(CombinatorialIdeaSchema).max(10),
  synergyRating: z.number().min(0).max(100),
  reasoning: z.string().max(2000),
});
export type PairwiseResult = z.infer<typeof PairwiseResultSchema>;

/** Morphological matrix cell mapping angle to dimension. */
export const MorphologicalCellSchema = z.object({
  angleId: z.string().max(100),
  dimension: z.string().max(200),
  values: z.array(z.string().max(500)).max(10),
});
export type MorphologicalCell = z.infer<typeof MorphologicalCellSchema>;

/** Full combinatorial synthesis result. */
export const CombinatorialResultSchema = z.object({
  subject: z.string().max(1000),
  pairwiseResults: z.array(PairwiseResultSchema),
  higherOrderIdeas: z.array(CombinatorialIdeaSchema).max(20),
  morphologicalMatrix: z.array(MorphologicalCellSchema),
  topCombinations: z.array(CombinatorialIdeaSchema).max(10),
  totalCombinationsExplored: z.number(),
  coveragePercentage: z.number().min(0).max(100),
  createdAt: z.string(),
});
export type CombinatorialResult = z.infer<typeof CombinatorialResultSchema>;

/** Progress during combinatorial synthesis. */
export interface CombinatorialProgress {
  stage: "pairing" | "combining" | "higher-order" | "ranking" | "complete" | "error";
  completedPairs: number;
  totalPairs: number;
  ideasGenerated: number;
  currentPair?: AnglePair;
  error?: string;
}

/** Configuration for combinatorial synthesis. */
export interface CombinatorialConfig {
  maxPairs?: number;
  includeHigherOrder?: boolean;
  minSynergyThreshold?: number;
  model?: string;
  signal?: AbortSignal;
}
