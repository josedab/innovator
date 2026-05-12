import { describe, it, expect, beforeEach } from "vitest";
import {
  addActivity,
  getActivityFeedItems,
  awardAchievement,
  getUserAchievements,
  createChallenge,
  startChallenge,
  completeChallenge,
  getLeaderboard,
  getGamificationConfig,
  updateGamificationConfig,
  clearGamification,
  ACHIEVEMENTS,
  type ActivityItem,
} from "../gamification/index.js";

describe("gamification - expanded", () => {
  beforeEach(() => {
    clearGamification();
  });

  // --- addActivity ---

  describe("addActivity", () => {
    it("adds item to feed", () => {
      const item: ActivityItem = {
        id: "act-1",
        userId: "user-1",
        userName: "user-1",
        action: "investigation-created",
        detail: "Created investigation",
        timestamp: Date.now(),
      };
      addActivity(item);
      const feed = getActivityFeedItems();
      expect(feed).toHaveLength(1);
      expect(feed[0].id).toBe("act-1");
    });

    it("enforces ActivityItemSchema validation (rejects invalid)", () => {
      expect(() =>
        addActivity({
          id: "act-bad",
          userId: "user-1",
          userName: "user-1",
          action: "invalid-action" as never,
          detail: "Bad action",
          timestamp: Date.now(),
        })
      ).toThrow();
    });
  });

  // --- getActivityFeedItems ---

  describe("getActivityFeedItems", () => {
    it("respects limit and returns newest first", () => {
      for (let i = 0; i < 5; i++) {
        addActivity({
          id: `act-${i}`,
          userId: "user-1",
          userName: "user-1",
          action: "investigation-created",
          detail: `Item ${i}`,
          timestamp: Date.now() + i,
        });
      }
      const feed = getActivityFeedItems(3);
      expect(feed).toHaveLength(3);
      // newest first
      expect(feed[0].id).toBe("act-4");
      expect(feed[2].id).toBe("act-2");
    });
  });

  // --- awardAchievement edge cases ---

  describe("awardAchievement", () => {
    it("returns undefined for unknown achievement ID", () => {
      expect(awardAchievement("nonexistent-id", "user-1")).toBeUndefined();
    });
  });

  // --- startChallenge edge cases ---

  describe("startChallenge", () => {
    it("returns undefined on already-started challenge", () => {
      const challenge = createChallenge("scamper-sprint", "user-1");
      startChallenge(challenge.id);
      // Starting again should fail (status is now 'active', not 'pending')
      const result = startChallenge(challenge.id);
      expect(result).toBeUndefined();
    });
  });

  // --- completeChallenge edge cases ---

  describe("completeChallenge", () => {
    it("works with score boundary 0", () => {
      const challenge = createChallenge("daily-prompt", "user-1");
      startChallenge(challenge.id);
      const result = completeChallenge(challenge.id, 0);
      expect(result).toBeDefined();
      expect(result!.score).toBe(0);
      expect(result!.status).toBe("completed");
    });

    it("works with score boundary 100", () => {
      const challenge = createChallenge("daily-prompt", "user-1");
      startChallenge(challenge.id);
      const result = completeChallenge(challenge.id, 100);
      expect(result).toBeDefined();
      expect(result!.score).toBe(100);
    });
  });

  // --- getLeaderboard edge cases ---

  describe("getLeaderboard", () => {
    it("with limit=0 returns empty", () => {
      awardAchievement("first-investigation", "user-1");
      const board = getLeaderboard(0);
      expect(board).toHaveLength(0);
    });
  });

  // --- updateGamificationConfig ---

  describe("updateGamificationConfig", () => {
    it("partial update preserves existing values", () => {
      updateGamificationConfig({ enabled: true, notifySlack: true });
      const config1 = getGamificationConfig();
      expect(config1.enabled).toBe(true);
      expect(config1.notifySlack).toBe(true);
      expect(config1.showLeaderboard).toBe(true); // default preserved

      updateGamificationConfig({ showLeaderboard: false });
      const config2 = getGamificationConfig();
      expect(config2.enabled).toBe(true); // preserved from previous update
      expect(config2.showLeaderboard).toBe(false);
    });
  });

  // --- clearGamification ---

  describe("clearGamification", () => {
    it("resets all state including activity feed", () => {
      awardAchievement("first-investigation", "user-1");
      addActivity({
        id: "act-1",
        userId: "user-1",
        userName: "user-1",
        action: "investigation-created",
        detail: "Test",
        timestamp: Date.now(),
      });
      createChallenge("scamper-sprint", "user-1");
      updateGamificationConfig({ enabled: true });

      clearGamification();

      expect(getUserAchievements("user-1")).toHaveLength(0);
      expect(getActivityFeedItems()).toHaveLength(0);
      expect(getLeaderboard()).toHaveLength(0);
      expect(getGamificationConfig().enabled).toBe(false);
    });
  });
});
