import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  processVoiceCapture: vi.fn(),
  processCameraCapture: vi.fn(),
  createTextCapture: vi.fn(),
  getMobileCaptures: vi.fn(),
  getSyncState: vi.fn(),
  getUnreadNotifications: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
  validateModel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/mobile/route.js";
import {
  processVoiceCapture,
  processCameraCapture,
  createTextCapture,
  getMobileCaptures,
  getSyncState,
  getUnreadNotifications,
} from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/mobile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/mobile");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

describe("API /api/mobile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
  });

  // --- POST: text capture ---

  describe("POST text capture", () => {
    it("processes text capture successfully", async () => {
      vi.mocked(createTextCapture).mockReturnValue({
        id: "cap-1",
        type: "text",
        text: "My idea",
      } as never);
      const res = await POST(makePost({ action: "text", text: "My idea" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("cap-1");
    });

    it("processes text capture with subject", async () => {
      vi.mocked(createTextCapture).mockReturnValue({ id: "cap-2" } as never);
      const res = await POST(makePost({ action: "text", text: "Idea", subject: "AI" }));
      expect(res.status).toBe(200);
      expect(createTextCapture).toHaveBeenCalledWith("Idea", "AI");
    });
  });

  // --- POST: voice capture ---

  describe("POST voice capture", () => {
    it("processes voice capture successfully", async () => {
      vi.mocked(processVoiceCapture).mockResolvedValue({ id: "cap-v1", type: "voice" } as never);
      const res = await POST(makePost({ action: "voice", transcript: "Voice idea here" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("cap-v1");
    });

    it("returns 400 when model validation fails", async () => {
      vi.mocked(validateModel).mockReturnValue(
        new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
      );
      const res = await POST(makePost({ action: "voice", transcript: "Test", model: "bad" }));
      expect(res.status).toBe(400);
    });
  });

  // --- POST: camera capture ---

  describe("POST camera capture", () => {
    it("processes camera capture successfully", async () => {
      vi.mocked(processCameraCapture).mockResolvedValue({ id: "cap-c1", type: "camera" } as never);
      const res = await POST(makePost({ action: "camera", ocrText: "Whiteboard text" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("cap-c1");
    });
  });

  // --- POST: error paths ---

  describe("POST error paths", () => {
    it("returns 400 for invalid capture type", async () => {
      const res = await POST(makePost({ action: "scan", data: "test" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing content (text)", async () => {
      const res = await POST(makePost({ action: "text" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing transcript (voice)", async () => {
      const res = await POST(makePost({ action: "voice" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty text", async () => {
      const res = await POST(makePost({ action: "text", text: "" }));
      expect(res.status).toBe(400);
    });

    it("returns content-type error when validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
          status: 415,
        })
      );
      const res = await POST(makePost({ action: "text", text: "test" }));
      expect(res.status).toBe(415);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/mobile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{{invalid",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(processVoiceCapture).mockRejectedValue(new Error("LLM down"));
      const res = await POST(makePost({ action: "voice", transcript: "test" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("failed");
    });
  });

  // --- GET endpoints ---

  describe("GET", () => {
    it("returns captures by type", async () => {
      vi.mocked(getMobileCaptures).mockReturnValue([{ id: "c1" }] as never);
      const res = await GET(makeGet({ type: "voice" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });

    it("returns sync state by deviceId", async () => {
      vi.mocked(getSyncState).mockReturnValue({ synced: true } as never);
      const res = await GET(makeGet({ deviceId: "d1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.synced).toBe(true);
    });

    it("returns unread notifications", async () => {
      vi.mocked(getUnreadNotifications).mockReturnValue([{ id: "n1" }] as never);
      const res = await GET(makeGet({ notifications: "true" }));
      expect(res.status).toBe(200);
    });

    it("returns all captures when no type filter", async () => {
      vi.mocked(getMobileCaptures).mockReturnValue([] as never);
      const res = await GET(makeGet({}));
      expect(res.status).toBe(200);
    });

    it("returns 500 on GET error", async () => {
      vi.mocked(getMobileCaptures).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await GET(makeGet({}));
      expect(res.status).toBe(500);
    });
  });
});
