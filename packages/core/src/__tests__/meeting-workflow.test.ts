/**
 * Tests for the Multi-Modal meeting workflow module.
 */

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
  withRetry: vi.fn((fn: () => unknown) => fn()),
  wrapUserInput: vi.fn((_tag: string, text: string) => text),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));
vi.mock("../copilot/client.js", () => ({
  generateText: mocks.generateText,
  extractJson: mocks.extractJson,
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: mocks.withRetry,
}));
vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: mocks.wrapUserInput,
  sanitizeLlmOutput: mocks.sanitizeLlmOutput,
}));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  analyzeMeeting,
  meetingAnalysisToMarkdown,
  extractKeyFrameTimestamps,
} from "../multi-modal/meeting-workflow.js";
import type { MeetingInput } from "../multi-modal/meeting-workflow.js";

const MOCK_ANALYSIS_RESPONSE = JSON.stringify({
  meetingTitle: "Product Strategy Meeting",
  summary: "Team discussed Q2 product roadmap",
  topics: [
    { title: "AI Feature Roadmap", description: "Discussion about AI features", innovationPotential: "high", keywords: ["AI", "roadmap"] },
    { title: "Performance Improvements", description: "Backend optimization plans", innovationPotential: "medium", keywords: ["performance", "optimization"] },
  ],
  actionItems: [
    { description: "Draft AI feature PRD", assignee: "Alice", priority: "high" },
    { description: "Set up performance benchmarks", priority: "medium" },
  ],
  innovationOpportunities: [
    { title: "AI-Powered Search", description: "Use embeddings for semantic search", suggestedAngle: "cross-domain", confidence: 0.85 },
  ],
  suggestedSubjects: ["AI-powered semantic search for enterprise", "Performance optimization through caching"],
  participants: ["Alice", "Bob", "Charlie"],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("meeting-workflow", () => {
  describe("extractKeyFrameTimestamps", () => {
    it("extracts evenly spaced timestamps", () => {
      const timestamps = extractKeyFrameTimestamps(60, 5);
      expect(timestamps).toHaveLength(5);
      expect(timestamps[0]).toBe(10);
      expect(timestamps[4]).toBe(50);
    });

    it("returns empty for zero duration", () => {
      expect(extractKeyFrameTimestamps(0, 5)).toHaveLength(0);
    });

    it("returns empty for zero max frames", () => {
      expect(extractKeyFrameTimestamps(60, 0)).toHaveLength(0);
    });

    it("handles single frame", () => {
      const timestamps = extractKeyFrameTimestamps(120, 1);
      expect(timestamps).toHaveLength(1);
      expect(timestamps[0]).toBe(60);
    });
  });

  describe("analyzeMeeting", () => {
    it("analyzes meeting inputs", async () => {
      mocks.generateText.mockResolvedValue(MOCK_ANALYSIS_RESPONSE);

      const inputs: MeetingInput[] = [
        {
          id: "input-1",
          type: "transcript",
          filename: "meeting.txt",
          content: "Alice: Let's discuss the AI roadmap...",
          uploadedAt: new Date().toISOString(),
        },
      ];

      const analysis = await analyzeMeeting(inputs);

      expect(analysis.id).toMatch(/^meeting-/);
      expect(analysis.meetingTitle).toBe("Product Strategy Meeting");
      expect(analysis.topics).toHaveLength(2);
      expect(analysis.actionItems).toHaveLength(2);
      expect(analysis.innovationOpportunities).toHaveLength(1);
      expect(analysis.suggestedSubjects).toHaveLength(2);
      expect(analysis.participants).toContain("Alice");
    });

    it("throws for empty inputs", async () => {
      await expect(analyzeMeeting([])).rejects.toThrow("At least one meeting input");
    });

    it("includes duration when provided", async () => {
      mocks.generateText.mockResolvedValue(MOCK_ANALYSIS_RESPONSE);

      const inputs: MeetingInput[] = [
        {
          id: "input-1",
          type: "audio-recording",
          filename: "meeting.mp3",
          content: "base64content",
          durationSeconds: 3600,
          uploadedAt: new Date().toISOString(),
        },
      ];

      const analysis = await analyzeMeeting(inputs);
      expect(analysis.durationMinutes).toBe(60);
    });
  });

  describe("meetingAnalysisToMarkdown", () => {
    it("formats analysis as markdown", async () => {
      mocks.generateText.mockResolvedValue(MOCK_ANALYSIS_RESPONSE);

      const inputs: MeetingInput[] = [
        { id: "i1", type: "transcript", filename: "m.txt", content: "hello", uploadedAt: new Date().toISOString() },
      ];

      const analysis = await analyzeMeeting(inputs);
      const md = meetingAnalysisToMarkdown(analysis);

      expect(md).toContain("Meeting Analysis");
      expect(md).toContain("Product Strategy Meeting");
      expect(md).toContain("Innovation Opportunities");
      expect(md).toContain("AI-Powered Search");
      expect(md).toContain("cross-domain");
      expect(md).toContain("Suggested Innovation Subjects");
      expect(md).toContain("Action Items");
      expect(md).toContain("Alice");
    });
  });
});
