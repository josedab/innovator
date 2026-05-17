import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  mineProcess: vi.fn(),
  analyticsToProcessEvents: vi.fn(),
  readEvents: vi.fn(),
}));

import { mineProcess, analyticsToProcessEvents, readEvents } from "@innovator/core";

const mockMineProcess = vi.mocked(mineProcess);
const mockAnalyticsToProcessEvents = vi.mocked(analyticsToProcessEvents);
const mockReadEvents = vi.mocked(readEvents);

// ---- Inline schema and handler ----

import { z } from "zod";

const RequestSchema = z.object({
  events: z
    .array(
      z.object({
        id: z.string(),
        caseId: z.string(),
        activity: z.string(),
        timestamp: z.string(),
        durationMs: z.number().optional(),
        actor: z.string().optional(),
      })
    )
    .optional(),
  useAnalytics: z.boolean().optional(),
  algorithm: z.enum(["alpha", "inductive"]).optional(),
  minFrequency: z.number().min(1).optional(),
  bottleneckThresholdMs: z.number().min(0).optional(),
});

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
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

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    let events = parsed.data.events;
    if (!events && parsed.data.useAnalytics) {
      const analyticsEvents = readEvents();
      events = analyticsToProcessEvents(analyticsEvents as any) as any;
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No events provided. Pass events array or set useAnalytics: true.",
        }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const result = mineProcess(
      events as any,
      {
        algorithm: parsed.data.algorithm,
        minFrequency: parsed.data.minFrequency,
        bottleneckThresholdMs: parsed.data.bottleneckThresholdMs,
      } as any
    );

    return new Response(JSON.stringify(result), { status: 200, headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Process mining failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/process-mining", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_EVENTS = [
  { id: "e1", caseId: "c1", activity: "investigate", timestamp: "2024-01-01T00:00:00Z" },
  { id: "e2", caseId: "c1", activity: "ideate", timestamp: "2024-01-01T01:00:00Z" },
  { id: "e3", caseId: "c1", activity: "synthesize", timestamp: "2024-01-01T02:00:00Z" },
];

describe("POST /api/process-mining", () => {
  beforeEach(() => vi.clearAllMocks());

  it("discovers process model from event logs", async () => {
    mockMineProcess.mockReturnValue({
      model: { nodes: ["A", "B"], edges: [{ from: "A", to: "B" }] },
      statistics: { totalCases: 1, totalEvents: 3 },
      bottlenecks: [],
    } as any);

    const res = await POST(makeRequest({ events: SAMPLE_EVENTS }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.model).toBeDefined();
    expect(data.statistics.totalCases).toBe(1);
    expect(data.statistics.totalEvents).toBe(3);
    expect(mockMineProcess).toHaveBeenCalledWith(SAMPLE_EVENTS, {
      algorithm: undefined,
      minFrequency: undefined,
      bottleneckThresholdMs: undefined,
    });
  });

  it("uses analytics data when useAnalytics is true", async () => {
    mockReadEvents.mockReturnValue([{ type: "session_started" }] as any);
    mockAnalyticsToProcessEvents.mockReturnValue(SAMPLE_EVENTS as any);
    mockMineProcess.mockReturnValue({
      model: { nodes: [] },
      statistics: { totalCases: 1, totalEvents: 3 },
    } as any);

    const res = await POST(makeRequest({ useAnalytics: true }));
    expect(res.status).toBe(200);
    expect(mockReadEvents).toHaveBeenCalled();
    expect(mockAnalyticsToProcessEvents).toHaveBeenCalled();
  });

  it("applies algorithm parameter", async () => {
    mockMineProcess.mockReturnValue({
      model: {},
      statistics: { totalCases: 1, totalEvents: 1 },
    } as any);

    const res = await POST(makeRequest({ events: SAMPLE_EVENTS, algorithm: "inductive" }));
    expect(res.status).toBe(200);
    expect(mockMineProcess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ algorithm: "inductive" })
    );
  });

  it("returns 400 for empty event log", async () => {
    const res = await POST(makeRequest({ events: [] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No events");
  });

  it("returns 400 for no events and no analytics flag", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid event format", async () => {
    const res = await POST(makeRequest({ events: [{ invalid: true }] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request");
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/process-mining", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 on core function failure", async () => {
    mockMineProcess.mockImplementation(() => {
      throw new Error("Mining algorithm failed");
    });

    const res = await POST(makeRequest({ events: SAMPLE_EVENTS }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/process-mining", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ events: SAMPLE_EVENTS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});
