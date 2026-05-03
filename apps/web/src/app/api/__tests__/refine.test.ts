/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => {
  const { z } = require("zod");
  return {
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    refineConversation: vi.fn(),
    InvestigationSchema: z.object({
      summary: z.string(),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
      currentState: z.string(),
      challenges: z.array(z.string()),
      opportunities: z.array(z.string()),
    }),
    AngleResultSchema: z.object({
      angleId: z.string(),
      angleName: z.string(),
      ideas: z.array(z.any()),
      reasoning: z.string(),
    }),
    SynthesisSchema: z.object({
      topIdeas: z.array(z.any()),
      themes: z.array(z.string()),
      recommendation: z.string(),
    }),
  };
});

import { createConversation, getConversation, refineConversation } from "@innovator/core";
import { z } from "zod";

const mockCreateConversation = vi.mocked(createConversation);
const mockGetConversation = vi.mocked(getConversation);
const mockRefineConversation = vi.mocked(refineConversation);

// Inline schemas and route handler (following existing test patterns)
const InvestigationSchema = z.object({
  summary: z.string(),
  keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
  currentState: z.string(),
  challenges: z.array(z.string()),
  opportunities: z.array(z.string()),
});

const AngleResultSchema = z.object({
  angleId: z.string(),
  angleName: z.string(),
  ideas: z.array(z.any()),
  reasoning: z.string(),
});

const SynthesisSchema = z.object({
  topIdeas: z.array(z.any()),
  themes: z.array(z.string()),
  recommendation: z.string(),
});

const StartConversationSchema = z.object({
  action: z.literal("start"),
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema.optional(),
  angleResults: z.array(AngleResultSchema).optional().default([]),
  synthesis: SynthesisSchema.optional(),
});

const RefineSchema = z.object({
  action: z.literal("refine"),
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(5000),
  selectedIdeas: z.array(z.string().max(500)).max(20).optional(),
  model: z.string().optional(),
});

const RequestSchema = z.discriminatedUnion("action", [StartConversationSchema, RefineSchema]);

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
        headers: API_RESPONSE_HEADERS,
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;

    if (data.action === "start") {
      const ctx = createConversation({
        subject: data.subject,
        investigation: data.investigation as any,
        angleResults: data.angleResults as any,
        synthesis: data.synthesis as any,
      });

      return Response.json(
        { sessionId: (ctx as any).sessionId, subject: (ctx as any).subject },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    // action === "refine"
    const ctx = getConversation(data.sessionId);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Conversation session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const response = await refineConversation(
      data.sessionId,
      data.message,
      data.selectedIdeas,
      data.model,
      request.signal
    );

    return Response.json(response, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Refinement failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/refine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with sessionId for action 'start'", async () => {
    mockCreateConversation.mockReturnValue({
      sessionId: "test-uuid-123",
      subject: "Test subject",
    } as any);

    const res = await POST(makeRequest({ action: "start", subject: "Test subject" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessionId).toBe("test-uuid-123");
    expect(data.subject).toBe("Test subject");
  });

  it("handles action 'refine' with valid sessionId", async () => {
    mockGetConversation.mockReturnValue({ sessionId: "valid-id" } as any);
    mockRefineConversation.mockResolvedValue({
      response: "Refined output",
      suggestions: ["Next step"],
    } as any);

    const res = await POST(
      makeRequest({
        action: "refine",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        message: "Tell me more",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.response).toBe("Refined output");
  });

  it("returns 404 for invalid sessionId in refine", async () => {
    mockGetConversation.mockReturnValue(undefined);

    const res = await POST(
      makeRequest({
        action: "refine",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        message: "Test",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ action: "start" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request");
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/refine", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "start", subject: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("returns 500 on internal error", async () => {
    mockCreateConversation.mockImplementation(() => {
      throw new Error("Internal error");
    });

    const res = await POST(makeRequest({ action: "start", subject: "test" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });
});
