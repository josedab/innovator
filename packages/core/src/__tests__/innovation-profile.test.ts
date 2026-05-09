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

  describe("XP calculation", () => {
    it("awards 10 base + 5/angle + 15 if exported", () => {
      const profile = recordCoachingSession(
        "user-xp",
        makeSessionRecord({ anglesUsed: ["scamper", "inversion"], exported: true })
      );
      // 10 + 2*5 + 15 = 35
      expect(profile.learningPath.xp).toBe(35);
    });

    it("awards 10 base + 5/angle without export bonus", () => {
      const profile = recordCoachingSession(
        "user-xp2",
        makeSessionRecord({ anglesUsed: ["scamper"], exported: false })
      );
      // 10 + 1*5 = 15
      expect(profile.learningPath.xp).toBe(15);
    });
  });

  describe("level thresholds", () => {
    it("stays beginner below 100 XP", () => {
      // 3 sessions × 15xp = 45xp
      for (let i = 0; i < 3; i++) {
        recordCoachingSession(
          "lvl-user",
          makeSessionRecord({
            sessionId: `s-${i}`,
            anglesUsed: ["scamper"],
            exported: false,
          })
        );
      }
      const profile = getInnovationProfile("lvl-user");
      expect(profile.learningPath.level).toBe("beginner");
    });

    it("reaches intermediate at 100 XP", () => {
      // Each: 10 + 2*5 + 15 = 35xp. 3 sessions = 105xp
      for (let i = 0; i < 3; i++) {
        recordCoachingSession(
          "int-user",
          makeSessionRecord({
            sessionId: `s-${i}`,
            anglesUsed: ["scamper", "inversion"],
            exported: true,
          })
        );
      }
      const profile = getInnovationProfile("int-user");
      expect(profile.learningPath.level).toBe("intermediate");
      expect(profile.learningPath.nextLevelXp).toBe(500);
    });

    it("reaches advanced at 500 XP", () => {
      // Each: 10 + 3*5 + 15 = 40xp. 13 sessions = 520xp
      for (let i = 0; i < 13; i++) {
        recordCoachingSession(
          "adv-user",
          makeSessionRecord({
            sessionId: `s-${i}`,
            anglesUsed: ["scamper", "inversion", "cross-domain"],
            exported: true,
          })
        );
      }
      const profile = getInnovationProfile("adv-user");
      expect(profile.learningPath.level).toBe("advanced");
      expect(profile.learningPath.nextLevelXp).toBe(2000);
    });

    it("reaches expert at 2000 XP", () => {
      // Each: 10 + 8*5 + 15 = 65xp. 31 sessions = 2015xp
      const allAngles = [
        "scamper",
        "first-principles",
        "cross-domain",
        "constraints",
        "inversion",
        "perspectives",
        "what-if",
        "trend-collision",
      ];
      for (let i = 0; i < 31; i++) {
        recordCoachingSession(
          "exp-user",
          makeSessionRecord({
            sessionId: `s-${i}`,
            anglesUsed: allAngles,
            exported: true,
          })
        );
      }
      const profile = getInnovationProfile("exp-user");
      expect(profile.learningPath.level).toBe("expert");
      expect(profile.learningPath.nextLevelXp).toBe(-1);
    });
  });

  describe("topic affinity cap", () => {
    it("caps at 30 topics", () => {
      for (let i = 0; i < 40; i++) {
        recordCoachingSession(
          "topic-user",
          makeSessionRecord({
            sessionId: `s-${i}`,
            subject: `unique_topic_word_${i}_longword`,
          })
        );
      }
      const profile = getInnovationProfile("topic-user");
      expect(profile.topicAffinity.length).toBeLessThanOrEqual(30);
    });
  });

  describe("proactive coaching: bias warning", () => {
    it("detects angle bias when one angle dominates >50%", () => {
      // Need angleHistory.length > 2 (3+ distinct angles)
      for (let i = 0; i < 6; i++) {
        recordCoachingSession(
          "bias-user",
          makeSessionRecord({
            sessionId: `s-${i}`,
            anglesUsed: ["scamper"],
          })
        );
      }
      recordCoachingSession(
        "bias-user",
        makeSessionRecord({
          sessionId: "s-inv",
          anglesUsed: ["inversion"],
        })
      );
      recordCoachingSession(
        "bias-user",
        makeSessionRecord({
          sessionId: "s-cd",
          anglesUsed: ["cross-domain"],
        })
      );

      const suggestions = getProactiveCoaching("bias-user");
      const biasWarning = suggestions.find((s) => s.type === "bias-warning");
      expect(biasWarning).toBeDefined();
      expect(biasWarning!.message).toContain("scamper");
    });
  });

  describe("recommendations: suggests unexplored angles", () => {
    it("recommends blind spot angle with high priority", () => {
      recordCoachingSession(
        "rec-user",
        makeSessionRecord({
          anglesUsed: ["scamper"],
        })
      );
      const profile = getInnovationProfile("rec-user");
      const angleRec = profile.recommendations.find((r) => r.type === "angle");
      expect(angleRec).toBeDefined();
      expect(angleRec!.priority).toBe("high");
    });
  });
});
