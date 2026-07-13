import { vi } from "vitest";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue(
      '{"signals":[{"title":"Test Signal","type":"pattern","confidence":0.8,"description":"A test signal"}]}'
    ),
  extractJson: vi.fn((s) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

import { describe, it, expect, beforeEach } from "vitest";
import {
  addMonitorSource,
  removeMonitorSource,
  listMonitorSources,
  updateMonitorSource,
  getRecentSignals,
  digestToMarkdown,
  digestToHtml,
  startMonitor,
  stopMonitor,
  getMonitorState,
  clearMonitorData,
  detectOpportunities,
  scoreSignal,
  generateDigest,
} from "../index.js";
import type { MonitorSource, OpportunitySignal, InnovationDigest } from "../index.js";

// ---- Helpers ----

function makeSource(overrides?: Partial<MonitorSource>): MonitorSource {
  return {
    id: overrides?.id ?? "src-1",
    type: overrides?.type ?? "market",
    name: overrides?.name ?? "Test Source",
    config: overrides?.config ?? { url: "https://example.com" },
    enabled: overrides?.enabled ?? true,
    pollIntervalMs: overrides?.pollIntervalMs ?? 60_000,
  };
}

function makeSignal(overrides?: Partial<OpportunitySignal>): OpportunitySignal {
  return {
    id: overrides?.id ?? "sig-1",
    sourceId: overrides?.sourceId ?? "src-1",
    type: overrides?.type ?? "pattern",
    title: overrides?.title ?? "Test Signal",
    description: overrides?.description ?? "A test signal",
    confidence: overrides?.confidence ?? 0.8,
    urgency: overrides?.urgency ?? "medium",
    detectedAt: overrides?.detectedAt ?? new Date().toISOString(),
    metadata: overrides?.metadata,
  };
}

function makeDigest(overrides?: Partial<InnovationDigest>): InnovationDigest {
  const sig = makeSignal();
  return {
    id: overrides?.id ?? "digest-1",
    period: overrides?.period ?? "daily",
    generatedAt: overrides?.generatedAt ?? new Date().toISOString(),
    signals: overrides?.signals ?? [sig],
    topOpportunities: overrides?.topOpportunities ?? [
      { signal: sig, innovationScore: 7.5, rationale: "Strong opportunity" },
    ],
    trendSummary: overrides?.trendSummary ?? "Emerging AI trends detected",
    recommendedActions: overrides?.recommendedActions ?? ["Explore AI integration"],
    stats: overrides?.stats ?? {
      totalSignals: 1,
      byType: { pattern: 1 },
      byUrgency: { medium: 1 },
      avgConfidence: 0.8,
    },
  };
}

describe("innovation-monitor", () => {
  beforeEach(() => {
    clearMonitorData();
  });

  // ---- addMonitorSource / removeMonitorSource ----

  describe("addMonitorSource", () => {
    it("adds a source and returns validated data", () => {
      const source = addMonitorSource(makeSource());
      expect(source.id).toBe("src-1");
      expect(source.type).toBe("market");
      expect(source.name).toBe("Test Source");
      expect(source.enabled).toBe(true);
    });

    it("adds multiple sources", () => {
      addMonitorSource(makeSource({ id: "src-1" }));
      addMonitorSource(makeSource({ id: "src-2", name: "Second Source" }));
      expect(listMonitorSources()).toHaveLength(2);
    });

    it("overwrites a source with the same id", () => {
      addMonitorSource(makeSource({ id: "src-1", name: "Original" }));
      addMonitorSource(makeSource({ id: "src-1", name: "Updated" }));
      const sources = listMonitorSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].name).toBe("Updated");
    });

    it("validates source type", () => {
      expect(() => addMonitorSource(makeSource({ type: "invalid" as any }))).toThrow();
    });

    it("validates pollIntervalMs minimum", () => {
      expect(() => addMonitorSource(makeSource({ pollIntervalMs: 100 }))).toThrow();
    });

    it("accepts all valid source types", () => {
      const types = ["codebase", "market", "competitor", "metrics", "custom"] as const;
      for (const type of types) {
        const source = addMonitorSource(makeSource({ id: `src-${type}`, type }));
        expect(source.type).toBe(type);
      }
      expect(listMonitorSources()).toHaveLength(types.length);
    });
  });

  describe("removeMonitorSource", () => {
    it("removes an existing source", () => {
      addMonitorSource(makeSource({ id: "src-1" }));
      removeMonitorSource("src-1");
      expect(listMonitorSources()).toHaveLength(0);
    });

    it("throws when removing a non-existent source", () => {
      expect(() => removeMonitorSource("nonexistent")).toThrow(
        "Monitor source nonexistent not found"
      );
    });

    it("only removes the specified source", () => {
      addMonitorSource(makeSource({ id: "src-1" }));
      addMonitorSource(makeSource({ id: "src-2" }));
      removeMonitorSource("src-1");
      const remaining = listMonitorSources();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("src-2");
    });
  });

  // ---- listMonitorSources ----

  describe("listMonitorSources", () => {
    it("returns empty array when no sources", () => {
      expect(listMonitorSources()).toHaveLength(0);
    });

    it("returns all added sources", () => {
      addMonitorSource(makeSource({ id: "a" }));
      addMonitorSource(makeSource({ id: "b" }));
      addMonitorSource(makeSource({ id: "c" }));
      expect(listMonitorSources()).toHaveLength(3);
    });
  });

  // ---- updateMonitorSource ----

  describe("updateMonitorSource", () => {
    it("updates the name of an existing source", () => {
      addMonitorSource(makeSource({ id: "src-1", name: "Original" }));
      const updated = updateMonitorSource("src-1", { name: "Updated" });
      expect(updated.name).toBe("Updated");
      expect(updated.id).toBe("src-1");
    });

    it("updates enabled status", () => {
      addMonitorSource(makeSource({ id: "src-1", enabled: true }));
      const updated = updateMonitorSource("src-1", { enabled: false });
      expect(updated.enabled).toBe(false);
    });

    it("updates pollIntervalMs", () => {
      addMonitorSource(makeSource({ id: "src-1" }));
      const updated = updateMonitorSource("src-1", { pollIntervalMs: 120_000 });
      expect(updated.pollIntervalMs).toBe(120_000);
    });

    it("preserves unchanged fields", () => {
      addMonitorSource(makeSource({ id: "src-1", name: "Original", type: "market" }));
      const updated = updateMonitorSource("src-1", { name: "New Name" });
      expect(updated.type).toBe("market");
      expect(updated.config).toEqual({ url: "https://example.com" });
    });

    it("throws when updating a non-existent source", () => {
      expect(() => updateMonitorSource("nonexistent", { name: "Nope" })).toThrow(
        "Monitor source nonexistent not found"
      );
    });
  });

  // ---- getRecentSignals ----

  describe("getRecentSignals", () => {
    it("returns empty when no signals exist", () => {
      expect(getRecentSignals()).toHaveLength(0);
    });

    it("returns signals after detection", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            {
              type: "pattern",
              title: "Detected Signal",
              description: "Found something",
              confidence: 0.9,
              urgency: "high",
            },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");
      const signals = getRecentSignals();
      expect(signals.length).toBeGreaterThan(0);
    });

    it("filters by sourceId", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify({
          opportunities: [
            { type: "trend", title: "S", description: "D", confidence: 0.9, urgency: "low" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-a" }));
      addMonitorSource(makeSource({ id: "src-b" }));
      await detectOpportunities("src-a");
      await detectOpportunities("src-b");

      const filtered = getRecentSignals({ sourceId: "src-a" });
      expect(filtered.every((s) => s.sourceId === "src-a")).toBe(true);
    });

    it("filters by type", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            { type: "gap", title: "G", description: "D", confidence: 0.9, urgency: "low" },
            { type: "trend", title: "T", description: "D", confidence: 0.9, urgency: "low" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");

      const gaps = getRecentSignals({ type: "gap" });
      expect(gaps.every((s) => s.type === "gap")).toBe(true);
    });

    it("filters by urgency", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            {
              type: "pattern",
              title: "Crit",
              description: "D",
              confidence: 0.9,
              urgency: "critical",
            },
            { type: "pattern", title: "Low", description: "D", confidence: 0.9, urgency: "low" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");

      const critical = getRecentSignals({ urgency: "critical" });
      expect(critical.every((s) => s.urgency === "critical")).toBe(true);
    });

    it("respects limit", async () => {
      const { generateText } = await import("../../copilot/client.js");
      const opps = Array.from({ length: 5 }, (_, i) => ({
        type: "pattern" as const,
        title: `Signal ${i}`,
        description: "D",
        confidence: 0.9,
        urgency: "low" as const,
      }));
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ opportunities: opps })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");

      const limited = getRecentSignals({ limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  // ---- digestToMarkdown ----

  describe("digestToMarkdown", () => {
    it("produces non-empty markdown", () => {
      const md = digestToMarkdown(makeDigest());
      expect(md.length).toBeGreaterThan(0);
    });

    it("includes digest period in heading", () => {
      const md = digestToMarkdown(makeDigest({ period: "weekly" }));
      expect(md).toContain("Innovation Digest — weekly");
    });

    it("includes trend summary", () => {
      const md = digestToMarkdown(makeDigest({ trendSummary: "AI is booming" }));
      expect(md).toContain("AI is booming");
    });

    it("includes stats section", () => {
      const md = digestToMarkdown(makeDigest());
      expect(md).toContain("## Stats");
      expect(md).toContain("Total signals:");
      expect(md).toContain("Avg confidence:");
    });

    it("includes top opportunities", () => {
      const md = digestToMarkdown(makeDigest());
      expect(md).toContain("## Top Opportunities");
      expect(md).toContain("Test Signal");
      expect(md).toContain("7.5/10");
    });

    it("includes recommended actions", () => {
      const md = digestToMarkdown(makeDigest({ recommendedActions: ["Do X", "Do Y"] }));
      expect(md).toContain("## Recommended Actions");
      expect(md).toContain("- Do X");
      expect(md).toContain("- Do Y");
    });

    it("includes all signals section", () => {
      const md = digestToMarkdown(makeDigest());
      expect(md).toContain("## All Signals");
    });

    it("handles empty signals and opportunities", () => {
      const md = digestToMarkdown(
        makeDigest({
          signals: [],
          topOpportunities: [],
          recommendedActions: [],
          stats: { totalSignals: 0, byType: {}, byUrgency: {}, avgConfidence: 0 },
        })
      );
      expect(md).toContain("Innovation Digest");
      expect(md).not.toContain("## Top Opportunities");
      expect(md).not.toContain("## Recommended Actions");
      expect(md).not.toContain("## All Signals");
    });
  });

  // ---- digestToHtml ----

  describe("digestToHtml", () => {
    it("produces non-empty HTML", () => {
      const html = digestToHtml(makeDigest());
      expect(html.length).toBeGreaterThan(0);
    });

    it("wraps content in html/body tags", () => {
      const html = digestToHtml(makeDigest());
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body></html>");
    });

    it("includes period in heading", () => {
      const html = digestToHtml(makeDigest({ period: "weekly" }));
      expect(html).toContain("weekly");
    });

    it("includes stats as list", () => {
      const html = digestToHtml(makeDigest());
      expect(html).toContain("<h2>Stats</h2>");
      expect(html).toContain("Total signals:");
    });

    it("includes top opportunities", () => {
      const html = digestToHtml(makeDigest());
      expect(html).toContain("<h2>Top Opportunities</h2>");
      expect(html).toContain("Test Signal");
    });

    it("includes recommended actions", () => {
      const html = digestToHtml(makeDigest({ recommendedActions: ["Act now"] }));
      expect(html).toContain("<h2>Recommended Actions</h2>");
      expect(html).toContain("Act now");
    });

    it("escapes HTML entities in content", () => {
      const html = digestToHtml(makeDigest({ trendSummary: "A <script>alert(1)</script> & test" }));
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;");
      expect(html).not.toContain("<script>");
    });

    it("handles empty digest gracefully", () => {
      const html = digestToHtml(
        makeDigest({
          signals: [],
          topOpportunities: [],
          recommendedActions: [],
          stats: { totalSignals: 0, byType: {}, byUrgency: {}, avgConfidence: 0 },
        })
      );
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).not.toContain("<h2>Top Opportunities</h2>");
    });
  });

  // ---- startMonitor / stopMonitor / getMonitorState ----

  describe("startMonitor", () => {
    it("starts the monitor and sets status to running", () => {
      const state = startMonitor({
        sources: [makeSource({ id: "src-1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      expect(state.status).toBe("running");
    });

    it("registers sources from config", () => {
      startMonitor({
        sources: [makeSource({ id: "src-1" }), makeSource({ id: "src-2" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      expect(listMonitorSources()).toHaveLength(2);
    });

    it("throws when monitor is already running", () => {
      startMonitor({
        sources: [makeSource({ id: "src-1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      expect(() =>
        startMonitor({
          sources: [makeSource({ id: "src-1" })],
          digestSchedule: "daily",
          opportunityThreshold: 0.5,
          maxSignalsPerDigest: 50,
        })
      ).toThrow("Monitor is already running");
    });
  });

  describe("stopMonitor", () => {
    it("stops the monitor and sets status to idle", () => {
      startMonitor({
        sources: [makeSource({ id: "src-1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      const state = stopMonitor();
      expect(state.status).toBe("idle");
    });

    it("is safe to call when already idle", () => {
      const state = stopMonitor();
      expect(state.status).toBe("idle");
    });

    it("clears every owned poll timer and remains safe on repeated stop", () => {
      vi.useFakeTimers();
      try {
        startMonitor({
          sources: [
            makeSource({ id: "src-1" }),
            makeSource({ id: "src-2" }),
            makeSource({ id: "disabled", enabled: false }),
          ],
          digestSchedule: "daily",
          opportunityThreshold: 0.5,
          maxSignalsPerDigest: 50,
        });
        expect(vi.getTimerCount()).toBe(2);

        stopMonitor();
        stopMonitor();

        expect(vi.getTimerCount()).toBe(0);
        expect(getMonitorState().status).toBe("idle");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getMonitorState", () => {
    it("returns idle state initially", () => {
      const state = getMonitorState();
      expect(state.status).toBe("idle");
      expect(state.signalCount).toBe(0);
      expect(state.digestCount).toBe(0);
    });

    it("reflects running status after start", () => {
      startMonitor({
        sources: [makeSource({ id: "src-1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      expect(getMonitorState().status).toBe("running");
    });

    it("returns a copy, not the internal state", () => {
      const state1 = getMonitorState();
      const state2 = getMonitorState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  // ---- clearMonitorData ----

  describe("clearMonitorData", () => {
    it("resets all state", () => {
      addMonitorSource(makeSource({ id: "src-1" }));
      startMonitor({
        sources: [makeSource({ id: "src-1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      clearMonitorData();
      expect(listMonitorSources()).toHaveLength(0);
      expect(getMonitorState().status).toBe("idle");
      expect(getMonitorState().signalCount).toBe(0);
      expect(getMonitorState().digestCount).toBe(0);
    });

    it("clears signals", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            { type: "pattern", title: "S", description: "D", confidence: 0.9, urgency: "low" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");
      expect(getRecentSignals().length).toBeGreaterThan(0);

      clearMonitorData();
      expect(getRecentSignals()).toHaveLength(0);
    });
  });

  // ---- LLM-dependent: detectOpportunities ----

  describe("detectOpportunities", () => {
    it("detects opportunities from a source", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            {
              type: "trend",
              title: "AI Growth",
              description: "Rapid AI adoption",
              confidence: 0.85,
              urgency: "high",
            },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      const detected = await detectOpportunities("src-1");
      expect(detected).toHaveLength(1);
      expect(detected[0].title).toBe("AI Growth");
      expect(detected[0].sourceId).toBe("src-1");
    });

    it("throws for non-existent source", async () => {
      await expect(detectOpportunities("nonexistent")).rejects.toThrow(
        "Monitor source nonexistent not found"
      );
    });

    it("returns empty for disabled source", async () => {
      addMonitorSource(makeSource({ id: "src-1", enabled: false }));
      const detected = await detectOpportunities("src-1");
      expect(detected).toHaveLength(0);
    });

    it("filters signals below confidence threshold", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            { type: "gap", title: "Low Conf", description: "D", confidence: 0.1, urgency: "low" },
            { type: "gap", title: "High Conf", description: "D", confidence: 0.9, urgency: "high" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      const detected = await detectOpportunities("src-1");
      expect(detected).toHaveLength(1);
      expect(detected[0].title).toBe("High Conf");
    });

    it("increments signal count in monitor state", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            { type: "anomaly", title: "X", description: "D", confidence: 0.8, urgency: "medium" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");
      expect(getMonitorState().signalCount).toBe(1);
    });
  });

  // ---- LLM-dependent: scoreSignal ----

  describe("scoreSignal", () => {
    it("scores a signal with innovation score and rationale", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ innovationScore: 8.5, rationale: "Highly innovative" })
      );

      const scored = await scoreSignal(makeSignal());
      expect(scored.innovationScore).toBe(8.5);
      expect(scored.rationale).toBe("Highly innovative");
      expect(scored.signal).toMatchObject({
        id: expect.any(String),
        sourceId: expect.any(String),
        type: expect.any(String),
      });
    });

    it("clamps score to 0-10 range", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ innovationScore: 15, rationale: "Off the charts" })
      );

      const scored = await scoreSignal(makeSignal());
      expect(scored.innovationScore).toBeLessThanOrEqual(10);
    });

    it("uses default score on LLM failure", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM error"));
      const { withRetry } = await import("../../copilot/retry.js");
      (withRetry as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Retry failed"));

      const scored = await scoreSignal(makeSignal());
      expect(scored.innovationScore).toBe(5);
      expect(scored.rationale).toContain("default");
    });
  });

  // ---- LLM-dependent: generateDigest ----

  describe("generateDigest", () => {
    it("generates a daily digest", async () => {
      const { generateText } = await import("../../copilot/client.js");
      // First call: detectOpportunities
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            { type: "pattern", title: "Opp", description: "D", confidence: 0.9, urgency: "high" },
          ],
        })
      );
      // scoreSignal call
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ innovationScore: 7, rationale: "Good opportunity" })
      );
      // generateDigest trend/actions call
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ trendSummary: "AI trending", recommendedActions: ["Invest in AI"] })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");

      const digest = await generateDigest("daily");
      expect(digest.period).toBe("daily");
      expect(digest.id).toMatch(/.+/);
      expect(digest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(digest.stats).toMatchObject({
        totalSignals: expect.any(Number),
      });
    });

    it("handles empty signals period", async () => {
      const digest = await generateDigest("weekly");
      expect(digest.period).toBe("weekly");
      expect(digest.signals).toHaveLength(0);
      expect(digest.stats.totalSignals).toBe(0);
      expect(digest.trendSummary).toContain("No signals");
    });

    it("increments digest count", async () => {
      await generateDigest("daily");
      expect(getMonitorState().digestCount).toBe(1);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles empty sources list in startMonitor", () => {
      const state = startMonitor({
        sources: [],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      expect(state.status).toBe("running");
      expect(listMonitorSources()).toHaveLength(0);
    });

    it("handles source with empty config", () => {
      const source = addMonitorSource(makeSource({ config: {} }));
      expect(source.config).toEqual({});
    });

    it("can restart monitor after stop", () => {
      startMonitor({
        sources: [makeSource({ id: "src-1" })],
        digestSchedule: "daily",
        opportunityThreshold: 0.5,
        maxSignalsPerDigest: 50,
      });
      stopMonitor();
      const state = startMonitor({
        sources: [makeSource({ id: "src-2" })],
        digestSchedule: "weekly",
        opportunityThreshold: 0.7,
        maxSignalsPerDigest: 100,
      });
      expect(state.status).toBe("running");
    });

    it("getRecentSignals returns sorted by detectedAt descending", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            { type: "pattern", title: "First", description: "D", confidence: 0.9, urgency: "low" },
            { type: "trend", title: "Second", description: "D", confidence: 0.8, urgency: "low" },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");

      const signals = getRecentSignals();
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].detectedAt >= signals[i].detectedAt).toBe(true);
      }
    });

    it("signal timestamps are in ISO 8601 format", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          opportunities: [
            {
              type: "pattern",
              title: "TS Test",
              description: "D",
              confidence: 0.9,
              urgency: "low",
            },
          ],
        })
      );

      addMonitorSource(makeSource({ id: "src-1" }));
      await detectOpportunities("src-1");

      const signals = getRecentSignals();
      for (const signal of signals) {
        expect(signal.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    it("scoreSignal returns signal with all expected fields", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ innovationScore: 7.0, rationale: "Good fit" })
      );

      const scored = await scoreSignal(makeSignal({ title: "Test Signal", type: "trend" }));
      expect(scored).toEqual(
        expect.objectContaining({
          innovationScore: expect.any(Number),
          rationale: expect.any(String),
          signal: expect.objectContaining({
            title: "Test Signal",
            type: "trend",
          }),
        })
      );
    });

    it("digest stats aggregation has correct structure", async () => {
      const digest = await generateDigest("daily");
      expect(digest.stats).toEqual(
        expect.objectContaining({
          totalSignals: expect.any(Number),
          byType: expect.any(Object),
          byUrgency: expect.any(Object),
          avgConfidence: expect.any(Number),
        })
      );
    });
  });
});
