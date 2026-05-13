/**
 * @module coaching/skill-tree
 *
 * Skill tree system for tracking innovation competency development.
 * Defines ~20 skills across 5 categories with prerequisite chains,
 * ~15 achievements, XP/level progression, streaks, and leaderboards.
 */

// ---- Types ----

export type SkillCategory =
  | "investigation"
  | "generation"
  | "synthesis"
  | "debate"
  | "collaboration";

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  level: SkillLevel;
  xpRequired: number;
  prerequisites: string[];
  unlocked: boolean;
  progress: number;
}

export interface SkillAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  category: SkillCategory | "general";
}

export interface SkillTree {
  nodes: SkillNode[];
  userId: string;
  totalXP: number;
  level: SkillLevel;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

export interface SkillLeaderboardEntry {
  userId: string;
  totalXP: number;
  level: SkillLevel;
  skillsUnlocked: number;
  achievementCount: number;
  rank: number;
}

export interface SessionResultForSkills {
  anglesUsed: string[];
  ideaCount: number;
  avgQuality: number;
  duration: number;
  participantCount?: number;
  usedDebate?: boolean;
  usedSynthesis?: boolean;
}

// ---- Default Skill Tree Definition ----

const DEFAULT_SKILLS: Omit<SkillNode, "unlocked" | "progress">[] = [
  // Investigation
  {
    id: "subject-research",
    name: "Subject Research",
    description: "Master the art of thorough subject investigation before ideation",
    category: "investigation",
    level: "beginner",
    xpRequired: 0,
    prerequisites: [],
  },
  {
    id: "deep-dive",
    name: "Deep Dive",
    description: "Conduct in-depth research sessions exceeding 20 minutes",
    category: "investigation",
    level: "intermediate",
    xpRequired: 100,
    prerequisites: ["subject-research"],
  },
  {
    id: "cross-domain-discovery",
    name: "Cross-Domain Discovery",
    description: "Find insights by investigating across multiple knowledge domains",
    category: "investigation",
    level: "advanced",
    xpRequired: 300,
    prerequisites: ["deep-dive"],
  },
  {
    id: "trend-sensing",
    name: "Trend Sensing",
    description: "Identify and leverage emerging trends in your investigations",
    category: "investigation",
    level: "expert",
    xpRequired: 800,
    prerequisites: ["cross-domain-discovery"],
  },
  // Generation
  {
    id: "multi-angle-thinking",
    name: "Multi-Angle Thinking",
    description: "Use 3+ different innovation angles in a single session",
    category: "generation",
    level: "beginner",
    xpRequired: 0,
    prerequisites: [],
  },
  {
    id: "constraint-mastery",
    name: "Constraint Mastery",
    description: "Excel at generating ideas within tight constraints",
    category: "generation",
    level: "intermediate",
    xpRequired: 150,
    prerequisites: ["multi-angle-thinking"],
  },
  {
    id: "paradigm-shifting",
    name: "Paradigm Shifting",
    description: "Generate ideas that fundamentally reframe the problem",
    category: "generation",
    level: "advanced",
    xpRequired: 400,
    prerequisites: ["constraint-mastery"],
  },
  {
    id: "prolific-ideator",
    name: "Prolific Ideator",
    description: "Generate 10+ quality ideas in a single session",
    category: "generation",
    level: "expert",
    xpRequired: 900,
    prerequisites: ["paradigm-shifting"],
  },
  // Synthesis
  {
    id: "pattern-recognition",
    name: "Pattern Recognition",
    description: "Identify recurring themes and patterns across ideas",
    category: "synthesis",
    level: "beginner",
    xpRequired: 50,
    prerequisites: [],
  },
  {
    id: "conflict-resolution",
    name: "Conflict Resolution",
    description: "Resolve contradictions between competing ideas effectively",
    category: "synthesis",
    level: "intermediate",
    xpRequired: 200,
    prerequisites: ["pattern-recognition"],
  },
  {
    id: "insight-crystallization",
    name: "Insight Crystallization",
    description: "Distill complex idea clusters into clear, actionable insights",
    category: "synthesis",
    level: "advanced",
    xpRequired: 500,
    prerequisites: ["conflict-resolution"],
  },
  {
    id: "systems-thinking",
    name: "Systems Thinking",
    description: "See and synthesize interconnections across the full innovation landscape",
    category: "synthesis",
    level: "expert",
    xpRequired: 1000,
    prerequisites: ["insight-crystallization"],
  },
  // Debate
  {
    id: "devils-advocate",
    name: "Devil's Advocate",
    description: "Effectively challenge ideas to strengthen them",
    category: "debate",
    level: "beginner",
    xpRequired: 50,
    prerequisites: [],
  },
  {
    id: "perspective-switching",
    name: "Perspective Switching",
    description: "Argue convincingly from multiple stakeholder viewpoints",
    category: "debate",
    level: "intermediate",
    xpRequired: 200,
    prerequisites: ["devils-advocate"],
  },
  {
    id: "consensus-building",
    name: "Consensus Building",
    description: "Guide debate toward productive consensus without losing diversity",
    category: "debate",
    level: "advanced",
    xpRequired: 500,
    prerequisites: ["perspective-switching"],
  },
  {
    id: "strategic-framing",
    name: "Strategic Framing",
    description: "Reframe debates to unlock breakthrough perspectives",
    category: "debate",
    level: "expert",
    xpRequired: 1000,
    prerequisites: ["consensus-building"],
  },
  // Collaboration
  {
    id: "idea-amplification",
    name: "Idea Amplification",
    description: "Build upon and enhance others' ideas effectively",
    category: "collaboration",
    level: "beginner",
    xpRequired: 0,
    prerequisites: [],
  },
  {
    id: "constructive-critique",
    name: "Constructive Critique",
    description: "Provide feedback that improves ideas without discouraging creativity",
    category: "collaboration",
    level: "intermediate",
    xpRequired: 150,
    prerequisites: ["idea-amplification"],
  },
  {
    id: "team-synergy",
    name: "Team Synergy",
    description: "Facilitate team sessions that produce more than the sum of parts",
    category: "collaboration",
    level: "advanced",
    xpRequired: 400,
    prerequisites: ["constructive-critique"],
  },
  {
    id: "innovation-leadership",
    name: "Innovation Leadership",
    description: "Lead and inspire innovation across teams and organizations",
    category: "collaboration",
    level: "expert",
    xpRequired: 1000,
    prerequisites: ["team-synergy"],
  },
];

// ---- Default Achievements ----

const DEFAULT_ACHIEVEMENTS: Omit<SkillAchievement, "unlockedAt">[] = [
  {
    id: "first-innovation",
    name: "First Innovation",
    description: "Complete your very first innovation session",
    icon: "🎯",
    category: "general",
  },
  {
    id: "angle-explorer",
    name: "Angle Explorer",
    description: "Use all 8 innovation angles at least once",
    icon: "🌈",
    category: "general",
  },
  {
    id: "quality-champion",
    name: "Quality Champion",
    description: "Achieve an average session quality above 8",
    icon: "⭐",
    category: "general",
  },
  {
    id: "streak-master",
    name: "Streak Master",
    description: "Maintain a 7-day innovation streak",
    icon: "🔥",
    category: "general",
  },
  {
    id: "deep-researcher",
    name: "Deep Researcher",
    description: "Complete 10 sessions with 20+ minute investigations",
    icon: "🔬",
    category: "investigation",
  },
  {
    id: "prolific-thinker",
    name: "Prolific Thinker",
    description: "Generate 100 total ideas across all sessions",
    icon: "💡",
    category: "generation",
  },
  {
    id: "synthesis-sage",
    name: "Synthesis Sage",
    description: "Complete 10 sessions using synthesis features",
    icon: "🧩",
    category: "synthesis",
  },
  {
    id: "debate-champion",
    name: "Debate Champion",
    description: "Participate in 10 debate sessions",
    icon: "⚔️",
    category: "debate",
  },
  {
    id: "team-player",
    name: "Team Player",
    description: "Participate in 5 collaborative sessions",
    icon: "🤝",
    category: "collaboration",
  },
  {
    id: "cross-domain-master",
    name: "Cross-Domain Master",
    description: "Innovate across 5 different domains",
    icon: "🌍",
    category: "investigation",
  },
  {
    id: "consistency-king",
    name: "Consistency King",
    description: "Complete 30 sessions total",
    icon: "👑",
    category: "general",
  },
  {
    id: "speed-innovator",
    name: "Speed Innovator",
    description: "Generate 5+ ideas in under 10 minutes",
    icon: "⚡",
    category: "generation",
  },
  {
    id: "perfectionist",
    name: "Perfectionist",
    description: "Achieve a 9+ quality score in 5 sessions",
    icon: "💎",
    category: "general",
  },
  {
    id: "monthly-streak",
    name: "Monthly Streak",
    description: "Maintain a 30-day innovation streak",
    icon: "📅",
    category: "general",
  },
  {
    id: "skill-tree-pioneer",
    name: "Skill Tree Pioneer",
    description: "Unlock 10 skills in the skill tree",
    icon: "🌳",
    category: "general",
  },
];

// ---- In-Memory Store ----

const userTrees = new Map<string, SkillTree>();
const userAchievements = new Map<string, SkillAchievement[]>();
const userStreaks = new Map<string, StreakData>();
const userStats = new Map<
  string,
  {
    totalSessions: number;
    totalIdeas: number;
    totalDebates: number;
    totalCollabs: number;
    totalSyntheses: number;
    deepSessions: number;
    highQualitySessions: number;
    anglesUsed: Set<string>;
    domainsExplored: Set<string>;
  }
>();

// ---- Level Thresholds ----

const LEVEL_XP: Record<SkillLevel, number> = {
  beginner: 0,
  intermediate: 200,
  advanced: 800,
  expert: 2000,
};

// ---- SkillTreeManager ----

export class SkillTreeManager {
  /** Get the skill tree for a user, initializing if needed. */
  getSkillTree(userId: string): SkillTree {
    if (!userTrees.has(userId)) {
      const nodes: SkillNode[] = DEFAULT_SKILLS.map((s) => ({
        ...s,
        unlocked: s.xpRequired === 0 && s.prerequisites.length === 0,
        progress: 0,
      }));

      const tree: SkillTree = {
        nodes,
        userId,
        totalXP: 0,
        level: "beginner",
      };
      userTrees.set(userId, tree);
    }
    return userTrees.get(userId)!;
  }

  /** Check if any new skills were unlocked after a session. */
  checkUnlocks(userId: string, sessionResult: SessionResultForSkills): string[] {
    const tree = this.getSkillTree(userId);
    this.updateStats(userId, sessionResult);
    const newlyUnlocked: string[] = [];

    for (const node of tree.nodes) {
      if (node.unlocked) continue;

      const prereqsMet = node.prerequisites.every((pId) => {
        const prereq = tree.nodes.find((n) => n.id === pId);
        return prereq?.unlocked;
      });

      if (prereqsMet && tree.totalXP >= node.xpRequired) {
        node.unlocked = true;
        node.progress = 100;
        newlyUnlocked.push(node.id);
      }
    }

    // Update progress on locked nodes
    for (const node of tree.nodes) {
      if (!node.unlocked && node.xpRequired > 0) {
        node.progress = Math.min(100, Math.round((tree.totalXP / node.xpRequired) * 100));
      }
    }

    // Check for new achievements
    this.checkAchievements(userId, sessionResult);

    return newlyUnlocked;
  }

  /** Award XP and check for level-ups. */
  awardXP(
    userId: string,
    amount: number,
    _reason: string
  ): { newXP: number; leveledUp: boolean; newLevel: SkillLevel } {
    const tree = this.getSkillTree(userId);
    const oldLevel = tree.level;
    tree.totalXP += amount;

    if (tree.totalXP >= LEVEL_XP.expert) tree.level = "expert";
    else if (tree.totalXP >= LEVEL_XP.advanced) tree.level = "advanced";
    else if (tree.totalXP >= LEVEL_XP.intermediate) tree.level = "intermediate";
    else tree.level = "beginner";

    const leveledUp = tree.level !== oldLevel;
    return { newXP: tree.totalXP, leveledUp, newLevel: tree.level };
  }

  /** Get all earned achievements for a user. */
  getAchievements(userId: string): SkillAchievement[] {
    return userAchievements.get(userId) ?? [];
  }

  /** Get current streak data for a user. */
  getStreak(userId: string): StreakData {
    return (
      userStreaks.get(userId) ?? {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
      }
    );
  }

  /** Update streak after a session. */
  updateStreak(userId: string): StreakData {
    const streak = this.getStreak(userId);
    const today = new Date().toISOString().slice(0, 10);

    if (streak.lastActivityDate === today) {
      return streak;
    }

    if (streak.lastActivityDate) {
      const last = new Date(streak.lastActivityDate).getTime();
      const now = new Date(today).getTime();
      const daysDiff = (now - last) / 86400000;

      if (daysDiff <= 1.5) {
        streak.currentStreak++;
      } else {
        streak.currentStreak = 1;
      }
    } else {
      streak.currentStreak = 1;
    }

    streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
    streak.lastActivityDate = today;
    userStreaks.set(userId, streak);
    return streak;
  }

  /** Get leaderboard ranked by XP. */
  getLeaderboard(teamId?: string, limit: number = 20): SkillLeaderboardEntry[] {
    const allTrees = Array.from(userTrees.values());
    const entries: SkillLeaderboardEntry[] = allTrees.map((tree) => ({
      userId: tree.userId,
      totalXP: tree.totalXP,
      level: tree.level,
      skillsUnlocked: tree.nodes.filter((n) => n.unlocked).length,
      achievementCount: (userAchievements.get(tree.userId) ?? []).length,
      rank: 0,
    }));

    entries.sort((a, b) => b.totalXP - a.totalXP);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries.slice(0, limit);
  }

  // ---- Private ----

  private updateStats(userId: string, session: SessionResultForSkills): void {
    const stats = userStats.get(userId) ?? {
      totalSessions: 0,
      totalIdeas: 0,
      totalDebates: 0,
      totalCollabs: 0,
      totalSyntheses: 0,
      deepSessions: 0,
      highQualitySessions: 0,
      anglesUsed: new Set<string>(),
      domainsExplored: new Set<string>(),
    };

    stats.totalSessions++;
    stats.totalIdeas += session.ideaCount;
    if (session.duration >= 20) stats.deepSessions++;
    if (session.avgQuality >= 9) stats.highQualitySessions++;
    if (session.usedDebate) stats.totalDebates++;
    if (session.usedSynthesis) stats.totalSyntheses++;
    if (session.participantCount && session.participantCount > 1) stats.totalCollabs++;
    for (const a of session.anglesUsed) stats.anglesUsed.add(a);

    userStats.set(userId, stats);
  }

  private checkAchievements(userId: string, session: SessionResultForSkills): void {
    const earned = userAchievements.get(userId) ?? [];
    const earnedIds = new Set(earned.map((a) => a.id));
    const stats = userStats.get(userId);
    const streak = this.getStreak(userId);
    const tree = this.getSkillTree(userId);

    if (!stats) return;

    const now = new Date().toISOString();
    const checks: Array<{ id: string; condition: boolean }> = [
      { id: "first-innovation", condition: stats.totalSessions >= 1 },
      { id: "angle-explorer", condition: stats.anglesUsed.size >= 8 },
      { id: "quality-champion", condition: stats.totalSessions >= 3 && session.avgQuality >= 8 },
      { id: "streak-master", condition: streak.currentStreak >= 7 },
      { id: "deep-researcher", condition: stats.deepSessions >= 10 },
      { id: "prolific-thinker", condition: stats.totalIdeas >= 100 },
      { id: "synthesis-sage", condition: stats.totalSyntheses >= 10 },
      { id: "debate-champion", condition: stats.totalDebates >= 10 },
      { id: "team-player", condition: stats.totalCollabs >= 5 },
      { id: "cross-domain-master", condition: stats.domainsExplored.size >= 5 },
      { id: "consistency-king", condition: stats.totalSessions >= 30 },
      {
        id: "speed-innovator",
        condition: session.ideaCount >= 5 && session.duration < 10,
      },
      { id: "perfectionist", condition: stats.highQualitySessions >= 5 },
      { id: "monthly-streak", condition: streak.currentStreak >= 30 },
      {
        id: "skill-tree-pioneer",
        condition: tree.nodes.filter((n) => n.unlocked).length >= 10,
      },
    ];

    for (const check of checks) {
      if (check.condition && !earnedIds.has(check.id)) {
        const def = DEFAULT_ACHIEVEMENTS.find((a) => a.id === check.id);
        if (def) {
          earned.push({ ...def, unlockedAt: now });
        }
      }
    }

    userAchievements.set(userId, earned);
  }
}

// ---- Singleton ----

let instance: SkillTreeManager | undefined;

/** Get the singleton SkillTreeManager instance. */
export function getSkillTreeManager(): SkillTreeManager {
  if (!instance) {
    instance = new SkillTreeManager();
  }
  return instance;
}

/** Clear all skill tree data (for testing). */
export function clearSkillTreeData(): void {
  userTrees.clear();
  userAchievements.clear();
  userStreaks.clear();
  userStats.clear();
}

/** Get the default skill definitions (read-only). */
export function getDefaultSkills(): typeof DEFAULT_SKILLS {
  return DEFAULT_SKILLS;
}

/** Get the default achievement definitions (read-only). */
export function getDefaultAchievements(): typeof DEFAULT_ACHIEVEMENTS {
  return DEFAULT_ACHIEVEMENTS;
}
