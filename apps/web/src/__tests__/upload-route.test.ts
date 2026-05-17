import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  processExtendedMultiModalInput: vi.fn(),
  analyzeImage: vi.fn(),
  visionToSubject: vi.fn(),
  validateBase64Image: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/upload/route.js";
import {
  processExtendedMultiModalInput as processMultiModalInput,
  analyzeImage,
  visionToSubject,
  validateBase64Image as validateImage,
} from "@innovator/core";

const mockValidateImage = vi.mocked(validateImage);
const mockAnalyzeImage = vi.mocked(analyzeImage);
const mockVisionToSubject = vi.mocked(visionToSubject);
const mockProcessInput = vi.mocked(processMultiModalInput);

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("action=validate", () => {
    it("validates a valid image", async () => {
      mockValidateImage.mockReturnValue({ valid: true, sizeBytes: 1024 } as never);

      const res = await POST(
        makePostRequest({
          action: "validate",
          imageData: "data:image/png;base64,iVBOR...",
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.validation.valid).toBe(true);
    });

    it("validates an invalid image", async () => {
      mockValidateImage.mockReturnValue({
        valid: false,
        error: "Too large",
        sizeBytes: 99999999,
      } as never);

      const res = await POST(
        makePostRequest({
          action: "validate",
          imageData: "data:image/png;base64,big...",
        })
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.validation.error).toBe("Too large");
    });

    it("passes custom maxSizeMB", async () => {
      mockValidateImage.mockReturnValue({ valid: true, sizeBytes: 1024 } as never);

      await POST(
        makePostRequest({
          action: "validate",
          imageData: "data:image/png;base64,abc",
          maxSizeMB: 20,
        })
      );

      expect(mockValidateImage).toHaveBeenCalledWith("data:image/png;base64,abc", 20);
    });
  });

  describe("action=analyze-image", () => {
    it("analyzes a valid image", async () => {
      mockValidateImage.mockReturnValue({ valid: true, sizeBytes: 1024 } as never);
      mockAnalyzeImage.mockResolvedValue({ description: "A diagram", elements: [] } as never);
      mockVisionToSubject.mockReturnValue("Diagram analysis");

      const res = await POST(
        makePostRequest({
          action: "analyze-image",
          imageData: "data:image/png;base64,valid",
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.analysis).toBeDefined();
      expect(data.subject).toBe("Diagram analysis");
    });

    it("returns 400 for invalid image in analyze", async () => {
      mockValidateImage.mockReturnValue({
        valid: false,
        error: "Invalid format",
        sizeBytes: 0,
      } as never);

      const res = await POST(
        makePostRequest({
          action: "analyze-image",
          imageData: "bad-data",
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid format");
    });

    it("accepts optional imageType and context", async () => {
      mockValidateImage.mockReturnValue({ valid: true, sizeBytes: 1024 } as never);
      mockAnalyzeImage.mockResolvedValue({ description: "Whiteboard notes" } as never);
      mockVisionToSubject.mockReturnValue("Whiteboard analysis");

      const res = await POST(
        makePostRequest({
          action: "analyze-image",
          imageData: "data:image/png;base64,valid",
          imageType: "whiteboard",
          context: "Meeting notes from Q4 planning",
        })
      );

      expect(res.status).toBe(200);
      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        "data:image/png;base64,valid",
        expect.objectContaining({
          imageType: "whiteboard",
          context: "Meeting notes from Q4 planning",
        })
      );
    });
  });

  describe("action=process", () => {
    it("processes subject with attachments", async () => {
      mockProcessInput.mockResolvedValue({
        context: { subject: "AI tool" },
        parseResults: [{ id: "r1", status: "completed" }],
      } as never);

      const res = await POST(
        makePostRequest({
          action: "process",
          subject: "AI tool for teams",
          attachments: [
            {
              id: "att-1",
              type: "image",
              name: "diagram.png",
            },
          ],
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.context).toBeDefined();
      expect(data.parseResults).toBeDefined();
    });

    it("processes subject only (no attachments)", async () => {
      mockProcessInput.mockResolvedValue({
        context: { subject: "Simple idea" },
        parseResults: [],
      } as never);

      const res = await POST(
        makePostRequest({
          action: "process",
          subject: "Simple idea exploration",
        })
      );

      expect(res.status).toBe(200);
    });
  });

  describe("error handling", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing action", async () => {
      const res = await POST(makePostRequest({ imageData: "test" }));
      expect(res.status).toBe(400);
    });

    it("rejects empty imageData via Zod min(1)", async () => {
      const res = await POST(
        makePostRequest({
          action: "validate",
          imageData: "",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects more than 10 attachments via .max(10)", async () => {
      const attachments = Array.from({ length: 11 }, (_, i) => ({
        id: `att-${i}`,
        type: "image",
        name: `file-${i}.png`,
      }));

      const res = await POST(
        makePostRequest({
          action: "process",
          subject: "Test",
          attachments,
        })
      );
      expect(res.status).toBe(400);
    });
  });
});
