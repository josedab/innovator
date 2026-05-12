import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  selectTopIdea: vi.fn(),
  buildPRWorkflow: vi.fn(),
  innovationToPR: vi.fn(),
  workflowToScript: vi.fn(),
  generateText: vi.fn(),
  extractJson: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
  validateModel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/idea-to-pr/route.js";
import {
  selectTopIdea,
  innovationToPR,
  workflowToScript,
  generateText,
  extractJson,
  withRetry,
} from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

const validSynthesis = {
  topIdeas: [
    {
      title: "AI Assistant",
      description: "An AI-powered assistant",
      potentialImpact: "High",
      implementationHint: "Use GPT",
    },
  ],
  themes: ["AI"],
  recommendation: "Go for it",
};

const validConfig = {
  owner: "testowner",
  repo: "testrepo",
  baseBranch: "main",
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/idea-to-pr", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/idea-to-pr", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
    vi.mocked(withRetry).mockImplementation((fn: () => Promise<unknown>) => fn());
    vi.mocked(innovationToPR).mockReturnValue({
      status: "ready",
      filesCreated: 3,
      workflowPlan: { steps: [] },
      branchName: "innovation/ai-assistant",
      prTitle: "AI Assistant",
      prBody: "body",
    } as never);
    vi.mocked(workflowToScript).mockReturnValue("#!/bin/bash\necho hello");
    vi.mocked(generateText).mockResolvedValue(
      '{"overview":"plan","phases":[{"name":"Phase 1","description":"d","tasks":["t1"],"deliverables":["d1"]}],"risks":[{"risk":"r","mitigation":"m"}],"estimatedComplexity":"medium"}'
    );
    vi.mocked(extractJson).mockImplementation((raw) => raw);
  });

  it("returns successful response with valid synthesis and config", async () => {
    const res = await POST(
      makeRequest({ synthesis: validSynthesis, config: validConfig, ideaIndex: 0 })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.script).toBeDefined();
  });

  it("uses ideaIndex to select specific idea", async () => {
    const synthesis = {
      ...validSynthesis,
      topIdeas: [
        { ...validSynthesis.topIdeas[0] },
        {
          title: "Second Idea",
          description: "desc2",
          potentialImpact: "Medium",
        },
      ],
    };
    const res = await POST(makeRequest({ synthesis, config: validConfig, ideaIndex: 1 }));
    expect(res.status).toBe(200);
    expect(innovationToPR).toHaveBeenCalled();
  });

  it("falls back to selectTopIdea when ideaIndex is not provided", async () => {
    vi.mocked(selectTopIdea).mockReturnValue({
      title: "Top",
      description: "d",
      potentialImpact: "High",
      implementationHint: "",
    });
    const res = await POST(
      makeRequest({
        synthesis: validSynthesis,
        config: validConfig,
        ideaIndex: undefined,
      })
    );
    expect(res.status).toBe(200);
    expect(selectTopIdea).toHaveBeenCalled();
  });

  it("returns 400 when no ideas found (selectTopIdea returns undefined)", async () => {
    vi.mocked(selectTopIdea).mockReturnValue(undefined);
    // ideaIndex beyond topIdeas array length → falls to selectTopIdea
    const synthesis = {
      ...validSynthesis,
      topIdeas: [validSynthesis.topIdeas[0]],
    };
    const res = await POST(
      makeRequest({
        synthesis,
        config: validConfig,
        ideaIndex: 5, // within Zod max(49) but beyond array length
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No ideas");
  });

  it("skips implementation plan when generatePlan is false", async () => {
    const res = await POST(
      makeRequest({
        synthesis: validSynthesis,
        config: validConfig,
        generatePlan: false,
        ideaIndex: 0,
      })
    );
    expect(res.status).toBe(200);
    expect(generateText).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.implementationPlan).toBeUndefined();
  });

  it("continues without plan when plan generation fails", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("LLM error"));
    const res = await POST(
      makeRequest({
        synthesis: validSynthesis,
        config: validConfig,
        generatePlan: true,
        ideaIndex: 0,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.implementationPlan).toBeUndefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/idea-to-pr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for Zod validation failure (missing config)", async () => {
    const res = await POST(makeRequest({ synthesis: validSynthesis }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for Zod validation failure (empty topIdeas)", async () => {
    const res = await POST(
      makeRequest({
        synthesis: { ...validSynthesis, topIdeas: [] },
        config: validConfig,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns content-type error when validation fails", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(
      new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
    );
    const res = await POST(makeRequest({ synthesis: validSynthesis, config: validConfig }));
    expect(res.status).toBe(415);
  });

  it("returns model error when model validation fails", async () => {
    vi.mocked(validateModel).mockReturnValue(
      new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
    );
    const res = await POST(
      makeRequest({
        synthesis: validSynthesis,
        config: validConfig,
        model: "bad-model",
      })
    );
    expect(res.status).toBe(400);
  });

  it("omits script when PR result has failed status", async () => {
    vi.mocked(innovationToPR).mockReturnValue({
      status: "failed",
      filesCreated: 0,
      workflowPlan: { steps: [] },
    } as never);
    const res = await POST(
      makeRequest({
        synthesis: validSynthesis,
        config: validConfig,
        generatePlan: false,
      })
    );
    const body = await res.json();
    expect(body.script).toBeUndefined();
  });

  it("returns 500 when innovationToPR throws unexpectedly", async () => {
    vi.mocked(innovationToPR).mockImplementation(() => {
      throw new Error("unexpected");
    });
    const res = await POST(
      makeRequest({
        synthesis: validSynthesis,
        config: validConfig,
        generatePlan: false,
        ideaIndex: 0,
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("PR pipeline failed");
  });
});
