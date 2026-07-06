import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getObservatoryStats: vi.fn(),
  getCallTimeline: vi.fn(),
  diffPromptCalls: vi.fn(),
}));

import { getObservatoryStats, getCallTimeline, diffPromptCalls } from "@innovator/core";
import { GET } from "../observatory/route";

const mockGetStats = vi.mocked(getObservatoryStats);
const mockGetTimeline = vi.mocked(getCallTimeline);
const mockDiffCalls = vi.mocked(diffPromptCalls);

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/observatory");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("GET /api/observatory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("action=stats", () => {
    it("returns 200 with stats data", async () => {
      const mockStats = { totalCalls: 42, modelDistribution: { "gpt-4": 30, "gpt-3.5": 12 } };
      mockGetStats.mockReturnValue(mockStats as any);

      const res = await GET(makeRequest({ action: "stats" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.totalCalls).toBe(42);
      expect(data.modelDistribution).toBeDefined();
    });

    it("defaults to stats when no action param", async () => {
      mockGetStats.mockReturnValue({ totalCalls: 0 } as any);

      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      expect(mockGetStats).toHaveBeenCalled();
    });
  });

  describe("action=timeline", () => {
    it("returns array of calls", async () => {
      mockGetTimeline.mockReturnValue([{ id: "call-1" }] as any);

      const res = await GET(makeRequest({ action: "timeline" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.calls).toHaveLength(1);
    });

    it("passes limit param to core function", async () => {
      mockGetTimeline.mockReturnValue([] as any);

      await GET(makeRequest({ action: "timeline", limit: "10" }));
      expect(mockGetTimeline).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });

    it("passes stage and model filter params", async () => {
      mockGetTimeline.mockReturnValue([] as any);

      await GET(makeRequest({ action: "timeline", stage: "investigate", model: "gpt-4" }));
      expect(mockGetTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "investigate", model: "gpt-4" })
      );
    });
  });

  describe("action=diff", () => {
    it("returns comparison for valid IDs", async () => {
      mockDiffCalls.mockReturnValue({ diff: "changes" } as any);

      const res = await GET(makeRequest({ action: "diff", a: "id1", b: "id2" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.diff).toBe("changes");
    });

    it("returns 400 when missing params", async () => {
      const res = await GET(makeRequest({ action: "diff", a: "id1" }));
      expect(res.status).toBe(400);

      const res2 = await GET(makeRequest({ action: "diff" }));
      expect(res2.status).toBe(400);
    });

    it("returns 404 when calls not found", async () => {
      mockDiffCalls.mockReturnValue(undefined as any);

      const res = await GET(makeRequest({ action: "diff", a: "x", b: "y" }));
      expect(res.status).toBe(404);
    });
  });

  describe("unknown action", () => {
    it("returns 400", async () => {
      const res = await GET(makeRequest({ action: "bogus" }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Unknown action");
    });
  });

  describe("error handling", () => {
    it("returns 500 when core function throws", async () => {
      mockGetStats.mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const res = await GET(makeRequest({ action: "stats" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toContain("DB connection lost");
    });
  });
});
