import { describe, it, expect, beforeEach } from "vitest";
import {
  getInnovationProfile,
  recordSession as recordCoachingSession,
  getProactiveCoaching,
  getSessionHistory as getCoachingHistory,
  clearCoachingProfiles,
} from "../coaching/innovation-profile.js";
import type { SessionRecord as CoachingSessionRecord } from "../coaching/innovation-profile.js";

function makeSessionRecord(overrides?: Partial<CoachingSessionRecord>): CoachingSessionRecord {
  return {
    sessionId: `session-${Date.now()}`,
    subject: "AI in education",
    anglesUsed: ["scamper", "first-principles"],
    ideaCount: 5,
    avgQuality: 7.5,
    duration: 120000,
    completedAt: new Date().toISOString(),
    exported: false,
    ...overrides,
  };
}

describe("Innovation Coach - Profile & Proactive Coaching", () => {
  beforeEach(() => {
    clearCoachingProfiles();
  });

  describe("getInnovationProfile", () => {
    it("creates a new profile for unknown user", () => {
      const profile = getInnovationProfile("user-1", "Alice");
      expect(profile.userId).toBe("user-1");
      expect(profile.displayName).toBe("Alice");
      expect(profile.totalSessions).toBe(0);
      expect(profile.learningPath.level).toBe("beginner");
      expect(profile.blindSpots.length).toBeGreaterThan(0);
    });

    it("returns existing profile on subsequent calls", () => {
      getInnovationProfile("user-1", "Alice");
      const profile = getInnovationProfile("user-1");
      expect(profile.displayName).toBe("Alice");
    });
  });

  describe("recordCoachingSession", () => {
    it("updates profile after session", () => {
      const profile = recordCoachingSession("user-1", makeSessionRecord());
      expect(profile.totalSessions).toBe(1);
      expect(profile.angleHistory.length).toBeGreaterThan(0);
      expect(profile.learningPath.xp).toBeGreaterThan(0);
    });

    it("tracks angle usage correctly", () => {
      recordCoachingSession("user-1", makeSessionRecord({ anglesUsed: ["scamper"] }));
      recordCoachingSession("user-1", makeSessionRecord({ anglesUsed: ["scamper"] }));
      const profile = getInnovationProfile("user-1");
      const scamperHistory = profile.angleHistory.find((a) => a.angleId === "scamper");
      expect(scamperHistory).toBeDefined();
      expect(scamperHistory!.timesUsed).toBe(2);
    });

    it("updates topic affinity from subject words", () => {
      recordCoachingSession("user-1", makeSessionRecord({ subject: "quantum computing research" }));
      const profile = getInnovationProfile("user-1");
      expect(profile.topicAffinity.some((t) => t.topic === "quantum")).toBe(true);
    });

    it("updates exploration breadth", () => {
      recordCoachingSession(
        "user-1",
        makeSessionRecord({ anglesUsed: ["scamper", "inversion", "cross-domain", "what-if"] })
      );
      const profile = getInnovationProfile("user-1");
      expect(profile.style.explorationBreadth).toBeGreaterThan(0.3);
    });

    it("reduces blind spots as angles are used", () => {
      const initial = getInnovationProfile("user-1");
      const initialBlindSpots = initial.blindSpots.length;

      recordCoachingSession("user-1", makeSessionRecord({ anglesUsed: ["scamper"] }));
      recordCoachingSession("user-1", makeSessionRecord({ anglesUsed: ["scamper"] }));
      const profile = getInnovationProfile("user-1");
      expect(profile.blindSpots.length).toBeLessThanOrEqual(initialBlindSpots);
    });

    it("levels up with enough XP", () => {
      for (let i = 0; i < 10; i++) {
        recordCoachingSession(
          "user-1",
          makeSessionRecord({
            sessionId: `s-${i}`,
            anglesUsed: ["scamper", "first-principles", "cross-domain"],
            exported: true,
          })
        );
      }
      const profile = getInnovationProfile("user-1");
      expect(profile.learningPath.level).not.toBe("beginner");
    });

    it("generates recommendations", () => {
      for (let i = 0; i < 5; i++) {
        recordCoachingSession("user-1", makeSessionRecord({ sessionId: `s-${i}` }));
      }
      const profile = getInnovationProfile("user-1");
      expect(profile.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("getProactiveCoaching", () => {
    it("suggests angles based on past sessions", () => {
      recordCoachingSession(
        "user-1",
        makeSessionRecord({
          subject: "sustainable energy",
          anglesUsed: ["scamper"],
          avgQuality: 9,
        })
      );
      const suggestions = getProactiveCoaching("user-1", "sustainable energy storage");
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("warns about blind spots", () => {
      for (let i = 0; i < 6; i++) {
        recordCoachingSession("user-1", makeSessionRecord({ sessionId: `s-${i}` }));
      }
      const suggestions = getProactiveCoaching("user-1");
      const blindSpotAlert = suggestions.find((s) => s.type === "blind-spot-alert");
      expect(blindSpotAlert).toBeDefined();
    });

    it("includes methodology tips", () => {
      const suggestions = getProactiveCoaching("user-1");
      const tip = suggestions.find((s) => s.type === "methodology-tip");
      expect(tip).toBeDefined();
    });
  });

  describe("getCoachingHistory", () => {
    it("returns session history", () => {
      recordCoachingSession("user-1", makeSessionRecord());
      recordCoachingSession("user-1", makeSessionRecord({ sessionId: "s2" }));
      const history = getCoachingHistory("user-1");
      expect(history).toHaveLength(2);
    });

    it("returns empty for unknown user", () => {
      expect(getCoachingHistory("nobody")).toHaveLength(0);
    });
  });
});
