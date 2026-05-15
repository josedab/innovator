import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  processWhiteboard,
  getMediaAnalysis,
  listMediaAnalyses,
  clearMediaAnalyses,
  mediaAnalysisToMarkdown,
  MediaTypeSchema,
  MediaSegmentSchema,
  WhiteboardRegionSchema,
  MediaAnalysisResultSchema,
} from "../multi-modal/media-processor.js";

beforeEach(() => {
  clearMediaAnalyses();
});

describe("MediaTypeSchema", () => {
  it("accepts valid types", () => {
    expect(MediaTypeSchema.parse("video")).toBe("video");
    expect(MediaTypeSchema.parse("whiteboard")).toBe("whiteboard");
    expect(MediaTypeSchema.parse("meeting_recording")).toBe("meeting_recording");
    expect(MediaTypeSchema.parse("screen_capture")).toBe("screen_capture");
    expect(MediaTypeSchema.parse("sketch")).toBe("sketch");
  });

  it("rejects invalid type", () => {
    expect(() => MediaTypeSchema.parse("invalid")).toThrow();
  });
});

describe("MediaSegmentSchema", () => {
  it("validates a segment", () => {
    const segment = MediaSegmentSchema.parse({
      id: "seg-1",
      type: "speech",
      content: "We should explore AI for customer service",
      confidence: 0.9,
      innovationRelevance: 75,
    });
    expect(segment.type).toBe("speech");
    expect(segment.innovationRelevance).toBe(75);
  });
});

describe("WhiteboardRegionSchema", () => {
  it("validates a whiteboard region", () => {
    const region = WhiteboardRegionSchema.parse({
      id: "r-1",
      label: "Main Idea",
      type: "sticky_note",
      extractedText: "AI-powered chatbot",
      connections: ["r-2", "r-3"],
    });
    expect(region.type).toBe("sticky_note");
    expect(region.connections).toHaveLength(2);
  });
});

describe("processWhiteboard", () => {
  it("processes whiteboard with regions", async () => {
    const result = await processWhiteboard({
      fileName: "brainstorm-session.jpg",
      ocrText: "Main ideas: AI chatbot, ML pipeline, automated testing",
      regions: [
        {
          label: "Central Topic",
          type: "text",
          extractedText: "AI-powered innovation",
          connections: [],
        },
        {
          label: "Branch A",
          type: "sticky_note",
          extractedText: "Customer service bot",
          connections: ["Central Topic"],
        },
        {
          label: "Branch B",
          type: "diagram",
          extractedText: "ML pipeline architecture",
          connections: ["Central Topic"],
        },
      ],
    });

    expect(result.mediaType).toBe("whiteboard");
    expect(result.whiteboardRegions).toHaveLength(3);
    expect(result.segments.length).toBeGreaterThanOrEqual(3);
    expect(result.summary).toBeDefined();
    expect(result.processedAt).toBeDefined();

    // Should be stored
    const stored = getMediaAnalysis(result.id);
    expect(stored).toBeDefined();
    expect(stored?.id).toBe(result.id);
  });

  it("handles whiteboard with only OCR text", async () => {
    const result = await processWhiteboard({
      fileName: "sketch.png",
      ocrText: "Ideas for Q4: new dashboard, API v2, mobile app",
    });

    expect(result.mediaType).toBe("whiteboard");
    expect(result.summary).toBeDefined();
  });
});

describe("listMediaAnalyses", () => {
  it("lists all stored analyses", async () => {
    await processWhiteboard({
      fileName: "wb1.jpg",
      ocrText: "Test 1",
    });
    await processWhiteboard({
      fileName: "wb2.jpg",
      ocrText: "Test 2",
    });

    const all = listMediaAnalyses();
    expect(all).toHaveLength(2);
  });
});

describe("mediaAnalysisToMarkdown", () => {
  it("generates markdown from whiteboard analysis", async () => {
    const result = await processWhiteboard({
      fileName: "strategy-board.jpg",
      ocrText: "Product roadmap Q1 2025",
      regions: [
        {
          label: "Goal",
          type: "text",
          extractedText: "Launch AI features",
        },
      ],
    });

    const md = mediaAnalysisToMarkdown(result);
    expect(md).toContain("# Media Analysis: strategy-board.jpg");
    expect(md).toContain("**Type:** whiteboard");
    expect(md).toContain("Summary");
    expect(md).toContain("Whiteboard Regions");
  });
});

describe("MediaAnalysisResultSchema", () => {
  it("validates a complete result", () => {
    const result = MediaAnalysisResultSchema.parse({
      id: "test-1",
      mediaType: "video",
      fileName: "demo.mp4",
      durationMs: 120000,
      segments: [
        {
          id: "s1",
          type: "speech",
          content: "Test content",
          confidence: 0.9,
          innovationRelevance: 80,
        },
      ],
      summary: "A video analysis",
      keyInsights: ["Insight 1"],
      innovationSubjects: [
        {
          subject: "AI in retail",
          confidence: 0.85,
          sourceSegments: ["s1"],
        },
      ],
      processedAt: new Date().toISOString(),
    });

    expect(result.mediaType).toBe("video");
    expect(result.segments).toHaveLength(1);
    expect(result.innovationSubjects).toHaveLength(1);
  });
});
