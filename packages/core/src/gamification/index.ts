/**
 * @module gamification
 *
 * Innovation Gamification Engine — achievements, time-boxed challenges,
 * team leaderboards, and activity feeds. Opt-in and configurable per team.
 */

import { z } from "zod";

// ---- Schemas ----

/** Achievement definition. */
export const AchievementSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500),
  icon: z.string().max(10),
  category: z.enum(["exploration", "quality", "consistency", "collaboration", "mastery"]),
  condition: z.string().max(500).describe("Human-readable condition to earn this achievement"),
  points: z.number().min(0).max(1000),
});

/** A user's earned achievement with timestamp. */
export const EarnedAchievementSchema = z.object({
  achievementId: z.string().max(100),
  userId: z.string().max(200),
  earnedAt: z.number(),
});

/** Challenge types. */
export const ChallengeTypeSchema = z.enum([
  "scamper-sprint",
  "daily-prompt",
  "weekly-theme",
  "cross-domain",
  "quality-focus",
]);

/** A time-boxed challenge definition. */
export const ChallengeSchema = z.object({
  id: z.string().max(200),
  type: ChallengeTypeSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  durationMinutes: z.number().min(1).max(10080), // up to 1 week
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  userId: z.string().max(200),
  score: z.number().default(0),
  status: z.enum(["pending", "active", "completed", "expired"]).default("pending"),
});

/** Leaderboard entry. */
export const LeaderboardEntrySchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  totalPoints: z.number().default(0),
  achievementCount: z.number().default(0),
  challengesCompleted: z.number().default(0),
  currentStreak: z.number().default(0),
  rank: z.number().min(1),
});

/** Activity feed item. */
export const ActivityItemSchema = z.object({
  id: z.string().max(200),
  userId: z.string().max(200),
  userName: z.string().max(200),
  action: z.enum([
    "achievement-earned",
    "challenge-completed",
    "investigation-created",
    "idea-scored",
    "streak-milestone",
  ]),
  detail: z.string().max(500),
  timestamp: z.number(),
});

/** Gamification configuration for opt-in/opt-out. */
export const GamificationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  showLeaderboard: z.boolean().default(true),
  showAchievements: z.boolean().default(true),
  showActivityFeed: z.boolean().default(true),
  notifySlack: z.boolean().default(false),
  notifyDiscord: z.boolean().default(false),
  slackWebhookUrl: z.string().max(500).optional(),
  discordWebhookUrl: z.string().max(500).optional(),
});

// ---- Types ----

export type Achievement = z.infer<typeof AchievementSchema>;
export type EarnedAchievement = z.infer<typeof EarnedAchievementSchema>;
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type GamificationConfig = z.infer<typeof GamificationConfigSchema>;

// ---- Built-in Achievements ----

/** All 20+ built-in achievements. */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-investigation",
    name: "First Steps",
    description: "Complete your first investigation",
    icon: "🎯",
    category: "exploration",
    condition: "Complete 1 investigation",
    points: 10,
  },
  {
    id: "all-8-angles",
    name: "Full Spectrum",
    description: "Use all 8 innovation angles in a single session",
    icon: "🌈",
    category: "exploration",
    condition: "Use all 8 angles in one session",
    points: 50,
  },
  {
    id: "7-day-streak",
    name: "Week Warrior",
    description: "Investigate 7 days in a row",
    icon: "🔥",
    category: "consistency",
    condition: "7 consecutive days with investigations",
    points: 75,
  },
  {
    id: "30-day-streak",
    name: "Monthly Maven",
    description: "Investigate 30 days in a row",
    icon: "💪",
    category: "consistency",
    condition: "30 consecutive days with investigations",
    points: 200,
  },
  {
    id: "cross-domain-explorer",
    name: "Cross-Domain Explorer",
    description: "Investigate in 5 different domains",
    icon: "🌍",
    category: "exploration",
    condition: "Investigate across 5+ domains",
    points: 100,
  },
  {
    id: "quality-pioneer",
    name: "Quality Pioneer",
    description: "Get a 9+ score on any idea",
    icon: "⭐",
    category: "quality",
    condition: "Achieve idea score ≥ 9",
    points: 50,
  },
  {
    id: "idea-machine",
    name: "Idea Machine",
    description: "Generate 100 total ideas",
    icon: "💡",
    category: "mastery",
    condition: "Generate 100+ ideas total",
    points: 100,
  },
  {
    id: "deep-diver",
    name: "Deep Diver",
    description: "Complete a deep research investigation",
    icon: "🤿",
    category: "exploration",
    condition: "Complete a deep research session",
    points: 75,
  },
  {
    id: "collaborator",
    name: "Team Player",
    description: "Participate in a collaborative session",
    icon: "🤝",
    category: "collaboration",
    condition: "Join a collaborative session",
    points: 25,
  },
  {
    id: "feedback-giver",
    name: "Feedback Champion",
    description: "Rate 50 ideas",
    icon: "📝",
    category: "collaboration",
    condition: "Rate 50+ ideas",
    points: 50,
  },
  {
    id: "first-fork",
    name: "Remixer",
    description: "Fork your first investigation",
    icon: "🍴",
    category: "collaboration",
    condition: "Fork 1 investigation",
    points: 25,
  },
  {
    id: "trend-spotter",
    name: "Trend Spotter",
    description: "Use trend-collision angle 10 times",
    icon: "📈",
    category: "mastery",
    condition: "Use trend-collision 10+ times",
    points: 50,
  },
  {
    id: "constraint-master",
    name: "Constraint Master",
    description: "Use constraints angle 10 times",
    icon: "🔒",
    category: "mastery",
    condition: "Use constraints 10+ times",
    points: 50,
  },
  {
    id: "inverter",
    name: "Contrarian Thinker",
    description: "Use inversion angle 10 times",
    icon: "🔄",
    category: "mastery",
    condition: "Use inversion 10+ times",
    points: 50,
  },
  {
    id: "speed-innovator",
    name: "Speed Innovator",
    description: "Complete a 15-minute SCAMPER sprint",
    icon: "⚡",
    category: "mastery",
    condition: "Complete a SCAMPER sprint",
    points: 30,
  },
  {
    id: "gallery-publisher",
    name: "Gallery Publisher",
    description: "Publish to the community gallery",
    icon: "🖼️",
    category: "collaboration",
    condition: "Publish 1 gallery listing",
    points: 25,
  },
  {
    id: "upvote-magnet",
    name: "Upvote Magnet",
    description: "Receive 10 upvotes on a gallery listing",
    icon: "👍",
    category: "collaboration",
    condition: "Get 10+ upvotes on a listing",
    points: 75,
  },
  {
    id: "multi-model",
    name: "Model Explorer",
    description: "Use 3 different LLM models",
    icon: "🤖",
    category: "exploration",
    condition: "Use 3+ different models",
    points: 30,
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Start an investigation after midnight",
    icon: "🦉",
    category: "exploration",
    condition: "Investigate after midnight local time",
    points: 15,
  },
  {
    id: "weekend-warrior",
    name: "Weekend Warrior",
    description: "Investigate on a weekend",
    icon: "📅",
    category: "consistency",
    condition: "Investigate on Saturday or Sunday",
    points: 15,
  },
  {
    id: "portfolio-builder",
    name: "Portfolio Builder",
    description: "Track 10 ideas in your portfolio",
    icon: "📊",
    category: "mastery",
    condition: "Track 10+ ideas in portfolio",
    points: 50,
  },
  {
    id: "knowledge-builder",
    name: "Knowledge Builder",
    description: "Ingest 5 documents into knowledge base",
    icon: "📚",
    category: "mastery",
    condition: "Ingest 5+ knowledge documents",
    points: 50,
  },
];

// ---- In-Memory Stores ----

const earnedAchievements: EarnedAchievement[] = [];
const challenges: Challenge[] = [];
const activityFeed: ActivityItem[] = [];
let gamificationConfig: GamificationConfig = {
  enabled: false,
  showLeaderboard: true,
  showAchievements: true,
  showActivityFeed: true,
  notifySlack: false,
  notifyDiscord: false,
};

// ---- Achievement Functions ----

/**
 * Check and award an achievement to a user if not already earned.
 *
 * @param achievementId - Achievement to award
 * @param userId - User to award it to
 * @returns The earned achievement or undefined if already earned or not found
 */
export function awardAchievement(
  achievementId: string,
  userId: string
): EarnedAchievement | undefined {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!achievement) return undefined;

  const alreadyEarned = earnedAchievements.some(
    (ea) => ea.achievementId === achievementId && ea.userId === userId
  );
  if (alreadyEarned) return undefined;

  const earned: EarnedAchievement = {
    achievementId,
    userId,
    earnedAt: Date.now(),
  };
  earnedAchievements.push(earned);

  addActivity({
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    userName: userId,
    action: "achievement-earned",
    detail: `Earned "${achievement.name}" (${achievement.icon})`,
    timestamp: Date.now(),
  });

  return earned;
}

/**
 * Get all achievements earned by a user.
 *
 * @param userId - The user ID
 * @returns Array of earned achievements with full details
 */
export function getUserAchievements(
  userId: string
): (EarnedAchievement & { achievement: Achievement })[] {
  return earnedAchievements
    .filter((ea) => ea.userId === userId)
    .map((ea) => ({
      ...ea,
      achievement: ACHIEVEMENTS.find((a) => a.id === ea.achievementId)!,
    }))
    .filter((ea) => ea.achievement);
}

/**
 * Get a user's total gamification points.
 *
 * @param userId - The user ID
 * @returns Total points earned
 */
export function getUserPoints(userId: string): number {
  return getUserAchievements(userId).reduce((sum, ea) => sum + ea.achievement.points, 0);
}

// ---- Challenge Functions ----

/**
 * Create a new challenge for a user.
 *
 * @param type - Challenge type
 * @param userId - The user
 * @returns The created challenge
 */
export function createChallenge(type: ChallengeType, userId: string): Challenge {
  const configs: Record<ChallengeType, { title: string; description: string; duration: number }> = {
    "scamper-sprint": {
      title: "15-Minute SCAMPER Sprint",
      description: "Generate as many SCAMPER ideas as possible in 15 minutes",
      duration: 15,
    },
    "daily-prompt": {
      title: "Daily Innovation Prompt",
      description: "Complete today's innovation prompt challenge",
      duration: 1440,
    },
    "weekly-theme": {
      title: "Weekly Theme Challenge",
      description: "Explore this week's themed innovation topic deeply",
      duration: 10080,
    },
    "cross-domain": {
      title: "Cross-Domain Challenge",
      description: "Apply ideas from a random domain to your subject",
      duration: 30,
    },
    "quality-focus": {
      title: "Quality Focus Challenge",
      description: "Generate fewer but higher-quality ideas (target 8+ score)",
      duration: 60,
    },
  };

  const config = configs[type];
  const challenge: Challenge = {
    id: `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: config.title,
    description: config.description,
    durationMinutes: config.duration,
    userId,
    score: 0,
    status: "pending",
  };

  challenges.push(challenge);
  return challenge;
}

/**
 * Start a challenge.
 *
 * @param challengeId - The challenge to start
 * @returns The updated challenge or undefined if not found
 */
export function startChallenge(challengeId: string): Challenge | undefined {
  const challenge = challenges.find((c) => c.id === challengeId);
  if (!challenge || challenge.status !== "pending") return undefined;

  challenge.status = "active";
  challenge.startedAt = Date.now();
  return { ...challenge };
}

/**
 * Complete a challenge with a score.
 *
 * @param challengeId - The challenge to complete
 * @param score - The earned score
 * @returns The updated challenge or undefined if not found
 */
export function completeChallenge(challengeId: string, score: number): Challenge | undefined {
  const challenge = challenges.find((c) => c.id === challengeId);
  if (!challenge || challenge.status !== "active") return undefined;

  challenge.status = "completed";
  challenge.completedAt = Date.now();
  challenge.score = score;

  addActivity({
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: challenge.userId,
    userName: challenge.userId,
    action: "challenge-completed",
    detail: `Completed "${challenge.title}" with score ${score}`,
    timestamp: Date.now(),
  });

  return { ...challenge };
}

/**
 * Get challenges for a user.
 *
 * @param userId - The user ID
 * @returns Array of challenges
 */
export function getUserChallenges(userId: string): Challenge[] {
  return challenges.filter((c) => c.userId === userId).map((c) => ({ ...c }));
}

// ---- Leaderboard ----

/**
 * Generate a leaderboard from all user data.
 *
 * @param limit - Maximum entries to return (default: 20)
 * @returns Sorted leaderboard entries
 */
export function getLeaderboard(limit: number = 20): LeaderboardEntry[] {
  const userIds = [
    ...new Set([...earnedAchievements.map((ea) => ea.userId), ...challenges.map((c) => c.userId)]),
  ];

  const entries: LeaderboardEntry[] = userIds.map((userId) => ({
    userId,
    displayName: userId,
    totalPoints: getUserPoints(userId),
    achievementCount: earnedAchievements.filter((ea) => ea.userId === userId).length,
    challengesCompleted: challenges.filter((c) => c.userId === userId && c.status === "completed")
      .length,
    currentStreak: 0, // streak requires date tracking beyond scope
    rank: 0,
  }));

  entries.sort((a, b) => b.totalPoints - a.totalPoints);
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  return entries.slice(0, limit);
}

// ---- Activity Feed ----

/**
 * Add an item to the activity feed.
 *
 * @param item - The activity item
 */
export function addActivity(item: ActivityItem): void {
  activityFeed.push(ActivityItemSchema.parse(item));
  // Keep feed bounded
  if (activityFeed.length > 1000) {
    activityFeed.splice(0, activityFeed.length - 1000);
  }
}

/**
 * Get the activity feed.
 *
 * @param limit - Maximum items to return (default: 50)
 * @returns Recent activity items, newest first
 */
export function getActivityFeedItems(limit: number = 50): ActivityItem[] {
  return activityFeed.slice(-limit).reverse();
}

// ---- Configuration ----

/**
 * Get the current gamification configuration.
 */
export function getGamificationConfig(): GamificationConfig {
  return { ...gamificationConfig };
}

/**
 * Update gamification configuration.
 *
 * @param config - Partial config to merge
 * @returns Updated config
 */
export function updateGamificationConfig(config: Partial<GamificationConfig>): GamificationConfig {
  gamificationConfig = { ...gamificationConfig, ...config };
  return { ...gamificationConfig };
}

/**
 * Clear all gamification data (for testing).
 */
export function clearGamification(): void {
  earnedAchievements.length = 0;
  challenges.length = 0;
  activityFeed.length = 0;
  gamificationConfig = {
    enabled: false,
    showLeaderboard: true,
    showAchievements: true,
    showActivityFeed: true,
    notifySlack: false,
    notifyDiscord: false,
  };
}
