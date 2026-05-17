import { describe, it, expect, vi, beforeEach } from "vitest";

const mockService = {
  getOverview: vi.fn(),
  getVelocityChart: vi.fn(),
  getQualityHeatmap: vi.fn(),
  getTeamComparison: vi.fn(),
  getDrillDown: vi.fn(),
  getROISummary: vi.fn(),
  generateReport: vi.fn(),
  generateExecutiveSummary: vi.fn(),
};

vi.mock("@innovator/core", () => ({
  getDashboardService: vi.fn(() => mockService),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

import { POST } from "../app/api/dashboard/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/dashboard", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { validateJsonContentType } = await import("@/lib/validate-request");
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  it("returns overview data", async () => {
    mockService.getOverview.mockReturnValue({ sessions: 10, ideas: 50 });
    const res = await POST(makePost({ action: "overview" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toBe(10);
  });

  it("returns velocity chart data", async () => {
    mockService.getVelocityChart.mockReturnValue({ points: [1, 2, 3] });
    const res = await POST(makePost({ action: "velocity", granularity: "week" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.points).toEqual([1, 2, 3]);
  });

  it("returns heatmap data", async () => {
    mockService.getQualityHeatmap.mockReturnValue({ cells: [] });
    const res = await POST(makePost({ action: "heatmap" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cells).toEqual([]);
  });

  it("returns leaderboard data", async () => {
    mockService.getTeamComparison.mockReturnValue([{ team: "A", score: 90 }]);
    const res = await POST(makePost({ action: "leaderboard", limit: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ team: "A", score: 90 }]);
  });

  it("returns ROI summary", async () => {
    mockService.getROISummary.mockReturnValue({ roi: 3.5 });
    const res = await POST(makePost({ action: "roi_summary" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roi).toBe(3.5);
  });

  it("returns executive summary", async () => {
    mockService.generateExecutiveSummary.mockReturnValue({ summary: "All good" });
    const res = await POST(makePost({ action: "executive_summary", period: "last_7_days" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("All good");
  });

  it("returns report markdown", async () => {
    mockService.generateReport.mockReturnValue("# Report");
    const res = await POST(makePost({ action: "report", title: "Q4 Report" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe("# Report");
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(makePost({ action: "bad_action" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
