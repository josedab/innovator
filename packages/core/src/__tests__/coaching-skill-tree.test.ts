import { describe, it, expect, beforeEach } from "vitest";
import {
  SkillTreeManager,
  getSkillTreeManager,
  clearSkillTreeData,
  getDefaultSkills,
  getDefaultAchievements,
  type SessionResultForSkills,
} from "../coaching/skill-tree.js";

describe("SkillTreeManager", () => {
  let manager: SkillTreeManager;

  beforeEach(() => {
    clearSkillTreeData();
    manager = new SkillTreeManager();
  });

  it("getSkillTree returns a full tree with all default skills", () => {
    const tree = manager.getSkillTree("user-1");
    expect(tree.userId).toBe("user-1");
    expect(tree.totalXP).toBe(0);
    expect(tree.level).toBe("beginner");
    expect(tree.nodes.length).toBe(getDefaultSkills().length);
  });

  it("getSkillTree initializes beginner skills as unlocked", () => {
    const tree = manager.getSkillTree("user-1");
    const unlocked = tree.nodes.filter((n) => n.unlocked);
    // Skills with xpRequired === 0 and no prerequisites start unlocked
    const expected = getDefaultSkills().filter(
      (s) => s.xpRequired === 0 && s.prerequisites.length === 0
    );
    expect(unlocked.length).toBe(expected.length);
  });

  it("getSkillTree returns the same tree on repeated calls", () => {
    const tree1 = manager.getSkillTree("user-1");
    const tree2 = manager.getSkillTree("user-1");
    expect(tree1).toBe(tree2);
  });

  it("checkUnlocks unlocks skills when XP and prerequisites are met", () => {
    manager.awardXP("user-1", 250, "test");
    const session: SessionResultForSkills = {
      anglesUsed: ["a"],
      ideaCount: 5,
      avgQuality: 7,
      duration: 15,
    };
    const unlocked = manager.checkUnlocks("user-1", session);
    // Should unlock intermediate skills whose prereqs (beginner skills) are already unlocked
    expect(unlocked.length).toBeGreaterThan(0);
    const tree = manager.getSkillTree("user-1");
    for (const id of unlocked) {
      const node = tree.nodes.find((n) => n.id === id);
      expect(node?.unlocked).toBe(true);
      expect(node?.progress).toBe(100);
    }
  });

  it("checkUnlocks updates progress on locked nodes", () => {
    manager.awardXP("user-1", 50, "test");
    const session: SessionResultForSkills = {
      anglesUsed: [],
      ideaCount: 1,
      avgQuality: 5,
      duration: 5,
    };
    manager.checkUnlocks("user-1", session);
    const tree = manager.getSkillTree("user-1");
    const lockedWithReq = tree.nodes.filter((n) => !n.unlocked && n.xpRequired > 0);
    for (const node of lockedWithReq) {
      expect(node.progress).toBe(Math.min(100, Math.round((50 / node.xpRequired) * 100)));
    }
  });

  it("awardXP increases XP and detects level-up to intermediate", () => {
    const result = manager.awardXP("user-1", 200, "session reward");
    expect(result.newXP).toBe(200);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe("intermediate");
  });

  it("awardXP accumulates across calls and levels to advanced then expert", () => {
    manager.awardXP("user-1", 400, "a");
    const r2 = manager.awardXP("user-1", 400, "b");
    expect(r2.newXP).toBe(800);
    expect(r2.newLevel).toBe("advanced");

    const r3 = manager.awardXP("user-1", 1200, "c");
    expect(r3.newXP).toBe(2000);
    expect(r3.newLevel).toBe("expert");
    expect(r3.leveledUp).toBe(true);
  });

  it("getAchievements returns empty array for new user", () => {
    expect(manager.getAchievements("user-1")).toEqual([]);
  });

  it("checkUnlocks awards first-innovation achievement after a session", () => {
    const session: SessionResultForSkills = {
      anglesUsed: ["angle1"],
      ideaCount: 3,
      avgQuality: 7,
      duration: 10,
    };
    manager.checkUnlocks("user-1", session);
    const achievements = manager.getAchievements("user-1");
    expect(achievements.some((a) => a.id === "first-innovation")).toBe(true);
  });

  it("getStreak returns default streak for new user", () => {
    const streak = manager.getStreak("user-1");
    expect(streak.currentStreak).toBe(0);
    expect(streak.longestStreak).toBe(0);
    expect(streak.lastActivityDate).toBeNull();
  });

  it("updateStreak increments streak and tracks longest", () => {
    const s1 = manager.updateStreak("user-1");
    expect(s1.currentStreak).toBe(1);
    expect(s1.longestStreak).toBe(1);
    expect(s1.lastActivityDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it("updateStreak does not double-count same day", () => {
    manager.updateStreak("user-1");
    const s2 = manager.updateStreak("user-1");
    expect(s2.currentStreak).toBe(1);
  });

  it("getLeaderboard ranks multiple users by XP", () => {
    manager.awardXP("alice", 500, "test");
    manager.awardXP("bob", 1000, "test");
    manager.awardXP("charlie", 200, "test");
    const board = manager.getLeaderboard();
    expect(board[0].userId).toBe("bob");
    expect(board[0].rank).toBe(1);
    expect(board[1].userId).toBe("alice");
    expect(board[2].userId).toBe("charlie");
    expect(board.length).toBe(3);
  });

  it("getSkillTreeManager returns a singleton", () => {
    clearSkillTreeData();
    const m1 = getSkillTreeManager();
    const m2 = getSkillTreeManager();
    expect(m1).toBe(m2);
  });

  it("getDefaultAchievements returns all achievement definitions", () => {
    const achievements = getDefaultAchievements();
    expect(achievements.length).toBeGreaterThanOrEqual(15);
    expect(achievements.every((a) => a.id && a.name && a.icon)).toBe(true);
  });
});
