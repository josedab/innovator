import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  routeRequest: vi.fn(),
  getCostDashboard: vi.fn(),
}));

import { routeRequest, getCostDashboard } from "@innovator/core";
import { GET, POST } from "../distillation/route";

const mockRouteRequest = vi.mocked(routeRequest);
const mockGetCostDashboard = vi.mocked(getCostDashboard);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/distillation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/distillation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes request successfully with defaults", async () => {
    mockRouteRequest.mockReturnValue({
      selectedModel: "ollama-local",
      reason: "Input below complexity threshold",
      estimatedCost: 0.001,
      qualityEstimate: 0.85,
    } as any);

    const res = await POST(makeRequest({ input: "Simple question about innovation" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.selectedModel).toBe("ollama-local");
    expect(data.reason).toBeDefined();
    expect(mockRouteRequest).toHaveBeenCalledWith(
      "Simple question about innovation",
      "gpt-4o",
      "ollama-local",
      0.8
    );
  });

  it("routes with custom models and threshold", async () => {
    mockRouteRequest.mockReturnValue({
      selectedModel: "claude-3",
      reason: "High complexity",
    } as any);

    const res = await POST(
      makeRequest({
        input: "Complex multi-step analysis",
        premiumModel: "claude-3",
        distilledModel: "llama-3",
        qualityThreshold: 0.95,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.selectedModel).toBe("claude-3");
    expect(mockRouteRequest).toHaveBeenCalledWith(
      "Complex multi-step analysis",
      "claude-3",
      "llama-3",
      0.95
    );
  });

  it("returns 400 for empty input", async () => {
    const res = await POST(makeRequest({ input: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request");
  });

  it("returns 400 for missing input", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for JSON parse error", async () => {
    const req = new Request("http://localhost/api/distillation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 500 when core function throws", async () => {
    mockRouteRequest.mockImplementation(() => {
      throw new Error("Routing engine failure");
    });

    const res = await POST(makeRequest({ input: "test input" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/distillation", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ input: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("validates qualityThreshold bounds", async () => {
    const res = await POST(makeRequest({ input: "test", qualityThreshold: 1.5 }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/distillation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cost dashboard", async () => {
    mockGetCostDashboard.mockReturnValue({
      totalRequests: 100,
      premiumUsage: 30,
      distilledUsage: 70,
      costSavings: 0.65,
    } as any);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalRequests).toBe(100);
    expect(data.costSavings).toBe(0.65);
  });

  it("returns 500 when dashboard fails", async () => {
    mockGetCostDashboard.mockImplementation(() => {
      throw new Error("Dashboard error");
    });

    const res = await GET();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("cost dashboard");
  });
});
