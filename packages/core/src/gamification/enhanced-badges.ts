import { randomUUID } from "node:crypto";
import { z } from "zod";

export const BadgeDefinitionSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500),
  icon: z.string().max(10),
  category: z.enum([
    "exploration",
    "quality",
    "consistency",
    "collaboration",
    "mastery",
    "speed",
    "creativity",
  ]),
  condition: z.string().max(500),
  threshold: z.number().min(1),
  points: z.number().min(0).max(1000),
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
});
export type BadgeDefinition = z.infer<typeof BadgeDefinitionSchema>;

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "first-spark", name: "First Spark", description: "Run your first investigation", icon: "⚡", category: "exploration", condition: "Complete 1 investigation", threshold: 1, points: 10, rarity: "common" },
  { id: "explorer-10", name: "Explorer", description: "Run 10 investigations", icon: "🔍", category: "exploration", condition: "Complete 10 investigations", threshold: 10, points: 50, rarity: "uncommon" },
  { id: "pathfinder", name: "Pathfinder", description: "Use 5 different angles", icon: "🧭", category: "exploration", condition: "Use 5 unique angles", threshold: 5, points: 30, rarity: "uncommon" },
  { id: "angle-master", name: "Angle Master", description: "Use all 8 built-in angles", icon: "🎯", category: "mastery", condition: "Use all 8 angles", threshold: 8, points: 100, rarity: "rare" },
  { id: "idea-machine", name: "Idea Machine", description: "Generate 100 ideas total", icon: "💡", category: "creativity", condition: "Generate 100 ideas", threshold: 100, points: 75, rarity: "rare" },
  { id: "quality-critic", name: "Quality Critic", description: "Score 10 ideas", icon: "⭐", category: "quality", condition: "Score 10 ideas", threshold: 10, points: 40, rarity: "uncommon" },
  { id: "streak-3", name: "On Fire", description: "3-day innovation streak", icon: "🔥", category: "consistency", condition: "3-day streak", threshold: 3, points: 30, rarity: "uncommon" },
  { id: "streak-7", name: "Unstoppable", description: "7-day innovation streak", icon: "🌟", category: "consistency", condition: "7-day streak", threshold: 7, points: 75, rarity: "rare" },
  { id: "streak-30", name: "Legendary Streak", description: "30-day innovation streak", icon: "👑", category: "consistency", condition: "30-day streak", threshold: 30, points: 200, rarity: "legendary" },
  { id: "team-player", name: "Team Player", description: "Join 5 collaborative sessions", icon: "🤝", category: "collaboration", condition: "Join 5 sessions", threshold: 5, points: 40, rarity: "uncommon" },
  { id: "influencer", name: "Influencer", description: "Get 20 votes on your ideas", icon: "📣", category: "collaboration", condition: "Receive 20 votes", threshold: 20, points: 60, rarity: "rare" },
  { id: "speed-demon", name: "Speed Demon", description: "Complete investigation in under 30s", icon: "⏱️", category: "speed", condition: "Fast investigation", threshold: 1, points: 25, rarity: "uncommon" },
  { id: "deep-diver", name: "Deep Diver", description: "Refine an idea 5 times", icon: "🤿", category: "quality", condition: "5 refinements on one idea", threshold: 5, points: 50, rarity: "rare" },
  { id: "cross-pollinator", name: "Cross-Pollinator", description: "Use cross-domain angle 10 times", icon: "🐝", category: "creativity", condition: "10 cross-domain runs", threshold: 10, points: 60, rarity: "rare" },
  { id: "architect", name: "Architect", description: "Generate 5 PRDs", icon: "📐", category: "mastery", condition: "Generate 5 PRDs", threshold: 5, points: 80, rarity: "rare" },
  { id: "storyteller", name: "Storyteller", description: "Create 3 pitch decks", icon: "📖", category: "creativity", condition: "Create 3 pitch decks", threshold: 3, points: 60, rarity: "rare" },
  { id: "data-driven", name: "Data Driven", description: "Track 10 outcomes", icon: "📊", category: "quality", condition: "Track 10 outcomes", threshold: 10, points: 50, rarity: "uncommon" },
  { id: "mentor", name: "Mentor", description: "Complete 3 coaching sessions", icon: "🧙", category: "mastery", condition: "3 coaching sessions", threshold: 3, points: 60, rarity: "rare" },
  { id: "innovator-100", name: "Centurion", description: "Complete 100 sessions", icon: "🏆", category: "mastery", condition: "100 sessions", threshold: 100, points: 300, rarity: "epic" },
  { id: "trailblazer", name: "Trailblazer", description: "Create a custom angle pack", icon: "🚀", category: "creativity", condition: "Publish 1 angle pack", threshold: 1, points: 40, rarity: "uncommon" },
].map((badge) => BadgeDefinitionSchema.parse(badge));

export function getBadgeDefinitions(): BadgeDefinition[] {
  return [...BADGE_DEFINITIONS];
}

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((badge) => badge.id === id);
}

export function checkBadgeUnlock(badgeId: string, currentValue: number): boolean {
  const badge = getBadgeById(badgeId);
  return badge ? currentValue >= badge.threshold : false;
}

export function getUnlockedBadges(progress: Record<string, number>): BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter((badge) => (progress[badge.id] ?? 0) >= badge.threshold);
}

// Daily challenge generation
export function generateDailyChallenge(userId: string): {
  id: string;
  title: string;
  description: string;
  target: number;
  expiresAt: string;
} {
  const challenges = [
    { title: "Speed Round", description: "Complete 3 investigations today", target: 3 },
    { title: "Angle Explorer", description: "Try 2 new angles today", target: 2 },
    { title: "Idea Sprint", description: "Generate 10 ideas today", target: 10 },
    { title: "Quality Focus", description: "Score 5 ideas today", target: 5 },
    { title: "Collaboration Day", description: "Vote on 3 ideas today", target: 3 },
  ];
  const challenge = challenges[Math.floor(Math.random() * challenges.length)];
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return {
    id: `daily-${userId}-${randomUUID()}`,
    ...challenge,
    expiresAt: tomorrow.toISOString(),
  };
}
