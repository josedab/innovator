import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  investigate: vi.fn(),
  generateForAngle: vi.fn(),
  ANGLES: [
    { id: "scamper", name: "SCAMPER" },
    { id: "first-principles", name: "First Principles" },
    { id: "cross-domain", name: "Cross Domain" },
    { id: "constraints", name: "Constraints" },
  ],
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON");
    return raw.slice(start, end + 1);
  }),
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  indexDocument: vi.fn(() => ({ id: `doc-${Math.random().toString(36).slice(2)}` })),
  findSimilarDocuments: vi.fn(() => []),
  clearEmbeddingsIndex: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn(() => null),
  validateModel: vi.fn(() => null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
  SECURITY_HEADERS: {},
}));

import { investigate, generateForAngle, generateText } from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

const mockInvestigate = vi.mocked(investigate);
const mockGenerateForAngle = vi.mocked(generateForAngle);
const mockGenerateText = vi.mocked(generateText);
const mockValidateContentType = vi.mocked(validateJsonContentType);

import { POST } from "../../../app/api/intersection/route.js";

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/intersection", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readSSEEvents(response: Response): Promise<Record<string, unknown>[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      if (part.startsWith("data: ")) {
        events.push(JSON.parse(part.slice(6)));
      }
    }
  }
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateContentType.mockReturnValue(null);
});

describe("POST /api/intersection", () => {
  it("returns SSE stream with investigating→complete for valid 2-subject request", async () => {
    mockInvestigate.mockResolvedValue({
      subject: "AI",
      summary: "AI investigation",
      opportunities: [],
      challenges: [],
      trends: [],
      keyPlayers: [],
      analyzedAt: new Date().toISOString(),
    } as unknown as ReturnType<typeof investigate> extends Promise<infer T> ? T : never);

    mockGenerateForAngle.mockResolvedValue({
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Idea 1",
          description: "Desc",
          potentialImpact: "High",
          implementationHint: "Do it",
        },
      ],
      reasoning: "reasoning",
    } as unknown as ReturnType<typeof generateForAngle> extends Promise<infer T> ? T : never);

    mockGenerateText.mockResolvedValue(
      JSON.stringify({
        opportunities: [
          {
            title: "Cross-domain opp",
            description: "AI meets healthcare",
            subjects: ["AI", "Healthcare"],
            confidence: 0.8,
          },
        ],
      })
    );

    const res = await POST(makeRequest({ subjects: ["AI", "Healthcare"] }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readSSEEvents(res);
    expect(events.length).toBeGreaterThanOrEqual(2);

    const stages = events.map((e) => e.stage);
    expect(stages).toContain("investigating");
    expect(stages).toContain("complete");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/intersection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for empty subjects array", async () => {
    const res = await POST(makeRequest({ subjects: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for only 1 subject", async () => {
    const res = await POST(makeRequest({ subjects: ["only-one"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when Content-Type validation fails", async () => {
    mockValidateContentType.mockReturnValue(
      new Response(JSON.stringify({ error: "Unsupported Media Type" }), { status: 415 })
    );
    const res = await POST(makeRequest({ subjects: ["A", "B"] }));
    expect(res.status).toBe(415);
  });

  it("sends error event when core function fails", async () => {
    mockInvestigate.mockRejectedValue(new Error("LLM timeout"));

    const res = await POST(makeRequest({ subjects: ["AI", "Healthcare"] }));
    const events = await readSSEEvents(res);

    const errorEvent = events.find((e) => e.stage === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toContain("failed");
  });
});
