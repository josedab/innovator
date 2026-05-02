import { describe, it, expect, beforeEach } from "vitest";
import {
  awardAchievement,
  getUserAchievements,
  getUserPoints,
  createChallenge,
  startChallenge,
  completeChallenge,
  getUserChallenges,
  getLeaderboard,
  getActivityFeedItems,
  getGamificationConfig,
  updateGamificationConfig,
  clearGamification,
  ACHIEVEMENTS,
} from "../gamification/index.js";

describe("gamification", () => {
  beforeEach(() => {
    clearGamification();
  });

  it("has 20+ built-in achievements", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
  });

  it("awards achievement to user", () => {
    const earned = awardAchievement("first-investigation", "user-1");
    expect(earned).toBeTruthy();
    expect(earned?.achievementId).toBe("first-investigation");
  });

  it("prevents duplicate achievement awards", () => {
    awardAchievement("first-investigation", "user-1");
    const duplicate = awardAchievement("first-investigation", "user-1");
    expect(duplicate).toBeUndefined();
  });

  it("returns undefined for unknown achievement", () => {
    expect(awardAchievement("nonexistent", "user-1")).toBeUndefined();
  });

  it("tracks user achievements and points", () => {
    awardAchievement("first-investigation", "user-1");
    awardAchievement("all-8-angles", "user-1");
    const achievements = getUserAchievements("user-1");
    expect(achievements).toHaveLength(2);
    const points = getUserPoints("user-1");
    expect(points).toBe(60); // 10 + 50
  });

  it("creates and manages challenges", () => {
    const challenge = createChallenge("scamper-sprint", "user-1");
    expect(challenge.title).toBe("15-Minute SCAMPER Sprint");
    expect(challenge.status).toBe("pending");

    const started = startChallenge(challenge.id);
    expect(started?.status).toBe("active");

    const completed = completeChallenge(challenge.id, 85);
    expect(completed?.status).toBe("completed");
    expect(completed?.score).toBe(85);
  });

  it("gets user challenges", () => {
    createChallenge("scamper-sprint", "user-1");
    createChallenge("daily-prompt", "user-1");
    createChallenge("scamper-sprint", "user-2");
    expect(getUserChallenges("user-1")).toHaveLength(2);
  });

  it("generates leaderboard", () => {
    awardAchievement("first-investigation", "user-1");
    awardAchievement("all-8-angles", "user-1");
    awardAchievement("first-investigation", "user-2");
    const board = getLeaderboard();
    expect(board).toHaveLength(2);
    expect(board[0].userId).toBe("user-1");
    expect(board[0].rank).toBe(1);
  });

  it("tracks activity feed", () => {
    awardAchievement("first-investigation", "user-1");
    const feed = getActivityFeedItems();
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].action).toBe("achievement-earned");
  });

  it("manages gamification config", () => {
    expect(getGamificationConfig().enabled).toBe(false);
    updateGamificationConfig({ enabled: true });
    expect(getGamificationConfig().enabled).toBe(true);
  });
});
