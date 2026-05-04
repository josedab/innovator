import { describe, it, expect, beforeEach } from "vitest";
import {
  recordPromptCall,
  observeCall,
  getCallTimeline,
  getPromptCallById,
  getObservatoryStats,
  diffPromptCalls,
  createABComparison,
  clearObservatory,
  setObservatoryEnabled,
  isObservatoryEnabled,
} from "../observatory/index.js";

describe("observatory", () => {
  beforeEach(() => {
    clearObservatory();
    setObservatoryEnabled(true);
  });

  // ---- recordPromptCall ----

  describe("recordPromptCall", () => {
    it("records a call and assigns ID and timestamp", () => {
      const call = recordPromptCall({
        promptText: "Test prompt",
        responseText: "Test response",
        model: "gpt-4",
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 100,
        stage: "investigate",
      });

      expect(call.id).toMatch(/^obs-/);
      expect(call.timestamp).toBeDefined();
      expect(call.promptText).toBe("Test prompt");
      expect(call.model).toBe("gpt-4");
    });

    it("assigns incrementing IDs", () => {
      const call1 = recordPromptCall({
        promptText: "p1",
        responseText: "r1",
        model: "gpt-4",
        inputTokens: 5,
        outputTokens: 10,
        latencyMs: 50,
      });
      const call2 = recordPromptCall({
        promptText: "p2",
        responseText: "r2",
        model: "gpt-4",
        inputTokens: 5,
        outputTokens: 10,
        latencyMs: 50,
      });
      expect(call1.id).not.toBe(call2.id);
    });

    it("does not add to log when capture is disabled", () => {
      setObservatoryEnabled(false);
      recordPromptCall({
        promptText: "p",
        responseText: "r",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
      });
      const timeline = getCallTimeline();
      expect(timeline).toHaveLength(0);
    });

    it("still returns the record even when capture is disabled", () => {
      setObservatoryEnabled(false);
      const call = recordPromptCall({
        promptText: "p",
        responseText: "r",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
      });
      expect(call.id).toBeDefined();
    });
  });

  // ---- observeCall ----

  describe("observeCall", () => {
    it("wraps a function call with timing and recording", async () => {
      const { result, call } = await observeCall(
        "investigate",
        "gpt-4",
        "Test prompt",
        async () => "Hello World"
      );

      expect(result).toBe("Hello World");
      expect(call.stage).toBe("investigate");
      expect(call.model).toBe("gpt-4");
      expect(call.latencyMs).toBeGreaterThanOrEqual(0);
      expect(call.responseText).toBe("Hello World");
    });

    it("captures latency", async () => {
      const { call } = await observeCall("generate", "gpt-4", "prompt", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "done";
      });
      expect(call.latencyMs).toBeGreaterThanOrEqual(5);
    });

    it("applies score function when provided", async () => {
      const { call } = await observeCall(
        "investigate",
        "gpt-4",
        "prompt",
        async () => "result",
        () => 85
      );
      expect(call.qualityScore).toBe(85);
    });

    it("handles execution failure", async () => {
      await expect(
        observeCall("generate", "gpt-4", "prompt", async () => {
          throw new Error("LLM failed");
        })
      ).rejects.toThrow("LLM failed");
    });

    it("estimates tokens from text length", async () => {
      const { call } = await observeCall("investigate", "gpt-4", "a".repeat(100), async () =>
        "b".repeat(200)
      );
      expect(call.inputTokens).toBe(25); // 100/4
      expect(call.outputTokens).toBe(50); // 200/4
    });

    it("serializes non-string results as JSON", async () => {
      const { call } = await observeCall("investigate", "gpt-4", "prompt", async () => ({
        key: "value",
      }));
      expect(call.responseText).toContain("key");
    });
  });

  // ---- getCallTimeline ----

  describe("getCallTimeline", () => {
    beforeEach(() => {
      recordPromptCall({
        promptText: "p1",
        responseText: "r1",
        model: "gpt-4",
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 100,
        stage: "investigate",
      });
      recordPromptCall({
        promptText: "p2",
        responseText: "r2",
        model: "gpt-3.5",
        inputTokens: 5,
        outputTokens: 15,
        latencyMs: 50,
        stage: "generate",
      });
      recordPromptCall({
        promptText: "p3",
        responseText: "r3",
        model: "gpt-4",
        inputTokens: 20,
        outputTokens: 30,
        latencyMs: 200,
        stage: "investigate",
      });
    });

    it("returns all calls sorted by timestamp descending", () => {
      const timeline = getCallTimeline();
      expect(timeline).toHaveLength(3);
      expect(timeline[0].timestamp >= timeline[1].timestamp).toBe(true);
    });

    it("filters by stage", () => {
      const timeline = getCallTimeline({ stage: "investigate" });
      expect(timeline).toHaveLength(2);
      expect(timeline.every((c) => c.stage === "investigate")).toBe(true);
    });

    it("filters by model", () => {
      const timeline = getCallTimeline({ model: "gpt-3.5" });
      expect(timeline).toHaveLength(1);
      expect(timeline[0].model).toBe("gpt-3.5");
    });

    it("respects limit", () => {
      const timeline = getCallTimeline({ limit: 1 });
      expect(timeline).toHaveLength(1);
    });

    it("returns empty for no calls", () => {
      clearObservatory();
      expect(getCallTimeline()).toEqual([]);
    });
  });

  // ---- getPromptCallById ----

  describe("getPromptCallById", () => {
    it("finds a call by ID", () => {
      const call = recordPromptCall({
        promptText: "p",
        responseText: "r",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
      });
      expect(getPromptCallById(call.id)).toBeDefined();
      expect(getPromptCallById(call.id)!.promptText).toBe("p");
    });

    it("returns undefined for unknown ID", () => {
      expect(getPromptCallById("nonexistent")).toBeUndefined();
    });
  });

  // ---- getObservatoryStats ----

  describe("getObservatoryStats", () => {
    it("returns zeros for empty log", () => {
      const stats = getObservatoryStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.averageLatencyMs).toBe(0);
      expect(stats.averageQuality).toBe(0);
    });

    it("aggregates stats correctly", () => {
      recordPromptCall({
        promptText: "p1",
        responseText: "r1",
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 200,
        latencyMs: 100,
        stage: "investigate",
        qualityScore: 80,
      });
      recordPromptCall({
        promptText: "p2",
        responseText: "r2",
        model: "gpt-4",
        inputTokens: 50,
        outputTokens: 100,
        latencyMs: 200,
        stage: "generate",
        qualityScore: 60,
      });

      const stats = getObservatoryStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.totalInputTokens).toBe(150);
      expect(stats.totalOutputTokens).toBe(300);
      expect(stats.averageLatencyMs).toBe(150);
      expect(stats.averageQuality).toBe(70);
      expect(stats.callsByModel["gpt-4"]).toBe(2);
      expect(stats.callsByStage["investigate"]).toBe(1);
      expect(stats.callsByStage["generate"]).toBe(1);
    });

    it("calculates quality distribution buckets", () => {
      recordPromptCall({
        promptText: "p1",
        responseText: "r1",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        qualityScore: 15,
      });
      recordPromptCall({
        promptText: "p2",
        responseText: "r2",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        qualityScore: 85,
      });

      const stats = getObservatoryStats();
      expect(stats.qualityDistribution).toHaveLength(5);
      const lowBucket = stats.qualityDistribution.find((d) => d.bucket === "0-20");
      const highBucket = stats.qualityDistribution.find((d) => d.bucket === "81-100");
      expect(lowBucket!.count).toBe(1);
      expect(highBucket!.count).toBe(1);
    });

    it("handles quality score on bucket boundary", () => {
      recordPromptCall({
        promptText: "p",
        responseText: "r",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        qualityScore: 20,
      });
      const stats = getObservatoryStats();
      const bucket = stats.qualityDistribution.find((d) => d.bucket === "0-20");
      expect(bucket!.count).toBe(1);
    });

    it("computes tokensByModel", () => {
      recordPromptCall({
        promptText: "p1",
        responseText: "r1",
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 1,
      });
      recordPromptCall({
        promptText: "p2",
        responseText: "r2",
        model: "gpt-3.5",
        inputTokens: 30,
        outputTokens: 20,
        latencyMs: 1,
      });
      const stats = getObservatoryStats();
      expect(stats.tokensByModel["gpt-4"]).toBe(150);
      expect(stats.tokensByModel["gpt-3.5"]).toBe(50);
    });
  });

  // ---- diffPromptCalls ----

  describe("diffPromptCalls", () => {
    it("produces a line-level diff between two calls", () => {
      const callA = recordPromptCall({
        promptText: "Line1\nLine2\nLine3",
        responseText: "r",
        model: "m",
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 100,
        qualityScore: 80,
      });
      const callB = recordPromptCall({
        promptText: "Line1\nChanged\nLine3",
        responseText: "r2",
        model: "m",
        inputTokens: 15,
        outputTokens: 10,
        latencyMs: 150,
        qualityScore: 90,
      });

      const diff = diffPromptCalls(callA.id, callB.id);
      expect(diff).not.toBeNull();
      expect(diff!.promptDiff.some((d) => d.type === "removed" && d.text === "Line2")).toBe(true);
      expect(diff!.promptDiff.some((d) => d.type === "added" && d.text === "Changed")).toBe(true);
      expect(diff!.promptDiff.some((d) => d.type === "unchanged" && d.text === "Line1")).toBe(true);
      expect(diff!.tokenDiff.inputDelta).toBe(5);
      expect(diff!.latencyDiff).toBe(50);
      expect(diff!.qualityDiff).toBe(10);
    });

    it("returns null when call not found", () => {
      expect(diffPromptCalls("bad-a", "bad-b")).toBeNull();
    });

    it("handles identical prompts (all unchanged)", () => {
      const a = recordPromptCall({
        promptText: "Same\nText",
        responseText: "r",
        model: "m",
        inputTokens: 5,
        outputTokens: 5,
        latencyMs: 50,
      });
      const b = recordPromptCall({
        promptText: "Same\nText",
        responseText: "r",
        model: "m",
        inputTokens: 5,
        outputTokens: 5,
        latencyMs: 60,
      });

      const diff = diffPromptCalls(a.id, b.id);
      expect(diff!.promptDiff.every((d) => d.type === "unchanged")).toBe(true);
      expect(diff!.tokenDiff.inputDelta).toBe(0);
    });

    it("handles undefined quality scores", () => {
      const a = recordPromptCall({
        promptText: "p",
        responseText: "r",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
      });
      const b = recordPromptCall({
        promptText: "p2",
        responseText: "r2",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
      });
      const diff = diffPromptCalls(a.id, b.id);
      expect(diff!.qualityDiff).toBeUndefined();
    });
  });

  // ---- createABComparison ----

  describe("createABComparison", () => {
    it("creates an A/B comparison record", () => {
      const comparison = createABComparison("Prompt A", "Prompt B");
      expect(comparison.promptA).toBe("Prompt A");
      expect(comparison.promptB).toBe("Prompt B");
      expect(comparison.winner).toBeUndefined();
      expect(comparison.resultA).toBeUndefined();
      expect(comparison.resultB).toBeUndefined();
    });
  });

  // ---- Enable/Disable ----

  describe("setObservatoryEnabled / isObservatoryEnabled", () => {
    it("toggles capture on and off", () => {
      expect(isObservatoryEnabled()).toBe(true);
      setObservatoryEnabled(false);
      expect(isObservatoryEnabled()).toBe(false);
      setObservatoryEnabled(true);
      expect(isObservatoryEnabled()).toBe(true);
    });
  });
});
