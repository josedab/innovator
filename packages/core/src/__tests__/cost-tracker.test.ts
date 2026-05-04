import { describe, it, expect, beforeEach } from "vitest";
import {
  CostTracker,
  getCostTracker,
  resetCostTracker,
  estimateTokenCount,
} from "../cost/tracker.js";

describe("estimateTokenCount", () => {
  it("estimates ~1 token per 4 characters", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("abcd")).toBe(1);
    expect(estimateTokenCount("abcde")).toBe(2);
    expect(estimateTokenCount("a")).toBe(1);
  });

  it("handles long text proportionally", () => {
    const text = "x".repeat(400);
    expect(estimateTokenCount(text)).toBe(100);
  });
});

describe("CostTracker", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it("starts with no records and zero cost", () => {
    expect(tracker.getRecords()).toHaveLength(0);
    expect(tracker.getTotalCost()).toBe(0);
  });

  it("records token usage and returns a valid record", () => {
    const usage = tracker.record("gpt-4.1", 100, 50, 200, "investigate");
    expect(usage.id).toBe("usage-1");
    expect(usage.model).toBe("gpt-4.1");
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.latencyMs).toBe(200);
    expect(usage.stage).toBe("investigate");
    expect(typeof usage.costUsd).toBe("number");
    expect(usage.costUsd).toBeGreaterThan(0);
    expect(usage.timestamp).toBeTruthy();
  });

  it("assigns sequential IDs", () => {
    const u1 = tracker.record("gpt-4.1", 10, 10, 100, "s1");
    const u2 = tracker.record("gpt-4.1", 10, 10, 100, "s2");
    expect(u1.id).toBe("usage-1");
    expect(u2.id).toBe("usage-2");
  });

  it("accumulates total cost across multiple records", () => {
    tracker.record("gpt-4.1", 100, 50, 200, "investigate");
    tracker.record("gpt-4.1", 200, 100, 300, "generate");
    const total = tracker.getTotalCost();
    expect(total).toBeGreaterThan(0);
    expect(tracker.getRecords()).toHaveLength(2);
  });

  it("returns zero cost for unknown models", () => {
    tracker.record("unknown-model", 100, 50, 200, "test");
    expect(tracker.getTotalCost()).toBe(0);
  });

  // ---- Aggregation by model/stage ----
  describe("getSummary", () => {
    it("returns correct totals", () => {
      tracker.record("gpt-4.1", 100, 50, 200, "investigate");
      tracker.record("gpt-4.1-mini", 200, 100, 150, "generate");

      const summary = tracker.getSummary();
      expect(summary.callCount).toBe(2);
      expect(summary.totalInputTokens).toBe(300);
      expect(summary.totalOutputTokens).toBe(150);
      expect(summary.totalLatencyMs).toBe(350);
      expect(summary.totalCostUsd).toBeGreaterThanOrEqual(0);
    });

    it("breaks down by model", () => {
      tracker.record("gpt-4.1", 100, 50, 200, "investigate");
      tracker.record("gpt-4.1", 200, 100, 300, "generate");
      tracker.record("gpt-4.1-mini", 50, 25, 100, "investigate");

      const summary = tracker.getSummary();
      expect(Object.keys(summary.byModel)).toHaveLength(2);
      expect(summary.byModel["gpt-4.1"].calls).toBe(2);
      expect(summary.byModel["gpt-4.1"].inputTokens).toBe(300);
      expect(summary.byModel["gpt-4.1-mini"].calls).toBe(1);
    });

    it("breaks down by stage", () => {
      tracker.record("gpt-4.1", 100, 50, 200, "investigate");
      tracker.record("gpt-4.1", 200, 100, 300, "generate");
      tracker.record("gpt-4.1", 50, 25, 100, "investigate");

      const summary = tracker.getSummary();
      expect(Object.keys(summary.byStage)).toHaveLength(2);
      expect(summary.byStage["investigate"].calls).toBe(2);
      expect(summary.byStage["generate"].calls).toBe(1);
      expect(summary.byStage["investigate"].inputTokens).toBe(150);
    });

    it("returns zero summary when no records", () => {
      const summary = tracker.getSummary();
      expect(summary.callCount).toBe(0);
      expect(summary.totalCostUsd).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
      expect(Object.keys(summary.byModel)).toHaveLength(0);
      expect(Object.keys(summary.byStage)).toHaveLength(0);
    });
  });

  // ---- Budget enforcement ----
  describe("budget enforcement", () => {
    it("sets and gets budget", () => {
      expect(tracker.getBudget()).toBeNull();
      tracker.setBudget({ maxCostUsd: 1.0 });
      expect(tracker.getBudget()!.maxCostUsd).toBe(1.0);
    });

    it("fires abort signal when budget is exceeded", () => {
      const controller = new AbortController();
      tracker.setBudget({ maxCostUsd: 0.0001, abortController: controller });

      expect(controller.signal.aborted).toBe(false);

      // Record enough to exceed the tiny budget (using known model with pricing)
      tracker.record("gpt-4.1", 10000, 5000, 200, "investigate");

      expect(controller.signal.aborted).toBe(true);
    });

    it("does not abort when under budget", () => {
      const controller = new AbortController();
      tracker.setBudget({ maxCostUsd: 100, abortController: controller });

      tracker.record("gpt-4.1", 10, 5, 100, "investigate");

      expect(controller.signal.aborted).toBe(false);
    });

    it("works without abortController (no error)", () => {
      tracker.setBudget({ maxCostUsd: 0.0001 });
      // Should not throw even when budget is exceeded
      expect(() => tracker.record("gpt-4.1", 10000, 5000, 200, "investigate")).not.toThrow();
    });
  });

  // ---- Clear ----
  it("clears all records and resets counter", () => {
    tracker.record("gpt-4.1", 100, 50, 200, "investigate");
    tracker.record("gpt-4.1", 100, 50, 200, "generate");
    tracker.clear();

    expect(tracker.getRecords()).toHaveLength(0);
    expect(tracker.getTotalCost()).toBe(0);

    // Counter resets: next ID starts from 1
    const usage = tracker.record("gpt-4.1", 10, 5, 100, "test");
    expect(usage.id).toBe("usage-1");
  });
});

// ---- Global singleton ----
describe("global cost tracker singleton", () => {
  beforeEach(() => {
    resetCostTracker();
  });

  it("getCostTracker returns the same instance on repeated calls", () => {
    const t1 = getCostTracker();
    const t2 = getCostTracker();
    expect(t1).toBe(t2);
  });

  it("resetCostTracker creates a new instance", () => {
    const t1 = getCostTracker();
    t1.record("gpt-4.1", 100, 50, 200, "test");
    resetCostTracker();
    const t2 = getCostTracker();
    expect(t2).not.toBe(t1);
    expect(t2.getRecords()).toHaveLength(0);
  });
});
