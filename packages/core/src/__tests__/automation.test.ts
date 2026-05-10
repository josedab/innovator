import { describe, it, expect, beforeEach } from "vitest";
import {
  createAutomationRule,
  getAutomationRule,
  listAutomationRules,
  toggleAutomationRule,
  deleteAutomationRule,
  getAutomationLog,
  createHighScoreChain,
  createPipelineNotificationChain,
  clearAutomation,
} from "../events/automation.js";
import { getEventBus } from "../events/emitter.js";
import type { EventType } from "../events/types.js";

async function emitEvent(type: EventType, payload: Record<string, unknown> = {}, subject?: string) {
  const bus = getEventBus();
  return bus.emit(type, payload, subject);
}

describe("automation", () => {
  beforeEach(() => {
    clearAutomation();
  });

  // ---- Rule CRUD ----
  describe("rule management", () => {
    it("creates a rule with generated id and createdAt", () => {
      const rule = createAutomationRule({
        name: "Test Rule",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });
      expect(rule.id).toMatch(/^rule-/);
      expect(rule.name).toBe("Test Rule");
      expect(rule.triggerCount).toBe(0);
      expect(rule.createdAt).toBeTruthy();
    });

    it("retrieves a rule by ID", () => {
      const rule = createAutomationRule({
        name: "R1",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });
      const found = getAutomationRule(rule.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("R1");
    });

    it("returns undefined for non-existent rule", () => {
      expect(getAutomationRule("nope")).toBeUndefined();
    });

    it("lists all rules", () => {
      createAutomationRule({
        name: "R1",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });
      createAutomationRule({
        name: "R2",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });
      expect(listAutomationRules()).toHaveLength(2);
    });

    it("toggles a rule enabled/disabled", () => {
      const rule = createAutomationRule({
        name: "R1",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });
      expect(toggleAutomationRule(rule.id, false)).toBe(true);
      expect(getAutomationRule(rule.id)!.enabled).toBe(false);
      expect(toggleAutomationRule(rule.id, true)).toBe(true);
      expect(getAutomationRule(rule.id)!.enabled).toBe(true);
    });

    it("returns false when toggling non-existent rule", () => {
      expect(toggleAutomationRule("nope", true)).toBe(false);
    });

    it("deletes a rule", () => {
      const rule = createAutomationRule({
        name: "R1",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });
      expect(deleteAutomationRule(rule.id)).toBe(true);
      expect(getAutomationRule(rule.id)).toBeUndefined();
    });

    it("returns false when deleting non-existent rule", () => {
      expect(deleteAutomationRule("nope")).toBe(false);
    });
  });

  // ---- Condition operators via event bus ----
  describe("condition operators", () => {
    async function triggerAndCheck(
      conditions: Array<{ field: string; operator: string; value?: unknown }>,
      eventType: EventType,
      payload: Record<string, unknown>,
      shouldTrigger: boolean
    ) {
      const rule = createAutomationRule({
        name: "Test",
        enabled: true,
        triggerEvent: eventType,
        conditions: conditions as unknown as Parameters<
          typeof createAutomationRule
        >[0]["conditions"],
        actions: [{ type: "log" }],
      });

      await emitEvent(eventType, payload, "Test subject");

      const ruleAfter = getAutomationRule(rule.id)!;
      if (shouldTrigger) {
        expect(ruleAfter.triggerCount).toBeGreaterThan(0);
      } else {
        expect(ruleAfter.triggerCount).toBe(0);
      }
    }

    it("eq: matches equal values", async () => {
      await triggerAndCheck(
        [{ field: "payload.status", operator: "eq", value: "complete" }],
        "idea.scored",
        { status: "complete" },
        true
      );
    });

    it("eq: rejects non-equal values", async () => {
      await triggerAndCheck(
        [{ field: "payload.status", operator: "eq", value: "complete" }],
        "idea.scored",
        { status: "pending" },
        false
      );
    });

    it("neq: matches non-equal values", async () => {
      await triggerAndCheck(
        [{ field: "payload.status", operator: "neq", value: "failed" }],
        "idea.scored",
        { status: "complete" },
        true
      );
    });

    it("gt: matches greater values", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "gt", value: 80 }],
        "idea.scored",
        { score: 90 },
        true
      );
    });

    it("gt: rejects equal values", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "gt", value: 80 }],
        "idea.scored",
        { score: 80 },
        false
      );
    });

    it("gte: matches equal values", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "gte", value: 80 }],
        "idea.scored",
        { score: 80 },
        true
      );
    });

    it("lt: matches lesser values", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "lt", value: 50 }],
        "idea.scored",
        { score: 30 },
        true
      );
    });

    it("lte: matches equal values", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "lte", value: 50 }],
        "idea.scored",
        { score: 50 },
        true
      );
    });

    it("contains: matches substring", async () => {
      await triggerAndCheck(
        [{ field: "payload.title", operator: "contains", value: "innov" }],
        "idea.scored",
        { title: "AI innovation platform" },
        true
      );
    });

    it("contains: rejects missing substring", async () => {
      await triggerAndCheck(
        [{ field: "payload.title", operator: "contains", value: "quantum" }],
        "idea.scored",
        { title: "AI innovation" },
        false
      );
    });

    it("exists: matches present fields", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "exists" }],
        "idea.scored",
        { score: 95 },
        true
      );
    });

    it("exists: rejects missing fields", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "exists" }],
        "idea.scored",
        {},
        false
      );
    });

    // ---- Dot-notation field access ----
    it("accesses nested fields via dot notation", async () => {
      await triggerAndCheck(
        [{ field: "payload.score", operator: "gte", value: 90 }],
        "idea.scored",
        { score: 95 },
        true
      );
    });

    // ---- AND logic for multiple conditions ----
    it("requires ALL conditions to be met (AND logic)", async () => {
      await triggerAndCheck(
        [
          { field: "payload.score", operator: "gte", value: 80 },
          { field: "payload.status", operator: "eq", value: "complete" },
        ],
        "idea.scored",
        { score: 90, status: "complete" },
        true
      );
    });

    it("fails when one condition is not met", async () => {
      await triggerAndCheck(
        [
          { field: "payload.score", operator: "gte", value: 80 },
          { field: "payload.status", operator: "eq", value: "complete" },
        ],
        "idea.scored",
        { score: 90, status: "pending" },
        false
      );
    });
  });

  // ---- Action execution status tracking ----
  describe("action execution", () => {
    it("logs executed actions in automation log", async () => {
      createAutomationRule({
        name: "Logger",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }, { type: "record-outcome" }],
      });

      await emitEvent("pipeline.completed", {}, "Test");

      const log = getAutomationLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].actionsExecuted).toHaveLength(2);
      expect(log[0].actionsExecuted[0].type).toBe("log");
      expect(log[0].actionsExecuted[0].status).toBe("success");
      expect(log[0].actionsExecuted[1].type).toBe("record-outcome");
      expect(log[0].actionsExecuted[1].status).toBe("success");
    });

    it("filters log by ruleId", async () => {
      const rule1 = createAutomationRule({
        name: "R1",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });
      createAutomationRule({
        name: "R2",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });

      await emitEvent("pipeline.completed", {});

      const log = getAutomationLog(rule1.id);
      expect(log).toHaveLength(1);
      expect(log[0].ruleId).toBe(rule1.id);
    });

    it("skips webhook action when no URL configured", async () => {
      createAutomationRule({
        name: "Webhook test",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "webhook" }],
      });

      await emitEvent("pipeline.completed", {});

      const log = getAutomationLog();
      expect(log[0].actionsExecuted[0].status).toBe("skipped");
    });
  });

  // ---- Rule enable/disable ----
  describe("enable/disable", () => {
    it("disabled rules do not trigger", async () => {
      const rule = createAutomationRule({
        name: "Disabled",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });

      toggleAutomationRule(rule.id, false);

      await emitEvent("idea.scored", {});

      expect(getAutomationRule(rule.id)!.triggerCount).toBe(0);
    });

    it("re-enabled rules trigger again", async () => {
      const rule = createAutomationRule({
        name: "Toggle",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });

      toggleAutomationRule(rule.id, false);
      await emitEvent("idea.scored", {});
      expect(getAutomationRule(rule.id)!.triggerCount).toBe(0);

      toggleAutomationRule(rule.id, true);
      await emitEvent("idea.scored", {});
      expect(getAutomationRule(rule.id)!.triggerCount).toBe(1);
    });
  });

  // ---- Preset chains ----
  describe("preset chains", () => {
    it("createHighScoreChain creates a rule with score condition", () => {
      const rule = createHighScoreChain(85, "my-org/my-repo");
      expect(rule.name).toContain("High Score");
      expect(rule.triggerEvent).toBe("idea.scored");
      expect(rule.conditions).toHaveLength(1);
      expect(rule.conditions[0].field).toBe("payload.score");
      expect(rule.conditions[0].operator).toBe("gte");
      expect(rule.conditions[0].value).toBe(85);
      expect(rule.actions).toHaveLength(3);
      expect(rule.actions.map((a) => a.type)).toEqual([
        "generate-prd",
        "create-github-issue",
        "send-notification",
      ]);
    });

    it("createHighScoreChain uses default threshold of 80", () => {
      const rule = createHighScoreChain();
      expect(rule.conditions[0].value).toBe(80);
    });

    it("createPipelineNotificationChain creates a notification rule", () => {
      const rule = createPipelineNotificationChain("dev-team");
      expect(rule.triggerEvent).toBe("pipeline.completed");
      expect(rule.conditions).toHaveLength(0);
      expect(rule.actions.map((a) => a.type)).toEqual([
        "send-notification",
        "record-outcome",
        "index-for-search",
      ]);
      expect(rule.actions[0].config).toEqual({ channel: "dev-team" });
    });

    it("createPipelineNotificationChain defaults to 'general' channel", () => {
      const rule = createPipelineNotificationChain();
      expect(rule.actions[0].config).toEqual({ channel: "general" });
    });
  });

  // ---- clearAutomation ----
  it("clearAutomation removes all rules, logs, and unsubscribes", () => {
    createAutomationRule({
      name: "R1",
      enabled: true,
      triggerEvent: "idea.scored",
      conditions: [],
      actions: [{ type: "log" }],
    });
    clearAutomation();
    expect(listAutomationRules()).toHaveLength(0);
    expect(getAutomationLog()).toHaveLength(0);
  });

  // ---- All 7 action types ----
  describe("all action types", () => {
    it("executes generate-prd action successfully", async () => {
      createAutomationRule({
        name: "PRD",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "generate-prd" }],
      });
      await emitEvent("idea.scored", {}, "Test subject");
      const log = getAutomationLog();
      expect(log[0].actionsExecuted[0].type).toBe("generate-prd");
      expect(log[0].actionsExecuted[0].status).toBe("success");
      expect(log[0].actionsExecuted[0].result).toContain("PRD generation");
    });

    it("executes create-github-issue action successfully", async () => {
      createAutomationRule({
        name: "GH Issue",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "create-github-issue", config: { repo: "org/repo" } }],
      });
      await emitEvent("idea.scored", {}, "Test");
      const log = getAutomationLog();
      expect(log[0].actionsExecuted[0].type).toBe("create-github-issue");
      expect(log[0].actionsExecuted[0].status).toBe("success");
    });

    it("executes send-notification action successfully", async () => {
      createAutomationRule({
        name: "Notify",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "send-notification", config: { channel: "alerts" } }],
      });
      await emitEvent("pipeline.completed", {});
      const log = getAutomationLog();
      expect(log[0].actionsExecuted[0].type).toBe("send-notification");
      expect(log[0].actionsExecuted[0].status).toBe("success");
      expect(log[0].actionsExecuted[0].result).toContain("alerts");
    });

    it("executes index-for-search action successfully", async () => {
      createAutomationRule({
        name: "Index",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "index-for-search" }],
      });
      await emitEvent("pipeline.completed", {});
      const log = getAutomationLog();
      expect(log[0].actionsExecuted[0].type).toBe("index-for-search");
      expect(log[0].actionsExecuted[0].status).toBe("success");
    });

    it("executes record-outcome action successfully", async () => {
      createAutomationRule({
        name: "Record",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "record-outcome" }],
      });
      await emitEvent("pipeline.completed", {});
      const log = getAutomationLog();
      expect(log[0].actionsExecuted[0].type).toBe("record-outcome");
      expect(log[0].actionsExecuted[0].status).toBe("success");
    });
  });

  // ---- Edge cases ----
  describe("edge cases", () => {
    it("rule with 0 conditions always matches", async () => {
      const rule = createAutomationRule({
        name: "Always",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });
      await emitEvent("pipeline.completed", {});
      expect(getAutomationRule(rule.id)!.triggerCount).toBe(1);
    });

    it("action failure does not block subsequent actions", async () => {
      createAutomationRule({
        name: "Multi",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [
          { type: "webhook" }, // Will be skipped (no URL)
          { type: "log" }, // Should still execute
          { type: "record-outcome" }, // Should still execute
        ],
      });
      await emitEvent("pipeline.completed", {});
      const log = getAutomationLog();
      expect(log[0].actionsExecuted).toHaveLength(3);
      expect(log[0].actionsExecuted[0].status).toBe("skipped");
      expect(log[0].actionsExecuted[1].status).toBe("success");
      expect(log[0].actionsExecuted[2].status).toBe("success");
    });

    it("concurrent rules on same event both trigger", async () => {
      const rule1 = createAutomationRule({
        name: "R1",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });
      const rule2 = createAutomationRule({
        name: "R2",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "record-outcome" }],
      });

      await emitEvent("pipeline.completed", {});

      expect(getAutomationRule(rule1.id)!.triggerCount).toBe(1);
      expect(getAutomationRule(rule2.id)!.triggerCount).toBe(1);
    });
  });
});
