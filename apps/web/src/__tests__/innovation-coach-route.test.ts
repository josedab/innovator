import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBuildProfile = vi.fn();
const mockGetProfile = vi.fn();
const mockGetMetrics = vi.fn();
const mockGetGrowthTrajectory = vi.fn();
const mockUpdateProfile = vi.fn();

const mockGetPreSessionRecommendations = vi.fn();
const mockGetMidSessionNudges = vi.fn();
const mockGetPostSessionAnalysis = vi.fn();
const mockGenerateChallenge = vi.fn();
const mockGetActiveChallenges = vi.fn();

const mockGetSkillTree = vi.fn();
const mockAwardXP = vi.fn();
const mockCheckUnlocks = vi.fn();
const mockUpdateStreak = vi.fn();
const mockGetStreak = vi.fn();
const mockGetAchievements = vi.fn();
const mockGetLeaderboard = vi.fn();

vi.mock("../../../../packages/core/src/coaching/innovation-profile-builder", () => ({
  getInnovationProfileBuilder: vi.fn(() => ({
    buildProfile: mockBuildProfile,
    getProfile: mockGetProfile,
    getMetrics: mockGetMetrics,
    getGrowthTrajectory: mockGetGrowthTrajectory,
    updateProfile: mockUpdateProfile,
  })),
}));

vi.mock("../../../../packages/core/src/coaching/proactive-coach", () => ({
  getProactiveCoachingEngine: vi.fn(() => ({
    getPreSessionRecommendations: mockGetPreSessionRecommendations,
    getMidSessionNudges: mockGetMidSessionNudges,
    getPostSessionAnalysis: mockGetPostSessionAnalysis,
    generateChallenge: mockGenerateChallenge,
    getActiveChallenges: mockGetActiveChallenges,
  })),
}));

vi.mock("../../../../packages/core/src/coaching/skill-tree", () => ({
  getSkillTreeManager: vi.fn(() => ({
    getSkillTree: mockGetSkillTree,
    awardXP: mockAwardXP,
    checkUnlocks: mockCheckUnlocks,
    updateStreak: mockUpdateStreak,
    getStreak: mockGetStreak,
    getAchievements: mockGetAchievements,
    getLeaderboard: mockGetLeaderboard,
  })),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/innovation-coach/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/innovation-coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/innovation-coach", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns profile for user without session history", async () => {
    mockGetProfile.mockReturnValue({ userId: "u1", level: 3 });
    mockGetMetrics.mockReturnValue({ sessions: 10 });
    const res = await POST(makePost({ action: "profile", userId: "u1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeDefined();
    expect(body.metrics).toBeDefined();
  });

  it("builds profile from session history", async () => {
    mockBuildProfile.mockReturnValue({ userId: "u1", level: 5 });
    mockGetMetrics.mockReturnValue({ sessions: 3 });
    mockGetGrowthTrajectory.mockReturnValue({ trend: "up" });
    const res = await POST(
      makePost({
        action: "profile",
        userId: "u1",
        sessionHistory: [
          {
            sessionId: "s1",
            subject: "AI",
            anglesUsed: ["reverse"],
            ideaCount: 5,
            avgQuality: 0.8,
            duration: 300,
            completedAt: "2024-01-01T00:00:00Z",
          },
        ],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeDefined();
    expect(body.trajectory).toBeDefined();
  });

  it("returns recommendations for a subject", async () => {
    mockGetPreSessionRecommendations.mockReturnValue([{ rec: "try X" }]);
    const res = await POST(
      makePost({ action: "recommendations", userId: "u1", subject: "AI tools" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toBeDefined();
  });

  it("returns skill tree for user", async () => {
    mockGetSkillTree.mockReturnValue({ nodes: [] });
    mockGetStreak.mockReturnValue({ current: 3 });
    const res = await POST(makePost({ action: "skill_tree", userId: "u1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skillTree).toBeDefined();
    expect(body.streak).toBeDefined();
  });

  it("returns achievements for user", async () => {
    mockGetAchievements.mockReturnValue([{ id: "a1", name: "First Session" }]);
    const res = await POST(makePost({ action: "achievements", userId: "u1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.achievements).toBeDefined();
  });

  it("returns leaderboard", async () => {
    mockGetLeaderboard.mockReturnValue([{ userId: "u1", xp: 500 }]);
    const res = await POST(makePost({ action: "leaderboard", limit: 10 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leaderboard).toBeDefined();
  });

  it("returns challenge for user", async () => {
    mockGenerateChallenge.mockReturnValue({ id: "c1", title: "Speed Run" });
    mockGetActiveChallenges.mockReturnValue([]);
    const res = await POST(makePost({ action: "challenge", userId: "u1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBeDefined();
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(makePost({ action: "bad_action" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for missing userId on profile", async () => {
    const res = await POST(makePost({ action: "profile" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/innovation-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
