import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: """${value}"""`),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import {
  MarketSignalSchema,
  _MarketSignalReportSchema,
  registerSignalProvider,
  unregisterSignalProvider,
  listSignalProviders,
  getAvailableProviders,
  clearSignalProviders,
  fetchMarketSignals,
  buildMarketSignalContext,
} from "../market-signals/index.js";
import type {
  MarketSignalProvider,
  MarketSignal,
  MarketSignalReport,
} from "../market-signals/index.js";
import { generateText, extractJson } from "../copilot/client.js";

function makeFakeProvider(
  id: string,
  signals: MarketSignal[] = [],
  available = true
): MarketSignalProvider {
  return {
    id,
    name: `Provider ${id}`,
    category: "product",
    fetchSignals: vi.fn().mockResolvedValue(signals),
    isAvailable: () => available,
  };
}

const sampleSignal: MarketSignal = {
  source: "TestSource",
  title: "Test Signal",
  summary: "A test signal",
  relevanceScore: 0.8,
  category: "product",
};

describe("market-signals", () => {
  beforeEach(() => {
    clearSignalProviders();
    vi.resetAllMocks();
  });

  // ---- Schemas ----

  describe("MarketSignalSchema", () => {
    it("validates a correct signal", () => {
      expect(() => MarketSignalSchema.parse(sampleSignal)).not.toThrow();
    });

    it("rejects missing source", () => {
      expect(() => MarketSignalSchema.parse({ ...sampleSignal, source: undefined })).toThrow();
    });

    it("rejects invalid category", () => {
      expect(() => MarketSignalSchema.parse({ ...sampleSignal, category: "invalid" })).toThrow();
    });
  });

  // ---- Provider Registry ----

  describe("registerSignalProvider / unregisterSignalProvider", () => {
    it("registers and lists providers", () => {
      const p = makeFakeProvider("test-p");
      registerSignalProvider(p);
      expect(listSignalProviders()).toHaveLength(1);
      expect(listSignalProviders()[0].id).toBe("test-p");
    });

    it("unregisters provider by id", () => {
      registerSignalProvider(makeFakeProvider("x"));
      expect(unregisterSignalProvider("x")).toBe(true);
      expect(listSignalProviders()).toHaveLength(0);
    });

    it("returns false for unregistering unknown provider", () => {
      expect(unregisterSignalProvider("unknown")).toBe(false);
    });

    it("overwrites duplicate registration", () => {
      registerSignalProvider(makeFakeProvider("dup"));
      const p2 = makeFakeProvider("dup");
      p2.name = "Second";
      registerSignalProvider(p2);
      expect(listSignalProviders()).toHaveLength(1);
      expect(listSignalProviders()[0].name).toBe("Second");
    });
  });

  describe("getAvailableProviders", () => {
    it("returns only available providers", () => {
      registerSignalProvider(makeFakeProvider("avail", [], true));
      registerSignalProvider(makeFakeProvider("unavail", [], false));
      expect(getAvailableProviders()).toHaveLength(1);
      expect(getAvailableProviders()[0].id).toBe("avail");
    });
  });

  describe("clearSignalProviders", () => {
    it("resets all providers", () => {
      registerSignalProvider(makeFakeProvider("a"));
      registerSignalProvider(makeFakeProvider("b"));
      clearSignalProviders();
      expect(listSignalProviders()).toHaveLength(0);
    });
  });

  // ---- fetchMarketSignals ----

  describe("fetchMarketSignals", () => {
    it("aggregates signals from all providers", async () => {
      const s1: MarketSignal = { ...sampleSignal, source: "P1", relevanceScore: 0.9 };
      const s2: MarketSignal = { ...sampleSignal, source: "P2", relevanceScore: 0.7 };
      registerSignalProvider(makeFakeProvider("p1", [s1]));
      registerSignalProvider(makeFakeProvider("p2", [s2]));

      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(
        JSON.stringify({ summary: "Test summary", temperature: "hot", opportunities: ["Opp1"] })
      );

      const report = await fetchMarketSignals("test query");
      expect(report.query).toBe("test query");
      expect(report.signals).toHaveLength(2);
      expect(report.signals[0].relevanceScore).toBeGreaterThanOrEqual(
        report.signals[1].relevanceScore
      );
    });

    it("returns cold temperature with zero providers", async () => {
      const report = await fetchMarketSignals("empty");
      expect(report.signals).toHaveLength(0);
      expect(report.marketTemperature).toBe("cold");
    });

    it("skips providers that throw", async () => {
      const failProvider = makeFakeProvider("fail");
      (failProvider.fetchSignals as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      registerSignalProvider(failProvider);
      registerSignalProvider(makeFakeProvider("ok", [sampleSignal]));

      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(
        JSON.stringify({ summary: "ok", temperature: "warming", opportunities: [] })
      );

      const report = await fetchMarketSignals("test");
      expect(report.signals).toHaveLength(1);
    });

    it("handles empty query", async () => {
      registerSignalProvider(makeFakeProvider("p", [sampleSignal]));
      vi.mocked(generateText).mockResolvedValue("json");
      vi.mocked(extractJson).mockReturnValue(
        JSON.stringify({ summary: "ok", temperature: "warming", opportunities: [] })
      );

      const report = await fetchMarketSignals("");
      expect(report.query).toBe("");
    });
  });

  // ---- buildMarketSignalContext ----

  describe("buildMarketSignalContext", () => {
    it("formats report for LLM consumption", () => {
      const report: MarketSignalReport = {
        query: "AI tools",
        signals: [sampleSignal],
        trendingSummary: "AI is trending",
        marketTemperature: "hot",
        topOpportunities: ["Build AI apps"],
        fetchedAt: "2025-01-01T00:00:00Z",
      };
      const ctx = buildMarketSignalContext(report);
      expect(ctx).toContain("LIVE MARKET SIGNALS");
      expect(ctx).toContain("hot");
      expect(ctx).toContain("AI is trending");
      expect(ctx).toContain("Test Signal");
      expect(ctx).toContain("Build AI apps");
    });

    it("handles empty opportunities", () => {
      const report: MarketSignalReport = {
        query: "q",
        signals: [],
        trendingSummary: "summary",
        marketTemperature: "cold",
        topOpportunities: [],
        fetchedAt: "2025-01-01T00:00:00Z",
      };
      const ctx = buildMarketSignalContext(report);
      expect(ctx).not.toContain("Opportunities:");
    });
  });
});
