import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  validateImage,
  detectImageFormat,
  extractionToSubject,
  extractionToContext,
  imageToDataUrl,
} from "../vision/index.js";
import type { ImageExtraction } from "../vision/index.js";

function makeExtraction(overrides: Partial<ImageExtraction> = {}): ImageExtraction {
  return {
    summary: "A whiteboard with business model canvas",
    elements: [
      { type: "text", content: "Revenue Streams", confidence: 0.9 },
      { type: "diagram", content: "Flow chart of customer journey", confidence: 0.8 },
    ],
    detectedType: "whiteboard",
    extractedText: "Revenue Streams, Customer Segments, Value Proposition",
    themes: ["business-model", "strategy"],
    suggestedSubject: "Business model innovation for SaaS platforms",
    innovationContext: "Whiteboard captures initial brainstorm on new business model",
    ...overrides,
  };
}

describe("vision", () => {
  describe("validateImage", () => {
    it("validates a valid image buffer", () => {
      const buffer = Buffer.from("fake-image-data");
      const result = validateImage(buffer);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty buffer", () => {
      const result = validateImage(Buffer.alloc(0));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Image buffer is empty");
    });

    it("rejects oversized buffer", () => {
      const buffer = Buffer.alloc(21 * 1024 * 1024); // 21MB
      const result = validateImage(buffer);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("maximum size"))).toBe(true);
    });

    it("rejects unsupported format", () => {
      const buffer = Buffer.from("data");
      const result = validateImage(buffer, { format: "svg" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Unsupported"))).toBe(true);
    });

    it("accepts supported format metadata", () => {
      const buffer = Buffer.from("data");
      const result = validateImage(buffer, { format: "png" });
      expect(result.valid).toBe(true);
    });
  });

  describe("detectImageFormat", () => {
    it("detects PNG", () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      expect(detectImageFormat(buffer)).toBe("png");
    });

    it("detects JPEG", () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(detectImageFormat(buffer)).toBe("jpeg");
    });

    it("detects GIF", () => {
      const buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectImageFormat(buffer)).toBe("gif");
    });

    it("detects BMP", () => {
      const buffer = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
      expect(detectImageFormat(buffer)).toBe("bmp");
    });

    it("returns undefined for unknown format", () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(detectImageFormat(buffer)).toBeUndefined();
    });

    it("returns undefined for short buffer", () => {
      const buffer = Buffer.from([0x89, 0x50]);
      expect(detectImageFormat(buffer)).toBeUndefined();
    });
  });

  describe("extractionToSubject", () => {
    it("returns suggested subject when available", () => {
      const extraction = makeExtraction();
      expect(extractionToSubject(extraction)).toBe("Business model innovation for SaaS platforms");
    });

    it("falls back to summary when no suggested subject", () => {
      const extraction = makeExtraction({ suggestedSubject: "" });
      expect(extractionToSubject(extraction)).toBe("A whiteboard with business model canvas");
    });
  });

  describe("extractionToContext", () => {
    it("generates context string with all sections", () => {
      const extraction = makeExtraction();
      const context = extractionToContext(extraction);
      expect(context).toContain("IMAGE ANALYSIS");
      expect(context).toContain("EXTRACTED TEXT");
      expect(context).toContain("THEMES");
      expect(context).toContain("INNOVATION CONTEXT");
      expect(context).toContain("DIAGRAMS/SKETCHES");
    });

    it("handles extraction with no diagrams", () => {
      const extraction = makeExtraction({
        elements: [{ type: "text", content: "hello", confidence: 1 }],
      });
      const context = extractionToContext(extraction);
      expect(context).not.toContain("DIAGRAMS/SKETCHES");
    });

    it("handles empty themes", () => {
      const extraction = makeExtraction({ themes: [] });
      const context = extractionToContext(extraction);
      expect(context).not.toContain("THEMES:");
    });
  });

  describe("imageToDataUrl", () => {
    it("generates correct data URL for PNG", () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const url = imageToDataUrl(buffer);
      expect(url).toMatch(/^data:image\/png;base64,/);
    });

    it("uses provided format override", () => {
      const buffer = Buffer.from("data");
      const url = imageToDataUrl(buffer, "jpeg");
      expect(url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("converts jpg to jpeg in mime type", () => {
      const buffer = Buffer.from("data");
      const url = imageToDataUrl(buffer, "jpg");
      expect(url).toMatch(/^data:image\/jpeg;base64,/);
    });
  });
});
