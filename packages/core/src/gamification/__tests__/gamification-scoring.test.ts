import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDailyChallengeData,
  completeDailyChallenge,
  getDailyChallenge,
  getUserDailyChallengeHistory,
} from "../daily-challenges.js";
import {
  STREAK_MILESTONES,
  checkMilestone,
  clearStreakData,
  getStreak,
  getStreakLeaderboard,
  recordActivity,
} from "../streaks.js";
import {
  computeVelocityScore,
  getMonthlyVelocity,
  getVelocityLeaderboard,
  getWeeklyVelocity,
  velocityToMarkdown,
  type VelocityActivity,
} from "../velocity.js";
import { awardAchievement, clearGamification, getLeaderboard } from "../index.js";

describe("gamification scoring", () => {
  beforeEach(() => {
    clearGamification();
    clearStreakData();
    clearDailyChallengeData();
  });

  describe("streak tracking", () => {
    it("records consecutive activity and recognizes milestones", () => {
      recordActivity("user-1", "2025-01-01");
      recordActivity("user-1", "2025-01-02");
      const streak = recordActivity("user-1", "2025-01-03");

      expect(streak.currentStreak).toBe(3);
      expect(streak.longestStreak).toBe(3);
      expect(checkMilestone(streak)).toMatchObject({ days: 3, name: STREAK_MILESTONES[0].name });
    });

    it("resets broken streaks and ranks the streak leaderboard", () => {
      recordActivity("user-1", "2025-01-01");
      recordActivity("user-1", "2025-01-02");
      recordActivity("user-2", "2025-01-01");
      recordActivity("user-2", "2025-01-02");
      recordActivity("user-2", "2025-01-03");
      const reset = recordActivity("user-1", "2025-01-05");
      const leaderboard = getStreakLeaderboard();

      expect(reset.currentStreak).toBe(1);
      expect(reset.longestStreak).toBe(2);
      expect(leaderboard[0].userId).toBe("user-2");
      expect(leaderboard[0].rank).toBe(1);
      expect(getStreak("user-1")?.lastActivityDate).toBe("2025-01-05");
    });

    it("feeds streak data into the main leaderboard", () => {
      awardAchievement("first-investigation", "user-1");
      recordActivity("user-1", "2025-01-01");
      recordActivity("user-1", "2025-01-02");
      const leaderboard = getLeaderboard();

      expect(leaderboard[0].currentStreak).toBe(2);
    });
  });

  describe("daily challenges", () => {
    it("returns a deterministic challenge for a given date", () => {
      const first = getDailyChallenge("2025-02-14");
      const second = getDailyChallenge("2025-02-14");
      const nextDay = getDailyChallenge("2025-02-15");

      expect(first).toEqual(second);
      expect(first.id).toContain("2025-02-14");
      expect(nextDay.id).not.toBe(first.id);
    });

    it("tracks completions without duplicates", () => {
      const challenge = getDailyChallenge("2025-02-14");
      const completion = completeDailyChallenge("user-1", challenge.id);
      const duplicate = completeDailyChallenge("user-1", challenge.id);
      const history = getUserDailyChallengeHistory("user-1");

      expect(completion?.pointsEarned).toBe(challenge.points);
      expect(duplicate).toEqual(completion);
      expect(history).toHaveLength(1);
      expect(history[0].challengeId).toBe(challenge.id);
    });
  });

  describe("velocity metrics", () => {
    const now = Date.now();
    const activities: VelocityActivity[] = [
      {
        userId: "user-1",
        timestamp: new Date(now - 2 * 86_400_000).toISOString(),
        ideasGenerated: 6,
        sessionsCompleted: 2,
        avgIdeaQuality: 8.5,
        anglesExplored: 3,
      },
      {
        userId: "user-1",
        timestamp: new Date(now - 5 * 86_400_000).toISOString(),
        ideasGenerated: 4,
        sessionsCompleted: 1,
        avgIdeaQuality: 7.5,
        anglesExplored: 2,
      },
      {
        userId: "user-2",
        timestamp: new Date(now - 3 * 86_400_000).toISOString(),
        ideasGenerated: 8,
        sessionsCompleted: 3,
        avgIdeaQuality: 8,
        anglesExplored: 4,
      },
      {
        userId: "user-2",
        timestamp: new Date(now - 20 * 86_400_000).toISOString(),
        ideasGenerated: 5,
        sessionsCompleted: 2,
        avgIdeaQuality: 9,
        anglesExplored: 3,
      },
    ];

    it("computes bounded velocity scores", () => {
      const score = computeVelocityScore({ ideas: 12, sessions: 4, quality: 8.5, angles: 6 });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("builds weekly and monthly velocity metrics", () => {
      const weekly = getWeeklyVelocity("user-1", activities);
      const monthly = getMonthlyVelocity("user-2", activities);

      expect(weekly.ideasGenerated).toBe(10);
      expect(weekly.sessionsCompleted).toBe(3);
      expect(weekly.avgIdeaQuality).toBeGreaterThan(7);
      expect(monthly.ideasGenerated).toBe(13);
      expect(monthly.anglesExplored).toBe(7);
    });

    it("ranks the velocity leaderboard and renders markdown", () => {
      const leaderboard = getVelocityLeaderboard(activities, "weekly", 2);
      const markdown = velocityToMarkdown(leaderboard[0]);

      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].velocityScore).toBeGreaterThanOrEqual(leaderboard[1].velocityScore);
      expect(markdown).toContain("# ⚡ Innovation Velocity");
      expect(markdown).toContain("Velocity score");
    });
  });
});
