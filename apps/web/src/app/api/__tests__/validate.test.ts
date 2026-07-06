import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  validateIdea: vi.fn(),
  validateIdeas: vi.fn(),
}));

import { validateIdeas } from "@innovator/core";
import { POST } from "../validate/route";

const mockValidateIdeas = vi.mocked(validateIdeas);

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
