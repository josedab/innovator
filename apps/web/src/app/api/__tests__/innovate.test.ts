import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", async () => {
  const { z: zod } = await import("zod");
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
    sanitizeLlmOutput: vi.fn((value: string) => value),
    scoreIdeas: vi.fn(),
    MAX_CONCURRENCY: 2,
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

import { generateForAngle } from "@innovator/core";
import type { AngleResult } from "@innovator/core";
import { POST } from "../innovate/route";

const mockGenerateForAngle = vi.mocked(generateForAngle);

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
    expect(data.error).toBe("All angle generations failed. Please try again.");
  });
});
