import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  parsePipelineRequest: vi.fn(),
  resolvePhases: vi.fn().mockReturnValue([]),
  resolveAngles: vi.fn().mockReturnValue(["scamper", "first-principles"]),
  runAutoPipeline: vi.fn(),
  ANGLE_IDS: [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ],
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
  validateModel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  SECURITY_HEADERS: { "X-Content-Type-Options": "nosniff" },
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/pipeline/route.js";
import { parsePipelineRequest, runAutoPipeline } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
    vi.mocked(parsePipelineRequest).mockResolvedValue({
      subject: "AI in healthcare",
      phases: ["investigate", "generate"],
      angles: ["scamper"],
    });
    vi.mocked(runAutoPipeline).mockImplementation(async (_s, onProgress) => {
      onProgress({ stage: "investigating", completedAngles: [], totalAngles: 2, angleResults: [] });
      onProgress({
        stage: "complete",
        completedAngles: ["scamper"],
        totalAngles: 2,
        angleResults: [],
      });
      return { stage: "complete", completedAngles: ["scamper"], totalAngles: 2, angleResults: [] };
    });
  });

  it("returns SSE stream with valid request", async () => {
    const res = await POST(makeRequest({ description: "Explore AI in healthcare" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("streams config event first then progress events", async () => {
    const res = await POST(makeRequest({ description: "Explore AI" }));
    const text = await res.text();
    expect(text).toContain("data: ");
    expect(text).toContain('"type":"config"');
  });

  it("returns 400 for missing description", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns content-type error when validation fails", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(
      new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
    );
    const res = await POST(makeRequest({ description: "test" }));
    expect(res.status).toBe(415);
  });

  it("returns model error when model validation fails", async () => {
    vi.mocked(validateModel).mockReturnValue(
      new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
    );
    const res = await POST(makeRequest({ description: "test", model: "bad-model" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when parsePipelineRequest fails", async () => {
    vi.mocked(parsePipelineRequest).mockRejectedValue(new Error("parse error"));
    const res = await POST(makeRequest({ description: "test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("parse");
  });

  it("returns SSE stream even when pipeline throws", async () => {
    vi.mocked(runAutoPipeline).mockRejectedValue(new Error("pipeline crash"));
    const res = await POST(makeRequest({ description: "test" }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
