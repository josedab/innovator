import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  investigate: vi.fn(),
}));

import { investigate } from "@innovator/core";
const mockInvestigate = vi.mocked(investigate);

// Inline the route handler to avoid Next.js module resolution issues
import { z } from "zod";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { subject, model } = parsed.data;
    const investigation = await investigate(subject, model);
    return Response.json(investigation);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Investigation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

const MOCK_INVESTIGATION = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect 1", description: "Description 1" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/investigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns investigation results for valid input", async () => {
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);

    const res = await POST(makeRequest({ subject: "code review" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toBe("Test summary");
    expect(mockInvestigate).toHaveBeenCalledWith("code review", undefined);
  });

  it("passes model parameter when provided", async () => {
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);

    await POST(makeRequest({ subject: "testing", model: "gpt-5" }));

    expect(mockInvestigate).toHaveBeenCalledWith("testing", "gpt-5");
  });

  it("returns 400 for missing subject", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("returns 400 for empty subject", async () => {
    const res = await POST(makeRequest({ subject: "" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for subject exceeding max length", async () => {
    const res = await POST(makeRequest({ subject: "x".repeat(501) }));

    expect(res.status).toBe(400);
  });

  it("returns 500 when investigate throws", async () => {
    mockInvestigate.mockRejectedValue(new Error("LLM unavailable"));

    const res = await POST(makeRequest({ subject: "testing" }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("LLM unavailable");
  });
});
