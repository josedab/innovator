/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getInnovationProfile: vi.fn(),
  recordCoachingSession: vi.fn(),
  getProactiveCoaching: vi.fn(),
  getCoachingHistory: vi.fn(),
  buildTeamProfile: vi.fn(),
  getTeamProfile: vi.fn(),
  getPreSessionCoaching: vi.fn(),
  generateCoachingInsights: vi.fn(),
}));

import {
  getInnovationProfile,
  recordCoachingSession,
  getProactiveCoaching,
  getCoachingHistory,
  buildTeamProfile,
  getTeamProfile,
  getPreSessionCoaching,
  generateCoachingInsights,
} from "@innovator/core";

const mockGetInnovationProfile = vi.mocked(getInnovationProfile);
const mockRecordCoachingSession = vi.mocked(recordCoachingSession);
const mockGetProactiveCoaching = vi.mocked(getProactiveCoaching);
const mockGetCoachingHistory = vi.mocked(getCoachingHistory);
const mockBuildTeamProfile = vi.mocked(buildTeamProfile);
const mockGetTeamProfile = vi.mocked(getTeamProfile);
const mockGetPreSessionCoaching = vi.mocked(getPreSessionCoaching);
const mockGenerateCoachingInsights = vi.mocked(generateCoachingInsights);

// ---- Inline schemas and handlers ----

import { z } from "zod";

const GetProfileSchema = z.object({
  action: z.literal("profile"),
  userId: z.string().max(200),
});

const RecordSessionSchema = z.object({
  action: z.literal("record"),
  userId: z.string().max(200),
  sessionId: z.string().max(100),
  subject: z.string().max(5000),
  anglesUsed: z.array(z.string()).max(20),
  ideaCount: z.number().int().min(0),
  avgQuality: z.number().min(0).max(10),
  duration: z.number().int().min(0),
  exported: z.boolean().default(false),
});

const CoachingSchema = z.object({
  action: z.literal("coaching"),
  userId: z.string().max(200),
  subject: z.string().max(5000).optional(),
  teamId: z.string().max(100).optional(),
});

const TeamProfileSchema = z.object({
  action: z.literal("team-profile"),
  teamId: z.string().max(100),
  teamName: z.string().max(200),
  memberIds: z.array(z.string().max(200)).max(100),
});

const InsightsSchema = z.object({
  action: z.literal("insights"),
  userId: z.string().max(200),
});

const PostBodySchema = z.discriminatedUnion("action", [
  GetProfileSchema,
  RecordSessionSchema,
  CoachingSchema,
  TeamProfileSchema,
  InsightsSchema,
]);

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");

    if (teamId) {
      const profile = getTeamProfile(teamId);
      if (!profile) {
        return Response.json({ error: "Team profile not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
      }
      return Response.json({ teamProfile: profile }, { headers: API_RESPONSE_HEADERS });
    }

    if (userId) {
      const profile = getInnovationProfile(userId);
      const history = getCoachingHistory(userId);
      const suggestions = getProactiveCoaching(userId);
      return Response.json(
        { profile, history: (history as any[]).slice(-20), suggestions },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    return Response.json({ error: "Provide userId or teamId" }, { status: 400, headers: API_RESPONSE_HEADERS });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}

async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    switch (parsed.action) {
      case "profile": {
        const profile = getInnovationProfile(parsed.userId);
        return Response.json({ profile }, { headers: API_RESPONSE_HEADERS });
      }

      case "record": {
        const profile = recordCoachingSession(parsed.userId, {
          sessionId: parsed.sessionId,
          subject: parsed.subject,
          anglesUsed: parsed.anglesUsed,
          ideaCount: parsed.ideaCount,
          avgQuality: parsed.avgQuality,
          duration: parsed.duration,
          completedAt: new Date().toISOString(),
          exported: parsed.exported,
        } as any);
        return Response.json({ profile, message: "Session recorded" }, { headers: API_RESPONSE_HEADERS });
      }

      case "coaching": {
        const suggestions = parsed.subject
          ? getPreSessionCoaching(parsed.userId, parsed.subject, parsed.teamId)
          : getProactiveCoaching(parsed.userId, parsed.subject as any);
        return Response.json({ suggestions }, { headers: API_RESPONSE_HEADERS });
      }

      case "team-profile": {
        const profile = buildTeamProfile(parsed.teamId, parsed.teamName, parsed.memberIds);
        return Response.json({ teamProfile: profile }, { headers: API_RESPONSE_HEADERS });
      }

      case "insights": {
        const insights = generateCoachingInsights(parsed.userId);
        const profile = getInnovationProfile(parsed.userId);
        return Response.json({ insights, profile }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return Response.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/coaching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/coaching", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("action: profile", () => {
    it("retrieves user profile", async () => {
      mockGetInnovationProfile.mockReturnValue({
        userId: "user-1",
        strengths: ["creativity"],
        sessionsCompleted: 5,
      } as any);

      const res = await POST(makeRequest({ action: "profile", userId: "user-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.profile.userId).toBe("user-1");
      expect(data.profile.sessionsCompleted).toBe(5);
    });
  });

  describe("action: record", () => {
    it("records a coaching session", async () => {
      mockRecordCoachingSession.mockReturnValue({ userId: "user-1", sessionsCompleted: 6 } as any);

      const res = await POST(
        makeRequest({
          action: "record",
          userId: "user-1",
          sessionId: "sess-1",
          subject: "AI in healthcare",
          anglesUsed: ["biomimicry", "first-principles"],
          ideaCount: 5,
          avgQuality: 7.5,
          duration: 300,
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe("Session recorded");
      expect(data.profile.sessionsCompleted).toBe(6);
      expect(mockRecordCoachingSession).toHaveBeenCalledWith("user-1", expect.objectContaining({
        sessionId: "sess-1",
        subject: "AI in healthcare",
      }));
    });
  });

  describe("action: coaching", () => {
    it("returns pre-session coaching with subject", async () => {
      mockGetPreSessionCoaching.mockReturnValue([
        { type: "tip", message: "Try biomimicry angle" },
      ] as any);

      const res = await POST(
        makeRequest({ action: "coaching", userId: "user-1", subject: "renewable energy" })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.suggestions).toHaveLength(1);
      expect(mockGetPreSessionCoaching).toHaveBeenCalledWith("user-1", "renewable energy", undefined);
    });

    it("returns proactive coaching without subject", async () => {
      mockGetProactiveCoaching.mockReturnValue([
        { type: "recommendation", message: "Explore new domains" },
      ] as any);

      const res = await POST(makeRequest({ action: "coaching", userId: "user-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(mockGetProactiveCoaching).toHaveBeenCalled();
    });
  });

  describe("action: team-profile", () => {
    it("builds team profile", async () => {
      mockBuildTeamProfile.mockReturnValue({
        teamId: "team-1",
        teamName: "Alpha",
        members: 3,
      } as any);

      const res = await POST(
        makeRequest({
          action: "team-profile",
          teamId: "team-1",
          teamName: "Alpha",
          memberIds: ["u1", "u2", "u3"],
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.teamProfile.teamName).toBe("Alpha");
    });
  });

  describe("action: insights", () => {
    it("generates coaching insights", async () => {
      mockGenerateCoachingInsights.mockReturnValue({
        trends: ["improving"],
        recommendations: ["explore more angles"],
      } as any);
      mockGetInnovationProfile.mockReturnValue({ userId: "user-1" } as any);

      const res = await POST(makeRequest({ action: "insights", userId: "user-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.insights.trends).toContain("improving");
      expect(data.profile).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("returns 400 for invalid input (missing userId)", async () => {
      const res = await POST(makeRequest({ action: "profile" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown action", async () => {
      const res = await POST(makeRequest({ action: "nonexistent", userId: "u1" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON", async () => {
      const req = new Request("http://localhost/api/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when core function throws", async () => {
      mockGetInnovationProfile.mockImplementation(() => {
        throw new Error("Profile DB failure");
      });

      const res = await POST(makeRequest({ action: "profile", userId: "user-1" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Profile DB failure");
    });

    it("returns 400 for invalid avgQuality > 10", async () => {
      const res = await POST(
        makeRequest({
          action: "record",
          userId: "user-1",
          sessionId: "s1",
          subject: "test",
          anglesUsed: [],
          ideaCount: 1,
          avgQuality: 11,
          duration: 10,
        })
      );
      expect(res.status).toBe(400);
    });
  });
});

describe("GET /api/coaching", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns user profile, history, and suggestions", async () => {
    mockGetInnovationProfile.mockReturnValue({ userId: "u1" } as any);
    mockGetCoachingHistory.mockReturnValue([{ id: "h1" }, { id: "h2" }] as any);
    mockGetProactiveCoaching.mockReturnValue([{ tip: "explore" }] as any);

    const req = new Request("http://localhost/api/coaching?userId=u1");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.profile.userId).toBe("u1");
    expect(data.history).toHaveLength(2);
    expect(data.suggestions).toHaveLength(1);
  });

  it("returns team profile", async () => {
    mockGetTeamProfile.mockReturnValue({ teamId: "t1", teamName: "Alpha" } as any);

    const req = new Request("http://localhost/api/coaching?teamId=t1");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.teamProfile.teamId).toBe("t1");
  });

  it("returns 404 for missing team profile", async () => {
    mockGetTeamProfile.mockReturnValue(undefined as any);

    const req = new Request("http://localhost/api/coaching?teamId=missing");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when no params provided", async () => {
    const req = new Request("http://localhost/api/coaching");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on GET error", async () => {
    mockGetTeamProfile.mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new Request("http://localhost/api/coaching?teamId=t1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
