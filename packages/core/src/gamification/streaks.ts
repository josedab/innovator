/**
 * @module gamification/streaks
 *
 * Daily streak tracking for innovation activity.
 */

import { z } from "zod";

export const StreakRecordSchema = z.object({
  userId: z.string().max(200),
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  lastActivityDate: z.string().max(10),
  streakStartDate: z.string().max(10),
  totalActiveDays: z.number().int().min(0),
});
export type StreakRecord = z.infer<typeof StreakRecordSchema>;

export const StreakMilestoneSchema = z.object({
  days: z.number().int().min(1),
  name: z.string().max(200),
  icon: z.string().max(10),
  bonusPoints: z.number().int().min(0),
});
export type StreakMilestone = z.infer<typeof StreakMilestoneSchema>;

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3, name: "Warm-Up Spark", icon: "🔥", bonusPoints: 10 },
  { days: 7, name: "Week Warrior", icon: "🗓️", bonusPoints: 25 },
  { days: 14, name: "Momentum Builder", icon: "🚀", bonusPoints: 50 },
  { days: 30, name: "Monthly Maven", icon: "💪", bonusPoints: 100 },
  { days: 60, name: "Relentless Creator", icon: "⚙️", bonusPoints: 150 },
  { days: 100, name: "Century Spark", icon: "💯", bonusPoints: 250 },
  { days: 365, name: "Annual Legend", icon: "👑", bonusPoints: 1000 },
].map((milestone) => StreakMilestoneSchema.parse(milestone));

const streakStore = new Map<string, StreakRecord>();

function normalizeDate(date?: string | Date): string {
  if (!date) return new Date().toISOString().slice(0, 10);
  if (typeof date === "string") return new Date(date).toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function daysBetween(previousDate: string, nextDate: string): number {
  const previous = new Date(`${previousDate}T00:00:00.000Z`).getTime();
  const next = new Date(`${nextDate}T00:00:00.000Z`).getTime();
  return Math.round((next - previous) / 86_400_000);
}

export function recordActivity(userId: string, date?: string | Date): StreakRecord {
  const activityDate = normalizeDate(date);
  const existing = streakStore.get(userId);

  if (!existing) {
    const created = StreakRecordSchema.parse({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: activityDate,
      streakStartDate: activityDate,
      totalActiveDays: 1,
    });
    streakStore.set(userId, created);
    return { ...created };
  }

  const gap = daysBetween(existing.lastActivityDate, activityDate);
  if (gap <= 0) {
    return { ...existing };
  }

  const next: StreakRecord = {
    ...existing,
    currentStreak: gap === 1 ? existing.currentStreak + 1 : 1,
    longestStreak: gap === 1 ? Math.max(existing.longestStreak, existing.currentStreak + 1) : existing.longestStreak,
    lastActivityDate: activityDate,
    streakStartDate: gap === 1 ? existing.streakStartDate : activityDate,
    totalActiveDays: existing.totalActiveDays + 1,
  };

  if (next.currentStreak > next.longestStreak) {
    next.longestStreak = next.currentStreak;
  }

  const validated = StreakRecordSchema.parse(next);
  streakStore.set(userId, validated);
  return { ...validated };
}

export function getStreak(userId: string): StreakRecord | undefined {
  const streak = streakStore.get(userId);
  return streak ? { ...streak } : undefined;
}

export function checkMilestone(streak: StreakRecord): StreakMilestone | undefined {
  return STREAK_MILESTONES.find((milestone) => milestone.days === streak.currentStreak);
}

export function getStreakLeaderboard(
  limit: number = 20
): Array<StreakRecord & { rank: number }> {
  return Array.from(streakStore.values())
    .sort(
      (a, b) =>
        b.currentStreak - a.currentStreak ||
        b.longestStreak - a.longestStreak ||
        b.totalActiveDays - a.totalActiveDays ||
        a.userId.localeCompare(b.userId)
    )
    .slice(0, limit)
    .map((streak, index) => ({ ...streak, rank: index + 1 }));
}

export function clearStreakData(): void {
  streakStore.clear();
}
