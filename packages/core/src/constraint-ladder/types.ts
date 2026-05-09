import { z } from "zod";

// ---- Difficulty Levels ----

export const LadderDifficultyLevelSchema = z.enum([
  "novice",
  "intermediate",
  "advanced",
  "expert",
  "master",
]);

export type LadderDifficultyLevel = z.infer<typeof LadderDifficultyLevelSchema>;

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

export type LadderConstraintType = z.infer<typeof LadderConstraintTypeSchema>;

export const LadderConstraintSchema = z.object({
  id: z.string(),
  type: LadderConstraintTypeSchema,
  description: z.string().max(1000),
  severity: z.number().min(0).max(1),
  appliedAtLevel: LadderDifficultyLevelSchema,
});

export type LadderConstraint = z.infer<typeof LadderConstraintSchema>;

// ---- Constrained Idea ----

export const ConstrainedIdeaSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  noveltyScore: z.number().min(0).max(1),
  feasibilityScore: z.number().min(0).max(1),
  constraintsSatisfied: z.array(z.string()).max(20),
  creativeSolution: z.string().max(3000),
});

export type ConstrainedIdea = z.infer<typeof ConstrainedIdeaSchema>;

// ---- Ladder Step ----

export const LadderStepSchema = z.object({
  level: LadderDifficultyLevelSchema,
  constraints: z.array(LadderConstraintSchema).max(10),
  ideas: z.array(ConstrainedIdeaSchema).max(10),
  averageNovelty: z.number().min(0).max(1),
  passedThreshold: z.boolean(),
  badge: z.string().max(100),
});

export type LadderStep = z.infer<typeof LadderStepSchema>;

// ---- Ladder Result ----

export const LadderResultSchema = z.object({
  subject: z.string().max(2000),
  steps: z.array(LadderStepSchema).max(5),
  highestLevelReached: LadderDifficultyLevelSchema,
  totalIdeasGenerated: z.number().int().min(0),
  bestIdea: ConstrainedIdeaSchema.optional(),
  progressionInsight: z.string().max(3000),
});

export type LadderResult = z.infer<typeof LadderResultSchema>;

// ---- Config ----

export interface ConstraintLadderConfig {
  startLevel?: LadderDifficultyLevel;
  maxLevel?: LadderDifficultyLevel;
  ideasPerLevel?: number;
  autoCalibrate?: boolean;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ConstraintLadderProgress) => void;
}

export interface ConstraintLadderProgress {
  stage: "generating-constraints" | "generating-ideas" | "evaluating" | "complete";
  currentLevel: LadderDifficultyLevel;
  completedLevels: number;
  totalLevels: number;
}

// ---- Badges ----

export const DIFFICULTY_BADGES: Record<LadderDifficultyLevel, string> = {
  novice: "🌱 Seedling Innovator",
  intermediate: "🌿 Growing Thinker",
  advanced: "🌳 Constrained Creator",
  expert: "⚡ Pressure Diamond",
  master: "🏆 Constraint Master",
};
