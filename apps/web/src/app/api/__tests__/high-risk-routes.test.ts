import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---- Mock core modules ----
vi.mock("@innovator/core", () => ({
  recordBiasActivity: vi.fn(),
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
  indexDocument: vi.fn().mockReturnValue({ id: "doc-1", size: 100 }),
  semanticSearch: vi.fn().mockReturnValue({ results: [], total: 0 }),
  findSimilarDocuments: vi.fn().mockResolvedValue([]),
  clusterDocuments: vi.fn().mockResolvedValue({ clusters: [] }),
  discoverConnections: vi.fn().mockResolvedValue({ connections: [] }),
  getIndexSize: vi.fn().mockReturnValue(0),
  runPatentScan: vi.fn().mockResolvedValue({ results: [], totalPatentsAnalyzed: 0 }),
  optimizePortfolio: vi.fn().mockReturnValue({ allocations: [], expectedReturn: 0 }),
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
import { POST as biasPost } from "../bias/route";
import { GET as costReportRouteGet } from "../cost-report/route";
import { POST as patentPost } from "../patent-scanner/route";
import { POST as portfolioPost } from "../portfolio-optimize/route";
import { POST as searchPost } from "../search/route";

function costReportGet() {
  return costReportRouteGet(new Request("http://localhost/api/cost-report"));
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
    expect(data.success).toBe(true);
    expect(recordBiasActivity).toHaveBeenCalledWith({
      userId: "user-1",
      activityType: "evaluate",
    });
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

  it("returns 415 for wrong content-type", async () => {
    const res = await biasPost(makePost("http://localhost/api/bias", {}, "text/plain"));
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toContain("Content-Type");
  });

  it("returns 500 when core function throws", async () => {
    vi.mocked(recordBiasActivity).mockImplementationOnce(() => {
      throw new Error("fail");
    });
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
    ideas: [
      {
        title: "Smart Diff",
        description: "AI analyzes code diffs for quality",
        potentialImpact: "",
        implementationHint: "",
      },
    ],
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

  it("returns 415 for wrong content-type", async () => {
    const res = await patentPost(
      makePost("http://localhost/api/patent-scanner", VALID_PATENT_BODY, "text/plain")
    );
    expect(res.status).toBe(415);
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
      {
        ideaTitle: "Idea A",
        angleId: "scamper",
        feasibility: 8,
        impact: 7,
        novelty: 6,
        timeToImplement: "months",
        confidence: 0.8,
        rationale: "Balanced option",
      },
      {
        ideaTitle: "Idea B",
        angleId: "inversion",
        feasibility: 5,
        impact: 9,
        novelty: 8,
        timeToImplement: "quarters",
        confidence: 0.6,
        rationale: "Higher upside",
      },
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
          {
            ideaTitle: "Idea A",
            angleId: "scamper",
            feasibility: 8,
            impact: 7,
            novelty: 6,
            timeToImplement: "months",
            confidence: 0.8,
            rationale: "Only option",
          },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for out-of-range values", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", {
        scores: [
          {
            ideaTitle: "Idea A",
            angleId: "scamper",
            feasibility: 11,
            impact: 7,
            novelty: 6,
            timeToImplement: "months",
            confidence: 0.8,
            rationale: "Invalid feasibility",
          },
          {
            ideaTitle: "Idea B",
            angleId: "inversion",
            feasibility: 5,
            impact: 9,
            novelty: 8,
            timeToImplement: "quarters",
            confidence: 0.6,
            rationale: "Valid comparison",
          },
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

  it("returns 415 for wrong content-type", async () => {
    const res = await portfolioPost(
      makePost("http://localhost/api/portfolio-optimize", VALID_PORTFOLIO_BODY, "text/plain")
    );
    expect(res.status).toBe(415);
  });

  it("returns 500 when optimization fails", async () => {
    vi.mocked(optimizePortfolio).mockImplementationOnce(() => {
      throw new Error("fail");
    });
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
    expect(optimizePortfolio).toHaveBeenCalledWith(VALID_PORTFOLIO_BODY.scores, {
      riskFreeRate: 0.02,
      monteCarloSimulations: 5000,
      maxAllocationPerIdea: 0.4,
    });
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
    expect(data.document).toHaveProperty("id", "doc-1");
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

  it("returns 500 for invalid JSON", async () => {
    const res = await searchPost(makeInvalidJsonRequest("http://localhost/api/search"));
    expect(res.status).toBe(500);
  });

  it("returns 415 for wrong content-type", async () => {
    const res = await searchPost(makePost("http://localhost/api/search", {}, "text/plain"));
    expect(res.status).toBe(415);
  });

  it("returns 500 when search fails", async () => {
    vi.mocked(semanticSearch).mockImplementationOnce(() => {
      throw new Error("fail");
    });
    const res = await searchPost(
      makePost("http://localhost/api/search", {
        action: "search",
        query: "test",
      })
    );
    expect(res.status).toBe(500);
  });
});
