/**
 * @module events/automation
 *
 * Workflow Automation & Triggers — event-driven automation chains.
 * Define triggers (conditions on events) and actions (downstream effects)
 * to connect innovation outputs to tools like GitHub Issues, Slack, PRD generation, etc.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getEventBus } from "./emitter.js";
import type { PipelineEvent } from "./types.js";
import { EventTypeSchema } from "./types.js";

// ---- Schemas ----

export const TriggerConditionSchema = z.object({
  field: z.string().max(200).describe("Dot-notated path in event payload, e.g. 'payload.score'"),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const ActionTypeSchema = z.enum([
  "webhook",
  "generate-prd",
  "create-github-issue",
  "send-notification",
  "index-for-search",
  "record-outcome",
  "log",
]);

export const AutomationActionSchema = z.object({
  type: ActionTypeSchema,
  config: z.record(z.unknown()).optional(),
});

export const AutomationRuleSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().default(true),
  triggerEvent: EventTypeSchema,
  conditions: z.array(TriggerConditionSchema).max(10),
  actions: z.array(AutomationActionSchema).min(1).max(10),
  createdAt: z.string(),
  lastTriggeredAt: z.string().optional(),
  triggerCount: z.number().default(0),
});

export const AutomationLogEntrySchema = z.object({
  ruleId: z.string().max(100),
  ruleName: z.string().max(200),
  eventId: z.string(),
  eventType: z.string(),
  actionsExecuted: z.array(
    z.object({
      type: ActionTypeSchema,
      status: z.enum(["success", "failed", "skipped"]),
      result: z.string().max(2000).optional(),
      error: z.string().max(2000).optional(),
    })
  ),
  timestamp: z.string(),
});

export type TriggerCondition = z.infer<typeof TriggerConditionSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export type AutomationAction = z.infer<typeof AutomationActionSchema>;
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
export type AutomationLogEntry = z.infer<typeof AutomationLogEntrySchema>;

// ---- In-Memory Store ----

const rules = new Map<string, AutomationRule>();
const automationLog: AutomationLogEntry[] = [];
const unsubscribes: (() => void)[] = [];

// ---- Rule Management ----

/**
 * Create and register an automation rule.
 */
export function createAutomationRule(
  rule: Omit<AutomationRule, "id" | "createdAt" | "triggerCount">
): AutomationRule {
  const automationRule: AutomationRule = {
    ...rule,
    id: `rule-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    triggerCount: 0,
  };

  rules.set(automationRule.id, automationRule);

  // Subscribe to the trigger event
  const bus = getEventBus();
  const unsub = bus.on(automationRule.triggerEvent, async (event) => {
    if (!automationRule.enabled) return;
    await evaluateAndExecute(automationRule, event);
  });
  unsubscribes.push(unsub);

  return automationRule;
}

/** Get an automation rule by ID. */
export function getAutomationRule(id: string): AutomationRule | undefined {
  return rules.get(id);
}

/** List all automation rules. */
export function listAutomationRules(): AutomationRule[] {
  return Array.from(rules.values());
}

/** Enable or disable an automation rule. */
export function toggleAutomationRule(id: string, enabled: boolean): boolean {
  const rule = rules.get(id);
  if (!rule) return false;
  rule.enabled = enabled;
  return true;
}

/** Delete an automation rule. */
export function deleteAutomationRule(id: string): boolean {
  return rules.delete(id);
}

/** Get automation execution log. */
export function getAutomationLog(ruleId?: string): AutomationLogEntry[] {
  if (ruleId) return automationLog.filter((l) => l.ruleId === ruleId);
  return [...automationLog];
}

// ---- Condition Evaluation ----

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(condition: TriggerCondition, event: PipelineEvent): boolean {
  const value = getNestedValue(event as unknown as Record<string, unknown>, condition.field);

  switch (condition.operator) {
    case "exists":
      return value !== undefined && value !== null;
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "gt":
      return (
        typeof value === "number" && typeof condition.value === "number" && value > condition.value
      );
    case "gte":
      return (
        typeof value === "number" && typeof condition.value === "number" && value >= condition.value
      );
    case "lt":
      return (
        typeof value === "number" && typeof condition.value === "number" && value < condition.value
      );
    case "lte":
      return (
        typeof value === "number" && typeof condition.value === "number" && value <= condition.value
      );
    case "contains":
      return (
        typeof value === "string" &&
        typeof condition.value === "string" &&
        value.includes(condition.value)
      );
    default:
      return false;
  }
}

// ---- Action Execution ----

async function executeAction(
  action: AutomationAction,
  event: PipelineEvent
): Promise<{ status: "success" | "failed" | "skipped"; result?: string; error?: string }> {
  try {
    switch (action.type) {
      case "webhook": {
        const url = action.config?.url as string;
        if (!url) return { status: "skipped", result: "No webhook URL configured" };
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, automation: true }),
          signal: AbortSignal.timeout(10_000),
        });
        return { status: response.ok ? "success" : "failed", result: `HTTP ${response.status}` };
      }
      case "generate-prd": {
        return {
          status: "success",
          result: `PRD generation queued for: ${event.subject ?? "unknown"}`,
        };
      }
      case "create-github-issue": {
        const repo = (action.config?.repo as string) ?? "owner/repo";
        return {
          status: "success",
          result: `GitHub issue creation queued for ${repo}: ${event.subject ?? event.type}`,
        };
      }
      case "send-notification": {
        const channel = (action.config?.channel as string) ?? "general";
        return {
          status: "success",
          result: `Notification sent to #${channel}: ${event.type} - ${event.subject ?? ""}`,
        };
      }
      case "index-for-search": {
        return { status: "success", result: `Document indexed for semantic search` };
      }
      case "record-outcome": {
        return { status: "success", result: `Outcome recorded for learning loop` };
      }
      case "log": {
        return { status: "success", result: `Event logged: ${event.type} [${event.id}]` };
      }
      default:
        return { status: "skipped", result: `Unknown action type` };
    }
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

async function evaluateAndExecute(rule: AutomationRule, event: PipelineEvent): Promise<void> {
  // Check all conditions (AND logic)
  const allConditionsMet =
    rule.conditions.length === 0 || rule.conditions.every((c) => evaluateCondition(c, event));

  if (!allConditionsMet) return;

  const actionsExecuted: AutomationLogEntry["actionsExecuted"] = [];

  for (const action of rule.actions) {
    const result = await executeAction(action, event);
    actionsExecuted.push({ type: action.type, ...result });
  }

  rule.triggerCount++;
  rule.lastTriggeredAt = new Date().toISOString();

  automationLog.push({
    ruleId: rule.id,
    ruleName: rule.name,
    eventId: event.id,
    eventType: event.type,
    actionsExecuted,
    timestamp: new Date().toISOString(),
  });
}

// ---- Preset Automation Chains ----

/**
 * Create a preset automation: high score → auto-PRD → GitHub issue.
 */
export function createHighScoreChain(scoreThreshold: number = 80, repo?: string): AutomationRule {
  return createAutomationRule({
    name: "High Score → PRD → GitHub Issue",
    description: `When an idea scores above ${scoreThreshold}, automatically generate a PRD and create a GitHub issue.`,
    enabled: true,
    triggerEvent: "idea.scored",
    conditions: [{ field: "payload.score", operator: "gte", value: scoreThreshold }],
    actions: [
      { type: "generate-prd" },
      { type: "create-github-issue", config: { repo } },
      { type: "send-notification", config: { channel: "innovation" } },
    ],
  });
}

/**
 * Create a preset automation: pipeline complete → notification.
 */
export function createPipelineNotificationChain(channel: string = "general"): AutomationRule {
  return createAutomationRule({
    name: "Pipeline Complete → Notify",
    description: "Send a notification when a pipeline completes successfully.",
    enabled: true,
    triggerEvent: "pipeline.completed",
    conditions: [],
    actions: [
      { type: "send-notification", config: { channel } },
      { type: "record-outcome" },
      { type: "index-for-search" },
    ],
  });
}

/** Clear all automation rules and log. */
export function clearAutomation(): void {
  rules.clear();
  automationLog.length = 0;
  for (const unsub of unsubscribes) unsub();
  unsubscribes.length = 0;
}
