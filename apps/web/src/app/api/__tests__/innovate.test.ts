import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", () => {
  const { z: zod } = require("zod");
  const ANGLE_IDS = [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ];
  return {
    generateForAngle: vi.fn(),
    generateText: vi.fn(),
    extractJson: vi.fn(),
    buildSynthesisPrompt: vi.fn(),
    InvestigationSchema: zod.object({
      summary: zod.string(),
      keyAspects: zod.array(zod.object({ title: zod.string(), description: zod.string() })),
      currentState: zod.string(),
      challenges: zod.array(zod.string()),
      opportunities: zod.array(zod.string()),
    }),
    ANGLE_IDS,
    SynthesisSchema: zod.object({
      topIdeas: zod.array(zod.any()),
      themes: zod.array(zod.string()),
      recommendation: zod.string(),
    }),
  };
});

import { generateForAngle, generateText, extractJson, buildSynthesisPrompt } from "@innovator/core";
const mockGenerateForAngle = vi.mocked(generateForAngle);
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);
const mockBuildSynthesisPrompt = vi.mocked(buildSynthesisPrompt);

const ANGLE_IDS_CONST = [
  "scamper",
  "first-principles",
  "cross-domain",
  "constraints",
  "inversion",
  "perspectives",
  "what-if",
  "trend-collision",
] as const;

const InvestigationSchema = z.object({
  summary: z.string(),
  keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
  currentState: z.string(),
  challenges: z.array(z.string()),
  opportunities: z.array(z.string()),
});

const SynthesisSchema = z.object({
  topIdeas: z.array(z.any()),
  themes: z.array(z.string()),
  recommendation: z.string(),
});

type AngleId = (typeof ANGLE_IDS_CONST)[number];
type AngleResult = { angleId: string; angleName: string; ideas: unknown[]; reasoning: string };

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema,
  angles: z.array(z.enum(ANGLE_IDS_CONST)).min(1).max(8),
  model: z.string().optional(),
  synthesize: z.boolean().optional(),
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
    const { subject, investigation, angles, model, synthesize } = parsed.data;
    const results: AngleResult[] = [];
    const MAX_CONCURRENCY = 2;
    for (let i = 0; i < angles.length; i += MAX_CONCURRENCY) {
      const batch = angles.slice(i, i + MAX_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((angleId) =>
          generateForAngle(subject, investigation, angleId as AngleId, model)
        )
      );
      results.push(...batchResults);
    }
    let synthesis = undefined;
    if (synthesize && results.length >= 2) {
      const angleResultsJson = JSON.stringify(results, null, 2);
      const prompt = buildSynthesisPrompt(subject, investigation, angleResultsJson);
      const raw = await generateText({ prompt, model, serverMode: true });
      const jsonStr = extractJson(raw);
      synthesis = SynthesisSchema.parse(JSON.parse(jsonStr));
    }
    return Response.json({ angleResults: results, synthesis });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Innovation generation failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

const MOCK_INVESTIGATION = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect 1", description: "Desc 1" }],
  currentState: "Current",
  challenges: ["c1"],
  opportunities: ["o1"],
};

const MOCK_ANGLE_RESULT: AngleResult = {
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
  reasoning: "Applied SCAMPER",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/innovate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/innovate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns angle results for valid input", async () => {
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);

    const res = await POST(
      makeRequest({
        subject: "testing",
        investigation: MOCK_INVESTIGATION,
        angles: ["scamper"],
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.angleResults).toHaveLength(1);
    expect(data.angleResults[0].angleId).toBe("scamper");
    expect(data.synthesis).toBeUndefined();
  });

  it("processes multiple angles in batches", async () => {
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);

    const res = await POST(
      makeRequest({
        subject: "testing",
        investigation: MOCK_INVESTIGATION,
        angles: ["scamper", "inversion", "what-if"],
      })
    );
    const data = await res.json();

    expect(data.angleResults).toHaveLength(3);
    expect(mockGenerateForAngle).toHaveBeenCalledTimes(3);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ subject: "test" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid angle ID", async () => {
    const res = await POST(
      makeRequest({
        subject: "test",
        investigation: MOCK_INVESTIGATION,
        angles: ["nonexistent"],
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty angles array", async () => {
    const res = await POST(
      makeRequest({
        subject: "test",
        investigation: MOCK_INVESTIGATION,
        angles: [],
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 500 when generateForAngle throws", async () => {
    mockGenerateForAngle.mockRejectedValue(new Error("LLM error"));

    const res = await POST(
      makeRequest({
        subject: "test",
        investigation: MOCK_INVESTIGATION,
        angles: ["scamper"],
      })
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("LLM error");
  });
});
