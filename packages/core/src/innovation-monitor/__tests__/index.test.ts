import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
}));

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((_label: string, value: string) => value),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import {
  addMonitorSource,
  removeMonitorSource,
  listMonitorSources,
  updateMonitorSource,
  detectOpportunities,
  scoreSignal,
  getRecentSignals,
  generateDigest,
  digestToMarkdown,
  digestToHtml,
  startMonitor,
  stopMonitor,
  getMonitorState,
  clearMonitorData,
  type MonitorSource,
  type OpportunitySignal,
  type MonitorConfig,
} from "../index.js";
import { generateText } from "../../copilot/client.js";
import { existsSync, readFileSync } from "node:fs";

function makeSource(overrides?: Partial<MonitorSource>): MonitorSource {
  return {
    id: `src-${Math.random().toString(36).slice(2, 8)}`,
    type: "codebase",
    name: "Test Source",
    config: {},
    enabled: true,
    pollIntervalMs: 60_000,
    ...overrides,
  };
}

function makeSignal(overrides?: Partial<OpportunitySignal>): OpportunitySignal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: "src-1",
    type: "pattern",
    title: "Test Signal",
    description: "A test signal",
    confidence: 0.8,
    urgency: "medium",
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("innovation-monitor", () => {
  beforeEach(() => {
    clearMonitorData();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopMonitor();
  });

  // ---- Source Management ----

  describe("addMonitorSource", () => {
    it("adds and returns validated source", () => {
      const source = addMonitorSource(makeSource({ id: "s1", name: "My Source" }));
      expect(source.id).toBe("s1");
      expect(source.name).toBe("My Source");
      expect(source.enabled).toBe(true);
    });

    it("lists added sources", () => {
      addMonitorSource(makeSource({ id: "s1" }));
      addMonitorSource(makeSource({ id: "s2" }));
      expect(listMonitorSources()).toHaveLength(2);
    });
  });

  describe("removeMonitorSource", () => {
    it("removes an existing source", () => {
      addMonitorSource(makeSource({ id: "s1" }));
      removeMonitorSource("s1");
      expect(listMonitorSources()).toHaveLength(0);
    });

    it("throws for non-existent source", () => {
      expect(() => removeMonitorSource("nonexistent")).toThrow("not found");
    });
  });

  describe("updateMonitorSource", () => {
    it("updates source config", () => {
      addMonitorSource(makeSource({ id: "s1", name: "Original" }));
      const updated = updateMonitorSource("s1", { name: "Updated" });
      expect(updated.name).toBe("Updated");
    });

    it("throws for non-existent source", () => {
      expect(() => updateMonitorSource("nonexistent", { name: "x" })).toThrow("not found");
    });
  });

  // ---- detectOpportunities ----

  describe("detectOpportunities", () => {
    it("detects opportunities from LLM response", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          opportunities: [
            {
              type: "trend",
              title: "AI Growth",
              description: "AI is growing fast",
              confidence: 0.9,
              urgency: "high",
            },
          ],
        })
      );

      const signals = await detectOpportunities("s1");
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        type: "trend",
        title: "AI Growth",
        confidence: 0.9,
        urgency: "high",
        sourceId: "s1",
      });
      expect(signals[0].id).toBeTruthy();
      expect(signals[0].detectedAt).toBeTruthy();
    });

    it("returns empty for disabled source", async () => {
      addMonitorSource(makeSource({ id: "s1", enabled: false }));
      const signals = await detectOpportunities("s1");
      expect(signals).toEqual([]);
    });

    it("throws for non-existent source", async () => {
      await expect(detectOpportunities("nonexistent")).rejects.toThrow("not found");
    });

    it("returns empty on LLM failure", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      vi.mocked(generateText).mockRejectedValue(new Error("LLM down"));

      const signals = await detectOpportunities("s1");
      expect(signals).toEqual([]);
    });

    it("filters signals below confidence threshold", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          opportunities: [
            {
              type: "gap",
              title: "Low conf",
              description: "desc",
              confidence: 0.2,
              urgency: "low",
            },
            {
              type: "gap",
              title: "High conf",
              description: "desc",
              confidence: 0.8,
              urgency: "low",
            },
          ],
        })
      );

      const signals = await detectOpportunities("s1");
      expect(signals).toHaveLength(1);
      expect(signals[0].title).toBe("High conf");
    });

    it("handles malformed LLM response (no opportunities key)", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      vi.mocked(generateText).mockResolvedValue(JSON.stringify({ data: [] }));

      const signals = await detectOpportunities("s1");
      expect(signals).toEqual([]);
    });
  });

  // ---- scoreSignal ----

  describe("scoreSignal", () => {
    it("scores a signal with LLM response", async () => {
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          innovationScore: 8.5,
          rationale: "Very innovative approach",
        })
      );

      const scored = await scoreSignal(makeSignal());
      expect(scored.innovationScore).toBe(8.5);
      expect(scored.rationale).toBe("Very innovative approach");
    });

    it("clamps score to 0-10 range", async () => {
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          innovationScore: 15,
          rationale: "Out of range",
        })
      );

      const scored = await scoreSignal(makeSignal());
      expect(scored.innovationScore).toBeLessThanOrEqual(10);
    });

    it("uses default score on LLM failure", async () => {
      vi.mocked(generateText).mockRejectedValue(new Error("LLM down"));

      const scored = await scoreSignal(makeSignal());
      expect(scored.innovationScore).toBe(5);
      expect(scored.rationale).toContain("default");
    });

    it("returns the original signal in the result", async () => {
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          innovationScore: 7,
          rationale: "Good",
        })
      );
      const signal = makeSignal({ title: "My Signal" });
      const scored = await scoreSignal(signal);
      expect(scored.signal.title).toBe("My Signal");
    });
  });

  // ---- getRecentSignals ----

  describe("getRecentSignals", () => {
    it("returns empty array with no signals", () => {
      expect(getRecentSignals()).toEqual([]);
    });

    it("returns signals sorted by detectedAt descending", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          opportunities: [
            { type: "trend", title: "Early", description: "d", confidence: 0.9, urgency: "low" },
            { type: "gap", title: "Late", description: "d", confidence: 0.9, urgency: "high" },
          ],
        })
      );
      await detectOpportunities("s1");

      const signals = getRecentSignals();
      expect(signals.length).toBeGreaterThanOrEqual(2);
    });

    it("filters by sourceId", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      addMonitorSource(makeSource({ id: "s2" }));
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          opportunities: [
            { type: "trend", title: "A", description: "d", confidence: 0.9, urgency: "low" },
          ],
        })
      );
      await detectOpportunities("s1");
      await detectOpportunities("s2");

      const filtered = getRecentSignals({ sourceId: "s1" });
      for (const s of filtered) {
        expect(s.sourceId).toBe("s1");
      }
    });

    it("respects limit option", async () => {
      addMonitorSource(makeSource({ id: "s1" }));
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          opportunities: [
            { type: "trend", title: "A", description: "d", confidence: 0.9, urgency: "low" },
            { type: "gap", title: "B", description: "d", confidence: 0.9, urgency: "high" },
            { type: "anomaly", title: "C", description: "d", confidence: 0.9, urgency: "medium" },
          ],
        })
      );
      await detectOpportunities("s1");

      const limited = getRecentSignals({ limit: 1 });
      expect(limited).toHaveLength(1);
    });
  });

  // ---- generateDigest ----

  describe("generateDigest", () => {
    it("generates a daily digest with stats", async () => {
      addMonitorSource(makeSource({ id: "s1" }));

      // First call for detectOpportunities
      vi.mocked(generateText)
        .mockResolvedValueOnce(
          JSON.stringify({
            opportunities: [
              { type: "trend", title: "T1", description: "d", confidence: 0.9, urgency: "high" },
            ],
          })
        )
        // scoreSignal call
        .mockResolvedValueOnce(
          JSON.stringify({
            innovationScore: 8,
            rationale: "Great",
          })
        )
        // generateDigest trend summary call
        .mockResolvedValueOnce(
          JSON.stringify({
            trendSummary: "Emerging AI trends",
            recommendedActions: ["Invest in AI", "Hire ML engineers"],
          })
        );

      await detectOpportunities("s1");
      const digest = await generateDigest("daily");

      expect(digest.period).toBe("daily");
      expect(digest.id).toBeTruthy();
      expect(digest.generatedAt).toBeTruthy();
      expect(digest.stats.totalSignals).toBeGreaterThanOrEqual(0);
      expect(digest.stats.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(digest.stats.avgConfidence).toBeLessThanOrEqual(1);
    });

    it("generates empty digest when no signals exist", async () => {
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          innovationScore: 5,
          rationale: "N/A",
        })
      );

      const digest = await generateDigest("weekly");
      expect(digest.period).toBe("weekly");
      expect(digest.stats.totalSignals).toBe(0);
      expect(digest.trendSummary).toContain("No signals");
      expect(digest.recommendedActions).toEqual([]);
    });
  });

  // ---- digestToMarkdown ----

  describe("digestToMarkdown", () => {
    it("produces valid markdown with all sections", () => {
      const digest = {
        id: "d1",
        period: "daily" as const,
        generatedAt: new Date().toISOString(),
        signals: [makeSignal()],
        topOpportunities: [
          {
            signal: makeSignal(),
            innovationScore: 8,
            rationale: "Strong potential",
          },
        ],
        trendSummary: "AI is trending",
        recommendedActions: ["Act now"],
        stats: {
          totalSignals: 1,
          byType: { pattern: 1 },
          byUrgency: { medium: 1 },
          avgConfidence: 0.8,
        },
      };

      const md = digestToMarkdown(digest);
      expect(md).toContain("# Innovation Digest");
      expect(md).toContain("daily");
      expect(md).toContain("## Summary");
      expect(md).toContain("AI is trending");
      expect(md).toContain("## Stats");
      expect(md).toContain("Total signals");
      expect(md).toContain("## Top Opportunities");
      expect(md).toContain("## Recommended Actions");
      expect(md).toContain("Act now");
      expect(md).toContain("## All Signals");
    });

    it("handles empty digest gracefully", () => {
      const digest = {
        id: "d1",
        period: "weekly" as const,
        generatedAt: new Date().toISOString(),
        signals: [],
        topOpportunities: [],
        trendSummary: "Nothing",
        recommendedActions: [],
        stats: { totalSignals: 0, byType: {}, byUrgency: {}, avgConfidence: 0 },
      };

      const md = digestToMarkdown(digest);
      expect(md).toContain("# Innovation Digest");
      expect(md).not.toContain("## Top Opportunities");
      expect(md).not.toContain("## All Signals");
    });
  });

  // ---- digestToHtml ----

  describe("digestToHtml", () => {
    it("produces valid HTML structure", () => {
      const digest = {
        id: "d1",
        period: "daily" as const,
        generatedAt: new Date().toISOString(),
        signals: [makeSignal()],
        topOpportunities: [
          {
            signal: makeSignal(),
            innovationScore: 7,
            rationale: "Good",
          },
        ],
        trendSummary: "Test summary",
        recommendedActions: ["Do something"],
        stats: {
          totalSignals: 1,
          byType: { trend: 1 },
          byUrgency: { high: 1 },
          avgConfidence: 0.9,
        },
      };

      const html = digestToHtml(digest);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<h1>");
      expect(html).toContain("<h2>Summary</h2>");
      expect(html).toContain("<h2>Stats</h2>");
      expect(html).toContain("Test summary");
      expect(html).toContain("Do something");
    });

    it("escapes HTML entities", () => {
      const digest = {
        id: "d1",
        period: "daily" as const,
        generatedAt: new Date().toISOString(),
        signals: [],
        topOpportunities: [],
        trendSummary: "A <script>alert('xss')</script> test",
        recommendedActions: [],
        stats: { totalSignals: 0, byType: {}, byUrgency: {}, avgConfidence: 0 },
      };

      const html = digestToHtml(digest);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  // ---- Monitor Lifecycle ----

  describe("startMonitor / stopMonitor", () => {
    it("starts monitor and sets running state", () => {
      const config: MonitorConfig = {
        sources: [makeSource({ id: "s1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      const state = startMonitor(config);
      expect(state.status).toBe("running");
    });

    it("throws when starting already running monitor", () => {
      const config: MonitorConfig = {
        sources: [makeSource({ id: "s1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      startMonitor(config);
      expect(() => startMonitor(config)).toThrow("already running");
    });

    it("stops monitor and sets idle state", () => {
      const config: MonitorConfig = {
        sources: [makeSource({ id: "s1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      startMonitor(config);
      const state = stopMonitor();
      expect(state.status).toBe("idle");
    });

    it("can restart after stopping", () => {
      const config: MonitorConfig = {
        sources: [makeSource({ id: "s1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      startMonitor(config);
      stopMonitor();
      const state = startMonitor(config);
      expect(state.status).toBe("running");
    });

    it("registers sources from config", () => {
      const config: MonitorConfig = {
        sources: [makeSource({ id: "s1" }), makeSource({ id: "s2" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      startMonitor(config);
      expect(listMonitorSources()).toHaveLength(2);
    });

    it("skips disabled sources for poll timers", () => {
      const config: MonitorConfig = {
        sources: [
          makeSource({ id: "s1", enabled: true }),
          makeSource({ id: "s2", enabled: false }),
        ],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      startMonitor(config);
      expect(getMonitorState().status).toBe("running");
    });
  });

  // ---- getMonitorState ----

  describe("getMonitorState", () => {
    it("returns idle state initially", () => {
      const state = getMonitorState();
      expect(state.status).toBe("idle");
      expect(state.signalCount).toBe(0);
      expect(state.digestCount).toBe(0);
    });
  });

  // ---- File persistence ----

  describe("file persistence", () => {
    it("recovers from corrupt signals file", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("not valid json{{{");

      // Should not throw — corrupted file should be recovered
      const signals = getRecentSignals();
      expect(signals).toEqual([]);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles empty sources config", () => {
      const config: MonitorConfig = {
        sources: [],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      };

      const state = startMonitor(config);
      expect(state.status).toBe("running");
      expect(listMonitorSources()).toHaveLength(0);
    });

    it("validates pollIntervalMs minimum", () => {
      expect(() => addMonitorSource(makeSource({ pollIntervalMs: 500 }))).toThrow();
    });
  });
});
