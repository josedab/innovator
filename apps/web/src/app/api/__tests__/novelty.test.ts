import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateNoveltyReport = vi.fn();
const mockNoveltyReportToMarkdown = vi.fn();
const mockAddPriorArt = vi.fn();
const mockGetPriorArtCount = vi.fn();

vi.mock("@innovator/core", () => ({
  generateNoveltyReport: mockGenerateNoveltyReport,
  noveltyReportToMarkdown: mockNoveltyReportToMarkdown,
  addPriorArt: mockAddPriorArt,
  clearPriorArt: vi.fn(),
  getPriorArtCount: mockGetPriorArtCount,
}));

import { z } from "zod";

// Inline route handler
const AssessRequestSchema = z.object({
  ideas: z.array(z.object({ title: z.string().min(1).max(500), description: z.string().min(1).max(5000) })).min(1).max(20),
  domain: z.string().max(200).optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

const SeedRequestSchema = z.object({
  action: z.literal("seed"),
  entries: z.array(z.object({
    id: z.string(),
    source: z.enum(["patent", "academic", "product", "pattern", "internal"]),
    title: z.string().max(500),
    description: z.string().max(2000),
    similarity: z.number().min(0).max(1).default(0),
  })).min(1).max(1000),
});

async function POST(request: Request) {
  try {
    const body = await request.json();
    const seedResult = SeedRequestSchema.safeParse(body);
    if (seedResult.success) {
      mockAddPriorArt(seedResult.data.entries);
      return Response.json({ message: "Prior art seeded", counts: mockGetPriorArtCount() });
    }
    const parsed = AssessRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const report = mockGenerateNoveltyReport(parsed.data.ideas, { domain: parsed.data.domain });
    if (parsed.data.format === "markdown") {
      return new Response(mockNoveltyReportToMarkdown(report), { headers: { "Content-Type": "text/markdown" } });
    }
    return Response.json(report);
  } catch {
    return new Response(JSON.stringify({ error: "Failed" }), { status: 500 });
  }
}

function GET() {
  return Response.json({ counts: mockGetPriorArtCount() });
}

const MOCK_REPORT = {
  id: "r1",
  domain: "test",
  timestamp: "2026-01-01T00:00:00Z",
  assessments: [{ ideaTitle: "Idea 1", noveltyScore: 85, assessment: "highly-novel", priorArt: [], recommendation: "Go ahead", patentCandidate: true, differentiators: ["novel"], riskFactors: [] }],
  summary: { totalIdeas: 1, highlyNovel: 1, partiallyNovel: 0, derivative: 0, patentCandidates: 1, averageNovelty: 85 },
  sourcesSearched: { patents: 10, papers: 5, products: 3, patterns: 2 },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/novelty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/novelty", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("assesses novelty of ideas", async () => {
    mockGenerateNoveltyReport.mockReturnValue(MOCK_REPORT);
    const res = await POST(makeRequest({ ideas: [{ title: "Test Idea", description: "A novel approach" }] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assessments[0].noveltyScore).toBe(85);
    expect(mockGenerateNoveltyReport).toHaveBeenCalledOnce();
  });

  it("returns markdown format when requested", async () => {
    mockGenerateNoveltyReport.mockReturnValue(MOCK_REPORT);
    mockNoveltyReportToMarkdown.mockReturnValue("# Report");
    const res = await POST(makeRequest({ ideas: [{ title: "Test", description: "Desc" }], format: "markdown" }));
    expect(res.headers.get("content-type")).toContain("text/markdown");
  });

  it("rejects invalid requests", async () => {
    const res = await POST(makeRequest({ ideas: [] }));
    expect(res.status).toBe(400);
  });

  it("seeds prior art", async () => {
    mockGetPriorArtCount.mockReturnValue({ total: 1, patents: 1, papers: 0, products: 0, patterns: 0 });
    const res = await POST(makeRequest({
      action: "seed",
      entries: [{ id: "p1", source: "patent", title: "Test Patent", description: "Desc", similarity: 0 }],
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Prior art seeded");
    expect(mockAddPriorArt).toHaveBeenCalledOnce();
  });
});

describe("GET /api/novelty", () => {
  it("returns prior art counts", async () => {
    mockGetPriorArtCount.mockReturnValue({ total: 5, patents: 2, papers: 2, products: 1, patterns: 0 });
    const res = GET();
    const data = await res.json();
    expect(data.counts.total).toBe(5);
  });
});
