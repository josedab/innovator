import { describe, it, expect, beforeEach } from "vitest";
import {
  InnovationProfileBuilder,
  clearProfileBuilderData,
  type SessionHistoryEntry,
  type InnovationProfileDetailed,
} from "../coaching/innovation-profile-builder.js";

function makeSession(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    sessionId: `s-${Math.random().toString(36).slice(2, 8)}`,
    subject: "AI in healthcare",
    domain: "healthcare",
    anglesUsed: ["scamper", "first-principles"],
    ideaCount: 5,
    avgQuality: 7,
    feasibility: 0.7,
    novelty: 0.6,
    impact: 0.8,
    duration: 20,
    completedAt: "2024-06-15T10:00:00Z",
    ...overrides,
  };
}

describe("innovation-profile-builder", () => {
  let builder: InnovationProfileBuilder;

  beforeEach(() => {
    clearProfileBuilderData();
    builder = new InnovationProfileBuilder();
  });

  describe("buildProfile", () => {
    it("creates a profile from session history", () => {
      const history = [makeSession(), makeSession({ anglesUsed: ["what-if"] })];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.userId).toBe("user-1");
      expect(profile.totalSessions).toBe(2);
      expect(profile.preferredAngles.length).toBeGreaterThan(0);
    });

    it("calculates average quality", () => {
      const history = [makeSession({ avgQuality: 6 }), makeSession({ avgQuality: 8 })];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.avgQuality).toBe(7);
    });

    it("computes domain affinities", () => {
      const history = [
        makeSession({ domain: "healthcare" }),
        makeSession({ domain: "healthcare" }),
        makeSession({ domain: "fintech" }),
      ];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.domainAffinities.healthcare).toBeCloseTo(2 / 3, 5);
      expect(profile.domainAffinities.fintech).toBeCloseTo(1 / 3, 5);
    });

    it("ranks preferred angles by quality * usage", () => {
      const history = [
        makeSession({ anglesUsed: ["scamper"], avgQuality: 9 }),
        makeSession({ anglesUsed: ["scamper"], avgQuality: 9 }),
        makeSession({ anglesUsed: ["what-if"], avgQuality: 5 }),
      ];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.preferredAngles[0].angleId).toBe("scamper");
      expect(profile.preferredAngles[0].rank).toBe(1);
    });

    it("assigns XP and level", () => {
      const history = [makeSession()];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.xp).toBeGreaterThan(0);
      expect(["beginner", "intermediate", "advanced", "expert"]).toContain(profile.level);
    });

    it("computes quality trends grouped by date", () => {
      const history = [
        makeSession({ completedAt: "2024-06-01T10:00:00Z", avgQuality: 6 }),
        makeSession({ completedAt: "2024-06-01T14:00:00Z", avgQuality: 8 }),
        makeSession({ completedAt: "2024-06-02T10:00:00Z", avgQuality: 9 }),
      ];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.qualityTrends.length).toBe(2);
      expect(profile.qualityTrends[0].date).toBe("2024-06-01");
      expect(profile.qualityTrends[0].avgQuality).toBe(7);
    });
  });

  describe("updateProfile", () => {
    it("incrementally updates profile with new session", () => {
      builder.buildProfile("user-1", [makeSession()]);
      const updated = builder.updateProfile("user-1", makeSession({ avgQuality: 10 }));
      expect(updated.totalSessions).toBe(2);
    });
  });

  describe("assessCreativityStyle", () => {
    it("classifies as divergent when divergent angles dominate", () => {
      const history = [
        makeSession({ anglesUsed: ["scamper"], avgQuality: 8 }),
        makeSession({ anglesUsed: ["what-if"], avgQuality: 8 }),
        makeSession({ anglesUsed: ["cross-domain"], avgQuality: 8 }),
      ];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.creativityStyle).toBe("divergent");
    });

    it("classifies as convergent when convergent angles dominate", () => {
      const history = [
        makeSession({ anglesUsed: ["first-principles"], avgQuality: 8 }),
        makeSession({ anglesUsed: ["constraints"], avgQuality: 8 }),
        makeSession({ anglesUsed: ["inversion"], avgQuality: 8 }),
      ];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.creativityStyle).toBe("convergent");
    });

    it("classifies as balanced when evenly split", () => {
      const history = [
        makeSession({ anglesUsed: ["scamper"], avgQuality: 7 }),
        makeSession({ anglesUsed: ["first-principles"], avgQuality: 7 }),
      ];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.creativityStyle).toBe("balanced");
    });
  });

  describe("identifyBlindSpots", () => {
    it("flags unused angles as blind spots", () => {
      const history = [makeSession({ anglesUsed: ["scamper"] })];
      const profile = builder.buildProfile("user-1", history);
      expect(profile.blindSpots.length).toBeGreaterThan(0);
      expect(profile.blindSpots.some((b) => b.startsWith("angle:"))).toBe(true);
    });

    it("does not flag frequently used angles", () => {
      const history = Array.from({ length: 5 }, () => makeSession({ anglesUsed: ["scamper"] }));
      const profile = builder.buildProfile("user-1", history);
      expect(profile.blindSpots).not.toContain("angle:scamper");
    });
  });

  describe("getGrowthTrajectory", () => {
    it("returns stable trend for single session", () => {
      const profile = builder.buildProfile("user-1", [makeSession()]);
      const trajectory = builder.getGrowthTrajectory(profile);
      expect(trajectory.trend).toBe("stable");
      expect(trajectory.changePercent).toBe(0);
    });

    it("detects improving trend when quality increases", () => {
      const history = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeSession({ completedAt: `2024-06-0${i + 1}T10:00:00Z`, avgQuality: 4 })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          makeSession({ completedAt: `2024-06-${i + 10}T10:00:00Z`, avgQuality: 9 })
        ),
      ];
      const profile = builder.buildProfile("user-1", history);
      const trajectory = builder.getGrowthTrajectory(profile);
      expect(trajectory.trend).toBe("improving");
      expect(trajectory.changePercent).toBeGreaterThan(10);
    });

    it("returns milestones for 10+ sessions", () => {
      const history = Array.from({ length: 12 }, (_, i) =>
        makeSession({ completedAt: `2024-06-${String(i + 1).padStart(2, "0")}T10:00:00Z` })
      );
      const profile = builder.buildProfile("user-1", history);
      const trajectory = builder.getGrowthTrajectory(profile);
      expect(trajectory.milestones.some((m) => m.description.includes("10 sessions"))).toBe(true);
    });
  });
});
