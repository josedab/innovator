import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue('{"summary":"Test summary","keyFindings":["Finding 1","Finding 2"]}'),
  extractJson: vi
    .fn()
    .mockReturnValue('{"summary":"Test summary","keyFindings":["Finding 1","Finding 2"]}'),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  validateAttachment,
  parseImage,
  parsePDF,
  parseURL,
  parseAudio,
  parseAttachment,
  buildMultiModalContext,
  buildMultiModalPrompt,
  processMultiModalInput,
} from "../multi-modal/index.js";
import type { Attachment, InvestigationInput, ParseResult } from "../multi-modal/index.js";

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    type: "image",
    name: "mockup.png",
    mimeType: "image/png",
    sizeBytes: 1024,
    base64Data: "iVBORw0KGgo=",
    status: "pending",
    ...overrides,
  };
}

describe("multi-modal", () => {
  describe("validation", () => {
    it("validates valid image attachment", () => {
      const errors = validateAttachment(makeAttachment());
      expect(errors).toHaveLength(0);
    });

    it("rejects oversized files", () => {
      const errors = validateAttachment(makeAttachment({ sizeBytes: 100 * 1024 * 1024 }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("limit");
    });

    it("rejects unsupported MIME types", () => {
      const errors = validateAttachment(makeAttachment({ mimeType: "video/mp4" }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("MIME type");
    });

    it("requires sourceUrl for URL attachments", () => {
      const errors = validateAttachment(makeAttachment({ type: "url", mimeType: undefined }));
      expect(errors.some((e) => e.includes("sourceUrl"))).toBe(true);
    });

    it("validates URL attachments with sourceUrl", () => {
      const errors = validateAttachment({
        id: "url-1",
        type: "url",
        name: "Competitor Page",
        sourceUrl: "https://example.com",
        extractedText: "Page content",
        status: "pending",
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("parsers", () => {
    it("parses image attachments", async () => {
      const result = await parseImage(makeAttachment());
      expect(result.type).toBe("image");
      expect(result.summary).toBeTruthy();
      expect(result.keyFindings).toBeDefined();
    });

    it("parses PDF attachments", async () => {
      const result = await parsePDF(
        makeAttachment({
          type: "pdf",
          name: "paper.pdf",
          mimeType: "application/pdf",
          extractedText: "Abstract: This paper discusses...",
        })
      );
      expect(result.type).toBe("pdf");
      expect(result.summary).toBeTruthy();
    });

    it("parses URL attachments", async () => {
      const result = await parseURL(
        makeAttachment({
          type: "url",
          name: "Competitor Page",
          mimeType: undefined,
          base64Data: undefined,
          sourceUrl: "https://competitor.com/product",
          extractedText: "Product features...",
        })
      );
      expect(result.type).toBe("url");
      expect(result.metadata?.sourceUrl).toBe("https://competitor.com/product");
    });

    it("parses audio attachments", async () => {
      const result = await parseAudio(
        makeAttachment({
          type: "audio",
          name: "meeting.mp3",
          mimeType: "audio/mpeg",
          extractedText: "In this meeting we discussed...",
        })
      );
      expect(result.type).toBe("audio");
      expect(result.summary).toBeTruthy();
    });

    it("routes to correct parser via parseAttachment", async () => {
      const result = await parseAttachment(makeAttachment());
      expect(result.type).toBe("image");
    });

    it("rejects wrong type in specific parser", async () => {
      await expect(parseImage(makeAttachment({ type: "pdf" }))).rejects.toThrow("Not an image");
    });
  });

  describe("multi-modal context", () => {
    it("builds context from parsed results", () => {
      const input: InvestigationInput = {
        subject: "AI in healthcare",
        attachments: [makeAttachment()],
        focusAreas: ["diagnostics", "patient care"],
      };

      const parseResults: ParseResult[] = [
        {
          attachmentId: "att-1",
          type: "image",
          extractedText: "Mockup of diagnostic tool",
          summary: "A UI mockup showing a diagnostic dashboard",
          keyFindings: ["Dashboard layout", "Real-time monitoring"],
          confidence: 0.8,
        },
      ];

      const context = buildMultiModalContext(input, parseResults);
      expect(context.subject).toBe("AI in healthcare");
      expect(context.totalAttachments).toBe(1);
      expect(context.attachmentSummaries).toHaveLength(1);
      expect(context.focusAreas).toContain("diagnostics");
    });

    it("builds prompt from context", () => {
      const context = {
        subject: "AI in healthcare",
        textContext: "Additional notes",
        attachmentSummaries: [
          {
            type: "image" as const,
            name: "mockup.png",
            summary: "A diagnostic dashboard",
            keyFindings: ["Real-time data"],
          },
        ],
        totalAttachments: 1,
        focusAreas: ["diagnostics"],
      };

      const prompt = buildMultiModalPrompt(context);
      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("IMAGE");
      expect(prompt).toContain("diagnostics");
    });
  });

  describe("full pipeline", () => {
    it("processes multi-modal input end-to-end", async () => {
      const input: InvestigationInput = {
        subject: "Smart home automation",
        attachments: [
          makeAttachment({ id: "att-1", type: "image", name: "sketch.png" }),
          makeAttachment({
            id: "att-2",
            type: "url",
            name: "Competitor",
            mimeType: undefined,
            base64Data: undefined,
            sourceUrl: "https://example.com",
            extractedText: "Smart home features",
          }),
        ],
        contextNotes: "Focus on energy efficiency",
      };

      const { context, parseResults } = await processMultiModalInput(input);
      expect(parseResults).toHaveLength(2);
      expect(context.totalAttachments).toBe(2);
      expect(context.textContext).toContain("energy efficiency");
    });

    it("handles parsing failures gracefully", async () => {
      const { generateText: mockGenerate } = await import("../copilot/client.js");
      (mockGenerate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM error"));

      const input: InvestigationInput = {
        subject: "Test",
        attachments: [makeAttachment()],
      };

      const { parseResults } = await processMultiModalInput(input);
      expect(parseResults).toHaveLength(1);
      expect(parseResults[0].summary).toContain("Failed");
    });
  });
});
