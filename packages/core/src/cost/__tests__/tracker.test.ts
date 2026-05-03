import { describe, it, expect, beforeEach, vi } from "vitest";
import { CostTracker, estimateTokenCount, getCostTracker, resetCostTracker } from "../tracker.js";
import { setModelPricing } from "../pricing.js";

// Ensure a known model exists for tests
beforeEach(() => {
  setModelPricing({ modelId: "test-model", inputPer1k: 0.002, outputPer1k: 0.008 });
});

describe("estimateTokenCount", () => {
  it("estimates ~1 token per 4 characters", () => {
    expect(estimateTokenCount("abcd")).toBe(1);
    expect(estimateTokenCount("abcde")).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("handles long text", () => {
    const text = "a".repeat(400);
    expect(estimateTokenCount(text)).toBe(100);
  });
});

describe("CostTracker", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe("record", () => {
    it("records a usage entry and returns it", () => {
      const usage = tracker.record("test-model", 1000, 500, 100, "investigation");
      expect(usage.id).toBe("usage-1");
      expect(usage.model).toBe("test-model");
      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
      expect(usage.costUsd).toBeCloseTo(0.006);
      expect(usage.latencyMs).toBe(100);
      expect(usage.stage).toBe("investigation");
      expect(usage.timestamp).toBeDefined();
    });

    it("increments IDs for each record", () => {
      const u1 = tracker.record("test-model", 100, 100, 50, "stage1");
      const u2 = tracker.record("test-model", 200, 200, 50, "stage2");
      expect(u1.id).toBe("usage-1");
      expect(u2.id).toBe("usage-2");
    });

    it("records 0 cost for unknown model", () => {
      const usage = tracker.record("unknown", 1000, 1000, 50, "stage");
      expect(usage.costUsd).toBe(0);
    });
  });

  describe("budget enforcement", () => {
    it("aborts when budget is exceeded", () => {
      const ac = new AbortController();
      tracker.setBudget({ maxCostUsd: 0.005, abortController: ac });

      // First call: cost ~0.006 which exceeds 0.005
      tracker.record("test-model", 1000, 500, 100, "investigation");

      expect(ac.signal.aborted).toBe(true);
      expect(ac.signal.reason).toContain("Budget exceeded");
    });

    it("does not abort when within budget", () => {
      const ac = new AbortController();
      tracker.setBudget({ maxCostUsd: 1.0, abortController: ac });

      tracker.record("test-model", 100, 50, 50, "stage");

      expect(ac.signal.aborted).toBe(false);
    });

    it("works without abort controller", () => {
      tracker.setBudget({ maxCostUsd: 0.001 });
      // Should not throw even when exceeded
      expect(() => tracker.record("test-model", 1000, 500, 100, "stage")).not.toThrow();
    });
  });

  describe("getBudget / setBudget", () => {
    it("returns null when no budget is set", () => {
      expect(tracker.getBudget()).toBeNull();
    });

    it("returns the set budget", () => {
      tracker.setBudget({ maxCostUsd: 10 });
      expect(tracker.getBudget()!.maxCostUsd).toBe(10);
    });
  });

  describe("getTotalCost", () => {
    it("returns 0 for empty tracker", () => {
      expect(tracker.getTotalCost()).toBe(0);
    });

    it("accumulates cost across records", () => {
      tracker.record("test-model", 1000, 500, 50, "s1");
      tracker.record("test-model", 1000, 500, 50, "s2");
      expect(tracker.getTotalCost()).toBeCloseTo(0.012);
    });
  });

  describe("getRecords", () => {
    it("returns a copy of records", () => {
      tracker.record("test-model", 100, 100, 50, "stage");
      const records = tracker.getRecords();
      expect(records).toHaveLength(1);
      // Verify it's a copy
      records.push(records[0]);
      expect(tracker.getRecords()).toHaveLength(1);
    });
  });

  describe("getSummary", () => {
    it("returns empty summary for no records", () => {
      const summary = tracker.getSummary();
      expect(summary.callCount).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.totalCostUsd).toBe(0);
      expect(summary.totalLatencyMs).toBe(0);
      expect(Object.keys(summary.byModel)).toHaveLength(0);
      expect(Object.keys(summary.byStage)).toHaveLength(0);
    });

    it("aggregates by model", () => {
      setModelPricing({ modelId: "model-a", inputPer1k: 0.001, outputPer1k: 0.002 });
      setModelPricing({ modelId: "model-b", inputPer1k: 0.003, outputPer1k: 0.006 });

      tracker.record("model-a", 1000, 500, 50, "stage");
      tracker.record("model-b", 2000, 1000, 100, "stage");
      tracker.record("model-a", 500, 250, 30, "stage");

      const summary = tracker.getSummary();
      expect(summary.callCount).toBe(3);
      expect(summary.byModel["model-a"].calls).toBe(2);
      expect(summary.byModel["model-b"].calls).toBe(1);
      expect(summary.byModel["model-a"].inputTokens).toBe(1500);
      expect(summary.byModel["model-b"].inputTokens).toBe(2000);
    });

    it("aggregates by stage", () => {
      tracker.record("test-model", 1000, 500, 50, "investigation");
      tracker.record("test-model", 2000, 1000, 100, "innovation");
      tracker.record("test-model", 500, 250, 30, "investigation");

      const summary = tracker.getSummary();
      expect(summary.byStage["investigation"].calls).toBe(2);
      expect(summary.byStage["innovation"].calls).toBe(1);
    });

    it("computes total latency and tokens", () => {
      tracker.record("test-model", 1000, 500, 50, "s1");
      tracker.record("test-model", 2000, 1000, 100, "s2");

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(3000);
      expect(summary.totalOutputTokens).toBe(1500);
      expect(summary.totalLatencyMs).toBe(150);
    });
  });

  describe("clear", () => {
    it("removes all records and resets counter", () => {
      tracker.record("test-model", 1000, 500, 50, "s");
      tracker.clear();
      expect(tracker.getRecords()).toHaveLength(0);
      expect(tracker.getTotalCost()).toBe(0);

      // Counter resets — next record starts at usage-1
      const usage = tracker.record("test-model", 100, 100, 10, "s");
      expect(usage.id).toBe("usage-1");
    });
  });
});

describe("global singleton", () => {
  beforeEach(() => {
    resetCostTracker();
  });

  it("returns the same instance on repeated calls", () => {
    const a = getCostTracker();
    const b = getCostTracker();
    expect(a).toBe(b);
  });

  it("returns a new instance after reset", () => {
    const a = getCostTracker();
    resetCostTracker();
    const b = getCostTracker();
    expect(a).not.toBe(b);
  });
});
