import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getInnovationMemoryService: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "../app/api/innovation-memory/route.js";
import { getInnovationMemoryService } from "@innovator/core";

const mockService = {
  query: vi.fn(),
  getRecommendations: vi.fn(),
  getMidSessionNudges: vi.fn(),
  getEffectiveAngles: vi.fn(),
  getBiasFrequency: vi.fn(),
};

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/innovation-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/innovation-memory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getInnovationMemoryService).mockReturnValue(mockService as never);
  });

  it("returns results for query action", async () => {
    mockService.query.mockReturnValue([{ id: "m1" }]);
    const res = await POST(makePost({ action: "query", domain: "AI" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([{ id: "m1" }]);
  });

  it("returns results for query with type and limit", async () => {
    mockService.query.mockReturnValue([]);
    const res = await POST(makePost({ action: "query", domain: "AI", type: "idea", limit: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns recommendations for domain", async () => {
    mockService.getRecommendations.mockReturnValue([{ rec: "try X" }]);
    const res = await POST(makePost({ action: "recommendations", domain: "healthcare" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toEqual([{ rec: "try X" }]);
  });

  it("returns nudges for mid-session", async () => {
    mockService.getMidSessionNudges.mockReturnValue(["nudge1"]);
    const res = await POST(
      makePost({
        action: "nudges",
        sessionId: "s1",
        currentAngles: ["reverse"],
        domain: "fintech",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nudges).toEqual(["nudge1"]);
  });

  it("returns effectiveness data", async () => {
    mockService.getEffectiveAngles.mockReturnValue({ top: "reverse" });
    const res = await POST(makePost({ action: "effectiveness" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.effectiveness).toEqual({ top: "reverse" });
  });

  it("returns bias analysis for userId", async () => {
    mockService.getBiasFrequency.mockReturnValue({ bias: "confirmation" });
    const res = await POST(makePost({ action: "bias", userId: "u1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bias).toEqual({ bias: "confirmation" });
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(makePost({ action: "unknown" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for missing required fields on nudges", async () => {
    const res = await POST(makePost({ action: "nudges" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns 500 when service throws", async () => {
    mockService.query.mockImplementation(() => {
      throw new Error("DB error");
    });
    const res = await POST(makePost({ action: "query" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
