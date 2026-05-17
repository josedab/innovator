/**
 * Tests for /api/upload route (POST with validate, analyze-image, process actions).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCore = vi.hoisted(() => ({
  processExtendedMultiModalInput: vi.fn(),
  analyzeImage: vi.fn(),
  visionToSubject: vi.fn(),
  validateBase64Image: vi.fn(),
}));

vi.mock("@innovator/core", () => mockCore);

vi.mock("../../../lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../upload/route";

// ---- Helpers ----

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockCore.validateBase64Image.mockReturnValue({ valid: true });
  mockCore.analyzeImage.mockResolvedValue({
    description: "A whiteboard sketch",
    elements: [],
  });
  mockCore.visionToSubject.mockReturnValue("Whiteboard ideas");
  mockCore.processExtendedMultiModalInput.mockResolvedValue({
    context: "Combined context",
    parseResults: [],
  });
});

describe("/api/upload", () => {
  describe("POST action=validate", () => {
    it("validates a valid image", async () => {
      const req = createRequest({
        action: "validate",
        imageData: "data:image/png;base64,iVBORw0KGgo=",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.validation).toEqual({ valid: true });
      expect(mockCore.validateBase64Image).toHaveBeenCalledWith(
        "data:image/png;base64,iVBORw0KGgo=",
        undefined
      );
    });

    it("passes maxSizeMB to validator", async () => {
      const req = createRequest({
        action: "validate",
        imageData: "data:image/png;base64,abc=",
        maxSizeMB: 5,
      });
      await POST(req);
      expect(mockCore.validateBase64Image).toHaveBeenCalledWith("data:image/png;base64,abc=", 5);
    });
  });

  describe("POST action=analyze-image", () => {
    it("analyzes image and returns subject", async () => {
      const req = createRequest({
        action: "analyze-image",
        imageData: "data:image/png;base64,abc=",
        imageType: "whiteboard",
        context: "brainstorming session",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.analysis).toBeDefined();
      expect(body.subject).toBe("Whiteboard ideas");
      expect(mockCore.analyzeImage).toHaveBeenCalledWith(
        "data:image/png;base64,abc=",
        expect.objectContaining({ imageType: "whiteboard", context: "brainstorming session" })
      );
    });

    it("returns 400 when image validation fails", async () => {
      mockCore.validateBase64Image.mockReturnValue({
        valid: false,
        error: "Image too large",
      });

      const req = createRequest({
        action: "analyze-image",
        imageData: "bad-data",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Image too large");
    });

    it("returns 400 when analyzeImage throws", async () => {
      mockCore.analyzeImage.mockRejectedValue(new Error("Vision API failed"));

      const req = createRequest({
        action: "analyze-image",
        imageData: "data:image/png;base64,abc=",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Vision API failed");
    });
  });

  describe("POST action=process", () => {
    it("processes multimodal input with attachments", async () => {
      const req = createRequest({
        action: "process",
        subject: "Innovation research",
        attachments: [
          { id: "att-1", type: "image", name: "photo.png" },
          { id: "att-2", type: "pdf", name: "report.pdf" },
          { id: "att-3", type: "audio", name: "recording.mp3" },
        ],
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.context).toBe("Combined context");
      expect(body.parseResults).toBeDefined();
    });

    it("works with empty attachments", async () => {
      const req = createRequest({
        action: "process",
        subject: "Just text",
        attachments: [],
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe("validation errors", () => {
    it("returns 400 for invalid action", async () => {
      const req = createRequest({
        action: "nonexistent",
        imageData: "abc",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for context notes exceeding 5000 chars", async () => {
      const req = createRequest({
        action: "process",
        subject: "Test",
        contextNotes: "x".repeat(5001),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for >10 attachments", async () => {
      const attachments = Array.from({ length: 11 }, (_, i) => ({
        id: `att-${i}`,
        type: "image",
        name: `file-${i}.png`,
      }));
      const req = createRequest({
        action: "process",
        subject: "Test",
        attachments,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when analyze-image has empty imageData", async () => {
      const req = createRequest({
        action: "analyze-image",
        imageData: "",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });
});
