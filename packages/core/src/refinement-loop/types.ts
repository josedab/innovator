import { z } from "zod";

/** Refinement tier levels. */
export type RefinementTier = "concept" | "plan" | "specification";

/** Status of a refinement iteration. */
export type RefinementStatus = "pending" | "in_progress" | "completed";

/** A single idea being refined across tiers. */
export interface RefinableIdea {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  currentTier: RefinementTier;
}

/** Refinement iteration result. */
export interface RefinementIteration {
  id: string;
  tier: RefinementTier;
  ideaId: string;
  input: string;
  feedback?: string;
  output: RefinementOutput;
  createdAt: string;
  qualityDelta?: number; // change in quality from previous iteration
}

/** Output at each refinement tier. */
export interface RefinementOutput {
  tier: RefinementTier;
  content: string;
  // Plan tier additions
  implementationSteps?: string[];
  techStack?: string[];
  timeline?: string;
  teamSize?: string;
  // Specification tier additions
  acceptanceCriteria?: string[];
  risks?: string[];
  dependencies?: string[];
  milestones?: Array<{ name: string; description: string }>;
}

/** Session for progressive refinement. */
export interface RefinementSession {
  id: string;
  ideas: RefinableIdea[];
  iterations: RefinementIteration[];
  convergenceScore: number; // 0-1, how much marginal gain remains
  suggestStop: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Zod schema for starting a refinement session. */
export const StartRefinementSchema = z.object({
  ideas: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500),
        description: z.string().min(1).max(5000),
      })
    )
    .min(1)
    .max(10),
});

/** Zod schema for refining an idea. */
export const RefineIdeaSchema = z.object({
  sessionId: z.string().min(1),
  ideaId: z.string().min(1),
  targetTier: z.enum(["plan", "specification"]),
  feedback: z.string().max(2000).optional(),
});
