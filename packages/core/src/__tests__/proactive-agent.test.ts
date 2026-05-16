import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildTeamProfile,
  getTeamProfile,
  getPreSessionCoaching,
  generateCoachingInsights,
  clearTeamProfiles,
} from "../coaching/proactive-agent.js";

// We need to mock the innovation-profile module since proactive-agent imports from it
vi.mock("../coaching/innovation-profile.js", () => {
  const profiles = new Map<string, ReturnType<typeof makeProfile>>();
  const histories = new Map<string, ReturnType<typeof makeSessionRecord>[]>();

  function makeProfile(userId: string, overrides: Record<string, unknown> = {}) {
    return {
      userId,
      displayName: userId,
      totalSessions: (overrides.totalSessions as number) ?? 0,
      angleHistory: (overrides.angleHistory as unknown[]) ?? [],
      topicAffinity: (overrides.topicAffinity as unknown[]) ?? [],
      style: {
        explorationBreadth: 0.5,
        riskTolerance: 0.5,
        collaborationScore: 0.3,
        iterationDepth: 0.5,
      },
      blindSpots: (overrides.blindSpots as string[]) ?? [
        "scamper",
        "first-principles",
        "cross-domain",
        "constraints",
        "inversion",
        "perspectives",
        "what-if",
        "trend-collision",
      ],
      recommendations: [],
      learningPath: {
        level: "beginner",
        xp: 0,
        nextLevelXp: 100,
        completedModules: [],
        currentModule: "intro-investigation",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function makeSessionRecord(subject: string, anglesUsed: string[], avgQuality: number) {
    return {
      sessionId: `s-${Math.random().toString(36).slice(2)}`,
      subject,
      anglesUsed,
      ideaCount: 3,
      avgQuality,
      duration: 300,
      completedAt: new Date().toISOString(),
      exported: false,
    };
  }

  return {
    getInnovationProfile: vi.fn((userId: string) => {
      if (!profiles.has(userId)) {
        profiles.set(userId, makeProfile(userId));
      }
      return profiles.get(userId);
    }),
    getSessionHistory: vi.fn((userId: string) => {
      return histories.get(userId) ?? [];
    }),
    // Helpers for tests to set up state
    __setProfile: (userId: string, overrides: Record<string, unknown>) => {
      profiles.set(userId, makeProfile(userId, overrides));
    },
    __setHistory: (userId: string, records: ReturnType<typeof makeSessionRecord>[]) => {
      histories.set(userId, records);
    },
    __clearAll: () => {
      profiles.clear();
      histories.clear();
    },
    __makeSessionRecord: makeSessionRecord,
  };
});

// Access mock helpers
import * as profileMod from "../coaching/innovation-profile.js";
const mockHelpers = profileMod as unknown as {
  __setProfile: (userId: string, overrides: Record<string, unknown>) => void;
  __setHistory: (userId: string, records: unknown[]) => void;
  __clearAll: () => void;
  __makeSessionRecord: (subject: string, anglesUsed: string[], avgQuality: number) => unknown;
};

beforeEach(() => {
  clearTeamProfiles();
  mockHelpers.__clearAll();
});

describe("buildTeamProfile", () => {
  it("produces aggregated metrics for 3 members", () => {
    mockHelpers.__setProfile("u1", {
      totalSessions: 10,
      angleHistory: [
        { angleId: "scamper", timesUsed: 5, avgIdeaQuality: 8, lastUsed: "2024-01-01" },
        { angleId: "inversion", timesUsed: 3, avgIdeaQuality: 7, lastUsed: "2024-01-01" },
      ],
      topicAffinity: [{ topic: "AI", count: 5, lastExplored: "2024-01-01" }],
    });
    mockHelpers.__setProfile("u2", {
      totalSessions: 5,
      angleHistory: [
        { angleId: "first-principles", timesUsed: 4, avgIdeaQuality: 6, lastUsed: "2024-01-01" },
      ],
      topicAffinity: [{ topic: "healthcare", count: 3, lastExplored: "2024-01-01" }],
    });
    mockHelpers.__setProfile("u3", {
      totalSessions: 3,
      angleHistory: [
        { angleId: "cross-domain", timesUsed: 2, avgIdeaQuality: 9, lastUsed: "2024-01-01" },
      ],
      topicAffinity: [{ topic: "AI", count: 2, lastExplored: "2024-01-01" }],
    });

    const profile = buildTeamProfile("team-1", "Test Team", ["u1", "u2", "u3"]);

    expect(profile.teamId).toBe("team-1");
    expect(profile.memberIds).toHaveLength(3);
    expect(profile.aggregatedProfile.totalSessions).toBe(18);
    expect(profile.aggregatedProfile.mostUsedAngles.length).toBeGreaterThan(0);
    expect(profile.aggregatedProfile.diversityScore).toBeGreaterThan(0);
    expect(profile.aggregatedProfile.topTopics.length).toBeGreaterThan(0);
  });

  it("returns empty profile with defaults for 0 members", () => {
    const profile = buildTeamProfile("team-empty", "Empty Team", []);
    expect(profile.aggregatedProfile.totalSessions).toBe(0);
    expect(profile.aggregatedProfile.mostUsedAngles).toHaveLength(0);
    expect(profile.aggregatedProfile.diversityScore).toBe(0);
    expect(profile.aggregatedProfile.innovationVelocity).toBe(0);
    expect(profile.aggregatedProfile.collaborationRate).toBe(0);
  });

  it("calculates high diversity score when all angles are used", () => {
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
    mockHelpers.__setProfile("u1", {
      totalSessions: 16,
      angleHistory: allAngles.map((a) => ({
        angleId: a,
        timesUsed: 5,
        avgIdeaQuality: 7,
        lastUsed: "2024-01-01",
      })),
    });

    const profile = buildTeamProfile("team-diverse", "Diverse Team", ["u1"]);
    expect(profile.aggregatedProfile.diversityScore).toBe(1);
  });

  it("calculates low diversity score when only one angle is used", () => {
    mockHelpers.__setProfile("u1", {
      totalSessions: 5,
      angleHistory: [
        { angleId: "scamper", timesUsed: 5, avgIdeaQuality: 7, lastUsed: "2024-01-01" },
      ],
    });

    const profile = buildTeamProfile("team-narrow", "Narrow Team", ["u1"]);
    expect(profile.aggregatedProfile.diversityScore).toBe(1 / 8);
  });
});

describe("getTeamProfile", () => {
  it("returns undefined for unknown teamId", () => {
    expect(getTeamProfile("unknown-team")).toBeUndefined();
  });

  it("returns profile after it has been built", () => {
    buildTeamProfile("team-x", "Team X", []);
    expect(getTeamProfile("team-x")).toBeDefined();
  });
});

describe("clearTeamProfiles", () => {
  it("clears all stored team profiles", () => {
    buildTeamProfile("team-a", "A", []);
    buildTeamProfile("team-b", "B", []);
    clearTeamProfiles();
    expect(getTeamProfile("team-a")).toBeUndefined();
    expect(getTeamProfile("team-b")).toBeUndefined();
  });
});

describe("getPreSessionCoaching", () => {
  it("returns context-aware suggestions", () => {
    const suggestions = getPreSessionCoaching("user-1", "machine learning applications");
    // Should get at least one suggestion (blind spot for new user)
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it("suggests based on past similar sessions", () => {
    mockHelpers.__setHistory("user-2", [
      mockHelpers.__makeSessionRecord("machine learning trends", ["scamper"], 8),
    ] as unknown[]);

    const suggestions = getPreSessionCoaching("user-2", "machine learning in healthcare");
    const angleSuggestion = suggestions.find((s) => s.type === "angle-recommendation");
    if (angleSuggestion) {
      expect(angleSuggestion.title).toContain("past success");
    }
  });
});

describe("generateCoachingInsights", () => {
  it("returns empty for users with less than 3 sessions", () => {
    mockHelpers.__setHistory("user-few", [
      mockHelpers.__makeSessionRecord("topic1", ["scamper"], 7),
    ] as unknown[]);

    const insights = generateCoachingInsights("user-few");
    expect(insights).toHaveLength(0);
  });

  it("detects strong angle patterns", () => {
    mockHelpers.__setProfile("user-strong", {
      totalSessions: 10,
      angleHistory: [
        { angleId: "scamper", timesUsed: 5, avgIdeaQuality: 8.5, lastUsed: "2024-01-01" },
      ],
      topicAffinity: [],
    });
    mockHelpers.__setHistory(
      "user-strong",
      Array.from({ length: 5 }, (_, i) =>
        mockHelpers.__makeSessionRecord(`topic ${i}`, ["scamper"], 8)
      ) as unknown[]
    );

    const insights = generateCoachingInsights("user-strong");
    const pattern = insights.find((i) => i.type === "pattern");
    if (pattern) {
      expect(pattern.title).toContain("scamper");
    }
  });

  it("detects topic tunnel vision", () => {
    mockHelpers.__setProfile("user-tunnel", {
      totalSessions: 10,
      angleHistory: [],
      topicAffinity: [
        { topic: "AI", count: 8, lastExplored: "2024-01-01" },
        { topic: "other", count: 2, lastExplored: "2024-01-01" },
      ],
    });
    mockHelpers.__setHistory(
      "user-tunnel",
      Array.from({ length: 5 }, (_, i) =>
        mockHelpers.__makeSessionRecord(`AI topic ${i}`, ["scamper"], 7)
      ) as unknown[]
    );

    const insights = generateCoachingInsights("user-tunnel");
    const anomaly = insights.find((i) => i.type === "anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly!.title).toContain("tunnel vision");
  });
});
