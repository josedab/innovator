import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BADGE_DEFINITIONS,
  checkBadgeUnlock,
  generateDailyChallenge,
  getBadgeById,
  getBadgeDefinitions,
  getUnlockedBadges,
} from "../gamification/enhanced-badges.js";

describe("gamification/enhanced-badges", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("defines 20 validated badges across categories", () => {
    const badges = getBadgeDefinitions();
    expect(badges).toHaveLength(20);
    expect(new Set(badges.map((badge) => badge.id)).size).toBe(20);
    expect(badges.map((badge) => badge.category)).toContain("creativity");
    expect(BADGE_DEFINITIONS.every((badge) => badge.points >= 0)).toBe(true);
  });

  it("retrieves badges by id", () => {
    expect(getBadgeById("first-spark")).toEqual(
      expect.objectContaining({ name: "First Spark", threshold: 1 })
    );
    expect(getBadgeById("missing")).toBeUndefined();
  });

  it("checks unlock thresholds", () => {
    expect(checkBadgeUnlock("explorer-10", 9)).toBe(false);
    expect(checkBadgeUnlock("explorer-10", 10)).toBe(true);
    expect(checkBadgeUnlock("missing", 100)).toBe(false);
  });

  it("returns all unlocked badges from progress", () => {
    const unlocked = getUnlockedBadges({
      "first-spark": 1,
      "explorer-10": 12,
      "quality-critic": 10,
      "streak-30": 7,
    });

    expect(unlocked.map((badge) => badge.id)).toEqual([
      "first-spark",
      "explorer-10",
      "quality-critic",
    ]);
  });

  it("generates daily challenges that expire at the next midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T15:30:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    const challenge = generateDailyChallenge("user-1");
    expect(challenge.id).toContain("daily-user-1-");
    expect(challenge.title).toBe("Speed Round");
    expect(challenge.target).toBe(3);
    expect(challenge.expiresAt).toBe("2026-01-11T00:00:00.000Z");
  });
});
