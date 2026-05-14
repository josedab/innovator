// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  runAutoPipeline: vi.fn(),
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
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
  SECURITY_HEADERS: {},
}));

import { runAutoPipeline } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
const mockRunAutoPipeline = vi.mocked(runAutoPipeline);

import { z } from "zod";

// Inline route handlers (following existing test patterns)
const EMBED_API_KEY_ENV = "INNOVATOR_EMBED_API_KEY";
const MAX_SUBJECT_LENGTH = 500;

const ANGLE_IDS = [
  "scamper",
  "first-principles",
  "cross-domain",
  "constraints",
  "inversion",
  "perspectives",
  "what-if",
  "trend-collision",
] as const;

const RequestSchema = z.object({
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH),
  angles: z.array(z.enum(ANGLE_IDS)).min(1).max(4).optional(),
  model: z.string().optional(),
});

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (process.env.INNOVATOR_EMBED_ORIGINS ?? "*")
    .split(",")
    .map((o) => o.trim());
  const isAllowed =
    allowedOrigins.includes("*") || (origin != null && allowedOrigins.includes(origin));

  return {
    "Access-Control-Allow-Origin": isAllowed ? (origin ?? "*") : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Embed-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function validateEmbedKey(request: Request): boolean {
  const requiredKey = process.env[EMBED_API_KEY_ENV];
  if (!requiredKey) return true;
  const providedKey = request.headers.get("x-embed-key");
  return providedKey === requiredKey;
}

async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);

  try {
    if (!validateEmbedKey(request)) {
      return new Response(JSON.stringify({ error: "Invalid embed API key" }), {
        status: 401,
        headers: { ...API_RESPONSE_HEADERS, ...cors },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...API_RESPONSE_HEADERS, ...cors },
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...API_RESPONSE_HEADERS, ...cors },
      });
    }

    const { subject, angles, model } = parsed.data;
    const selectedAngles = angles ?? (["scamper", "first-principles"] as const);

    let finalResult: PipelineProgress | null = null;

    await runAutoPipeline(
      subject,
      (progress: PipelineProgress) => {
        finalResult = progress;
      },
      model,
      selectedAngles as unknown as string[]
    );

    if (!finalResult || (finalResult as PipelineProgress).stage === "error") {
      return new Response(JSON.stringify({ error: "Pipeline failed" }), {
        status: 500,
        headers: { ...API_RESPONSE_HEADERS, ...cors },
      });
    }

    const result = finalResult as PipelineProgress;
    return Response.json(
      {
        subject,
        investigation: result.investigation,
        angleResults: result.angleResults,
        synthesis: result.synthesis,
      },
      { headers: { ...API_RESPONSE_HEADERS, ...cors } }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Widget request failed" }), {
      status: 500,
      headers: { ...API_RESPONSE_HEADERS, ...cors },
    });
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("OPTIONS /api/embed", () => {
  it("returns correct CORS headers", async () => {
    const req = new Request("http://localhost/api/embed", {
      method: "OPTIONS",
      headers: { origin: "https://example.com" },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-Embed-Key");
  });
});

describe("POST /api/embed", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env[EMBED_API_KEY_ENV];
    delete process.env.INNOVATOR_EMBED_ORIGINS;
  });

  it("POST with valid API key returns pipeline results", async () => {
    process.env[EMBED_API_KEY_ENV] = "test-key-123";
    mockRunAutoPipeline.mockImplementation(async (_subject, onProgress) => {
      const result: PipelineProgress = {
        stage: "complete",
        completedAngles: ["scamper"],
        totalAngles: 1,
        angleResults: [],
        investigation: undefined,
        synthesis: undefined,
      };
      (onProgress as (p: PipelineProgress) => void)(result);
      return result as never;
    });

    const res = await POST(makeRequest({ subject: "test" }, { "x-embed-key": "test-key-123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subject).toBe("test");
  });

  it("POST without API key returns 401 when key is configured", async () => {
    process.env[EMBED_API_KEY_ENV] = "required-key";
    const res = await POST(makeRequest({ subject: "test" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Invalid embed API key");
  });

  it("POST with invalid key returns 401", async () => {
    process.env[EMBED_API_KEY_ENV] = "correct-key";
    const res = await POST(makeRequest({ subject: "test" }, { "x-embed-key": "wrong-key" }));
    expect(res.status).toBe(401);
  });

  it("POST with non-JSON body returns 400", async () => {
    const req = new Request("http://localhost/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid JSON");
  });

  it("POST with missing subject returns 400", async () => {
    const res = await POST(makeRequest({ angles: ["scamper"] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid request");
  });

  it("POST with disallowed origin returns restricted CORS headers", async () => {
    process.env.INNOVATOR_EMBED_ORIGINS = "https://allowed.com";
    const req = new Request("http://localhost/api/embed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://disallowed.com",
      },
      body: JSON.stringify({ subject: "test" }),
    });
    mockRunAutoPipeline.mockImplementation(async (_subject, onProgress) => {
      const result: PipelineProgress = {
        stage: "complete",
        completedAngles: [],
        totalAngles: 0,
        angleResults: [],
      };
      (onProgress as (p: PipelineProgress) => void)(result);
      return result as never;
    });
    const res = await POST(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("");
  });

  it("core pipeline error returns 500", async () => {
    mockRunAutoPipeline.mockImplementation(async (_subject, onProgress) => {
      const result: PipelineProgress = {
        stage: "error",
        completedAngles: [],
        totalAngles: 0,
        angleResults: [],
        error: "Something broke",
      };
      (onProgress as (p: PipelineProgress) => void)(result);
      return result as never;
    });

    const res = await POST(makeRequest({ subject: "test" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Pipeline failed");
  });

  it("pipeline exception returns 500", async () => {
    mockRunAutoPipeline.mockRejectedValue(new Error("Unexpected crash"));
    const res = await POST(makeRequest({ subject: "test" }));
    expect(res.status).toBe(500);
  });
});
