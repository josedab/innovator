import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", () => ({
  ingestTranscript: vi.fn(),
  extractSignals: vi.fn().mockResolvedValue({
    signals: [{ type: "innovation-opportunity", confidence: 0.9, text: "Great idea" }],
  }),
  getExtractionResult: vi.fn(),
  getHighConfidenceSignals: vi.fn().mockReturnValue([]),
  getSuggestedInvestigations: vi.fn().mockReturnValue([]),
  MeetingTranscriptSchema: z.object({
    id: z.string().min(1).max(200),
    platform: z.enum(["zoom", "teams", "google-meet", "generic"]),
    title: z.string().max(500),
    date: z.string(),
    duration: z.number().min(0),
    participants: z
      .array(
        z.object({
          name: z.string().max(200),
          role: z.string().max(200).optional(),
        })
      )
      .max(100),
    segments: z
      .array(
        z.object({
          speaker: z.string().max(200),
          timestamp: z.string().max(20),
          text: z.string().max(10_000),
        })
      )
      .max(5000),
    rawText: z.string().max(500_000).optional(),
  }),
}));

import { ingestTranscript, extractSignals, getExtractionResult } from "@innovator/core";
import { GET, POST } from "../meeting-intelligence/route";

const mockExtractSignals = vi.mocked(extractSignals);
const mockGetExtractionResult = vi.mocked(getExtractionResult);
const mockIngestTranscript = vi.mocked(ingestTranscript);

const validTranscript = {
  id: "meeting-1",
  platform: "zoom",
  title: "Sprint Planning",
  date: "2025-01-15T10:00:00Z",
  duration: 30,
  participants: [{ name: "Alice", role: "PM" }],
  segments: [{ speaker: "Alice", timestamp: "00:01", text: "Let's discuss the roadmap." }],
};

describe("POST /api/meeting-intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ingests a valid transcript", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ingest", transcript: validTranscript }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.meetingId).toBe("meeting-1");
    expect(mockIngestTranscript).toHaveBeenCalledTimes(1);
  });

  it("extracts signals from a transcript", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract", transcriptId: "meeting-1" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signals).toHaveLength(1);
    expect(data.signals[0].confidence).toBe(0.9);
  });

  it("returns 400 for missing required fields", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract" }), // missing transcriptId
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request");
  });

  it("returns 400 for invalid action", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unknown" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 415 for non-JSON content type", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });

    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("returns 500 when extractSignals throws", async () => {
    mockExtractSignals.mockRejectedValueOnce(new Error("LLM failed"));

    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract", transcriptId: "m1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 400 for empty transcript (missing required fields)", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ingest", transcript: {} }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/meeting-intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no query parameter provided", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("meetingId");
  });

  it("returns 404 for non-existent meeting extraction", async () => {
    mockGetExtractionResult.mockReturnValue(undefined as never);
    const req = new Request("http://localhost/api/meeting-intelligence?meetingId=unknown");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns extraction result for valid meetingId", async () => {
    mockGetExtractionResult.mockReturnValue({ signals: [{ text: "test" }] } as never);
    const req = new Request("http://localhost/api/meeting-intelligence?meetingId=m1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.signals).toHaveLength(1);
  });

  it("returns suggestions when suggestions=true", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence?suggestions=true");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns high confidence signals with minConfidence param", async () => {
    const req = new Request("http://localhost/api/meeting-intelligence?minConfidence=0.8");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
