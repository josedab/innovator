import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  loadFederationPrivacyBudget: vi.fn(),
  getRemainingFederationBudget: vi.fn(),
  loadSharedPatterns: vi.fn(),
  generateFederationRecommendations: vi.fn(),
  detectFederationAntiPatterns: vi.fn(),
  computeFederationNetworkStats: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/federation-dp/route.js";
import {
  loadSharedPatterns,
  generateFederationRecommendations,
  detectFederationAntiPatterns,
  computeFederationNetworkStats,
} from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/federation-dp");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/federation-dp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/federation-dp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSharedPatterns).mockReturnValue([]);
  });

  it("GET returns privacy budget by default", async () => {
    const { loadFederationPrivacyBudget, getRemainingFederationBudget } =
      await import("@innovator/core");
    vi.mocked(loadFederationPrivacyBudget).mockReturnValue({
      totalSpent: 2.5,
      maxBudget: 10,
      queriesProcessed: 5,
      budgetHistory: [],
    });
    vi.mocked(getRemainingFederationBudget).mockReturnValue(7.5);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.remaining).toBe(7.5);
  });

  it("GET action=patterns returns shared patterns", async () => {
    vi.mocked(loadSharedPatterns).mockReturnValue([
      {
        id: "p1",
        type: "angle-effectiveness",
        angleId: "scamper",
        topicCategory: "sustainability",
        noisedValue: 0.82,
        ciLower: 0.7,
        ciUpper: 0.9,
        sampleSize: 12,
        epoch: "2026-01",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await GET(makeGet({ action: "patterns" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
  });

  it("GET action=anti-patterns detects underperformers", async () => {
    vi.mocked(detectFederationAntiPatterns).mockReturnValue([
      {
        angleId: "first-principles",
        topicCategory: "HR",
        avgEffectiveness: 0.1,
        warningReason: "Low",
      },
    ]);
    const res = await GET(makeGet({ action: "anti-patterns" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.antiPatterns).toHaveLength(1);
  });

  it("GET action=network-stats returns stats", async () => {
    vi.mocked(computeFederationNetworkStats).mockReturnValue({
      totalNodes: 10,
      totalPatterns: 50,
      averageEpsilon: 1.0,
      trendingAngles: [],
      antiPatterns: [],
    });
    const res = await GET(makeGet({ action: "network-stats" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalNodes).toBe(10);
  });

  it("POST recommend returns angle recommendations", async () => {
    vi.mocked(generateFederationRecommendations).mockReturnValue([
      {
        id: "rec-1",
        recommendedAngle: "cross-domain",
        topicCategory: "sustainability",
        contributingOrgs: 12,
        effectivenessScore: 0.85,
        confidence: "high",
        explanation: "12 orgs report 85%",
        createdAt: "2026-01-01",
      },
    ]);
    const res = await POST(
      makePost({
        action: "recommend",
        userTopics: ["sustainability"],
        userAngles: ["scamper"],
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recommendations).toHaveLength(1);
    expect(data.recommendations[0].recommendedAngle).toBe("cross-domain");
  });

  it("POST validates required topics", async () => {
    const res = await POST(makePost({ action: "recommend", userTopics: [] }));
    expect(res.status).toBe(400);
  });

  it("POST rejects unknown action", async () => {
    const res = await POST(makePost({ action: "unknown" }));
    expect(res.status).toBe(400);
  });
});
