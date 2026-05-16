import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return raw.slice(start, end + 1);
  }),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, text: string) => `[${label}]: ${text}`),
  sanitizeLlmOutput: vi.fn((text: string) => text),
}));

import { generateText } from "../copilot/client.js";
import {
  processAttachment,
  processPdfInput,
  fuseContext,
  generateRichOutput,
} from "../multi-modal/context-fusion.js";
import type { InputSource, FusedContext } from "../multi-modal/context-fusion.js";
import type { Attachment } from "../multi-modal/index.js";

const mockGenerateText = vi.mocked(generateText);

function makePdfAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    type: "pdf",
    name: "research.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    status: "completed",
    extractedText: "This is extracted PDF content about innovation.",
    ...overrides,
  };
}

function makeFusedContext(overrides: Partial<FusedContext> = {}): FusedContext {
  return {
    id: "fused-1",
    subject: "AI Innovation",
    sources: [
      {
        id: "s1",
        type: "text",
        label: "Source 1",
        content: "AI content",
        confidence: 0.9,
        metadata: {},
      },
    ],
    unifiedSummary: "Unified summary about AI innovation",
    keyThemes: ["AI", "automation"],
    contradictions: [],
    confidence: 0.9,
    totalTokens: 500,
    fusedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processAttachment", () => {
  it("routes PDF attachment to processPdfInput", () => {
    const source = processAttachment(makePdfAttachment());
    expect(source.type).toBe("pdf");
    expect(source.confidence).toBe(0.9);
    expect(source.content).toContain("innovation");
  });

  it("routes image attachment", () => {
    const source = processAttachment({
      id: "att-2",
      type: "image",
      name: "whiteboard.png",
      mimeType: "image/png",
      status: "completed",
      extractedText: "OCR text",
    });
    expect(source.type).toBe("image");
    expect(source.confidence).toBe(0.8);
  });

  it("routes audio attachment", () => {
    const source = processAttachment({
      id: "att-3",
      type: "audio",
      name: "meeting.mp3",
      mimeType: "audio/mpeg",
      status: "completed",
      extractedText: "Transcribed audio",
    });
    expect(source.type).toBe("audio");
  });

  it("routes URL attachment", () => {
    const source = processAttachment({
      id: "att-4",
      type: "url",
      name: "competitor.com",
      status: "completed",
      sourceUrl: "https://competitor.com",
      extractedText: "Page content",
    });
    expect(source.type).toBe("url");
  });

  it("falls back to text type with confidence 0.5 for unknown type", () => {
    const att = {
      id: "att-5",
      type: "video" as Attachment["type"],
      name: "demo.mp4",
      status: "completed" as const,
      extractedText: "video transcript",
    };
    // video is not handled by switch, falls to default
    const source = processAttachment(att as unknown as Attachment);
    expect(source.type).toBe("text");
    expect(source.confidence).toBe(0.5);
  });
});

describe("processPdfInput", () => {
  it("returns confidence 0.1 when extractedText is missing", () => {
    const source = processPdfInput(makePdfAttachment({ extractedText: undefined }));
    expect(source.confidence).toBe(0.1);
    expect(source.content).toContain("pending");
  });

  it("returns confidence 0.9 when extractedText is present", () => {
    const source = processPdfInput(makePdfAttachment());
    expect(source.confidence).toBe(0.9);
  });

  it("throws for non-PDF attachment", () => {
    expect(() =>
      processPdfInput({ ...makePdfAttachment(), type: "image" } as unknown as Attachment)
    ).toThrow("Expected PDF");
  });
});

describe("fuseContext", () => {
  it("returns early with zero tokens for empty sources", async () => {
    const result = await fuseContext("test subject", []);
    expect(result.sources).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.unifiedSummary).toBe("test subject");
    expect(result.confidence).toBe(1);
  });

  it("fuses sources with mocked LLM producing valid output", async () => {
    const llmResponse = JSON.stringify({
      unifiedSummary: "AI and healthcare converge",
      keyThemes: ["AI", "healthcare", "diagnostics"],
      contradictions: [],
    });
    mockGenerateText.mockResolvedValueOnce(llmResponse);

    const sources: InputSource[] = [
      {
        id: "s1",
        type: "text",
        label: "Source 1",
        content: "AI in healthcare",
        confidence: 0.9,
        metadata: {},
      },
      {
        id: "s2",
        type: "pdf",
        label: "Source 2",
        content: "Medical diagnostics paper",
        confidence: 0.8,
        metadata: {},
      },
    ];

    const result = await fuseContext("AI Healthcare", sources);
    expect(result.unifiedSummary).toBe("AI and healthcare converge");
    expect(result.keyThemes).toContain("AI");
    expect(result.sources).toHaveLength(2);
    expect(result.confidence).toBeCloseTo(0.85, 1);
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

describe("generateRichOutput", () => {
  it("produces mermaid format for mind-map outputType", async () => {
    const mermaidContent = "mindmap\n  root(AI Innovation)\n    ML\n    NLP";
    mockGenerateText.mockResolvedValueOnce(mermaidContent);

    const result = await generateRichOutput(makeFusedContext(), "mind-map");
    expect(result.format).toBe("mermaid");
    expect(result.type).toBe("mind-map");
    expect(result.content).toContain("mindmap");
  });

  it("produces markdown format for summary-card outputType", async () => {
    const mdContent = "# Summary\n- Key finding 1\n- Key finding 2";
    mockGenerateText.mockResolvedValueOnce(mdContent);

    const result = await generateRichOutput(makeFusedContext(), "summary-card");
    expect(result.format).toBe("markdown");
    expect(result.type).toBe("summary-card");
  });

  it("includes source IDs from fused context", async () => {
    mockGenerateText.mockResolvedValueOnce("Timeline content");
    const ctx = makeFusedContext();
    const result = await generateRichOutput(ctx, "timeline");
    expect(result.sourceIds).toContain("s1");
  });
});
