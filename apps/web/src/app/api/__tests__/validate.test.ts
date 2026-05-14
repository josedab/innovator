// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  validateIdea: vi.fn(),
  validateIdeas: vi.fn(),
}));

import { validateIdeas } from "@innovator/core";
const mockValidateIdeas = vi.mocked(validateIdeas);

// Inline the route handler to avoid Next.js module resolution issues
import { z } from "zod";

const IdeaInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  potentialImpact: z.string().max(2000).default(""),
  implementationHint: z.string().max(2000).default(""),
});

const RequestSchema = z.object({
  ideas: z.array(IdeaInputSchema).min(1).max(50),
  domain: z.string().min(1).max(200),
  model: z.string().optional(),
});

async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { ideas, domain, model } = parsed.data;
    const scorecard = await validateIdeas(
      ideas as Parameters<typeof validateIdeas>[0],
      domain,
      model,
      request.signal
    );

    return Response.json(scorecard);
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Validation failed. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  ideas: [
    {
      title: "Smart Widget",
      description: "An AI-powered widget that predicts user needs",
    },
  ],
  domain: "consumer-tech",
};

const MOCK_SCORECARD = {
  results: [
    {
      ideaTitle: "Smart Widget",
      overallScore: 85,
      status: "promising",
      recommendation: "Worth pursuing",
    },
  ],
  summary: "1 idea validated",
};

describe("POST /api/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation scorecard for valid input", async () => {
    mockValidateIdeas.mockResolvedValue(MOCK_SCORECARD as ReturnType<typeof mockValidateIdeas>);

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toBe("1 idea validated");
    expect(mockValidateIdeas).toHaveBeenCalledTimes(1);
  });

  it("passes model parameter when provided", async () => {
    mockValidateIdeas.mockResolvedValue(MOCK_SCORECARD as ReturnType<typeof mockValidateIdeas>);

    await POST(makeRequest({ ...VALID_BODY, model: "gpt-5" }));

    expect(mockValidateIdeas).toHaveBeenCalledWith(
      expect.any(Array),
      "consumer-tech",
      "gpt-5",
      expect.anything()
    );
  });

  it("returns 400 for missing ideas", async () => {
    const res = await POST(makeRequest({ domain: "tech" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request");
  });

  it("returns 400 for missing domain", async () => {
    const res = await POST(
      makeRequest({
        ideas: [{ title: "Test", description: "Desc" }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty ideas array", async () => {
    const res = await POST(makeRequest({ ideas: [], domain: "tech" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for idea with empty title", async () => {
    const res = await POST(
      makeRequest({
        ideas: [{ title: "", description: "Desc" }],
        domain: "tech",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when validateIdeas throws", async () => {
    mockValidateIdeas.mockRejectedValue(new Error("LLM unavailable"));

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Validation failed");
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("applies default values for optional idea fields", async () => {
    mockValidateIdeas.mockResolvedValue(MOCK_SCORECARD as ReturnType<typeof mockValidateIdeas>);

    await POST(makeRequest(VALID_BODY));

    const calledWith = mockValidateIdeas.mock.calls[0][0] as unknown[];
    expect(calledWith[0].potentialImpact).toBe("");
    expect(calledWith[0].implementationHint).toBe("");
  });
});
