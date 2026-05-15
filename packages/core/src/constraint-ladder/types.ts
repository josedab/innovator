import { z } from "zod";

// ---- Difficulty Levels ----

/** Validates progressive difficulty levels from novice to master for the constraint ladder. */
export const LadderDifficultyLevelSchema = z.enum([
  "novice",
  "intermediate",
  "advanced",
  "expert",
  "master",
]);

/** A progressive difficulty level controlling constraint intensity and novelty thresholds. */
export type LadderDifficultyLevel = z.infer<typeof LadderDifficultyLevelSchema>;

/**
 * Configuration for each difficulty level, mapping levels to their constraint count,
 * novelty threshold, and human-readable description.
 * @see {@link LadderDifficultyLevel}
 */
export const DIFFICULTY_CONFIGS: Record<
  LadderDifficultyLevel,
  { description: string; constraintCount: number; noveltyThreshold: number }
> = {
  novice: {
    description: "Loose constraints — explore freely with minimal restrictions",
    constraintCount: 1,
    noveltyThreshold: 0.3,
  },
  intermediate: {
    description: "Moderate constraints — budget reduced, some resources limited",
    constraintCount: 2,
    noveltyThreshold: 0.5,
  },
  advanced: {
    description: "Tight constraints — budget halved, timeline compressed, key tech unavailable",
    constraintCount: 3,
    noveltyThreshold: 0.65,
  },
  expert: {
    description:
      "Severe constraints — minimal budget, extreme timeline, multiple technologies excluded",
    constraintCount: 4,
    noveltyThreshold: 0.8,
  },
  master: {
    description: "Near-impossible constraints — force radical rethinking of the entire approach",
    constraintCount: 5,
    noveltyThreshold: 0.9,
  },
};

// ---- Constraint Types ----

/** Validates the category of constraint applied at a given ladder level (e.g., budget, timeline, technology). */
export const LadderConstraintTypeSchema = z.enum([
  "budget",
  "timeline",
  "technology",
  "team-size",
  "geography",
  "regulation",
  "sustainability",
  "accessibility",
  "backward-compatibility",
  "zero-dependency",
]);

/** A category of constraint that can be applied during constrained ideation. */
export type LadderConstraintType = z.infer<typeof LadderConstraintTypeSchema>;

/**
 * Validates a single constraint with its type, severity (0–1), and the difficulty level
 * at which it is introduced.
 * @see {@link LadderConstraintType}
 */
export const LadderConstraintSchema = z.object({
  id: z.string(),
  type: LadderConstraintTypeSchema,
  description: z.string().max(1000),
  severity: z.number().min(0).max(1),
  appliedAtLevel: LadderDifficultyLevelSchema,
});

/** A single constraint applied at a specific difficulty level during the ladder climb. */
export type LadderConstraint = z.infer<typeof LadderConstraintSchema>;

// ---- Constrained Idea ----

/**
 * Validates an idea generated under specific constraints, including novelty and feasibility
 * scores and which constraints were satisfied.
 */
export const ConstrainedIdeaSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  noveltyScore: z.number().min(0).max(1),
  feasibilityScore: z.number().min(0).max(1),
  constraintsSatisfied: z.array(z.string()).max(20),
  creativeSolution: z.string().max(3000),
});

/** An idea produced under constraints, scored for novelty and feasibility. */
export type ConstrainedIdea = z.infer<typeof ConstrainedIdeaSchema>;

// ---- Ladder Step ----

/**
 * Validates a single step in the constraint ladder, containing the difficulty level,
 * active constraints, generated ideas, and an achievement badge.
 */
export const LadderStepSchema = z.object({
  level: LadderDifficultyLevelSchema,
  constraints: z.array(LadderConstraintSchema).max(10),
  ideas: z.array(ConstrainedIdeaSchema).max(10),
  averageNovelty: z.number().min(0).max(1),
  passedThreshold: z.boolean(),
  badge: z.string().max(100),
});

/** A single step in the ladder representing one difficulty level's constraints, ideas, and results. */
export type LadderStep = z.infer<typeof LadderStepSchema>;

// ---- Ladder Result ----

/**
 * Validates the complete result of a constraint ladder run, including all steps,
 * the highest level reached, and the best idea found across all levels.
 */
export const LadderResultSchema = z.object({
  subject: z.string().max(2000),
  steps: z.array(LadderStepSchema).max(5),
  highestLevelReached: LadderDifficultyLevelSchema,
  totalIdeasGenerated: z.number().int().min(0),
  bestIdea: ConstrainedIdeaSchema.optional(),
  progressionInsight: z.string().max(3000),
});

/** The full output of a constraint ladder session, summarizing progression and top ideas. */
export type LadderResult = z.infer<typeof LadderResultSchema>;

// ---- Config ----

/** Options for configuring a constraint ladder run, including level range, calibration, and progress callbacks. */
export interface ConstraintLadderConfig {
  startLevel?: LadderDifficultyLevel;
  maxLevel?: LadderDifficultyLevel;
  ideasPerLevel?: number;
  autoCalibrate?: boolean;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ConstraintLadderProgress) => void;
}

/** Progress update emitted during a constraint ladder run, indicating the current stage and level. */
export interface ConstraintLadderProgress {
  stage: "generating-constraints" | "generating-ideas" | "evaluating" | "complete";
  currentLevel: LadderDifficultyLevel;
  completedLevels: number;
  totalLevels: number;
}

// ---- Badges ----

/**
 * Achievement badge emoji and label awarded for completing each difficulty level.
 * @see {@link LadderDifficultyLevel}
 */
export const DIFFICULTY_BADGES: Record<LadderDifficultyLevel, string> = {
  novice: "🌱 Seedling Innovator",
  intermediate: "🌿 Growing Thinker",
  advanced: "🌳 Constrained Creator",
  expert: "⚡ Pressure Diamond",
  master: "🏆 Constraint Master",
};
