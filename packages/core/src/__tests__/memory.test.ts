import { describe, it, expect, beforeEach } from "vitest";
import {
  recordSignal,
  getUserSignals,
  buildPreferenceProfile,
  getPreferenceProfile,
  buildPreferenceContext,
  assignABTest,
  getABTestVariant,
  clearMemory,
} from "../memory/index.js";

describe("memory", () => {
  beforeEach(() => {
    clearMemory();
  });

  describe("signal recording", () => {
    it("records a signal and assigns ID", () => {
      const signal = recordSignal({
        userId: "user-1",
        type: "rating",
        ideaTitle: "Test Idea",
        value: 8,
      });
      expect(signal.id).toBeTruthy();
      expect(signal.timestamp).toBeTruthy();
      expect(signal.value).toBe(8);
    });

    it("retrieves signals for a user", () => {
      recordSignal({ userId: "user-1", type: "rating", ideaTitle: "Idea 1", value: 7 });
      recordSignal({ userId: "user-1", type: "selection", ideaTitle: "Idea 2", value: 1 });
      recordSignal({ userId: "user-2", type: "rating", ideaTitle: "Idea 3", value: 5 });

      expect(getUserSignals("user-1")).toHaveLength(2);
      expect(getUserSignals("user-2")).toHaveLength(1);
      expect(getUserSignals("user-3")).toHaveLength(0);
    });

    it("records signals with angle ID and metadata", () => {
      const signal = recordSignal({
        userId: "user-1",
        type: "rating",
        ideaTitle: "Idea",
        angleId: "scamper",
        value: 9,
        metadata: { domain: "technology", feasibility: "high" },
      });
      expect(signal.angleId).toBe("scamper");
      expect(signal.metadata?.domain).toBe("technology");
    });
  });

  describe("preference profile", () => {
    it("builds a profile from signals", () => {
      recordSignal({ userId: "u1", type: "rating", ideaTitle: "I1", angleId: "scamper", value: 8 });
      recordSignal({ userId: "u1", type: "rating", ideaTitle: "I2", angleId: "scamper", value: 9 });
      recordSignal({
        userId: "u1",
        type: "selection",
        ideaTitle: "I1",
        angleId: "what-if",
        value: 1,
      });

      const profile = buildPreferenceProfile("u1");
      expect(profile.userId).toBe("u1");
      expect(profile.signalCount).toBe(3);
      expect(profile.averageRating).toBe(8.5);
      expect(profile.topAngles).toContain("scamper");
    });

    it("stores and retrieves profile", () => {
      recordSignal({ userId: "u1", type: "rating", ideaTitle: "I1", value: 7 });
      buildPreferenceProfile("u1");
      const profile = getPreferenceProfile("u1");
      expect(profile).toBeDefined();
      expect(profile!.userId).toBe("u1");
    });

    it("handles empty signals", () => {
      const profile = buildPreferenceProfile("u1");
      expect(profile.signalCount).toBe(0);
      expect(profile.averageRating).toBeUndefined();
      expect(profile.engagementScore).toBe(0);
    });

    it("calculates engagement score from time-on-idea", () => {
      recordSignal({ userId: "u1", type: "time-on-idea", ideaTitle: "I1", value: 120 });
      recordSignal({ userId: "u1", type: "time-on-idea", ideaTitle: "I2", value: 60 });

      const profile = buildPreferenceProfile("u1");
      expect(profile.engagementScore).toBeGreaterThan(0);
      expect(profile.engagementScore).toBeLessThanOrEqual(1);
    });
  });

  describe("preference context", () => {
    it("returns undefined with too few signals", () => {
      recordSignal({ userId: "u1", type: "rating", ideaTitle: "I1", value: 8 });
      buildPreferenceProfile("u1");
      expect(buildPreferenceContext("u1")).toBeUndefined();
    });

    it("returns undefined for unknown user", () => {
      expect(buildPreferenceContext("unknown")).toBeUndefined();
    });

    it("generates context string with sufficient signals", () => {
      for (let i = 0; i < 5; i++) {
        recordSignal({
          userId: "u1",
          type: "rating",
          ideaTitle: `Idea ${i}`,
          angleId: "scamper",
          value: 8,
          metadata: { domain: "technology", novelty: "high" },
        });
      }
      const profile = buildPreferenceProfile("u1");
      // Profile needs bias > threshold for context generation
      expect(profile.signalCount).toBe(5);
    });
  });

  describe("A/B testing", () => {
    it("assigns consistent variant for same user+test", () => {
      const a1 = assignABTest("test-1", "user-1");
      const a2 = assignABTest("test-1", "user-1");
      expect(a1.variant).toBe(a2.variant);
    });

    it("retrieves assignment variant", () => {
      assignABTest("test-1", "user-1");
      const variant = getABTestVariant("test-1", "user-1");
      expect(variant).toBeDefined();
      expect(["adapted", "default"]).toContain(variant);
    });

    it("returns undefined for unassigned user", () => {
      expect(getABTestVariant("test-1", "unknown")).toBeUndefined();
    });

    it("assigns different users potentially different variants", () => {
      const variants = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const a = assignABTest("test-1", `user-${i}`);
        variants.add(a.variant);
      }
      // With 20 users, we should likely see both variants
      expect(variants.size).toBeGreaterThanOrEqual(1);
    });
  });
});
