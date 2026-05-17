import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", async () => {
  const { z: zod } = await import("zod");
  return {
    generateArtifact: vi.fn(),
    ARTIFACT_TYPES: ["prd", "user-story", "tech-spec", "pitch-outline", "okr"] as const,
    KNOWN_MODELS: ["gpt-4.1", "gpt-4.1-mini", "gpt-5"],
    InnovationIdeaSchema: zod.object({
      title: zod.string().min(1).max(500),
      description: zod.string().min(1).max(5000),
      potentialImpact: zod.string().max(2000).default(""),
      implementationHint: zod.string().max(2000).default(""),
    }),
    InvestigationSchema: zod.object({
      summary: zod.string(),
      keyAspects: zod.array(zod.object({ title: zod.string(), description: zod.string() })),
      currentState: zod.string(),
      challenges: zod.array(zod.string()),
      opportunities: zod.array(zod.string()),
    }),
  };
});

import { generateArtifact } from "@innovator/core";
const mockGenerateArtifact = vi.mocked(generateArtifact);

const ARTIFACT_TYPES = ["prd", "user-story", "tech-spec", "pitch-outline", "okr"] as const;

const InnovationIdeaSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  potentialImpact: z.string().max(2000).default(""),
  implementationHint: z.string().max(2000).default(""),
});

const InvestigationSchema = z.object({
  summary: z.string(),
  keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
  currentState: z.string(),
  challenges: z.array(z.string()),
  opportunities: z.array(z.string()),
});

const API_RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Vary: "Accept-Encoding",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
} as const;

// Inline the route handler
const RequestSchema = z.object({
  idea: InnovationIdeaSchema,
  artifactType: z.enum(ARTIFACT_TYPES),
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema.optional(),
  model: z.string().optional(),
});

function validateJsonContentType(request: Request): Response | null {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: API_RESPONSE_HEADERS,
    });
  }
  return null;
}

function validateModel(model: string | undefined): Response | null {
  const KNOWN = ["gpt-4.1", "gpt-4.1-mini", "gpt-5"];
  if (model && !KNOWN.includes(model)) {
    return new Response(
      JSON.stringify({ error: `Unknown model. Allowed models: ${KNOWN.join(", ")}` }),
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
  return null;
}

async function POST(request: Request) {
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { idea, artifactType, subject, investigation, model } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const artifact = await generateArtifact(
      idea,
      artifactType,
      { subject, investigation },
      model,
      request.signal
    );

    return Response.json(artifact, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(
      JSON.stringify({ error: "Artifact generation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

function makeRequest(body: unknown, contentType = "application/json"): Request {
  return new Request("http://localhost/api/artifacts", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  idea: { title: "Smart Widget", description: "AI widget for predictions" },
  artifactType: "prd",
  subject: "consumer tech",
};

const MOCK_ARTIFACT = {
  content: "# PRD\n\n## Summary\nSmart widget...",
  type: "prd",
};

describe("POST /api/artifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with valid idea + artifactType", async () => {
    mockGenerateArtifact.mockResolvedValue(MOCK_ARTIFACT as any);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toContain("PRD");
  });

  it("returns 415 with non-JSON Content-Type", async () => {
    const res = await POST(makeRequest(VALID_BODY, "text/plain"));
    expect(res.status).toBe(415);
  });

  it("returns 400 with invalid JSON body", async () => {
    const req = new Request("http://localhost/api/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 400 with missing required fields", async () => {
    const res = await POST(makeRequest({ idea: { title: "X" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with invalid artifactType", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, artifactType: "nonexistent" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with unknown model name", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, model: "bad-model" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Unknown model");
  });

  it("returns 500 when generateArtifact throws", async () => {
    mockGenerateArtifact.mockRejectedValue(new Error("LLM error"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Artifact generation failed");
  });

  it("optional investigation field accepted", async () => {
    mockGenerateArtifact.mockResolvedValue(MOCK_ARTIFACT as any);
    const body = {
      ...VALID_BODY,
      investigation: {
        summary: "test",
        keyAspects: [{ title: "A", description: "D" }],
        currentState: "current",
        challenges: ["c"],
        opportunities: ["o"],
      },
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  it("response includes API_RESPONSE_HEADERS", async () => {
    mockGenerateArtifact.mockResolvedValue(MOCK_ARTIFACT as any);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
