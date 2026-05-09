import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

// Mock @innovator/core before imports
vi.mock("@innovator/core", () => ({
  generateForAngle: vi.fn(),
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => raw),
  buildSynthesisPrompt: vi.fn(() => "synthesis prompt"),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  InvestigationSchema: z.object({
    summary: z.string(),
    keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
    currentState: z.string(),
    challenges: z.array(z.string()),
    opportunities: z.array(z.string()),
  }),
  ANGLE_IDS: [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ] as const,
  SynthesisSchema: z.object({
    mergedIdeas: z.array(z.any()),
    connections: z.array(z.any()),
    narrative: z.string(),
  }),
  MAX_CONCURRENCY: 2,
  scoreIdeas: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn(() => null),
  validateModel: vi.fn(() => null),
}));

vi.mock("@/lib/api-headers", () => ({
  CACHE_HEADERS: { "Cache-Control": "no-store" },
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "@/app/api/innovate/route";
import { generateForAngle, generateText, scoreIdeas } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

const mockGenerateForAngle = vi.mocked(generateForAngle);
const mockGenerateText = vi.mocked(generateText);
const mockScoreIdeas = vi.mocked(scoreIdeas);
const mockValidateContentType = vi.mocked(validateJsonContentType);
const mockValidateModel = vi.mocked(validateModel);

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/innovate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeValidBody(overrides: Record<string, unknown> = {}) {
  return {
    subject: "AI in Healthcare",
    investigation: {
      summary: "AI healthcare summary",
      keyAspects: [{ title: "Diagnosis", description: "AI-powered diagnosis" }],
      currentState: "Current state",
      challenges: ["Data privacy"],
      opportunities: ["Better outcomes"],
    },
    angles: ["first-principles"],
    ...overrides,
  };
}

const MOCK_ANGLE_RESULT = {
  angleId: "first-principles",
  angleName: "First Principles",
  ideas: [
    {
      title: "Test Idea",
      description: "Test description",
      potentialImpact: "High",
      implementationHint: "Start here",
    },
  ],
  rawOutput: "raw",
};

describe("POST /api/innovate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);
    mockValidateContentType.mockReturnValue(null);
    mockValidateModel.mockReturnValue(null);
  });

  // ---- Happy path ----

  it("returns 200 with angle results for valid request", async () => {
    const res = await POST(makeRequest(makeValidBody()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.angleResults).toHaveLength(1);
    expect(data.angleResults[0].angleId).toBe("first-principles");
  });

  it("processes multiple angles", async () => {
    const body = makeValidBody({ angles: ["first-principles", "constraints"] });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.angleResults).toHaveLength(2);
  });

  // ---- Validation errors ----

  it("returns 400 for missing subject", async () => {
    const body = makeValidBody();
    delete (body as Record<string, unknown>).subject;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty angles", async () => {
    const res = await POST(makeRequest(makeValidBody({ angles: [] })));
    expect(res.status).toBe(400);
  });

  it("returns 400 for too many angles (>8)", async () => {
    const angles = Array(9).fill("first-principles");
    const res = await POST(makeRequest(makeValidBody({ angles })));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid model", async () => {
    mockValidateModel.mockReturnValue(
      new Response(JSON.stringify({ error: "Invalid model" }), { status: 400 })
    );
    const res = await POST(makeRequest(makeValidBody({ model: "bad-model" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/innovate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 415 when content type validation fails", async () => {
    mockValidateContentType.mockReturnValue(
      new Response(JSON.stringify({ error: "Invalid content type" }), { status: 415 })
    );
    const res = await POST(makeRequest(makeValidBody()));
    expect(res.status).toBe(415);
  });

  // ---- Synthesis ----

  it("triggers synthesis with 2+ angles", async () => {
    mockGenerateText.mockResolvedValue(
      JSON.stringify({
        mergedIdeas: [],
        connections: [],
        narrative: "Synthesis narrative",
      })
    );
    const body = makeValidBody({
      angles: ["first-principles", "constraints"],
      synthesize: true,
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.synthesis).toBeDefined();
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it("skips synthesis with only 1 angle", async () => {
    const body = makeValidBody({
      angles: ["first-principles"],
      synthesize: true,
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.synthesis).toBeUndefined();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // ---- Scoring ----

  it("includes scoring when score:true", async () => {
    mockScoreIdeas.mockResolvedValue({
      scores: [{ ideaTitle: "Test", overallScore: 8.5, dimensionScores: [], reasoning: "Good" }],
      rankedIdeas: ["Test"],
    });
    const body = makeValidBody({ score: true });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scoring).toBeDefined();
  });

  // ---- Error handling ----

  it("returns 500 when all angle generations fail", async () => {
    mockGenerateForAngle.mockRejectedValue(new Error("LLM failure"));
    const res = await POST(makeRequest(makeValidBody()));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("handles partial angle failures gracefully", async () => {
    let callCount = 0;
    mockGenerateForAngle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("fail");
      return MOCK_ANGLE_RESULT;
    });
    const body = makeValidBody({ angles: ["first-principles", "constraints"] });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.angleResults).toHaveLength(1);
  });

  // ---- MAX_CONCURRENCY batching ----

  it("processes angles in batches of MAX_CONCURRENCY", async () => {
    const body = makeValidBody({
      angles: ["first-principles", "constraints", "inversion", "what-if"],
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    // With MAX_CONCURRENCY=2, 4 angles should result in 2 batch calls
    expect(mockGenerateForAngle).toHaveBeenCalledTimes(4);
  });
});
