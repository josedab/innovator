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

import { GET, POST } from "../genome/route";

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
