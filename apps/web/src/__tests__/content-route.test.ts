import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const { IdeaSchema, InvestigationSchema, RevisionSchema } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { z } = require("zod");
  return {
    IdeaSchema: z.object({
      title: z.string(),
      description: z.string(),
      potentialImpact: z.string(),
      implementationHint: z.string(),
    }),
    InvestigationSchema: z.object({
      summary: z.string(),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
      currentState: z.string(),
      challenges: z.array(z.string()),
      opportunities: z.array(z.string()),
    }),
    RevisionSchema: z.object({
      contentId: z.string(),
      feedback: z.string(),
    }),
  };
});

vi.mock("@innovator/core", () => ({
  generateContent: vi.fn(),
  reviseContent: vi.fn(),
  CONTENT_FORMATS: ["blog-post", "tweet-thread", "executive-summary"],
  CONTENT_TONES: ["professional", "casual", "technical"],
  CONTENT_AUDIENCES: ["general", "technical", "executive"],
  InnovationIdeaSchema: IdeaSchema,
  InvestigationSchema,
  RevisionRequestSchema: RevisionSchema,
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

import { POST } from "../app/api/content/route.js";
import { generateContent, reviseContent } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/content", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validGenerateBody = {
  action: "generate" as const,
  idea: {
    title: "AI Dashboard",
    description: "An AI-powered analytics dashboard",
    potentialImpact: "High",
    implementationHint: "Start with data pipeline",
  },
  format: "blog-post",
};

const validReviseBody = {
  action: "revise" as const,
  contentId: "content-123",
  feedback: "Make it more concise",
};

describe("API /api/content POST", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
    vi.mocked(generateContent).mockResolvedValue({
      id: "c-1",
      content: "Generated blog post",
      format: "blog-post",
    } as ReturnType<typeof generateContent> extends Promise<infer T> ? T : never);
    vi.mocked(reviseContent).mockResolvedValue({
      id: "c-2",
      content: "Revised content",
      format: "blog-post",
    } as ReturnType<typeof reviseContent> extends Promise<infer T> ? T : never);
  });

  it("returns 200 for valid generate request", async () => {
    const res = await POST(makeRequest(validGenerateBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("Generated blog post");
  });

  it("returns 200 for valid revise request", async () => {
    const res = await POST(makeRequest(validReviseBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("Revised content");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not valid json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ action: "generate" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid request");
  });

  it("returns 400 for unknown action", async () => {
    const res = await POST(makeRequest({ action: "delete" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when validateModel fails", async () => {
    vi.mocked(validateModel).mockReturnValue(
      new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
    );
    const res = await POST(makeRequest({ ...validGenerateBody, model: "bad-model" }));
    expect(res.status).toBe(400);
  });

  it("returns 415 when content-type validation fails", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(
      new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
      })
    );
    const res = await POST(makeRequest(validGenerateBody));
    expect(res.status).toBe(415);
  });

  it("returns 500 when generateContent throws", async () => {
    vi.mocked(generateContent).mockRejectedValue(new Error("LLM timeout"));
    const res = await POST(makeRequest(validGenerateBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("failed");
  });

  it("returns 500 when reviseContent throws", async () => {
    vi.mocked(reviseContent).mockRejectedValue(new Error("Revision error"));
    const res = await POST(makeRequest(validReviseBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("failed");
  });

  it("calls generateContent with correct parameters", async () => {
    await POST(makeRequest({ ...validGenerateBody, tone: "professional", audience: "technical" }));
    expect(vi.mocked(generateContent)).toHaveBeenCalledWith(
      validGenerateBody.idea,
      "blog-post",
      expect.objectContaining({
        tone: "professional",
        audience: "technical",
      })
    );
  });

  it("calls reviseContent with correct parameters", async () => {
    await POST(makeRequest(validReviseBody));
    expect(vi.mocked(reviseContent)).toHaveBeenCalledWith(
      expect.objectContaining({
        contentId: "content-123",
        feedback: "Make it more concise",
      }),
      undefined,
      expect.anything()
    );
  });
});
