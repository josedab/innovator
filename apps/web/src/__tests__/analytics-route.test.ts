import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  generateSummary: vi.fn(),
  generateInsights: vi.fn(),
  trackEvent: vi.fn(),
  getTimeSeries: vi.fn(),
  getActivityHeatmap: vi.fn(),
  getLeaderboard: vi.fn(),
  generateReport: vi.fn(),
  reportToMarkdown: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/analytics/route.js";
import {
  generateSummary,
  generateInsights,
  trackEvent,
  getTimeSeries,
  getActivityHeatmap,
  getLeaderboard,
  generateReport,
  reportToMarkdown,
} from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/analytics");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- GET ---

  describe("GET default summary", () => {
    it("returns summary and insights", async () => {
      vi.mocked(generateSummary).mockReturnValue({ sessions: 10 } as never);
      vi.mocked(generateInsights).mockReturnValue([{ text: "insight" }] as never);

      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.summary).toEqual({ sessions: 10 });
      expect(data.insights).toHaveLength(1);
    });
  });

  describe("GET view=timeseries", () => {
    it("returns time series data", async () => {
      vi.mocked(getTimeSeries).mockReturnValue([{ date: "2024-01-01", value: 5 }] as never);

      const res = await GET(makeGet({ view: "timeseries", metric: "ideas", granularity: "week" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.timeSeries).toBeDefined();
      expect(getTimeSeries).toHaveBeenCalledWith(
        "ideas",
        expect.objectContaining({ granularity: "week" })
      );
    });
  });

  describe("GET view=heatmap", () => {
    it("returns heatmap data", async () => {
      vi.mocked(getActivityHeatmap).mockReturnValue({ cells: [] } as never);

      const res = await GET(makeGet({ view: "heatmap", type: "angle-topic" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.heatmap).toBeDefined();
      expect(getActivityHeatmap).toHaveBeenCalledWith("angle-topic");
    });
  });

  describe("GET view=leaderboard", () => {
    it("returns leaderboard data", async () => {
      vi.mocked(getLeaderboard).mockReturnValue([{ userId: "u1" }] as never);

      const res = await GET(makeGet({ view: "leaderboard", metric: "quality", limit: "5" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.leaderboard).toBeDefined();
      expect(getLeaderboard).toHaveBeenCalledWith("quality", 5);
    });
  });

  describe("GET view=report", () => {
    it("returns report JSON by default", async () => {
      vi.mocked(generateReport).mockReturnValue({ title: "Report" } as never);

      const res = await GET(makeGet({ view: "report" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.report).toBeDefined();
    });

    it("returns markdown when format=markdown", async () => {
      vi.mocked(generateReport).mockReturnValue({ title: "Report" } as never);
      vi.mocked(reportToMarkdown).mockReturnValue("# Report");

      const res = await GET(makeGet({ view: "report", format: "markdown" }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/markdown");
      const text = await res.text();
      expect(text).toBe("# Report");
    });
  });

  describe("GET error handling", () => {
    it("returns 500 on internal error", async () => {
      vi.mocked(generateSummary).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await GET(makeGet());
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Failed to generate analytics");
    });
  });

  // --- POST ---

  describe("POST valid event", () => {
    it("tracks event with type and data", async () => {
      vi.mocked(trackEvent).mockReturnValue({ id: "e1", type: "click" } as never);

      const res = await POST(makePost({ type: "click", data: { page: "home" } }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.event).toBeDefined();
      expect(trackEvent).toHaveBeenCalledWith("click", { page: "home" });
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("POST missing type", () => {
    it("returns 400", async () => {
      const res = await POST(makePost({ data: { page: "home" } }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid event data");
    });
  });

  describe("POST error handling", () => {
    it("returns 500 on internal error", async () => {
      vi.mocked(trackEvent).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await POST(makePost({ type: "click" }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Failed to track event");
    });
  });
});
