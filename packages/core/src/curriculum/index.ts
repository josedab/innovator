/**
 * @module curriculum
 *
 * Auto-generate personalized learning paths based on Team DNA profile
 * weaknesses. Each module contains concept explanation, example investigation,
 * practice exercise, and quiz. Course-style UI with progress tracking,
 * peer review, completion certificates, and skill badges. Adaptive
 * difficulty tracking learning outcomes.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { ValidationError } from "../errors.js";

// ---- Skill & Difficulty ----

export const INNOVATION_SKILLS = [
  "divergent-thinking",
  "convergent-thinking",
  "empathy-mapping",
  "first-principles",
  "cross-domain-transfer",
  "risk-assessment",
  "opportunity-identification",
  "prototyping",
  "stakeholder-management",
  "data-driven-decision",
  "creative-constraint",
  "trend-analysis",
  "competitive-intelligence",
  "synthesis",
  "presentation",
] as const;

export type InnovationSkill = (typeof INNOVATION_SKILLS)[number];

export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

// ---- Learning Module ----

export const QuizQuestionSchema = z.object({
  id: z.string().max(100),
  question: z.string().max(2000),
  options: z.array(z.string().max(500)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  explanation: z.string().max(2000),
  difficulty: z.enum(DIFFICULTY_LEVELS),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const PracticeExerciseSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  description: z.string().max(5000),
  type: z.enum(["investigation", "angle-application", "scoring", "synthesis", "freeform"]),
  suggestedSubject: z.string().max(500).optional(),
  suggestedAngles: z.array(z.string().max(100)).max(10).optional(),
  evaluationCriteria: z.array(z.string().max(500)).max(10),
  estimatedMinutes: z.number().int().min(5).max(120),
  difficulty: z.enum(DIFFICULTY_LEVELS),
});

export type PracticeExercise = z.infer<typeof PracticeExerciseSchema>;

export const LearningModuleSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  description: z.string().max(2000),
  skill: z.enum(INNOVATION_SKILLS),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  conceptExplanation: z.string().max(10_000),
  exampleInvestigation: z
    .object({
      subject: z.string().max(500),
      walkthrough: z.string().max(5000),
      keyInsights: z.array(z.string().max(500)).max(10),
    })
    .optional(),
  exercises: z.array(PracticeExerciseSchema).max(5),
  quiz: z.array(QuizQuestionSchema).max(10),
  estimatedMinutes: z.number().int().min(10).max(240),
  prerequisites: z.array(z.string().max(100)).max(5).optional(),
  badges: z.array(z.string().max(100)).max(5).optional(),
});

export type LearningModule = z.infer<typeof LearningModuleSchema>;

// ---- Learning Path ----

export const LearningPathSchema = z.object({
  id: z.string().max(100),
  userId: z.string().max(200),
  title: z.string().max(300),
  description: z.string().max(2000),
  targetSkills: z.array(z.enum(INNOVATION_SKILLS)).max(15),
  modules: z.array(z.string().max(100)).max(30).describe("Ordered module IDs"),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  estimatedHours: z.number().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LearningPath = z.infer<typeof LearningPathSchema>;

// ---- Progress Tracking ----

export const ModuleProgressSchema = z.object({
  userId: z.string().max(200),
  moduleId: z.string().max(100),
  status: z.enum(["not-started", "in-progress", "completed", "needs-review"]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  quizScore: z.number().min(0).max(100).optional(),
  exercisesCompleted: z.number().int().min(0).default(0),
  timeSpentMinutes: z.number().min(0).default(0),
  attempts: z.number().int().min(0).default(0),
});

export type ModuleProgress = z.infer<typeof ModuleProgressSchema>;

export const LearnerProfileSchema = z.object({
  userId: z.string().max(200),
  skillLevels: z.record(z.enum(INNOVATION_SKILLS), z.number().min(0).max(100)).optional(),
  completedModules: z.array(z.string().max(100)).max(100),
  totalPoints: z.number().int().min(0).default(0),
  badges: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(200),
        earnedAt: z.string(),
        skill: z.enum(INNOVATION_SKILLS).optional(),
      })
    )
    .max(100),
  currentPath: z.string().max(100).optional(),
  streakDays: z.number().int().min(0).default(0),
  lastActivityAt: z.string().optional(),
});

export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

// ---- Certificate ----

export const CertificateSchema = z.object({
  id: z.string().max(200),
  userId: z.string().max(200),
  pathId: z.string().max(100),
  pathTitle: z.string().max(300),
  completedAt: z.string(),
  avgQuizScore: z.number().min(0).max(100),
  totalHours: z.number().min(0),
  skills: z.array(z.enum(INNOVATION_SKILLS)).max(15),
  verificationCode: z.string().max(100),
});

export type Certificate = z.infer<typeof CertificateSchema>;

// ---- In-Memory Store ----

const modules = new Map<string, LearningModule>();
const paths = new Map<string, LearningPath>();
const progress = new Map<string, ModuleProgress>(); // key: userId:moduleId
const profiles = new Map<string, LearnerProfile>();
const certificates = new Map<string, Certificate>();

let moduleIdCounter = 0;

// ---- Functions ----

/** Generate a personalized learning path based on skill weaknesses. */
export async function generateLearningPath(
  userId: string,
  weakSkills: InnovationSkill[],
  options: {
    difficulty?: DifficultyLevel;
    maxModules?: number;
    model?: string;
    signal?: AbortSignal;
  } = {}
): Promise<LearningPath> {
  if (weakSkills.length === 0) throw new ValidationError("At least one target skill is required");

  const difficulty = options.difficulty ?? "intermediate";
  const maxModules = options.maxModules ?? 10;

  const prompt = `You are an innovation education expert. Create a learning path curriculum for someone who needs to improve in these innovation skills: ${weakSkills.join(", ")}.
Difficulty level: ${difficulty}
Maximum modules: ${maxModules}

For each module, provide:
- A clear title and description
- Which skill it develops
- A concept explanation (thorough but accessible)
- An example investigation walkthrough
- 1-2 practice exercises with evaluation criteria
- 3-5 quiz questions with options and correct answer

Respond in JSON:
{
  "title": "path title",
  "description": "path description",
  "modules": [
    {
      "title": "module title",
      "description": "module description",
      "skill": "skill-id",
      "conceptExplanation": "detailed explanation",
      "exampleInvestigation": { "subject": "example subject", "walkthrough": "step by step", "keyInsights": ["insight"] },
      "exercises": [{ "title": "exercise", "description": "what to do", "type": "investigation|angle-application|scoring|synthesis|freeform", "evaluationCriteria": ["criteria"], "estimatedMinutes": 30, "difficulty": "${difficulty}" }],
      "quiz": [{ "question": "question?", "options": ["a", "b", "c", "d"], "correctIndex": 0, "explanation": "why", "difficulty": "${difficulty}" }],
      "estimatedMinutes": 60
    }
  ],
  "estimatedHours": number
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, model: options.model, serverMode: true, signal: options.signal })
  );
  const parsed = JSON.parse(extractJson(raw));

  // Create and store modules
  const moduleIds: string[] = [];
  const generatedModules: LearningModule[] = (parsed.modules ?? [])
    .slice(0, maxModules)
    .map((m: Record<string, unknown>) => {
      const id = `module-${++moduleIdCounter}-${Date.now()}`;
      moduleIds.push(id);

      const skill = weakSkills.includes(m.skill as InnovationSkill)
        ? (m.skill as InnovationSkill)
        : weakSkills[0];

      const mod: LearningModule = {
        id,
        title: String(m.title ?? ""),
        description: String(m.description ?? ""),
        skill,
        difficulty,
        conceptExplanation: String(m.conceptExplanation ?? ""),
        exampleInvestigation: m.exampleInvestigation as LearningModule["exampleInvestigation"],
        exercises: (Array.isArray(m.exercises) ? m.exercises : []).map(
          (e: Record<string, unknown>, i: number) => ({
            id: `exercise-${id}-${i}`,
            title: String(e.title ?? ""),
            description: String(e.description ?? ""),
            type: (e.type as PracticeExercise["type"]) ?? "freeform",
            evaluationCriteria: Array.isArray(e.evaluationCriteria)
              ? e.evaluationCriteria.map(String)
              : [],
            estimatedMinutes: typeof e.estimatedMinutes === "number" ? e.estimatedMinutes : 30,
            difficulty,
          })
        ),
        quiz: (Array.isArray(m.quiz) ? m.quiz : []).map(
          (q: Record<string, unknown>, i: number) => ({
            id: `quiz-${id}-${i}`,
            question: String(q.question ?? ""),
            options: Array.isArray(q.options) ? q.options.map(String) : ["True", "False"],
            correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
            explanation: String(q.explanation ?? ""),
            difficulty,
          })
        ),
        estimatedMinutes: typeof m.estimatedMinutes === "number" ? m.estimatedMinutes : 60,
      };

      return LearningModuleSchema.parse(mod);
    });

  for (const mod of generatedModules) {
    modules.set(mod.id, mod);
  }

  const path: LearningPath = {
    id: `path-${userId}-${Date.now()}`,
    userId,
    title: parsed.title ?? `Innovation Skills Path`,
    description: parsed.description ?? `Learning path for ${weakSkills.join(", ")}`,
    targetSkills: weakSkills,
    modules: moduleIds,
    difficulty,
    estimatedHours:
      typeof parsed.estimatedHours === "number" ? parsed.estimatedHours : moduleIds.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validated = LearningPathSchema.parse(path);
  paths.set(validated.id, validated);
  return validated;
}

/** Get a learning module by ID. */
export function getLearningModule(id: string): LearningModule | undefined {
  return modules.get(id);
}

/** Get a learning path by ID. */
export function getLearningPath(id: string): LearningPath | undefined {
  return paths.get(id);
}

/** Get all paths for a user. */
export function getUserLearningPaths(userId: string): LearningPath[] {
  return Array.from(paths.values()).filter((p) => p.userId === userId);
}

// ---- Progress Tracking ----

/** Start a module (set status to in-progress). */
export function startModule(userId: string, moduleId: string): ModuleProgress {
  const key = `${userId}:${moduleId}`;
  const existing = progress.get(key);

  const p: ModuleProgress = {
    userId,
    moduleId,
    status: "in-progress",
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    exercisesCompleted: existing?.exercisesCompleted ?? 0,
    timeSpentMinutes: existing?.timeSpentMinutes ?? 0,
    attempts: (existing?.attempts ?? 0) + 1,
  };

  const validated = ModuleProgressSchema.parse(p);
  progress.set(key, validated);
  return validated;
}

/** Complete a module with quiz score. */
export function completeModule(
  userId: string,
  moduleId: string,
  quizScore: number,
  timeSpentMinutes: number
): ModuleProgress {
  const key = `${userId}:${moduleId}`;
  const existing = progress.get(key);

  const p: ModuleProgress = {
    userId,
    moduleId,
    status: "completed",
    startedAt: existing?.startedAt,
    completedAt: new Date().toISOString(),
    quizScore,
    exercisesCompleted: existing?.exercisesCompleted ?? 0,
    timeSpentMinutes: (existing?.timeSpentMinutes ?? 0) + timeSpentMinutes,
    attempts: existing?.attempts ?? 1,
  };

  const validated = ModuleProgressSchema.parse(p);
  progress.set(key, validated);

  // Update learner profile
  const profile = getOrCreateProfile(userId);
  if (!profile.completedModules.includes(moduleId)) {
    profile.completedModules.push(moduleId);
    profile.totalPoints += Math.round(quizScore * 10);
    profile.lastActivityAt = new Date().toISOString();

    // Update skill level
    const mod = modules.get(moduleId);
    if (mod && profile.skillLevels) {
      const current = profile.skillLevels[mod.skill] ?? 0;
      profile.skillLevels[mod.skill] = Math.min(100, current + quizScore / 5);
    }

    // Award badge for first module in a skill
    if (mod) {
      const hasSkillBadge = profile.badges.some((b) => b.skill === mod.skill);
      if (!hasSkillBadge) {
        profile.badges.push({
          id: `badge-${mod.skill}-${Date.now()}`,
          name: `${mod.skill} Learner`,
          earnedAt: new Date().toISOString(),
          skill: mod.skill,
        });
      }
    }

    profiles.set(userId, profile);
  }

  return validated;
}

/** Get module progress for a user. */
export function getModuleProgress(userId: string, moduleId: string): ModuleProgress | undefined {
  return progress.get(`${userId}:${moduleId}`);
}

/** Get all module progress for a user. */
export function getCurriculumProgress(userId: string): ModuleProgress[] {
  return Array.from(progress.values()).filter((p) => p.userId === userId);
}

// ---- Learner Profile ----

function getOrCreateProfile(userId: string): LearnerProfile {
  if (!profiles.has(userId)) {
    const defaultSkills: Record<string, number> = {};
    for (const skill of INNOVATION_SKILLS) {
      defaultSkills[skill] = 0;
    }
    profiles.set(
      userId,
      LearnerProfileSchema.parse({
        userId,
        skillLevels: defaultSkills,
        completedModules: [],
        badges: [],
      })
    );
  }
  return profiles.get(userId)!;
}

/** Get a learner's profile. */
export function getLearnerProfile(userId: string): LearnerProfile {
  return getOrCreateProfile(userId);
}

/** Get the weakest skills for a user (for path generation). */
export function getWeakestSkills(userId: string, count: number = 3): InnovationSkill[] {
  const profile = getOrCreateProfile(userId);
  const levels = profile.skillLevels ?? {};

  return INNOVATION_SKILLS.slice()
    .sort((a, b) => (levels[a] ?? 0) - (levels[b] ?? 0))
    .slice(0, count);
}

// ---- Certificates ----

/** Generate a completion certificate for a learning path. */
export function generateCertificate(userId: string, pathId: string): Certificate | undefined {
  const path = paths.get(pathId);
  if (!path || path.userId !== userId) return undefined;

  // Check all modules completed
  const allCompleted = path.modules.every((mId) => {
    const p = progress.get(`${userId}:${mId}`);
    return p?.status === "completed";
  });
  if (!allCompleted) return undefined;

  const moduleScores = path.modules.map((mId) => progress.get(`${userId}:${mId}`)?.quizScore ?? 0);
  const avgScore = moduleScores.reduce((s, v) => s + v, 0) / Math.max(moduleScores.length, 1);
  const totalMinutes = path.modules.reduce(
    (s, mId) => s + (progress.get(`${userId}:${mId}`)?.timeSpentMinutes ?? 0),
    0
  );

  const cert: Certificate = {
    id: `cert-${userId}-${pathId}`,
    userId,
    pathId,
    pathTitle: path.title,
    completedAt: new Date().toISOString(),
    avgQuizScore: Math.round(avgScore),
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    skills: path.targetSkills,
    verificationCode: `INNOV-${Date.now().toString(36).toUpperCase()}`,
  };

  const validated = CertificateSchema.parse(cert);
  certificates.set(validated.id, validated);

  // Award certificate badge
  const profile = getOrCreateProfile(userId);
  profile.badges.push({
    id: `badge-cert-${pathId}`,
    name: `Certified: ${path.title}`,
    earnedAt: validated.completedAt,
  });
  profiles.set(userId, profile);

  return validated;
}

/** Get all certificates for a user. */
export function getUserCertificates(userId: string): Certificate[] {
  return Array.from(certificates.values()).filter((c) => c.userId === userId);
}

/** Clear all curriculum data. */
export function clearCurriculumData(): void {
  modules.clear();
  paths.clear();
  progress.clear();
  profiles.clear();
  certificates.clear();
  moduleIdCounter = 0;
}
