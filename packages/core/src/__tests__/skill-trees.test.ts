import { describe, it, expect, beforeEach } from "vitest";
import {
  awardXP,
  getUserProgress,
  getUserLevel,
  hasSkill,
  isFeatureUnlocked,
  getSkillTreeWithProgress,
  unlockSkill,
  getXPHistory,
  getXPLeaderboard,
  clearSkillTrees,
  SKILL_TREE,
  LEVELS,
  XP_REWARDS,
} from "../gamification/skill-trees.js";

describe("skill-trees", () => {
  beforeEach(() => {
    clearSkillTrees();
  });

  describe("awardXP", () => {
    it("awards XP and returns progress", () => {
      const { event, progress } = awardXP("user1", "investigation");
      expect(event.amount).toBe(XP_REWARDS.investigation);
      expect(progress.totalXP).toBe(XP_REWARDS.investigation);
      expect(progress.level).toBeGreaterThanOrEqual(1);
    });

    it("detects level ups", () => {
      // Award enough XP to level up
      let leveledUp = false;
      for (let i = 0; i < 20; i++) {
        const result = awardXP("user1", "synthesis");
        if (result.leveledUp) {
          leveledUp = true;
          expect(result.newLevel).toBeDefined();
          break;
        }
      }
      // With 20 * 30 = 600 XP, should have leveled up from level 1
      expect(leveledUp).toBe(true);
    });

    it("auto-unlocks skills when XP threshold is met", () => {
      // first-investigation requires 0 XP and no prerequisites
      awardXP("user1", "investigation");
      expect(hasSkill("user1", "first-investigation")).toBe(true);
    });

    it("tracks XP by category", () => {
      awardXP("user1", "investigation");
      awardXP("user1", "collaboration");
      const progress = getUserProgress("user1");
      expect(progress.xpByCategory["exploration"]).toBeGreaterThan(0);
      expect(progress.xpByCategory["collaboration"]).toBeGreaterThan(0);
    });
  });

  describe("getUserProgress", () => {
    it("returns default progress for new user", () => {
      const progress = getUserProgress("new-user");
      expect(progress.totalXP).toBe(0);
      expect(progress.level).toBe(1);
      expect(progress.unlockedSkills).toEqual([]);
    });
  });

  describe("getUserLevel", () => {
    it("returns level definition", () => {
      const level = getUserLevel("user1");
      expect(level.level).toBe(1);
      expect(level.title).toBe("Novice Innovator");
    });
  });

  describe("hasSkill / isFeatureUnlocked", () => {
    it("checks skill unlocks", () => {
      expect(hasSkill("user1", "first-investigation")).toBe(false);
      unlockSkill("user1", "first-investigation");
      expect(hasSkill("user1", "first-investigation")).toBe(true);
    });

    it("checks feature unlocks", () => {
      expect(isFeatureUnlocked("user1", "custom-angles")).toBe(false);
      unlockSkill("user1", "all-angles");
      expect(isFeatureUnlocked("user1", "custom-angles")).toBe(true);
    });
  });

  describe("getSkillTreeWithProgress", () => {
    it("overlays progress on skill tree", () => {
      unlockSkill("user1", "first-investigation");
      const tree = getSkillTreeWithProgress("user1");
      expect(tree.length).toBe(SKILL_TREE.length);
      const firstInvestigation = tree.find((s) => s.id === "first-investigation");
      expect(firstInvestigation?.unlocked).toBe(true);
    });
  });

  describe("getXPHistory", () => {
    it("tracks XP events", () => {
      awardXP("user1", "investigation");
      awardXP("user1", "synthesis");
      const history = getXPHistory("user1");
      expect(history).toHaveLength(2);
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) awardXP("user1", "export");
      expect(getXPHistory("user1", 3)).toHaveLength(3);
    });
  });

  describe("getXPLeaderboard", () => {
    it("returns users sorted by XP", () => {
      for (let i = 0; i < 5; i++) awardXP("user1", "synthesis");
      for (let i = 0; i < 2; i++) awardXP("user2", "investigation");
      const board = getXPLeaderboard();
      expect(board[0].userId).toBe("user1");
      expect(board[0].totalXP).toBeGreaterThan(board[1].totalXP);
    });
  });

  describe("constants", () => {
    it("has valid skill tree", () => {
      expect(SKILL_TREE.length).toBeGreaterThan(10);
      for (const skill of SKILL_TREE) {
        expect(skill.id).toBeTruthy();
        expect(skill.tier).toBeGreaterThanOrEqual(1);
        expect(skill.tier).toBeLessThanOrEqual(5);
      }
    });

    it("has valid level definitions", () => {
      expect(LEVELS.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < LEVELS.length; i++) {
        expect(LEVELS[i].xpRequired).toBeGreaterThan(LEVELS[i - 1].xpRequired);
      }
    });
  });
});
