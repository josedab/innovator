import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  runAutonomousAgent: vi.fn(),
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

import { POST } from "../app/api/autonomous-agent/route.js";
import { runAutonomousAgent } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/autonomous-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readStream(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  return chunks;
}

function parseSSEEvents(chunks: string[]): Array<Record<string, unknown>> {
  const text = chunks.join("");
  const events: Array<Record<string, unknown>> = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // Skip non-JSON data lines
      }
    }
  }
  return events;
}

describe("POST /api/autonomous-agent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
  });

  it("returns SSE stream with progress events for valid subject", async () => {
    vi.mocked(runAutonomousAgent).mockImplementation(async (_subject, onProgress) => {
      onProgress({
        runId: "run-1",
        status: "investigating",
        completedBranches: 0,
        totalBranches: 3,
        totalIdeas: 0,
        currentBranch: { subject: "AI in healthcare", depth: 0 },
      });
      onProgress({
        runId: "run-1",
        status: "synthesizing",
        completedBranches: 1,
        totalBranches: 3,
        totalIdeas: 5,
      });
      return {
        runId: "run-1",
        subject: "AI in healthcare",
        branches: [{ subject: "AI", ideas: [], depth: 0 }],
        portfolio: [],
        totalIdeas: 5,
        duration: 1000,
      };
    });

    const response = await POST(makeRequest({ subject: "AI in healthcare" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const chunks = await readStream(response);
    const events = parseSSEEvents(chunks);

    // Should have progress events and a complete event
    expect(events.length).toBeGreaterThanOrEqual(2);
    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
  });

  it("returns 400 for missing subject", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 for empty subject string", async () => {
    const response = await POST(makeRequest({ subject: "" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/autonomous-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("validates Content-Type", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(
      new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
      })
    );

    const response = await POST(makeRequest({ subject: "test" }));
    expect(response.status).toBe(415);
  });

  it("sends error event when agent fails mid-stream", async () => {
    vi.mocked(runAutonomousAgent).mockImplementation(async (_subject, onProgress) => {
      onProgress({
        runId: "run-1",
        status: "investigating",
        completedBranches: 0,
        totalBranches: 1,
        totalIdeas: 0,
      });
      throw new Error("LLM provider failed");
    });

    const response = await POST(makeRequest({ subject: "test" }));
    expect(response.status).toBe(200); // SSE always returns 200

    const chunks = await readStream(response);
    const events = parseSSEEvents(chunks);

    const errorEvent = events.find((e) => e.status === "failed");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toBeTruthy();
  });

  it("SSE stream format has data: prefix and newlines", async () => {
    vi.mocked(runAutonomousAgent).mockImplementation(async (_subject, _onProgress) => ({
      runId: "run-1",
      subject: "test",
      branches: [],
      portfolio: [],
      totalIdeas: 0,
      duration: 100,
    }));

    const response = await POST(makeRequest({ subject: "test" }));
    const chunks = await readStream(response);
    const text = chunks.join("");

    // Every data event should have the "data: " prefix
    const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));
    expect(dataLines.length).toBeGreaterThanOrEqual(1);
  });

  it("handles very long subject within limits", async () => {
    vi.mocked(runAutonomousAgent).mockImplementation(async () => ({
      runId: "run-1",
      subject: "test",
      branches: [],
      portfolio: [],
      totalIdeas: 0,
      duration: 100,
    }));

    const longSubject = "A".repeat(500);
    const response = await POST(makeRequest({ subject: longSubject }));
    expect(response.status).toBe(200);
  });

  it("rejects subject exceeding max length", async () => {
    const tooLong = "A".repeat(501);
    const response = await POST(makeRequest({ subject: tooLong }));
    expect(response.status).toBe(400);
  });

  it("passes model and config options to agent", async () => {
    vi.mocked(runAutonomousAgent).mockImplementation(async () => ({
      runId: "run-1",
      subject: "test",
      branches: [],
      portfolio: [],
      totalIdeas: 0,
      duration: 100,
    }));

    await POST(
      makeRequest({
        subject: "test",
        maxBranches: 5,
        maxDepth: 3,
        strategy: "breadth-first",
      })
    );

    expect(runAutonomousAgent).toHaveBeenCalledWith(
      "test",
      expect.any(Function),
      expect.objectContaining({
        maxBranches: 5,
        maxDepth: 3,
        strategy: "breadth-first",
      })
    );
  });
});
