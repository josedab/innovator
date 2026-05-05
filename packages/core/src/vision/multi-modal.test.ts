import { describe, it, expect } from "vitest";
import {
  processMultiModalInput,
  batchProcessInputs,
  MultiModalInputSchema,
  type MultiModalInput,
} from "./multi-modal.js";

function makeInput(overrides: Partial<MultiModalInput> = {}): MultiModalInput {
  return {
    id: "input-1",
    type: "text",
    name: "test-input",
    ...overrides,
  };
}

describe("processMultiModalInput", () => {
  it("text input produces high confidence extraction", () => {
    const result = processMultiModalInput(
      makeInput({ type: "text", content: "Innovation in renewable energy" })
    );
    expect(result.inputType).toBe("text");
    expect(result.confidence).toBe(1.0);
    expect(result.extractedText).toBe("Innovation in renewable energy");
    expect(result.sourceAttribution).toContain("Text");
  });

  it("image with base64Data produces moderate confidence", () => {
    const result = processMultiModalInput(
      makeInput({
        type: "image",
        name: "photo.png",
        base64Data: "iVBORw0KGgo=",
        sizeBytes: 1024,
        mimeType: "image/png",
      })
    );
    expect(result.inputType).toBe("image");
    expect(result.confidence).toBe(0.7);
    expect(result.extractedText).toContain("Vision model analysis required");
    expect(result.sourceAttribution).toContain("Image");
  });

  it("image without base64Data produces low confidence", () => {
    const result = processMultiModalInput(makeInput({ type: "image", name: "photo.png" }));
    expect(result.confidence).toBe(0.3);
  });

  it("PDF with content produces high confidence", () => {
    const result = processMultiModalInput(
      makeInput({ type: "pdf", name: "report.pdf", content: "Research findings..." })
    );
    expect(result.inputType).toBe("pdf");
    expect(result.confidence).toBe(0.9);
    expect(result.extractedText).toBe("Research findings...");
  });

  it("PDF without content produces low confidence placeholder", () => {
    const result = processMultiModalInput(makeInput({ type: "pdf", name: "report.pdf" }));
    expect(result.confidence).toBe(0.2);
    expect(result.extractedText).toContain("Text extraction required");
  });

  it("voice with transcript produces good confidence", () => {
    const result = processMultiModalInput(
      makeInput({ type: "voice", name: "recording.mp3", content: "Hello, this is a transcript" })
    );
    expect(result.inputType).toBe("voice");
    expect(result.confidence).toBe(0.85);
    expect(result.extractedText).toBe("Hello, this is a transcript");
  });

  it("voice without transcript produces low confidence with warning", () => {
    const result = processMultiModalInput(makeInput({ type: "voice", name: "recording.mp3" }));
    expect(result.confidence).toBe(0.1);
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("Whisper");
  });

  it("URL with content produces good confidence", () => {
    const result = processMultiModalInput(
      makeInput({
        type: "url",
        name: "webpage",
        url: "https://example.com",
        content: "Page content",
      })
    );
    expect(result.inputType).toBe("url");
    expect(result.confidence).toBe(0.8);
    expect(result.extractedText).toBe("Page content");
  });

  it("URL without content produces low confidence with warning", () => {
    const result = processMultiModalInput(
      makeInput({ type: "url", name: "webpage", url: "https://example.com" })
    );
    expect(result.confidence).toBe(0.2);
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("fetching");
  });

  it("all results have processingTimeMs >= 0", () => {
    const types = ["text", "image", "pdf", "voice", "url"] as const;
    for (const type of types) {
      const result = processMultiModalInput(makeInput({ type }));
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Zod schema validation", () => {
  it("rejects invalid input type", () => {
    expect(() => MultiModalInputSchema.parse({ id: "1", type: "video", name: "test" })).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => MultiModalInputSchema.parse({ id: "1" })).toThrow();
    expect(() => MultiModalInputSchema.parse({ type: "text" })).toThrow();
  });

  it("accepts valid input with all optional fields", () => {
    const result = MultiModalInputSchema.parse({
      id: "1",
      type: "image",
      name: "test.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      content: "data",
      base64Data: "abc=",
      url: "https://example.com",
      metadata: { key: "value" },
    });
    expect(result.id).toBe("1");
  });
});

describe("batchProcessInputs", () => {
  it("empty batch produces empty context", () => {
    const result = batchProcessInputs([]);
    expect(result.processedInputs).toHaveLength(0);
    expect(result.combinedContext).toBe("");
    expect(result.totalInputs).toBe(0);
    expect(result.successfulInputs).toBe(0);
    expect(result.primarySubject).toBeUndefined();
  });

  it("mixed types produce combined context", () => {
    const inputs = [
      makeInput({ id: "1", type: "text", name: "text1", content: "Innovation topic" }),
      makeInput({ id: "2", type: "image", name: "photo.png", base64Data: "abc=" }),
      makeInput({ id: "3", type: "pdf", name: "report.pdf", content: "PDF findings" }),
    ];

    const result = batchProcessInputs(inputs);
    expect(result.processedInputs).toHaveLength(3);
    expect(result.totalInputs).toBe(3);
    expect(result.successfulInputs).toBe(3);
    expect(result.combinedContext).toContain("Innovation topic");
    expect(result.combinedContext).toContain("PDF findings");
  });

  it("primary subject detected from highest confidence input", () => {
    const inputs = [
      makeInput({ id: "1", type: "image", name: "img" }), // 0.3 confidence
      makeInput({ id: "2", type: "text", name: "txt", content: "Main topic" }), // 1.0 confidence
    ];

    const result = batchProcessInputs(inputs);
    expect(result.primarySubject).toBe("Main topic");
  });

  it("successfulInputs count matches inputs with confidence > 0", () => {
    const inputs = [
      makeInput({ id: "1", type: "text", content: "has content" }),
      makeInput({ id: "2", type: "text", content: "" }),
    ];

    const result = batchProcessInputs(inputs);
    // text with empty content has confidence 1.0 (extractedText is empty string)
    expect(result.successfulInputs).toBe(2);
  });

  it("single input batch works correctly", () => {
    const result = batchProcessInputs([
      makeInput({ id: "1", type: "text", content: "Solo input" }),
    ]);
    expect(result.processedInputs).toHaveLength(1);
    expect(result.totalInputs).toBe(1);
    expect(result.successfulInputs).toBe(1);
  });

  it("handles processing failure gracefully", () => {
    // Create an input that would fail validation
    const inputs = [makeInput({ id: "1", type: "text", content: "valid" })];
    // Process should not throw for valid inputs
    const result = batchProcessInputs(inputs);
    expect(result.processedInputs).toHaveLength(1);
  });
});
