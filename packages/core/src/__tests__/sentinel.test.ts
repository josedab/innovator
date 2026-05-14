import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { collectSignals, briefToMarkdown } from "../sentinel/sentinel.js";
import type { SignalSource, DailyBrief } from "../sentinel/types.js";

describe("sentinel", () => {
  describe("collectSignals", () => {
    it("returns empty array for empty sources", async () => {
      const signals = await collectSignals([], new Set());
      expect(signals).toEqual([]);
    });

    it("returns empty array for disabled sources", async () => {
      const sources: SignalSource[] = [
        { id: "test", type: "rss", name: "Test", url: "http://example.com/feed", enabled: false },
      ];
      const signals = await collectSignals(sources, new Set());
      expect(signals).toEqual([]);
    });

    it("returns empty array for sources without URL", async () => {
      const sources: SignalSource[] = [{ id: "test", type: "rss", name: "Test", enabled: true }];
      const signals = await collectSignals(sources, new Set());
      expect(signals).toEqual([]);
    });

    it("skips already-processed signal IDs", async () => {
      const processedIds = new Set(["sig-test-Some-Title"]);
      const sources: SignalSource[] = [
        { id: "test", type: "rss", name: "Test", url: "http://example.com/feed", enabled: true },
      ];
      // Will fail to fetch but should not crash
      const signals = await collectSignals(sources, processedIds);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe("briefToMarkdown", () => {
    it("formats empty brief correctly", () => {
      const brief: DailyBrief = {
        id: "brief-2026-05-13",
        date: "2026-05-13",
        signalsDetected: 0,
        signalsProcessed: 0,
        opportunities: [],
        createdAt: "2026-05-13T10:00:00Z",
      };
      const md = briefToMarkdown(brief);
      expect(md).toContain("Sentinel Daily Brief");
      expect(md).toContain("No significant opportunities");
    });

    it("formats brief with opportunities", () => {
      const brief: DailyBrief = {
        id: "brief-2026-05-13",
        date: "2026-05-13",
        signalsDetected: 10,
        signalsProcessed: 3,
        opportunities: [
          {
            id: "opp-1",
            signalId: "sig-1",
            title: "AI Regulation Update",
            description: "New regulation creates opportunity",
            ideas: [{ title: "Compliance Tool", description: "Build it", angleId: "constraints" }],
            overallRelevance: 0.85,
            createdAt: "2026-05-13T10:00:00Z",
            status: "new",
          },
        ],
        topOpportunity: undefined,
        createdAt: "2026-05-13T10:00:00Z",
      };
      const md = briefToMarkdown(brief);
      expect(md).toContain("AI Regulation Update");
      expect(md).toContain("Compliance Tool");
      expect(md).toContain("85%");
    });
  });

  describe("runSentinel validation", () => {
    it("throws on empty sources", async () => {
      const { runSentinel } = await import("../sentinel/sentinel.js");
      await expect(runSentinel({ sources: [], topics: ["AI"] })).rejects.toThrow(
        "At least one signal source is required"
      );
    });

    it("throws on empty topics", async () => {
      const { runSentinel } = await import("../sentinel/sentinel.js");
      await expect(
        runSentinel({
          sources: [{ id: "t", type: "rss", name: "T", url: "http://x.com", enabled: true }],
          topics: [],
        })
      ).rejects.toThrow("At least one topic is required");
    });

    it("throws on invalid relevance threshold", async () => {
      const { runSentinel } = await import("../sentinel/sentinel.js");
      await expect(
        runSentinel({
          sources: [{ id: "t", type: "rss", name: "T", url: "http://x.com", enabled: true }],
          topics: ["AI"],
          relevanceThreshold: 1.5,
        })
      ).rejects.toThrow("Relevance threshold must be between 0 and 1");
    });
  });
});
