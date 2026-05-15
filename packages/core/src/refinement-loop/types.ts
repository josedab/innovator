import { z } from "zod";

/** Refinement tier levels. */
export type RefinementTier = "concept" | "plan" | "specification";

/** Status of a refinement iteration. */
export type RefinementStatus = "pending" | "in_progress" | "completed";

/** A single idea being refined across tiers. */
export interface RefinableIdea {
  /** Unique idea identifier. */
  id: string;
  /** Short idea title. */
  title: string;
  /** Full idea description. */
  description: string;
  /** Whether this idea is selected for refinement. */
  selected: boolean;
  /** Current refinement tier (`"concept"` → `"plan"` → `"specification"`). */
  currentTier: RefinementTier;
}

/** Refinement iteration result. */
export interface RefinementIteration {
  /** Unique iteration identifier. */
  id: string;
  /** Tier this iteration targeted. */
  tier: RefinementTier;
  /** ID of the idea being refined. */
  ideaId: string;
  /** Input text sent to the LLM for refinement. */
  input: string;
  /** Optional user feedback guiding this iteration. */
  feedback?: string;
  /** Structured output produced by the LLM. */
  output: RefinementOutput;
  /** ISO 8601 timestamp when this iteration was created. */
  createdAt: string;
  /** Change in quality score compared to previous iteration (positive = improvement). */
  qualityDelta?: number;
}

/** Output at each refinement tier. */
export interface RefinementOutput {
  /** The tier this output was generated for. */
  tier: RefinementTier;
  /** Primary text content of the refinement. */
  content: string;
  /** Step-by-step implementation plan (plan tier). */
  implementationSteps?: string[];
  /** Recommended technologies and frameworks (plan tier). */
  techStack?: string[];
  /** Estimated timeline description (plan tier). */
  timeline?: string;
  /** Recommended team size (plan tier). */
  teamSize?: string;
  /** Testable acceptance criteria (specification tier). */
  acceptanceCriteria?: string[];
  /** Identified risks and mitigation strategies (specification tier). */
  risks?: string[];
  /** External dependencies and prerequisites (specification tier). */
  dependencies?: string[];
  /** Key milestones with descriptions (specification tier). */
  milestones?: Array<{ name: string; description: string }>;
}

/** Session for progressive refinement. */
export interface RefinementSession {
  /** Unique session identifier. */
  id: string;
  /** Ideas being refined in this session. */
  ideas: RefinableIdea[];
  /** History of refinement iterations. */
  iterations: RefinementIteration[];
  /** Convergence score (0–1); lower values indicate diminishing returns. */
  convergenceScore: number;
  /** Whether the system suggests stopping further refinement. */
  suggestStop: boolean;
  /** ISO 8601 timestamp when the session was created. */
  createdAt: string;
  /** ISO 8601 timestamp when the session was last modified. */
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
