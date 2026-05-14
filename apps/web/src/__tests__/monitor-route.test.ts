// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  addMonitorSource: vi.fn((s: Record<string, unknown>) => ({ id: s.id ?? "src-1", ...s })),
  removeMonitorSource: vi.fn(),
  listMonitorSources: vi.fn(() => []),
  generateMonitorDigest: vi.fn(async () => ({
    period: "daily",
    signals: [],
    opportunities: [],
    summary: "No signals",
  })),
  monitorDigestToMarkdown: vi.fn(() => "# Digest"),
  getMonitorState: vi.fn(() => ({ running: false, sourceCount: 0 })),
  startMonitor: vi.fn(() => ({ running: true, sourceCount: 0, digestSchedule: "daily" })),
  stopMonitor: vi.fn(() => ({ running: false, sourceCount: 0 })),
  getRecentSignals: vi.fn(() => []),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn(() => null),
}));
vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import {
  addMonitorSource,
  getMonitorState,
  listMonitorSources,
  getRecentSignals,
  startMonitor,
  stopMonitor,
  generateMonitorDigest,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";
import { POST, GET } from "../app/api/monitor/route.js";

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/monitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/monitor");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

describe("API /api/monitor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(addMonitorSource).mockImplementation((s: Record<string, unknown>) => ({
      id: s.id ?? "src-1",
      ...s,
    }) as ReturnType<typeof addMonitorSource>);
    vi.mocked(getMonitorState).mockReturnValue({ running: false, sourceCount: 0 } as ReturnType<typeof getMonitorState>);
    vi.mocked(listMonitorSources).mockReturnValue([]);
    vi.mocked(getRecentSignals).mockReturnValue([]);
    vi.mocked(startMonitor).mockReturnValue({ running: true, sourceCount: 0, digestSchedule: "daily" } as ReturnType<typeof startMonitor>);
    vi.mocked(stopMonitor).mockReturnValue({ running: false, sourceCount: 0 } as ReturnType<typeof stopMonitor>);
    vi.mocked(generateMonitorDigest).mockResolvedValue({
      period: "daily",
      signals: [],
      opportunities: [],
      summary: "No signals",
    } as Awaited<ReturnType<typeof generateMonitorDigest>>);
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // ---- POST: Invalid input ----

  describe("POST — invalid input", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown action", async () => {
      const res = await POST(makePostRequest({ action: "unknown" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing action field", async () => {
      const res = await POST(makePostRequest({ foo: "bar" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: add-source ----

  describe("POST — add-source", () => {
    it("returns 201 with source on success", async () => {
      const res = await POST(
        makePostRequest({
          action: "add-source",
          source: {
            id: "src-test",
            type: "codebase",
            name: "Test Source",
            config: { repo: "test/repo" },
          },
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("src-test");
    });

    it("returns 400 when source is missing", async () => {
      const res = await POST(makePostRequest({ action: "add-source" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("source required");
    });
  });

  // ---- POST: remove-source ----

  describe("POST — remove-source", () => {
    it("returns 200 with removed sourceId", async () => {
      const res = await POST(
        makePostRequest({ action: "remove-source", sourceId: "src-1" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.removed).toBe("src-1");
    });

    it("returns 400 when sourceId is missing", async () => {
      const res = await POST(makePostRequest({ action: "remove-source" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("sourceId required");
    });
  });

  // ---- POST: start/stop ----

  describe("POST — start/stop", () => {
    it("start returns monitor state", async () => {
      const res = await POST(makePostRequest({ action: "start" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.running).toBe(true);
    });

    it("stop returns monitor state", async () => {
      const res = await POST(makePostRequest({ action: "stop" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.running).toBe(false);
    });
  });

  // ---- POST: generate-digest ----

  describe("POST — generate-digest", () => {
    it("returns digest on success", async () => {
      const res = await POST(makePostRequest({ action: "generate-digest" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.period).toBe("daily");
    });

    it("passes period parameter", async () => {
      const res = await POST(makePostRequest({ action: "generate-digest", period: "weekly" }));
      expect(res.status).toBe(200);
      expect(generateMonitorDigest).toHaveBeenCalledWith("weekly", undefined);
    });
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns monitor state by default", async () => {
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("running");
    });

    it("returns sources when view=sources", async () => {
      const res = await GET(makeGetRequest({ view: "sources" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("sources");
      expect(Array.isArray(body.sources)).toBe(true);
    });

    it("returns signals when view=signals", async () => {
      const res = await GET(makeGetRequest({ view: "signals" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("signals");
      expect(Array.isArray(body.signals)).toBe(true);
    });
  });
});
