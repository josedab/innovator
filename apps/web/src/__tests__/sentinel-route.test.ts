import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  runSentinel: vi.fn(),
  loadSentinelState: vi.fn(),
  loadSentinelBriefs: vi.fn(),
  sentinelBriefToMarkdown: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/sentinel/route.js";
import { loadSentinelState, loadSentinelBriefs, runSentinel } from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/sentinel");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/sentinel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/sentinel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET returns sentinel state by default", async () => {
    vi.mocked(loadSentinelState).mockReturnValue({
      totalRuns: 3,
      totalSignals: 50,
      totalOpportunities: 5,
      processedSignalIds: [],
      estimatedCostToDate: 0.45,
    });
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalRuns).toBe(3);
  });

  it("GET action=briefs returns past briefs", async () => {
    vi.mocked(loadSentinelBriefs).mockReturnValue([
      {
        id: "brief-2026-05-13",
        date: "2026-05-13",
        signalsDetected: 10,
        signalsProcessed: 3,
        opportunities: [],
        createdAt: "2026-05-13T10:00:00Z",
      },
    ]);
    const res = await GET(makeGet({ action: "briefs" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
  });

  it("POST validates required config fields", async () => {
    const res = await POST(makePost({ sources: [] }));
    expect(res.status).toBe(400);
  });

  it("POST runs sentinel with valid config", async () => {
    vi.mocked(runSentinel).mockResolvedValue({
      id: "brief-2026-05-13",
      date: "2026-05-13",
      signalsDetected: 5,
      signalsProcessed: 2,
      opportunities: [],
      createdAt: "2026-05-13T10:00:00Z",
    });
    const res = await POST(
      makePost({
        action: "run",
        sources: [
          {
            id: "hn",
            type: "rss",
            name: "HN",
            url: "https://news.ycombinator.com/rss",
            enabled: true,
          },
        ],
        topics: ["AI", "innovation"],
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.signalsDetected).toBe(5);
  });

  it("POST returns 500 on sentinel failure", async () => {
    vi.mocked(runSentinel).mockRejectedValue(new Error("Network error"));
    const res = await POST(
      makePost({
        action: "run",
        sources: [{ id: "t", type: "rss", name: "T", url: "http://x.com", enabled: true }],
        topics: ["AI"],
      })
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Network error");
  });
});
