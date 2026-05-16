import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  createAutomationRule,
  listAutomationRules,
  toggleAutomationRule,
  evaluateConditions,
  processSignalAgainstRules,
  getPendingApprovals,
  reviewApproval,
  computeSentinelPerformance,
  getBatchReviewItems,
  processSignalWithDedup,
  getConversionFunnel,
  clearAutomationData,
} from "../sentinel/automation.js";
import type { DetectedSignal } from "../sentinel/types.js";

function makeSignal(overrides: Partial<DetectedSignal> = {}): DetectedSignal {
  return {
    id: overrides.id ?? "sig-1",
    sourceId: overrides.sourceId ?? "src-1",
    title: overrides.title ?? "AI breakthrough in healthcare",
    summary: "New AI technique improves diagnostics",
    detectedAt: new Date().toISOString(),
    relevanceScore: overrides.relevanceScore ?? 0.85,
    topics: overrides.topics ?? ["ai", "healthcare"],
    processed: false,
  };
}

describe("sentinel/automation", () => {
  beforeEach(() => {
    clearAutomationData();
  });

  it("creates and lists automation rules", () => {
    createAutomationRule({
      name: "High relevance auto-investigate",
      conditions: [{ field: "relevanceScore", operator: "gt", value: 0.8 }],
      actions: [{ type: "auto-investigate" }],
    });
    expect(listAutomationRules()).toHaveLength(1);
  });

  it("toggles rule active status", () => {
    const rule = createAutomationRule({
      name: "Test Rule",
      conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
      actions: [{ type: "notify-team" }],
    });
    expect(rule.isActive).toBe(true);
    const toggled = toggleAutomationRule(rule.id);
    expect(toggled?.isActive).toBe(false);
  });

  describe("evaluateConditions", () => {
    it("evaluates gt condition", () => {
      const signal = makeSignal({ relevanceScore: 0.9 });
      const result = evaluateConditions(signal, [
        { field: "relevanceScore", operator: "gt", value: 0.8 },
      ]);
      expect(result).toBe(true);
    });

    it("evaluates contains condition", () => {
      const signal = makeSignal({ title: "AI breakthrough" });
      const result = evaluateConditions(signal, [
        { field: "title", operator: "contains", value: "breakthrough" },
      ]);
      expect(result).toBe(true);
    });

    it("evaluates 'any' logic", () => {
      const signal = makeSignal({ relevanceScore: 0.3 });
      const result = evaluateConditions(
        signal,
        [
          { field: "relevanceScore", operator: "gt", value: 0.8 },
          { field: "title", operator: "contains", value: "AI" },
        ],
        "any"
      );
      expect(result).toBe(true);
    });
  });

  describe("processSignalAgainstRules", () => {
    it("executes actions for matching rules", () => {
      createAutomationRule({
        name: "Auto-investigate high relevance",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.7 }],
        actions: [{ type: "auto-investigate" }],
      });

      const result = processSignalAgainstRules(makeSignal());
      expect(result.executedActions).toHaveLength(1);
      expect(result.executedActions[0].actionType).toBe("auto-investigate");
    });

    it("creates approval requests for rules requiring approval", () => {
      createAutomationRule({
        name: "Create draft with approval",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
        actions: [{ type: "create-draft-idea" }],
        requiresApproval: true,
      });

      const result = processSignalAgainstRules(makeSignal());
      expect(result.pendingApprovals).toHaveLength(1);
      expect(result.executedActions).toHaveLength(0);
    });
  });

  describe("approvals", () => {
    it("reviews and approves a pending approval", () => {
      createAutomationRule({
        name: "Rule",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
        actions: [{ type: "notify-team" }],
        requiresApproval: true,
      });
      processSignalAgainstRules(makeSignal());

      const pending = getPendingApprovals();
      expect(pending).toHaveLength(1);

      const reviewed = reviewApproval(pending[0].id, "approved", { reviewedBy: "admin" });
      expect(reviewed?.status).toBe("approved");
      expect(getPendingApprovals()).toHaveLength(0);
    });
  });

  describe("performance analytics", () => {
    it("computes performance metrics", () => {
      createAutomationRule({
        name: "Rule",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
        actions: [{ type: "create-draft-idea" }],
      });
      processSignalAgainstRules(makeSignal({ id: "s1" }));
      processSignalAgainstRules(makeSignal({ id: "s2" }));

      const perf = computeSentinelPerformance();
      expect(perf.totalSignals).toBe(2);
      expect(perf.totalActionsExecuted).toBe(2);
      expect(perf.signalToIdeaRate).toBe(1);
    });
  });

  describe("batch review", () => {
    it("returns batch review items sorted by priority", () => {
      createAutomationRule({
        name: "High Priority",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
        actions: [{ type: "auto-investigate" }],
        requiresApproval: true,
        priority: 90,
      });
      processSignalAgainstRules(
        makeSignal({ id: "batch-1", title: "Important signal about AI breakthrough" })
      );

      const items = getBatchReviewItems();
      expect(items.length).toBe(1);
      expect(items[0].rule.priority).toBe(90);
      expect(items[0].suggestedDecision).toBeDefined();
    });
  });

  describe("signal deduplication", () => {
    it("detects duplicate signals", () => {
      createAutomationRule({
        name: "Rule",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
        actions: [{ type: "notify-team" }],
      });

      const r1 = processSignalWithDedup(makeSignal({ id: "d1", title: "Unique Signal" }));
      expect(r1.isDuplicate).toBe(false);
      expect(r1.executedActions.length).toBe(1);

      const r2 = processSignalWithDedup(makeSignal({ id: "d2", title: "Unique Signal" }));
      expect(r2.isDuplicate).toBe(true);
      expect(r2.executedActions.length).toBe(0);
    });
  });

  describe("conversion funnel", () => {
    it("computes conversion funnel stages", () => {
      createAutomationRule({
        name: "Rule",
        conditions: [{ field: "relevanceScore", operator: "gt", value: 0.5 }],
        actions: [{ type: "create-draft-idea" }, { type: "notify-team" }],
      });
      processSignalAgainstRules(makeSignal({ id: "f1" }));

      const funnel = getConversionFunnel();
      expect(funnel.length).toBe(5);
      expect(funnel[0].stage).toBe("Signals Detected");
      expect(funnel[0].count).toBeGreaterThan(0);
    });
  });
});
