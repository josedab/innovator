import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  analyzeRepoHealth: vi.fn(),
  generateBadgeMarkdown: vi.fn(),
  getRepoHealthScore: vi.fn(),
}));

import { analyzeRepoHealth, generateBadgeMarkdown, getRepoHealthScore } from "@innovator/core";

const mockAnalyzeRepoHealth = vi.mocked(analyzeRepoHealth);
const mockGenerateBadgeMarkdown = vi.mocked(generateBadgeMarkdown);
const mockGetRepoHealthScore = vi.mocked(getRepoHealthScore);

// ---- Inline schema and handlers ----

import { z } from "zod";

const RequestSchema = z.object({
  repositoryUrl: z.string().min(1).max(500),
  repositoryName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  language: z.string().max(100).optional(),
  stars: z.number().int().min(0).optional(),
  openIssues: z.number().int().min(0).optional(),
  contributors: z.number().int().min(0).optional(),
  lastCommitDate: z.string().optional(),
  recentCommitMessages: z.array(z.string().max(500)).max(20).optional(),
  model: z.string().optional(),
});

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
        headers: API_RESPONSE_HEADERS,
      });
    }

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

    const { model, ...repoData } = parsed.data;
    const healthScore = await analyzeRepoHealth(repoData as any, model, request.signal);
    const badgeMarkdown = generateBadgeMarkdown(healthScore as any);

    return Response.json({ ...healthScore, badgeMarkdown }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Health analysis failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const score = getRepoHealthScore(url);
    if (!score) {
      return new Response(JSON.stringify({ error: "No health score found. Run POST first." }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    return Response.json(score, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to retrieve health score." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/github-health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_REPO = {
  repositoryUrl: "https://github.com/org/repo",
  repositoryName: "org/repo",
  description: "A test repository",
  language: "TypeScript",
  stars: 1000,
  openIssues: 15,
  contributors: 20,
  lastCommitDate: "2024-06-01T00:00:00Z",
};

describe("POST /api/github-health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("analyzes repo health successfully", async () => {
    mockAnalyzeRepoHealth.mockResolvedValue({
      overallScore: 85,
      categories: {
        maintainability: 90,
        documentation: 80,
        community: 85,
      },
    } as any);
    mockGenerateBadgeMarkdown.mockReturnValue(
      "![Health](https://img.shields.io/badge/health-85-green)"
    );

    const res = await POST(makeRequest(VALID_REPO));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.overallScore).toBe(85);
    expect(data.badgeMarkdown).toContain("health-85");
    expect(mockAnalyzeRepoHealth).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryName: "org/repo" }),
      undefined,
      expect.anything()
    );
  });

  it("analyzes with minimal required fields", async () => {
    mockAnalyzeRepoHealth.mockResolvedValue({ overallScore: 60 } as any);
    mockGenerateBadgeMarkdown.mockReturnValue("badge");

    const res = await POST(
      makeRequest({ repositoryUrl: "https://github.com/a/b", repositoryName: "a/b" })
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for missing repositoryUrl", async () => {
    const res = await POST(makeRequest({ repositoryName: "repo" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing repositoryName", async () => {
    const res = await POST(makeRequest({ repositoryUrl: "https://github.com/a/b" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/github-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "broken{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 when health analysis fails", async () => {
    mockAnalyzeRepoHealth.mockRejectedValue(new Error("API rate limit"));

    const res = await POST(makeRequest(VALID_REPO));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/github-health", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(VALID_REPO),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});

describe("GET /api/github-health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached health score", async () => {
    mockGetRepoHealthScore.mockReturnValue({
      overallScore: 85,
      analyzedAt: "2024-06-01T00:00:00Z",
    } as any);

    const req = new Request("http://localhost/api/github-health?url=https://github.com/org/repo");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.overallScore).toBe(85);
  });

  it("returns 400 when url param is missing", async () => {
    const req = new Request("http://localhost/api/github-health");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("url");
  });

  it("returns 404 when no score found", async () => {
    mockGetRepoHealthScore.mockReturnValue(undefined as any);

    const req = new Request("http://localhost/api/github-health?url=https://github.com/no/score");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 500 on GET error", async () => {
    mockGetRepoHealthScore.mockImplementation(() => {
      throw new Error("Cache error");
    });

    const req = new Request("http://localhost/api/github-health?url=https://github.com/org/repo");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
