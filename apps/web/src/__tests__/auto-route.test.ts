// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
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

import { POST } from "../app/api/auto/route.js";
import { runAutoPipeline } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auto", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("POST /api/auto", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
    vi.mocked(runAutoPipeline).mockImplementation(async (_subject, onProgress) => {
      onProgress({
        stage: "investigating",
        completedAngles: [],
        totalAngles: 8,
        angleResults: [],
      });
      onProgress({
        stage: "complete",
        completedAngles: ["scamper"],
        totalAngles: 8,
        angleResults: [],
      });
      return {
        stage: "complete",
        completedAngles: ["scamper"],
        totalAngles: 8,
        angleResults: [],
      };
    });
  });

  it("returns SSE stream with valid subject", async () => {
    const res = await POST(makeRequest({ subject: "AI in healthcare" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("streams data: events with PipelineProgress JSON", async () => {
    const res = await POST(makeRequest({ subject: "Test subject" }));
    const text = await readStream(res);
    expect(text).toContain("data: ");
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(lines[0].replace("data: ", ""));
    expect(parsed).toHaveProperty("stage");
    expect(parsed).toHaveProperty("completedAngles");
    expect(parsed).toHaveProperty("totalAngles");
  });

  it("returns 400 for missing subject", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for empty subject string", async () => {
    const res = await POST(makeRequest({ subject: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for subject exceeding 500 characters", async () => {
    const longSubject = "x".repeat(501);
    const res = await POST(makeRequest({ subject: longSubject }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns content-type error when validation fails", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(
      new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
    );
    const res = await POST(makeRequest({ subject: "test" }));
    expect(res.status).toBe(415);
  });

  it("returns model error when model validation fails", async () => {
    vi.mocked(validateModel).mockReturnValue(
      new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
    );
    const res = await POST(makeRequest({ subject: "test", model: "bad-model" }));
    expect(res.status).toBe(400);
  });

  it("streams error progress when pipeline throws mid-stream", async () => {
    vi.mocked(runAutoPipeline).mockRejectedValue(new Error("pipeline crash"));
    const res = await POST(makeRequest({ subject: "test" }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await readStream(res);
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    const lastEvent = JSON.parse(lines[lines.length - 1].replace("data: ", ""));
    expect(lastEvent.stage).toBe("error");
    expect(lastEvent.error).toBeDefined();
  });

  it("passes subject and model to runAutoPipeline", async () => {
    await POST(makeRequest({ subject: "my subject", model: "gpt-4.1" }));
    expect(runAutoPipeline).toHaveBeenCalledWith(
      "my subject",
      expect.any(Function),
      "gpt-4.1",
      undefined,
      expect.any(AbortSignal)
    );
  });

  it("passes abort signal that can be cancelled", async () => {
    const controller = new AbortController();
    const req = new Request("http://localhost/api/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "test" }),
      signal: controller.signal,
    });

    vi.mocked(runAutoPipeline).mockImplementation(async () => {
      controller.abort();
    });

    const res = await POST(req);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
