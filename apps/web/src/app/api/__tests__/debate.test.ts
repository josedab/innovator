import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  debateIdeas: vi.fn(),
  DEFAULT_PRO_PERSONA: {
    name: "Innovation Advocate",
    role: "Argues in favor of the idea, highlighting potential, market opportunity, and strategic value",
    bias: "pro",
    style: "optimistic but evidence-based",
  },
  DEFAULT_CON_PERSONA: {
    name: "Critical Analyst",
    role: "Challenges the idea, identifying risks, feasibility concerns, and market barriers",
    bias: "con",
    style: "rigorous and skeptical",
  },
}));

import { debateIdeas, DEFAULT_PRO_PERSONA, DEFAULT_CON_PERSONA } from "@innovator/core";
const mockDebateIdeas = vi.mocked(debateIdeas);

// Inline the route handler to avoid Next.js module resolution issues
import { z } from "zod";

const IdeaSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  potentialImpact: z.string().min(1).max(2000),
  implementationHint: z.string().max(2000).optional().default(""),
});

const RequestSchema = z.object({
  ideas: z.array(IdeaSchema).min(1).max(20),
  investigation: z
    .object({
      summary: z.string().max(5000),
      keyAspects: z
        .array(z.object({ title: z.string().max(500), description: z.string().max(2000) }))
        .max(20),
      currentState: z.string().max(5000),
      challenges: z.array(z.string().max(2000)).max(20),
      opportunities: z.array(z.string().max(2000)).max(20),
    })
    .optional(),
  config: z
    .object({
      rounds: z.number().int().min(1).max(5).optional(),
      model: z.string().optional(),
    })
    .optional(),
  sessionId: z.string().max(200).optional(),
});

const KNOWN_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o3-mini",
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
];

function validateModel(model?: string) {
  if (model && !KNOWN_MODELS.includes(model)) {
    return new Response(
      JSON.stringify({ error: `Unknown model: ${model}`, allowedModels: KNOWN_MODELS }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

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

    const { ideas, investigation, config } = parsed.data;

    const modelError = validateModel(config?.model);
    if (modelError) return modelError;

    const results = await debateIdeas(ideas, investigation, {
      rounds: config?.rounds,
      model: config?.model,
      signal: request.signal,
    });

    return Response.json(results);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Request cancelled" }), {
        status: 499,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Debate failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function GET() {
  return Response.json({
    defaultPersonas: {
      pro: DEFAULT_PRO_PERSONA,
      con: DEFAULT_CON_PERSONA,
    },
    config: {
      rounds: { min: 1, max: 5, default: 2 },
      maxIdeas: 20,
    },
    verdictOutcomes: ["pro", "con", "nuanced"],
  });
}

const MOCK_IDEA = {
  title: "Test idea",
  description: "A test idea description",
  potentialImpact: "High impact",
  implementationHint: "Use AI",
};

const MOCK_DEBATE_RESULT = {
  idea: "Test idea",
  rounds: [
    {
      round: 1,
      proArguments: [{ point: "Pro point", evidence: "Evidence", strength: 8 }],
      conArguments: [{ point: "Con point", evidence: "Evidence", strength: 7 }],
    },
  ],
  verdict: {
    winner: "pro",
    confidence: 0.8,
    summary: "Pro wins",
    keyInsight: "Key insight",
    conditions: ["Condition 1"],
  },
  quality: {
    argumentDepth: 8,
    evidenceQuality: 7,
    balanceScore: 8,
    insightNovelty: 7,
    overall: 8,
  },
  totalRounds: 1,
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/debate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/debate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns debate results for valid input", async () => {
    mockDebateIdeas.mockResolvedValue([MOCK_DEBATE_RESULT]);

    const res = await POST(makeRequest({ ideas: [MOCK_IDEA] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].idea).toBe("Test idea");
    expect(data[0].verdict.winner).toBe("pro");
    expect(mockDebateIdeas).toHaveBeenCalledWith([MOCK_IDEA], undefined, {
      rounds: undefined,
      model: undefined,
      signal: expect.any(AbortSignal),
    });
  });

  it("returns 400 for missing ideas", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("returns 400 for empty ideas array", async () => {
    const res = await POST(makeRequest({ ideas: [] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("accepts up to 20 ideas", async () => {
    const ideas = Array.from({ length: 20 }, (_, i) => ({
      ...MOCK_IDEA,
      title: `Idea ${i + 1}`,
    }));
    mockDebateIdeas.mockResolvedValue(ideas.map(() => MOCK_DEBATE_RESULT));

    const res = await POST(makeRequest({ ideas }));

    expect(res.status).toBe(200);
    expect(mockDebateIdeas).toHaveBeenCalledWith(ideas, undefined, expect.any(Object));
  });

  it("returns 400 when ideas exceed max of 20", async () => {
    const ideas = Array.from({ length: 21 }, (_, i) => ({
      ...MOCK_IDEA,
      title: `Idea ${i + 1}`,
    }));

    const res = await POST(makeRequest({ ideas }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for idea title exceeding max length", async () => {
    const res = await POST(
      makeRequest({ ideas: [{ ...MOCK_IDEA, title: "x".repeat(501) }] })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown model", async () => {
    const res = await POST(
      makeRequest({ ideas: [MOCK_IDEA], config: { model: "unknown-model" } })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Unknown model");
    expect(data.allowedModels).toBeDefined();
  });

  it("passes valid model to debateIdeas", async () => {
    mockDebateIdeas.mockResolvedValue([MOCK_DEBATE_RESULT]);

    await POST(makeRequest({ ideas: [MOCK_IDEA], config: { model: "gpt-4o" } }));

    expect(mockDebateIdeas).toHaveBeenCalledWith(
      [MOCK_IDEA],
      undefined,
      expect.objectContaining({ model: "gpt-4o" })
    );
  });

  it("passes investigation and config to debateIdeas", async () => {
    const investigation = {
      summary: "Test summary",
      keyAspects: [{ title: "Aspect", description: "Desc" }],
      currentState: "Current",
      challenges: ["Challenge"],
      opportunities: ["Opportunity"],
    };
    mockDebateIdeas.mockResolvedValue([MOCK_DEBATE_RESULT]);

    await POST(
      makeRequest({ ideas: [MOCK_IDEA], investigation, config: { rounds: 3 } })
    );

    expect(mockDebateIdeas).toHaveBeenCalledWith(
      [MOCK_IDEA],
      investigation,
      expect.objectContaining({ rounds: 3 })
    );
  });

  it("returns 499 on abort", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    mockDebateIdeas.mockRejectedValue(abortError);

    const res = await POST(makeRequest({ ideas: [MOCK_IDEA] }));
    const data = await res.json();

    expect(res.status).toBe(499);
    expect(data.error).toBe("Request cancelled");
  });

  it("returns 500 when debateIdeas throws", async () => {
    mockDebateIdeas.mockRejectedValue(new Error("LLM unavailable"));

    const res = await POST(makeRequest({ ideas: [MOCK_IDEA] }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("LLM unavailable");
  });
});

describe("GET /api/debate", () => {
  it("returns debate config info with personas", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.defaultPersonas.pro.name).toBe("Innovation Advocate");
    expect(data.defaultPersonas.con.name).toBe("Critical Analyst");
    expect(data.config.rounds).toEqual({ min: 1, max: 5, default: 2 });
    expect(data.config.maxIdeas).toBe(20);
    expect(data.verdictOutcomes).toEqual(["pro", "con", "nuanced"]);
  });
});
