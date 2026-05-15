import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockRecordBiasActivity = vi.fn();
const mockAnalyzeBiases = vi.fn();
const mockGetBiasAnalysis = vi.fn();
const mockGetCounterPrompt = vi.fn();
const mockGenerateDebiasingChallenges = vi.fn();
const mockCompleteDebiasingChallenge = vi.fn();
const mockBuildTeamBiasDashboard = vi.fn();

vi.mock("@innovator/core", () => ({
  recordBiasActivity: (...args: unknown[]) => mockRecordBiasActivity(...args),
  analyzeBiases: (...args: unknown[]) => mockAnalyzeBiases(...args),
  getBiasAnalysis: (...args: unknown[]) => mockGetBiasAnalysis(...args),
  getCounterPrompt: (...args: unknown[]) => mockGetCounterPrompt(...args),
  generateDebiasingChallenges: (...args: unknown[]) => mockGenerateDebiasingChallenges(...args),
  completeDebiasingChallenge: (...args: unknown[]) => mockCompleteDebiasingChallenge(...args),
  buildTeamBiasDashboard: (...args: unknown[]) => mockBuildTeamBiasDashboard(...args),
  COGNITIVE_BIASES: [
    "confirmation",
    "anchoring",
    "availability-heuristic",
    "groupthink",
    "sunk-cost",
    "status-quo",
    "dunning-kruger",
    "framing-effect",
  ],
  UserActivitySchema: z.object({
    userId: z.string().max(100),
    sessionId: z.string().max(100),
    timestamp: z.string(),
    action: z.enum([
      "investigate",
      "select-angle",
      "score-idea",
      "refine-idea",
      "dismiss-idea",
      "vote",
      "search",
      "filter",
      "compare",
      "export",
    ]),
    data: z.record(z.string().max(100), z.unknown()).optional(),
  }),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/bias/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/bias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/bias");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

const validActivity = {
  userId: "u1",
  sessionId: "s1",
  timestamp: "2024-01-01T00:00:00Z",
  action: "investigate" as const,
  data: { subject: "AI" },
};

describe("API /api/bias", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("POST", () => {
    it("records bias activity successfully", async () => {
      const res = await POST(makePost({ action: "record", activity: validActivity }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockRecordBiasActivity).toHaveBeenCalledWith(validActivity);
    });

    it("analyzes biases for a user", async () => {
      const mockAnalysis = {
        userId: "u1",
        biases: [{ id: "confirmation", score: 0.7, severity: "moderate" }],
      };
      mockAnalyzeBiases.mockResolvedValue(mockAnalysis);

      const res = await POST(makePost({ action: "analyze", userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.biases).toHaveLength(1);
      expect(body.biases[0].id).toBe("confirmation");
    });

    it("generates debiasing challenges for a user", async () => {
      const mockChallenges = [{ id: "c1", biasId: "confirmation", title: "Devil's Advocate" }];
      mockGenerateDebiasingChallenges.mockReturnValue(mockChallenges);

      const res = await POST(makePost({ action: "challenges", userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].biasId).toBe("confirmation");
    });

    it("completes a debiasing challenge", async () => {
      mockCompleteDebiasingChallenge.mockReturnValue({ completed: true, xpAwarded: 50 });

      const res = await POST(
        makePost({ action: "complete-challenge", userId: "u1", challengeId: "c1" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.completed).toBe(true);
    });

    it("returns 404 when challenge not found or already completed", async () => {
      mockCompleteDebiasingChallenge.mockReturnValue(null);

      const res = await POST(
        makePost({ action: "complete-challenge", userId: "u1", challengeId: "missing" })
      );
      expect(res.status).toBe(404);
    });

    it("builds team bias dashboard", async () => {
      const mockDashboard = { teamId: "team1", summary: {} };
      mockBuildTeamBiasDashboard.mockReturnValue(mockDashboard);

      const res = await POST(
        makePost({
          action: "team-dashboard",
          teamId: "team1",
          memberIds: ["u1", "u2"],
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.teamId).toBe("team1");
    });

    it("returns 400 for malformed JSON body", async () => {
      const req = new Request("http://localhost/api/bias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 for missing required fields", async () => {
      const res = await POST(makePost({ action: "analyze" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid action", async () => {
      const res = await POST(makePost({ action: "unknown" }));
      expect(res.status).toBe(400);
    });

    it("returns 415 for invalid content-type", async () => {
      const req = new Request("http://localhost/api/bias", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "hello",
      });
      const res = await POST(req);
      expect(res.status).toBe(415);
    });

    it("returns 500 when core analysis throws", async () => {
      mockAnalyzeBiases.mockRejectedValue(new Error("LLM unavailable"));

      const res = await POST(makePost({ action: "analyze", userId: "u1" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("failed");
    });
  });

  describe("GET", () => {
    it("returns bias analysis for userId", async () => {
      mockGetBiasAnalysis.mockReturnValue({
        userId: "u1",
        biases: [{ id: "anchoring", score: 0.5 }],
      });

      const res = await GET(makeGet({ userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("u1");
    });

    it("returns 404 when no analysis found for user", async () => {
      mockGetBiasAnalysis.mockReturnValue(null);

      const res = await GET(makeGet({ userId: "u1" }));
      expect(res.status).toBe(404);
    });

    it("returns counter-prompt for valid biasId", async () => {
      mockGetCounterPrompt.mockReturnValue("Try to consider opposing viewpoints.");

      const res = await GET(makeGet({ biasId: "confirmation" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.biasId).toBe("confirmation");
      expect(body.counterPrompt).toBe("Try to consider opposing viewpoints.");
    });

    it("returns 400 for invalid biasId", async () => {
      const res = await GET(makeGet({ biasId: "not-a-real-bias" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid bias ID");
    });

    it("returns 400 when no parameters provided", async () => {
      const res = await GET(makeGet());
      expect(res.status).toBe(400);
    });
  });
});
