/**
 * @module gamification/skill-trees
 *
 * Innovation Skill Trees — gamified learning progression with XP system,
 * skill trees, and unlockable features. Track user progress across
 * innovation frameworks, award experience points, and gate advanced
 * capabilities behind skill milestones.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for a skill category. */
export const SkillCategorySchema = z.enum([
  "exploration",
  "analysis",
  "synthesis",
  "collaboration",
  "mastery",
  "frameworks",
]);

/** Schema for a single skill node in the tree. */
export const SkillNodeSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  description: z.string().max(500),
  category: SkillCategorySchema,
  icon: z.string().max(10),
  xpRequired: z.number().min(0).max(10000),
  tier: z.number().min(1).max(5),
  prerequisites: z.array(z.string().max(100)).max(5),
  /** Feature unlocked when this skill is reached. */
  unlocksFeature: z.string().max(200).optional(),
});

/** Schema for user XP event. */
export const XPEventSchema = z.object({
  id: z.string().max(200),
  userId: z.string().max(200),
  amount: z.number().min(0).max(1000),
  source: z.enum([
    "investigation",
    "angle-generation",
    "synthesis",
    "high-score-idea",
    "streak",
    "challenge-complete",
    "collaboration",
    "deep-research",
    "export",
    "feedback",
  ]),
  timestamp: z.string(),
  detail: z.string().max(500).optional(),
});

/** Schema for user skill progress. */
export const UserSkillProgressSchema = z.object({
  userId: z.string().max(200),
  totalXP: z.number().min(0),
  level: z.number().min(1),
  unlockedSkills: z.array(z.string().max(100)).max(100),
  xpByCategory: z.record(z.number()),
  currentStreak: z.number().min(0),
  lastActivityDate: z.string().optional(),
});

/** Schema for level definition. */
export const LevelDefinitionSchema = z.object({
  level: z.number().min(1).max(100),
  title: z.string().max(200),
  xpRequired: z.number().min(0),
  perks: z.array(z.string().max(200)).max(10),
});

// ---- Types ----

export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type SkillNode = z.infer<typeof SkillNodeSchema>;
export type XPEvent = z.infer<typeof XPEventSchema>;
export type UserSkillProgress = z.infer<typeof UserSkillProgressSchema>;
export type LevelDefinition = z.infer<typeof LevelDefinitionSchema>;

// ---- Built-in Skill Tree ----

/** The innovation skill tree. */
export const SKILL_TREE: SkillNode[] = [
  // Tier 1 — Beginner
  { id: "first-investigation", name: "First Steps", description: "Complete your first investigation", category: "exploration", icon: "🌱", xpRequired: 0, tier: 1, prerequisites: [] },
  { id: "scamper-basics", name: "SCAMPER Novice", description: "Use the SCAMPER angle", category: "frameworks", icon: "🔧", xpRequired: 50, tier: 1, prerequisites: ["first-investigation"] },
  { id: "first-principles-basics", name: "Principled Thinker", description: "Use first-principles angle", category: "frameworks", icon: "🧱", xpRequired: 50, tier: 1, prerequisites: ["first-investigation"] },

  // Tier 2 — Intermediate
  { id: "multi-angle", name: "Multi-Angle Explorer", description: "Use 4+ angles in one session", category: "exploration", icon: "🔀", xpRequired: 200, tier: 2, prerequisites: ["scamper-basics", "first-principles-basics"] },
  { id: "idea-scorer", name: "Critical Evaluator", description: "Score 20 ideas", category: "analysis", icon: "📊", xpRequired: 300, tier: 2, prerequisites: ["first-investigation"], unlocksFeature: "advanced-scoring" },
  { id: "collaborator", name: "Team Innovator", description: "Join 3 collaborative sessions", category: "collaboration", icon: "🤝", xpRequired: 250, tier: 2, prerequisites: ["first-investigation"], unlocksFeature: "create-sessions" },

  // Tier 3 — Advanced
  { id: "all-angles", name: "Full Spectrum", description: "Use all 8 angles", category: "exploration", icon: "🌈", xpRequired: 500, tier: 3, prerequisites: ["multi-angle"], unlocksFeature: "custom-angles" },
  { id: "deep-researcher", name: "Deep Diver", description: "Complete 5 deep research sessions", category: "analysis", icon: "🤿", xpRequired: 600, tier: 3, prerequisites: ["idea-scorer"], unlocksFeature: "deep-research" },
  { id: "synthesis-master", name: "Synthesis Master", description: "Generate 10 synthesis reports", category: "synthesis", icon: "🧬", xpRequired: 500, tier: 3, prerequisites: ["multi-angle"] },

  // Tier 4 — Expert
  { id: "framework-master", name: "Framework Master", description: "Master all innovation frameworks", category: "mastery", icon: "🏆", xpRequired: 1000, tier: 4, prerequisites: ["all-angles", "synthesis-master"], unlocksFeature: "angle-studio" },
  { id: "mentor", name: "Innovation Mentor", description: "Help 5 users in collaborative sessions", category: "collaboration", icon: "🎓", xpRequired: 800, tier: 4, prerequisites: ["collaborator"] },

  // Tier 5 — Grandmaster
  { id: "grandmaster", name: "Innovation Grandmaster", description: "Reach the pinnacle of innovation mastery", category: "mastery", icon: "👑", xpRequired: 2000, tier: 5, prerequisites: ["framework-master", "mentor"], unlocksFeature: "all-features" },
];

/** Level progression definitions. */
export const LEVELS: LevelDefinition[] = [
  { level: 1, title: "Novice Innovator", xpRequired: 0, perks: ["Basic angles"] },
  { level: 2, title: "Aspiring Innovator", xpRequired: 100, perks: ["Investigation history"] },
  { level: 3, title: "Rising Innovator", xpRequired: 300, perks: ["Export features"] },
  { level: 4, title: "Skilled Innovator", xpRequired: 600, perks: ["Custom angles"] },
  { level: 5, title: "Expert Innovator", xpRequired: 1000, perks: ["Deep research", "Scoring"] },
  { level: 6, title: "Master Innovator", xpRequired: 1500, perks: ["Angle studio", "Collaboration"] },
  { level: 7, title: "Elite Innovator", xpRequired: 2000, perks: ["All features"] },
  { level: 8, title: "Legend", xpRequired: 3000, perks: ["Community leadership"] },
  { level: 9, title: "Visionary", xpRequired: 5000, perks: ["Beta features"] },
  { level: 10, title: "Grandmaster", xpRequired: 10000, perks: ["Everything unlocked"] },
];

// ---- XP Reward Table ----

/** XP awards per activity type. */
export const XP_REWARDS: Record<XPEvent["source"], number> = {
  "investigation": 20,
  "angle-generation": 10,
  "synthesis": 30,
  "high-score-idea": 50,
  "streak": 25,
  "challenge-complete": 40,
  "collaboration": 15,
  "deep-research": 60,
  "export": 5,
  "feedback": 10,
};

// ---- In-Memory Store ----

const xpEvents: XPEvent[] = [];
const userProgress: Map<string, UserSkillProgress> = new Map();

// ---- Core Functions ----

/**
 * Award XP to a user for an activity.
 *
 * @param userId - The user ID
 * @param source - The activity type
 * @param detail - Optional activity detail
 * @returns The XP event and updated progress
 */
export function awardXP(
  userId: string,
  source: XPEvent["source"],
  detail?: string
): { event: XPEvent; progress: UserSkillProgress; leveledUp: boolean; newLevel?: LevelDefinition } {
  const amount = XP_REWARDS[source];
  const event: XPEvent = {
    id: `xp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    amount,
    source,
    timestamp: new Date().toISOString(),
    detail,
  };
  xpEvents.push(event);

  const progress = getOrCreateProgress(userId);
  const oldLevel = progress.level;

  progress.totalXP += amount;

  // Update category XP
  const category = sourceToCategory(source);
  progress.xpByCategory[category] = (progress.xpByCategory[category] ?? 0) + amount;

  // Check for new level
  const newLevel = computeLevel(progress.totalXP);
  const leveledUp = newLevel > oldLevel;
  progress.level = newLevel;
  progress.lastActivityDate = new Date().toISOString().split("T")[0];

  // Auto-unlock skills based on XP thresholds
  checkSkillUnlocks(progress);

  return {
    event,
    progress: { ...progress },
    leveledUp,
    newLevel: leveledUp ? LEVELS.find((l) => l.level === newLevel) : undefined,
  };
}

/**
 * Get user skill progress.
 */
export function getUserProgress(userId: string): UserSkillProgress {
  return { ...getOrCreateProgress(userId) };
}

/**
 * Get user's current level definition.
 */
export function getUserLevel(userId: string): LevelDefinition {
  const progress = getOrCreateProgress(userId);
  return LEVELS.find((l) => l.level === progress.level) ?? LEVELS[0];
}

/**
 * Check if a user has unlocked a specific skill.
 */
export function hasSkill(userId: string, skillId: string): boolean {
  const progress = getOrCreateProgress(userId);
  return progress.unlockedSkills.includes(skillId);
}

/**
 * Check if a feature is unlocked for a user.
 */
export function isFeatureUnlocked(userId: string, featureId: string): boolean {
  const progress = getOrCreateProgress(userId);
  return SKILL_TREE.some(
    (skill) =>
      skill.unlocksFeature === featureId &&
      progress.unlockedSkills.includes(skill.id)
  );
}

/**
 * Get the full skill tree with user progress overlaid.
 */
export function getSkillTreeWithProgress(userId: string): Array<SkillNode & { unlocked: boolean; available: boolean }> {
  const progress = getOrCreateProgress(userId);
  return SKILL_TREE.map((skill) => ({
    ...skill,
    unlocked: progress.unlockedSkills.includes(skill.id),
    available: skill.prerequisites.every((p) => progress.unlockedSkills.includes(p)) &&
      progress.totalXP >= skill.xpRequired,
  }));
}

/**
 * Manually unlock a skill (for admin/testing).
 */
export function unlockSkill(userId: string, skillId: string): boolean {
  const skill = SKILL_TREE.find((s) => s.id === skillId);
  if (!skill) return false;

  const progress = getOrCreateProgress(userId);
  if (progress.unlockedSkills.includes(skillId)) return false;

  progress.unlockedSkills.push(skillId);
  return true;
}

/**
 * Get XP history for a user.
 */
export function getXPHistory(userId: string, limit?: number): XPEvent[] {
  const events = xpEvents.filter((e) => e.userId === userId);
  return limit ? events.slice(-limit) : events;
}

/**
 * Get leaderboard based on XP.
 */
export function getXPLeaderboard(limit: number = 10): Array<{ userId: string; totalXP: number; level: number; levelTitle: string }> {
  return Array.from(userProgress.values())
    .sort((a, b) => b.totalXP - a.totalXP)
    .slice(0, limit)
    .map((p) => ({
      userId: p.userId,
      totalXP: p.totalXP,
      level: p.level,
      levelTitle: LEVELS.find((l) => l.level === p.level)?.title ?? "Unknown",
    }));
}

/**
 * Clear all skill tree data (for testing).
 */
export function clearSkillTrees(): void {
  xpEvents.length = 0;
  userProgress.clear();
}

// ---- Helpers ----

function getOrCreateProgress(userId: string): UserSkillProgress {
  let progress = userProgress.get(userId);
  if (!progress) {
    progress = {
      userId,
      totalXP: 0,
      level: 1,
      unlockedSkills: [],
      xpByCategory: {},
      currentStreak: 0,
    };
    userProgress.set(userId, progress);
  }
  return progress;
}

function computeLevel(totalXP: number): number {
  let level = 1;
  for (const def of LEVELS) {
    if (totalXP >= def.xpRequired) {
      level = def.level;
    }
  }
  return level;
}

function checkSkillUnlocks(progress: UserSkillProgress): void {
  for (const skill of SKILL_TREE) {
    if (progress.unlockedSkills.includes(skill.id)) continue;
    if (progress.totalXP < skill.xpRequired) continue;
    if (!skill.prerequisites.every((p) => progress.unlockedSkills.includes(p))) continue;
    progress.unlockedSkills.push(skill.id);
  }
}

function sourceToCategory(source: XPEvent["source"]): string {
  const mapping: Record<string, string> = {
    "investigation": "exploration",
    "angle-generation": "frameworks",
    "synthesis": "synthesis",
    "high-score-idea": "analysis",
    "streak": "mastery",
    "challenge-complete": "mastery",
    "collaboration": "collaboration",
    "deep-research": "analysis",
    "export": "mastery",
    "feedback": "collaboration",
  };
  return mapping[source] ?? "mastery";
}
