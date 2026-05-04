import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();
vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
  generateTextStream: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  CONTENT_FORMATS,
  CONTENT_TONES,
  CONTENT_AUDIENCES,
  generateContent,
  reviseContent,
  generateContentBundle,
  getContentPiece,
  listContentPieces,
  clearContentPipeline,
  getContentFormatLabel,
  ContentPieceSchema,
} from "../content-pipeline/index.js";

const mockContentJson = JSON.stringify({
  title: "Test Blog Post",
  body: "This is a blog post about innovation.",
  sections: [{ heading: "Intro", body: "Introduction text", order: 0 }],
  hashtags: ["#innovation"],
  callToAction: "Learn more",
});

const mockIdea = {
  title: "AI Chat",
  description: "An AI-powered chat assistant",
  potentialImpact: "High",
  implementationHint: "Use LLM APIs",
};

describe("content-pipeline", () => {
  beforeEach(() => {
    clearContentPipeline();
    vi.clearAllMocks();
  });

  it("CONTENT_FORMATS has 6 items", () => {
    expect(CONTENT_FORMATS).toHaveLength(6);
  });

  it("CONTENT_TONES has 6 items", () => {
    expect(CONTENT_TONES).toHaveLength(6);
  });

  it("CONTENT_AUDIENCES has 6 items", () => {
    expect(CONTENT_AUDIENCES).toHaveLength(6);
  });

  it("getContentFormatLabel returns human-readable labels for all formats", () => {
    for (const format of CONTENT_FORMATS) {
      const label = getContentFormatLabel(format);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("clearContentPipeline empties the store", () => {
    expect(listContentPieces()).toHaveLength(0);
  });

  it("listContentPieces returns empty array initially", () => {
    expect(listContentPieces()).toEqual([]);
  });

  it("generateContent calls LLM and returns valid ContentPiece", async () => {
    mockGenerateText.mockResolvedValue(mockContentJson);
    mockExtractJson.mockReturnValue(mockContentJson);

    const piece = await generateContent(mockIdea, "blog-post", {
      tone: "professional",
      audience: "general",
    });
    expect(piece).toBeDefined();
    expect(piece.format).toBe("blog-post");
    expect(piece.title).toBeDefined();
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it("getContentPiece retrieves stored content", async () => {
    mockGenerateText.mockResolvedValue(mockContentJson);
    mockExtractJson.mockReturnValue(mockContentJson);

    const piece = await generateContent(mockIdea, "blog-post", {
      tone: "professional",
      audience: "general",
    });
    const retrieved = getContentPiece(piece.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(piece.id);
  });

  it("generateContentBundle generates multiple pieces", async () => {
    mockGenerateText.mockResolvedValue(mockContentJson);
    mockExtractJson.mockReturnValue(mockContentJson);

    const pieces = await generateContentBundle(mockIdea, ["blog-post", "internal-memo"], {
      tone: "professional",
      audience: "general",
    });
    expect(pieces).toHaveLength(2);
  });

  it("reviseContent updates existing content", async () => {
    mockGenerateText.mockResolvedValue(mockContentJson);
    mockExtractJson.mockReturnValue(mockContentJson);

    const piece = await generateContent(mockIdea, "blog-post", {
      tone: "professional",
      audience: "general",
    });
    const revised = await reviseContent({ contentId: piece.id, feedback: "Make it shorter" });
    expect(revised).toBeDefined();
    expect(revised.id).toBe(piece.id);
  });

  it("ContentPieceSchema validates valid data", () => {
    const valid = ContentPieceSchema.parse({
      id: "cp-1",
      format: "blog-post",
      title: "Test",
      body: "Body text",
      metadata: {
        ideaTitle: "AI Chat",
        tone: "professional",
        audience: "general",
        wordCount: 100,
        generatedAt: new Date().toISOString(),
        revisionNumber: 0,
      },
    });
    expect(valid.id).toBe("cp-1");
  });
});
