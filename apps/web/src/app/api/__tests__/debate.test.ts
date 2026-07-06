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

import { debateIdeas } from "@innovator/core";
import { GET, POST } from "../debate/route";

const mockDebateIdeas = vi.mocked(debateIdeas);

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
    expect(data.error).toBe("Invalid request. Please check your input and try again.");
  });

  it("returns 400 for empty ideas array", async () => {
    const res = await POST(makeRequest({ ideas: [] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid request. Please check your input and try again.");
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
    const res = await POST(makeRequest({ ideas: [{ ...MOCK_IDEA, title: "x".repeat(501) }] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown model", async () => {
    const res = await POST(makeRequest({ ideas: [MOCK_IDEA], config: { model: "unknown-model" } }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Unknown model");
  });

  it("passes valid model to debateIdeas", async () => {
    mockDebateIdeas.mockResolvedValue([MOCK_DEBATE_RESULT]);

    await POST(makeRequest({ ideas: [MOCK_IDEA], config: { model: "gpt-5" } }));

    expect(mockDebateIdeas).toHaveBeenCalledWith(
      [MOCK_IDEA],
      undefined,
      expect.objectContaining({ model: "gpt-5" })
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

    await POST(makeRequest({ ideas: [MOCK_IDEA], investigation, config: { rounds: 3 } }));

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
    expect(data.error).toBe("Debate failed. Please try again.");
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
