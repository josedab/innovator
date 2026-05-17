import { describe, it, expect, vi } from "vitest";

// Mock only transitive SDK deps that cannot load in test env
vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue('{"summary":"test"}'),
  extractJson: vi.fn().mockReturnValue('{"summary":"test"}'),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  resolveFileType,
  validateUploadedFile,
  UploadProcessor,
  UploadedFileSchema,
  ProcessingResultSchema,
  type UploadedFile,
  type ProcessingResult,
} from "../multi-modal/upload-processor.js";

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: "file-1",
    filename: "test.png",
    mimeType: "image/png",
    sizeBytes: 1024,
    base64Content: Buffer.from("fake-image-data").toString("base64"),
    uploadedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("upload-processor", () => {
  describe("resolveFileType", () => {
    it("resolves image MIME types", () => {
      expect(resolveFileType("image/png")).toBe("image");
      expect(resolveFileType("image/jpeg")).toBe("image");
      expect(resolveFileType("image/gif")).toBe("image");
      expect(resolveFileType("image/webp")).toBe("image");
      expect(resolveFileType("image/svg+xml")).toBe("image");
    });

    it("resolves pdf MIME type", () => {
      expect(resolveFileType("application/pdf")).toBe("pdf");
    });

    it("resolves audio MIME types", () => {
      expect(resolveFileType("audio/mpeg")).toBe("audio");
      expect(resolveFileType("audio/wav")).toBe("audio");
      expect(resolveFileType("audio/ogg")).toBe("audio");
      expect(resolveFileType("audio/webm")).toBe("audio");
      expect(resolveFileType("audio/mp4")).toBe("audio");
    });

    it("resolves document MIME types", () => {
      expect(resolveFileType("text/plain")).toBe("document");
      expect(resolveFileType("text/markdown")).toBe("document");
      expect(resolveFileType("application/msword")).toBe("document");
    });

    it("returns undefined for unsupported MIME types", () => {
      expect(resolveFileType("application/octet-stream")).toBeUndefined();
      expect(resolveFileType("video/mp4")).toBeUndefined();
      expect(resolveFileType("")).toBeUndefined();
    });
  });

  describe("validateUploadedFile", () => {
    it("returns no errors for a valid image file", () => {
      const errors = validateUploadedFile(makeFile());
      expect(errors).toHaveLength(0);
    });

    it("returns error for unsupported MIME type", () => {
      const errors = validateUploadedFile(makeFile({ mimeType: "video/mp4" }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Unsupported MIME type");
    });

    it("returns error when image exceeds 10MB limit", () => {
      const errors = validateUploadedFile(makeFile({ sizeBytes: 11 * 1024 * 1024 }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("10MB limit");
    });

    it("returns error when pdf exceeds 25MB limit", () => {
      const errors = validateUploadedFile(
        makeFile({ mimeType: "application/pdf", sizeBytes: 26 * 1024 * 1024 })
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("25MB limit");
    });

    it("returns error when audio exceeds 50MB limit", () => {
      const errors = validateUploadedFile(
        makeFile({ mimeType: "audio/mpeg", sizeBytes: 51 * 1024 * 1024 })
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("50MB limit");
    });

    it("returns error when file has no content", () => {
      const errors = validateUploadedFile(
        makeFile({ base64Content: "", extractedText: undefined })
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("base64Content or extractedText");
    });

    it("allows file with extractedText but no base64Content", () => {
      const errors = validateUploadedFile(
        makeFile({ base64Content: "", extractedText: "some text" })
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe("UploadedFileSchema", () => {
    it("parses a valid uploaded file", () => {
      const result = UploadedFileSchema.safeParse(makeFile());
      expect(result.success).toBe(true);
    });

    it("rejects invalid uploaded file missing required fields", () => {
      const result = UploadedFileSchema.safeParse({ id: "x" });
      expect(result.success).toBe(false);
    });
  });

  describe("UploadProcessor", () => {
    it("can be constructed without options", () => {
      const processor = new UploadProcessor();
      expect(processor).toBeInstanceOf(UploadProcessor);
    });

    it("can be constructed with a model option", () => {
      const processor = new UploadProcessor({ model: "gpt-4" });
      expect(processor).toBeInstanceOf(UploadProcessor);
    });

    it("processFile rejects invalid files with validation errors", async () => {
      const processor = new UploadProcessor();
      const invalidFile = makeFile({ mimeType: "video/mp4" });
      await expect(processor.processFile(invalidFile)).rejects.toThrow("Validation failed");
    });

    it("processFile rejects oversized files", async () => {
      const processor = new UploadProcessor();
      const oversized = makeFile({ sizeBytes: 11 * 1024 * 1024 });
      await expect(processor.processFile(oversized)).rejects.toThrow("Validation failed");
    });

    it("buildInnovationPrompt returns empty string for no results", () => {
      const processor = new UploadProcessor();
      expect(processor.buildInnovationPrompt([])).toBe("");
    });

    it("buildInnovationPrompt combines multiple results", () => {
      const processor = new UploadProcessor();
      const results: ProcessingResult[] = [
        {
          fileId: "f1",
          type: "image",
          extractedContext: "Whiteboard diagram of ML pipeline",
          suggestedSubject: "ML Pipeline",
          confidence: 0.9,
        },
        {
          fileId: "f2",
          type: "pdf",
          extractedContext: "Research paper on neural networks",
          suggestedSubject: "Neural Networks",
          confidence: 0.8,
        },
      ];
      const prompt = processor.buildInnovationPrompt(results);
      expect(prompt).toContain("UPLOADED MATERIALS");
      expect(prompt).toContain("[IMAGE]");
      expect(prompt).toContain("[PDF]");
      expect(prompt).toContain("ML Pipeline");
      expect(prompt).toContain("Neural Networks");
      expect(prompt).toContain("SUGGESTED SUBJECTS");
    });

    it("buildInnovationPrompt filters low-confidence subjects", () => {
      const processor = new UploadProcessor();
      const results: ProcessingResult[] = [
        {
          fileId: "f1",
          type: "image",
          extractedContext: "Some image",
          suggestedSubject: "High Confidence",
          confidence: 0.9,
        },
        {
          fileId: "f2",
          type: "audio",
          extractedContext: "Some audio",
          suggestedSubject: "Low Confidence",
          confidence: 0.3,
        },
      ];
      const prompt = processor.buildInnovationPrompt(results);
      expect(prompt).toContain("High Confidence");
      // Low confidence subject should not appear in SUGGESTED SUBJECTS
      const subjectsSection = prompt.split("SUGGESTED SUBJECTS")[1];
      expect(subjectsSection).not.toContain("Low Confidence");
    });
  });
});
