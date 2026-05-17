import { Buffer } from "node:buffer";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  ExtractedDocumentContextSchema,
  ExtractedImageContextSchema,
  EnrichedContextSchema,
  TranscriptionResultSchema,
  clearExtractorRegistries,
  listAudioTranscribers,
  listImageExtractors,
  listPDFExtractors,
  mergeExtractedContexts,
  registerAudioTranscriber,
  registerImageExtractor,
  registerPDFExtractor,
} from "../multi-modal/extraction-interfaces.js";
import { listAudioTranscribers as listAudioFromModuleIndex } from "../multi-modal/index.js";

describe("multi-modal extraction interfaces", () => {
  beforeEach(() => {
    clearExtractorRegistries();
  });

  it("registers extractors and exposes registry names", async () => {
    registerImageExtractor({
      name: "vision-mock",
      extractContext: async () =>
        ExtractedImageContextSchema.parse({
          description: "A product mockup",
          objects: ["dashboard", "chart"],
          tags: ["product", "ux"],
          confidence: 0.92,
        }),
    });
    registerPDFExtractor({
      name: "pdf-mock",
      extractText: async () =>
        ExtractedDocumentContextSchema.parse({
          text: "Whitepaper text",
          pages: 2,
          sections: [{ title: "Intro", content: "Overview", pageNumber: 1 }],
        }),
    });
    registerAudioTranscriber({
      name: "audio-mock",
      transcribe: async () =>
        TranscriptionResultSchema.parse({
          text: "Workshop recording",
          durationSeconds: 45,
          segments: [{ start: 0, end: 10, text: "Hello", confidence: 0.8 }],
        }),
    });

    expect(listImageExtractors()).toEqual(["vision-mock"]);
    expect(listPDFExtractors()).toEqual(["pdf-mock"]);
    expect(listAudioTranscribers()).toEqual(["audio-mock"]);
    expect(listAudioFromModuleIndex()).toEqual(["audio-mock"]);
  });

  it("replaces an extractor with the same name", async () => {
    registerImageExtractor({
      name: "vision-mock",
      extractContext: async () =>
        ExtractedImageContextSchema.parse({
          description: "first",
          objects: [],
          tags: [],
          confidence: 0.4,
        }),
    });
    registerImageExtractor({
      name: "vision-mock",
      extractContext: async (imageData, mimeType) =>
        ExtractedImageContextSchema.parse({
          description: `${mimeType}:${String(imageData).slice(0, 5)}`,
          objects: ["mockup"],
          text: "embedded text",
          tags: ["updated"],
          confidence: 0.88,
        }),
    });

    expect(listImageExtractors()).toEqual(["vision-mock"]);
  });

  it("merges extracted contexts into a normalized enriched context", () => {
    const context = mergeExtractedContexts("Battery subscription pilot", [
      { source: "image", content: "Whiteboard notes about swap stations", confidence: 0.9 },
      { source: "pdf", content: "Research paper on urban mobility economics." },
      { source: "audio", content: "Transcript discussing pricing experiments.", confidence: 0.82 },
      { source: "text", content: "Manual note about rider retention." },
    ]);

    expect(EnrichedContextSchema.parse(context)).toEqual(context);
    expect(context.totalSources).toBe(4);
    expect(context.mergedContext).toContain("Battery subscription pilot");
    expect(context.mergedContext).toContain("Source 1 (image)");
    expect(context.extractedTexts[0].confidence).toBe(0.9);
  });

  it("supports downstream extractor implementations", async () => {
    const extractor = {
      name: "doc-reader",
      extractText: async (_pdfData: Buffer) =>
        ExtractedDocumentContextSchema.parse({
          text: "Detailed PDF text",
          pages: 3,
          sections: [{ title: "Findings", content: "Key findings", pageNumber: 2 }],
          metadata: { author: "Innovator" },
        }),
    };
    registerPDFExtractor(extractor);

    const result = await extractor.extractText(Buffer.from("pdf"));
    expect(result.pages).toBe(3);
    expect(result.metadata?.author).toBe("Innovator");
  });
});
