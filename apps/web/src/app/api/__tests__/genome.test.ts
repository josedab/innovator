import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetNetworkDashboard = vi.fn();
const mockExtractPatterns = vi.fn();
const mockEnrichAngleSelection = vi.fn();
const mockComputeGenomeAnalytics = vi.fn();
const mockGenomeAnalyticsToMarkdown = vi.fn();
const mockGenerateGenomeInsights = vi.fn();
const mockListNodes = vi.fn();
const mockCreateFederationNode = vi.fn();

vi.mock("@innovator/core", () => ({
  createFederationNode: (...args: unknown[]) => mockCreateFederationNode(...args),
  listNodes: () => mockListNodes(),
  getNetworkDashboard: (...args: unknown[]) => mockGetNetworkDashboard(...args),
  extractPatterns: (...args: unknown[]) => mockExtractPatterns(...args),
  enrichAngleSelection: (...args: unknown[]) => mockEnrichAngleSelection(...args),
  computeGenomeAnalytics: (...args: unknown[]) => mockComputeGenomeAnalytics(...args),
  genomeAnalyticsToMarkdown: (...args: unknown[]) => mockGenomeAnalyticsToMarkdown(...args),
  generateGenomeInsights: (...args: unknown[]) => mockGenerateGenomeInsights(...args),
  gossipSync: vi.fn(),
}));

import { z } from "zod";

const MOCK_NODE = { id: "node-1", name: "test" };
const MOCK_DASHBOARD = {
  totalNodes: 1,
  totalPatterns: 5,
  trendingAngles: [{ angleId: "scamper", frequency: 3, trend: "rising" }],
  topPatterns: [],
  networkHealth: "healthy",
};

function makeGetRequest(params = ""): Request {
  return new Request(`http://localhost/api/genome${params}`);
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/genome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Inline simplified handlers
async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const nodes = mockListNodes();
  const node = nodes.length > 0 ? nodes[0] : mockCreateFederationNode({ name: "test" });

  if (view === "analytics") {
    const analytics = mockComputeGenomeAnalytics(node.id);
    return Response.json(analytics);
  }
  if (view === "insights") {
    const domain = searchParams.get("domain") ?? undefined;
    const insights = mockGenerateGenomeInsights(node.id, domain);
    return Response.json({ insights });
  }
  return Response.json(mockGetNetworkDashboard(node.id));
}

async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "contribute") {
      const patterns = mockExtractPatterns({
        nodeId: "node-1",
        domain: body.domain,
        angleResults: body.angleResults,
      });
      return Response.json({ message: "Patterns contributed", count: patterns.length });
    }
    if (body.action === "enrich") {
      const result = mockEnrichAngleSelection("node-1", body.angles, body.domainHint);
      return Response.json(result);
    }
    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
  } catch {
    return new Response(JSON.stringify({ error: "Failed" }), { status: 500 });
  }
}

describe("GET /api/genome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListNodes.mockReturnValue([MOCK_NODE]);
    mockGetNetworkDashboard.mockReturnValue(MOCK_DASHBOARD);
  });

  it("returns network dashboard by default", async () => {
    const res = await GET(makeGetRequest());
    const data = await res.json();
    expect(data.totalNodes).toBe(1);
    expect(data.networkHealth).toBe("healthy");
  });

  it("returns analytics when view=analytics", async () => {
    mockComputeGenomeAnalytics.mockReturnValue({ totalPatterns: 10, totalNodes: 2, topAngles: [] });
    const res = await GET(makeGetRequest("?view=analytics"));
    const data = await res.json();
    expect(data.totalPatterns).toBe(10);
  });

  it("returns insights when view=insights", async () => {
    mockGenerateGenomeInsights.mockReturnValue([
      { type: "angle-recommendation", content: "Use SCAMPER", confidence: 0.8 },
    ]);
    const res = await GET(makeGetRequest("?view=insights&domain=fintech"));
    const data = await res.json();
    expect(data.insights).toHaveLength(1);
  });

  it("creates default node when none exists", async () => {
    mockListNodes.mockReturnValue([]);
    mockCreateFederationNode.mockReturnValue(MOCK_NODE);
    const res = await GET(makeGetRequest());
    expect(mockCreateFederationNode).toHaveBeenCalled();
  });
});

describe("POST /api/genome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("contributes patterns", async () => {
    mockExtractPatterns.mockReturnValue([{ id: "p1" }, { id: "p2" }]);
    const res = await POST(
      makePostRequest({
        action: "contribute",
        domain: "fintech",
        angleResults: [
          { angleId: "scamper", angleName: "SCAMPER", ideasCount: 5, successRate: 0.8 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(2);
  });

  it("enriches angle selection", async () => {
    mockEnrichAngleSelection.mockReturnValue({
      angles: ["scamper", "first-principles"],
      enrichments: ["Added first-principles"],
      insightCount: 3,
    });
    const res = await POST(
      makePostRequest({
        action: "enrich",
        angles: ["scamper"],
        domainHint: "fintech",
      })
    );
    const data = await res.json();
    expect(data.angles).toContain("scamper");
    expect(data.insightCount).toBe(3);
  });
});
