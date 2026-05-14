// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---- Mock core modules ----
vi.mock("@innovator/core", () => ({
  recordBiasActivity: vi.fn().mockResolvedValue({ id: "activity-1" }),
  analyzeBiases: vi
    .fn()
    .mockResolvedValue({ biases: [], summary: "No significant biases detected" }),
  getBiasAnalysis: vi.fn().mockReturnValue(undefined),
  getCounterPrompt: vi.fn().mockReturnValue("Consider the opposite perspective"),
  generateDebiasingChallenges: vi.fn().mockResolvedValue([{ id: "ch-1", title: "Challenge 1" }]),
  completeDebiasingChallenge: vi.fn().mockReturnValue(true),
  buildTeamBiasDashboard: vi.fn().mockResolvedValue({ teamId: "t1", members: [] }),
  COGNITIVE_BIASES: [],
  UserActivitySchema: z.object({
    userId: z.string().min(1).max(200),
    activityType: z.string().min(1),
    data: z.record(z.unknown()).optional(),
  }),
  generateCostReport: vi.fn().mockReturnValue({ totalCost: 1.23, breakdown: [] }),
  indexDocument: vi.fn().mockResolvedValue({ id: "doc-1", size: 100 }),
  semanticSearch: vi.fn().mockResolvedValue({ results: [], total: 0 }),
  findSimilarDocuments: vi.fn().mockResolvedValue([]),
  clusterDocuments: vi.fn().mockResolvedValue({ clusters: [] }),
  discoverConnections: vi.fn().mockResolvedValue({ connections: [] }),
  getIndexSize: vi.fn().mockReturnValue(0),
  runPatentScan: vi.fn().mockResolvedValue({ results: [], totalPatentsAnalyzed: 0 }),
  optimizePortfolio: vi.fn().mockResolvedValue({ allocations: [], expectedReturn: 0 }),
}));

import {
  recordBiasActivity,
  analyzeBiases,
  generateCostReport,
  runPatentScan,
  optimizePortfolio,
  indexDocument,
  semanticSearch,
} from "@innovator/core";

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

// ---- Inlined route handlers (avoids Next.js module resolution) ----

// Bias route
const BiasRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    activity: z.object({
      userId: z.string().min(1).max(200),
      activityType: z.string().min(1),
      data: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    action: z.literal("analyze"),
    userId: z.string().min(1).max(200),
    model: z.string().optional(),
  }),
  z.object({ action: z.literal("challenges"), userId: z.string().min(1).max(200) }),
  z.object({
    action: z.literal("complete-challenge"),
    userId: z.string().min(1).max(200),
    challengeId: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("team-dashboard"),
    teamId: z.string().min(1).max(200),
    memberIds: z.array(z.string().max(200)).min(1).max(100),
  }),
]);

async function biasPost(request: Request) {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 400,
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
    const parsed = BiasRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const data = parsed.data;
    if (data.action === "record") {
      const result = await recordBiasActivity(data.activity as unknown);
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }
    if (data.action === "analyze") {
      const result = await analyzeBiases(data.userId as unknown, data.model as unknown);
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }
    return Response.json({ status: "ok" }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Bias analysis failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

// Cost report route
async function costReportGet() {
  try {
    const report = generateCostReport();
    return Response.json(report, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Cost report generation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

// Patent scanner route
const PatentRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        description: z.string().min(1).max(5000),
        potentialImpact: z.string().max(2000).default(""),
        implementationHint: z.string().max(2000).default(""),
      })
    )
    .min(1)
    .max(50),
  model: z.string().optional(),
  databases: z.array(z.enum(["USPTO", "EPO", "WIPO"])).optional(),
});

async function patentPost(request: Request) {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 400,
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
    const parsed = PatentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const result = await runPatentScan(parsed.data as unknown);
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Patent scan failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

// Portfolio optimize route
const PortfolioRequestSchema = z.object({
  scores: z
    .array(
      z.object({
        feasibility: z.number().min(1).max(10),
        impact: z.number().min(1).max(10),
        novelty: z.number().min(1).max(10),
        timeToImplement: z.enum(["days", "weeks", "months", "quarters", "years"]),
        confidence: z.number().min(0).max(1),
        rationale: z.string().max(2000).optional(),
      })
    )
    .min(2)
    .max(100),
  riskFreeRate: z.number().min(0).max(1).default(0.02),
  monteCarloSimulations: z.number().int().min(100).max(50000).default(5000),
  maxAllocationPerIdea: z.number().min(0.05).max(1).default(0.4),
});

async function portfolioPost(request: Request) {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 400,
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
    const parsed = PortfolioRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const result = await optimizePortfolio(parsed.data as unknown);
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Portfolio optimization failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

// Search route
const SearchRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("index"),
    type: z.string().min(1),
    title: z.string().min(1).max(500),
    content: z.string().min(1).max(10000),
    metadata: z.record(z.unknown()).optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    action: z.literal("search"),
    query: z.string().min(1).max(2000),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    action: z.literal("similar"),
    documentId: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    action: z.literal("cluster"),
    numClusters: z.number().int().min(2).max(20).optional(),
  }),
  z.object({ action: z.literal("discover"), documentId: z.string().min(1).max(200) }),
]);

async function searchPost(request: Request) {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 400,
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
    const parsed = SearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const data = parsed.data;
    if (data.action === "index") {
      const result = await indexDocument(data as unknown);
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }
    if (data.action === "search") {
      const result = await semanticSearch(data.query as unknown, data.limit as unknown);
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }
    return Response.json({ status: "ok" }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Search operation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

// ---- Helpers ----
function makePost(url: string, body: unknown, contentType = "application/json"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json{",
  });
}

// ==========================================
// TESTS
// ==========================================

describe("POST /api/bias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records bias activity for valid record action", async () => {
    const res = await biasPost(
      makePost("http://localhost/api/bias", {
        action: "record",
        activity: { userId: "user-1", activityType: "evaluate" },
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("activity-1");
  });

  it("analyzes biases for valid analyze action", async () => {
    const res = await biasPost(
      makePost("http://localhost/api/bias", {
        action: "analyze",
        userId: "user-1",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toContain("No significant");
  });

  it("returns 400 for missing action", async () => {
    const res = await biasPost(makePost("http://localhost/api/bias", { userId: "user-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await biasPost(makeInvalidJsonRequest("http://localhost/api/bias"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 400 for wrong content-type", async () => {
    const res = await biasPost(makePost("http://localhost/api/bias", {}, "text/plain"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Content-Type");
  });

  it("returns 500 when core function throws", async () => {
    vi.mocked(recordBiasActivity).mockRejectedValueOnce(new Error("fail"));
    const res = await biasPost(
      makePost("http://localhost/api/bias", {
        action: "record",
        activity: { userId: "user-1", activityType: "evaluate" },
      })
    );
    expect(res.status).toBe(500);
  });
});

describe("GET /api/cost-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cost report", async () => {
    const res = await costReportGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalCost).toBe(1.23);
  });

  it("returns 500 when report generation fails", async () => {
    vi.mocked(generateCostReport).mockImplementationOnce(() => {
      throw new Error("fail");
    });
    const res = await costReportGet();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Cost report");
  });
});

describe("POST /api/patent-scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_PATENT_BODY = {
    subject: "AI-powered code review",
    ideas: [{ title: "Smart Diff", description: "AI analyzes code diffs for quality" }],
  };

  it("returns patent scan results for valid input", async () => {
    const res = await patentPost(
      makePost("http://localhost/api/patent-scanner", VALID_PATENT_BODY)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("totalPatentsAnalyzed");
  });

  it("returns 400 for missing subject", async () => {
    const res = await patentPost(
      makePost("http://localhost/api/patent-scanner", {
        ideas: [{ title: "T", description: "D" }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty ideas array", async () => {
    const res = await patentPost(
      makePost("http://localhost/api/patent-scanner", {
        subject: "Test",
        ideas: [],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await patentPost(makeInvalidJsonRequest("http://localhost/api/patent-scanner"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for wrong content-type", async () => {
    const res = await patentPost(
      makePost("http://localhost/api/patent-scanner", VALID_PATENT_BODY, "text/plain")
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when scan fails", async () => {
    vi.mocked(runPatentScan).mockRejectedValueOnce(new Error("fail"));
    const res = await patentPost(
      makePost("http://localhost/api/patent-scanner", VALID_PATENT_BODY)
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/portfolio-optimize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_PORTFOLIO_BODY = {
    scores: [
      { feasibility: 8, impact: 7, novelty: 6, timeToImplement: "months", confidence: 0.8 },
      { feasibility: 5, impact: 9, novelty: 8, timeToImplement: "quarters", confidence: 0.6 },
    ],
  };

  it("returns optimized portfolio for valid input", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", VALID_PORTFOLIO_BODY)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("expectedReturn");
  });

  it("returns 400 for fewer than 2 scores", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", {
        scores: [
          { feasibility: 8, impact: 7, novelty: 6, timeToImplement: "months", confidence: 0.8 },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for out-of-range values", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", {
        scores: [
          { feasibility: 11, impact: 7, novelty: 6, timeToImplement: "months", confidence: 0.8 },
          { feasibility: 5, impact: 9, novelty: 8, timeToImplement: "quarters", confidence: 0.6 },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await portfolioPost(
      makeInvalidJsonRequest("http://localhost/api/portfolio-optimize")
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for wrong content-type", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", VALID_PORTFOLIO_BODY, "text/plain")
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when optimization fails", async () => {
    vi.mocked(optimizePortfolio).mockRejectedValueOnce(new Error("fail"));
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", VALID_PORTFOLIO_BODY)
    );
    expect(res.status).toBe(500);
  });

  it("applies default values for optional parameters", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", VALID_PORTFOLIO_BODY)
    );
    expect(res.status).toBe(200);
    expect(optimizePortfolio).toHaveBeenCalledWith(
      expect.objectContaining({
        riskFreeRate: 0.02,
        monteCarloSimulations: 5000,
        maxAllocationPerIdea: 0.4,
      })
    );
  });
});

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("indexes document for valid index action", async () => {
    const res = await searchPost(
      makePost("http://localhost/api/search", {
        action: "index",
        type: "idea",
        title: "Test Idea",
        content: "This is a test idea about innovation",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("id");
  });

  it("searches for valid search action", async () => {
    const res = await searchPost(
      makePost("http://localhost/api/search", {
        action: "search",
        query: "innovation AI",
      })
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for missing action", async () => {
    const res = await searchPost(makePost("http://localhost/api/search", { query: "test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty query in search", async () => {
    const res = await searchPost(
      makePost("http://localhost/api/search", {
        action: "search",
        query: "",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await searchPost(makeInvalidJsonRequest("http://localhost/api/search"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for wrong content-type", async () => {
    const res = await searchPost(makePost("http://localhost/api/search", {}, "text/plain"));
    expect(res.status).toBe(400);
  });

  it("returns 500 when search fails", async () => {
    vi.mocked(semanticSearch).mockRejectedValueOnce(new Error("fail"));
    const res = await searchPost(
      makePost("http://localhost/api/search", {
        action: "search",
        query: "test",
      })
    );
    expect(res.status).toBe(500);
  });
});
