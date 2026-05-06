import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  analyzeTimings,
  getTimingAnalysis,
  listTimingAnalyses,
  getActionableIdeas,
  timingToMarkdown,
  clearTimingData,
  type TimingAnalysis,
  type IdeaTiming,
} from "../timing/index.js";
import { generateText, extractJson } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

function makeIdeaTiming(overrides: Partial<IdeaTiming> = {}): IdeaTiming {
  return {
    ideaTitle: "Test Idea",
    classification: "right-time",
    confidence: 0.8,
    signals: [
      {
        source: "hype-cycle",
        signalName: "AI Hype",
        value: 7.5,
        trend: "rising",
        confidence: 0.85,
        description: "AI is trending",
      },
    ],
    optimalWindowStart: "Q2 2025",
    optimalWindowEnd: "Q4 2026",
    urgencyScore: 75,
    risks: ["Market saturation"],
    opportunities: ["First-mover advantage"],
    rationale: "Good timing based on signals",
    ...overrides,
  };
}

function makeLlmResponse(ideas: IdeaTiming[], maturity = "growing") {
  return JSON.stringify({
    ideas,
    marketMaturityStage: maturity,
    overallTimingAdvice: "Act now",
  });
}

describe("timing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTimingData();
  });

  describe("analyzeTimings", () => {
    it("rejects empty ideas array with error", async () => {
      await expect(analyzeTimings("Subject", [])).rejects.toThrow("No ideas to analyze");
    });

    it("classifies ideas into 4 states", async () => {
      const ideas = [
        makeIdeaTiming({ ideaTitle: "A", classification: "too-early" }),
        makeIdeaTiming({ ideaTitle: "B", classification: "right-time" }),
        makeIdeaTiming({ ideaTitle: "C", classification: "peak-window" }),
        makeIdeaTiming({ ideaTitle: "D", classification: "late-entry" }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(ideas));

      const result = await analyzeTimings("Subject", [
        { title: "A", description: "desc" },
        { title: "B", description: "desc" },
        { title: "C", description: "desc" },
        { title: "D", description: "desc" },
      ]);
      const classifications = result.ideas.map((i) => i.classification);
      expect(classifications).toEqual(["too-early", "right-time", "peak-window", "late-entry"]);
    });

    it("parses 7 signal sources correctly", async () => {
      const signals = [
        {
          source: "hype-cycle" as const,
          signalName: "S1",
          value: 1,
          trend: "rising" as const,
          confidence: 0.5,
          description: "d",
        },
        {
          source: "google-trends" as const,
          signalName: "S2",
          value: 2,
          trend: "stable" as const,
          confidence: 0.5,
          description: "d",
        },
        {
          source: "competitive-density" as const,
          signalName: "S3",
          value: 3,
          trend: "declining" as const,
          confidence: 0.5,
          description: "d",
        },
        {
          source: "regulatory" as const,
          signalName: "S4",
          value: 4,
          trend: "volatile" as const,
          confidence: 0.5,
          description: "d",
        },
        {
          source: "funding" as const,
          signalName: "S5",
          value: 5,
          trend: "rising" as const,
          confidence: 0.5,
          description: "d",
        },
        {
          source: "adoption-rate" as const,
          signalName: "S6",
          value: 6,
          trend: "rising" as const,
          confidence: 0.5,
          description: "d",
        },
        {
          source: "patent-filings" as const,
          signalName: "S7",
          value: 7,
          trend: "rising" as const,
          confidence: 0.5,
          description: "d",
        },
      ];
      const idea = makeIdeaTiming({ signals });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse([idea]));

      const result = await analyzeTimings("S", [{ title: "T", description: "d" }]);
      const sources = result.ideas[0].signals.map((s) => s.source);
      expect(sources).toEqual([
        "hype-cycle",
        "google-trends",
        "competitive-density",
        "regulatory",
        "funding",
        "adoption-rate",
        "patent-filings",
      ]);
    });

    it("validates signal trend values", async () => {
      const idea = makeIdeaTiming({
        signals: [
          {
            source: "hype-cycle",
            signalName: "S",
            value: 1,
            trend: "rising",
            confidence: 0.5,
            description: "d",
          },
          {
            source: "funding",
            signalName: "S",
            value: 1,
            trend: "stable",
            confidence: 0.5,
            description: "d",
          },
          {
            source: "regulatory",
            signalName: "S",
            value: 1,
            trend: "declining",
            confidence: 0.5,
            description: "d",
          },
          {
            source: "google-trends",
            signalName: "S",
            value: 1,
            trend: "volatile",
            confidence: 0.5,
            description: "d",
          },
        ],
      });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse([idea]));
      const result = await analyzeTimings("S", [{ title: "T", description: "d" }]);
      const trends = result.ideas[0].signals.map((s) => s.trend);
      expect(trends).toEqual(["rising", "stable", "declining", "volatile"]);
    });

    it("confidence interval is in 0-1 range", async () => {
      const idea = makeIdeaTiming({ confidence: 0.75 });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse([idea]));
      const result = await analyzeTimings("S", [{ title: "T", description: "d" }]);
      expect(result.ideas[0].confidence).toBeGreaterThanOrEqual(0);
      expect(result.ideas[0].confidence).toBeLessThanOrEqual(1);
    });

    it("stores result and retrieves it", async () => {
      const idea = makeIdeaTiming();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse([idea]));
      await analyzeTimings("MySubject", [{ title: "T", description: "d" }]);
      const stored = getTimingAnalysis("MySubject");
      expect(stored).toBeDefined();
      expect(stored?.subject).toBe("MySubject");
    });
  });

  describe("getActionableIdeas", () => {
    it("filters only peak-window and right-time sorted by urgencyScore desc", () => {
      const analysis: TimingAnalysis = {
        subject: "Test",
        ideas: [
          makeIdeaTiming({ ideaTitle: "Too Early", classification: "too-early", urgencyScore: 90 }),
          makeIdeaTiming({
            ideaTitle: "Right Time",
            classification: "right-time",
            urgencyScore: 60,
          }),
          makeIdeaTiming({ ideaTitle: "Peak", classification: "peak-window", urgencyScore: 80 }),
          makeIdeaTiming({ ideaTitle: "Late", classification: "late-entry", urgencyScore: 50 }),
        ],
        marketMaturityStage: "growing",
        overallTimingAdvice: "Act now",
        analyzedAt: Date.now(),
      };
      const actionable = getActionableIdeas(analysis);
      expect(actionable).toHaveLength(2);
      expect(actionable[0].ideaTitle).toBe("Peak");
      expect(actionable[1].ideaTitle).toBe("Right Time");
    });

    it("returns empty when no actionable ideas", () => {
      const analysis: TimingAnalysis = {
        subject: "Test",
        ideas: [
          makeIdeaTiming({ classification: "too-early" }),
          makeIdeaTiming({ classification: "late-entry" }),
        ],
        marketMaturityStage: "mature",
        overallTimingAdvice: "Wait",
        analyzedAt: Date.now(),
      };
      expect(getActionableIdeas(analysis)).toHaveLength(0);
    });
  });

  describe("timingToMarkdown", () => {
    it("maps emoji per classification", () => {
      const analysis: TimingAnalysis = {
        subject: "Test",
        ideas: [
          makeIdeaTiming({ ideaTitle: "A", classification: "too-early" }),
          makeIdeaTiming({ ideaTitle: "B", classification: "right-time" }),
          makeIdeaTiming({ ideaTitle: "C", classification: "peak-window" }),
          makeIdeaTiming({ ideaTitle: "D", classification: "late-entry" }),
        ],
        marketMaturityStage: "growing",
        overallTimingAdvice: "Advice",
        analyzedAt: Date.now(),
      };
      const md = timingToMarkdown(analysis);
      expect(md).toContain("🕐");
      expect(md).toContain("✅");
      expect(md).toContain("🔥");
      expect(md).toContain("⚠️");
    });

    it("includes market maturity and subject", () => {
      const analysis: TimingAnalysis = {
        subject: "AI Innovation",
        ideas: [makeIdeaTiming()],
        marketMaturityStage: "emerging",
        overallTimingAdvice: "Go!",
        analyzedAt: Date.now(),
      };
      const md = timingToMarkdown(analysis);
      expect(md).toContain("AI Innovation");
      expect(md).toContain("emerging");
    });
  });

  describe("storage operations", () => {
    it("listTimingAnalyses returns all stored", async () => {
      const idea = makeIdeaTiming();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse([idea]));
      await analyzeTimings("S1", [{ title: "T", description: "d" }]);
      await analyzeTimings("S2", [{ title: "T", description: "d" }]);
      expect(listTimingAnalyses()).toHaveLength(2);
    });

    it("clearTimingData removes all entries", async () => {
      const idea = makeIdeaTiming();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse([idea]));
      await analyzeTimings("S1", [{ title: "T", description: "d" }]);
      clearTimingData();
      expect(listTimingAnalyses()).toHaveLength(0);
    });

    it("getTimingAnalysis returns undefined for missing key", () => {
      expect(getTimingAnalysis("nonexistent")).toBeUndefined();
    });
  });
});
