import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  smartRecommend: vi.fn(),
  classifySubject: vi.fn(),
  recordAngleFeedback: vi.fn(),
  getAngleFeedback: vi.fn(),
  computeAngleEffectiveness: vi.fn(),
  getDataPoints: vi.fn(),
  ANGLES: [
    { id: "scamper", name: "SCAMPER", shortDescription: "desc", icon: "🔄" },
    { id: "first-principles", name: "First Principles", shortDescription: "desc", icon: "🧱" },
    { id: "cross-domain", name: "Cross-Domain", shortDescription: "desc", icon: "🌐" },
  ],
}));

import {
  smartRecommend,
  classifySubject,
  recordAngleFeedback,
  getAngleFeedback,
} from "@innovator/core";
import { POST, PUT } from "../recommend-angles/route";

const mockSmartRecommend = vi.mocked(smartRecommend);
const mockClassifySubject = vi.mocked(classifySubject);
const mockRecordAngleFeedback = vi.mocked(recordAngleFeedback);
const mockGetAngleFeedback = vi.mocked(getAngleFeedback);

const MOCK_CLASSIFICATION = {
  domain: "technology",
  subDomain: "AI",
  complexity: "moderate",
  intent: "optimize",
  keywords: ["ai", "testing"],
  confidence: 0.9,
};

const MOCK_RECOMMENDATIONS = {
  classification: MOCK_CLASSIFICATION,
  recommendations: [
    { angleId: "scamper", relevance: 0.9, rationale: "Good for optimization" },
    { angleId: "first-principles", relevance: 0.85, rationale: "Fundamental analysis" },
  ],
  suggestedCount: 3,
};

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/recommend-angles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutRequest(body: unknown): Request {
  return new Request("http://localhost/api/recommend-angles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/recommend-angles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassifySubject.mockResolvedValue(MOCK_CLASSIFICATION as never);
    mockSmartRecommend.mockResolvedValue(MOCK_RECOMMENDATIONS as never);
    mockGetAngleFeedback.mockReturnValue([] as never);
  });

  it("returns recommendations for valid subject", async () => {
    const res = await POST(
      makePostRequest({ subject: "AI testing", count: 3, useThompsonSampling: true })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.recommendations).toHaveLength(3);
    expect(data.recommendations.map(({ angleId }: { angleId: string }) => angleId)).toEqual(
      expect.arrayContaining(["scamper", "first-principles", "cross-domain"])
    );
    expect(mockSmartRecommend).toHaveBeenCalledWith("AI testing", 3, undefined, expect.anything());
  });

  it("returns 400 for missing subject", async () => {
    const res = await POST(makePostRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid request");
  });

  it("includes classification in response", async () => {
    const res = await POST(makePostRequest({ subject: "AI testing" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.classification).toEqual(MOCK_CLASSIFICATION);
    expect(data.classification.domain).toBe("technology");
    expect(mockClassifySubject).toHaveBeenCalledWith("AI testing", undefined, expect.anything());
  });

  it("returns 500 when smartRecommend throws", async () => {
    mockSmartRecommend.mockRejectedValue(new Error("LLM unavailable"));

    const res = await POST(makePostRequest({ subject: "AI testing" }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Recommendation failed.");
  });
});

describe("PUT /api/recommend-angles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassifySubject.mockResolvedValue(MOCK_CLASSIFICATION as never);
  });

  it("records feedback successfully", async () => {
    const res = await PUT(
      makePutRequest({ subject: "AI testing", angleId: "scamper", qualityScore: 8 })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRecordAngleFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "technology",
        angleId: "scamper",
        qualityScore: 8,
      })
    );
  });

  it("returns 400 for missing angleId", async () => {
    const res = await PUT(makePutRequest({ subject: "AI testing", qualityScore: 8 }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid feedback");
  });

  it("returns 500 when classifySubject throws", async () => {
    mockClassifySubject.mockRejectedValue(new Error("Classification failed"));

    const res = await PUT(
      makePutRequest({ subject: "AI testing", angleId: "scamper", qualityScore: 8 })
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Failed to record feedback.");
  });
});
