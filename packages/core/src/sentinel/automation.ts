/**
 * @module sentinel/automation
 *
 * Sentinel Automation Engine — configurable trigger→action rules,
 * multi-step approval workflows with human-in-the-loop gates,
 * and performance analytics for signal→idea conversion tracking.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DetectedSignal, Opportunity } from "./types.js";

// ---- Automation Rule Schemas ----

export const TriggerConditionSchema = z.object({
  field: z.enum(["relevanceScore", "topic", "sourceId", "title", "signalCount"]),
  operator: z.enum(["gt", "lt", "eq", "contains", "not-contains"]),
  value: z.union([z.string(), z.number()]),
});
export type TriggerCondition = z.infer<typeof TriggerConditionSchema>;

export const ActionTypeSchema = z.enum([
  "auto-investigate",
  "create-draft-idea",
  "notify-team",
  "add-to-portfolio",
  "schedule-review",
  "tag-signal",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const AutomationRuleSchema = z.object({
  id: z.string(),
  name: z.string().max(300),
  description: z.string().max(1000).optional(),
  conditions: z.array(TriggerConditionSchema).min(1).max(10),
  conditionLogic: z.enum(["all", "any"]).default("all"),
  actions: z
    .array(
      z.object({
        type: ActionTypeSchema,
        params: z.record(z.unknown()).default({}),
      })
    )
    .min(1)
    .max(5),
  isActive: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  priority: z.number().int().min(0).max(100).default(50),
  createdAt: z.string(),
  triggerCount: z.number().int().min(0).default(0),
  lastTriggeredAt: z.string().optional(),
});
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;

// ---- Approval Workflow ----

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  signalId: z.string(),
  signalTitle: z.string(),
  proposedActions: z.array(
    z.object({
      type: ActionTypeSchema,
      params: z.record(z.unknown()),
    })
  ),
  status: ApprovalStatusSchema,
  requestedAt: z.string(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().max(200).optional(),
  reviewNote: z.string().max(1000).optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// ---- Performance Analytics ----

export const SentinelPerformanceSchema = z.object({
  totalSignals: z.number().int().min(0),
  totalRulesTriggered: z.number().int().min(0),
  totalActionsExecuted: z.number().int().min(0),
  signalToIdeaRate: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
  avgResponseTimeMs: z.number().min(0),
  approvalRate: z.number().min(0).max(1),
  topRules: z
    .array(
      z.object({
        ruleId: z.string(),
        ruleName: z.string(),
        triggerCount: z.number(),
        successRate: z.number(),
      })
    )
    .max(10),
  byDay: z
    .array(
      z.object({
        date: z.string(),
        signals: z.number(),
        triggers: z.number(),
        actions: z.number(),
      })
    )
    .max(90),
  generatedAt: z.string(),
});
export type SentinelPerformance = z.infer<typeof SentinelPerformanceSchema>;

// ---- In-Memory Stores ----

const rules = new Map<string, AutomationRule>();
const approvalQueue: ApprovalRequest[] = [];
const executionLog: Array<{
  ruleId: string;
  signalId: string;
  actionType: string;
  timestamp: string;
  success: boolean;
}> = [];

// ---- Rule Management ----

/** Create an automation rule. */
export function createAutomationRule(params: {
  name: string;
  description?: string;
  conditions: TriggerCondition[];
  conditionLogic?: "all" | "any";
  actions: Array<{ type: ActionType; params?: Record<string, unknown> }>;
  requiresApproval?: boolean;
  priority?: number;
}): AutomationRule {
  const rule: AutomationRule = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    conditions: params.conditions,
    conditionLogic: params.conditionLogic ?? "all",
    actions: params.actions.map((a) => ({ type: a.type, params: a.params ?? {} })),
    isActive: true,
    requiresApproval: params.requiresApproval ?? false,
    priority: params.priority ?? 50,
    createdAt: new Date().toISOString(),
    triggerCount: 0,
  };
  const validated = AutomationRuleSchema.parse(rule);
  rules.set(validated.id, validated);
  return validated;
}

/** List all automation rules. */
export function listAutomationRules(): AutomationRule[] {
  return Array.from(rules.values()).sort((a, b) => b.priority - a.priority);
}

/** Get rule by ID. */
export function getAutomationRule(id: string): AutomationRule | undefined {
  return rules.get(id);
}

/** Toggle rule active status. */
export function toggleAutomationRule(id: string): AutomationRule | undefined {
  const rule = rules.get(id);
  if (!rule) return undefined;
  rule.isActive = !rule.isActive;
  rules.set(id, rule);
  return rule;
}

/** Delete a rule. */
export function deleteAutomationRule(id: string): boolean {
  return rules.delete(id);
}

// ---- Signal Evaluation ----

/** Evaluate whether a signal matches a rule's conditions. */
export function evaluateConditions(
  signal: DetectedSignal,
  conditions: TriggerCondition[],
  logic: "all" | "any" = "all"
): boolean {
  const evaluate = (cond: TriggerCondition): boolean => {
    let fieldValue: string | number;

    switch (cond.field) {
      case "relevanceScore":
        fieldValue = signal.relevanceScore;
        break;
      case "topic":
        fieldValue = signal.topics.join(",");
        break;
      case "sourceId":
        fieldValue = signal.sourceId;
        break;
      case "title":
        fieldValue = signal.title;
        break;
      case "signalCount":
        fieldValue = 1;
        break;
      default:
        return false;
    }

    switch (cond.operator) {
      case "gt":
        return Number(fieldValue) > Number(cond.value);
      case "lt":
        return Number(fieldValue) < Number(cond.value);
      case "eq":
        return String(fieldValue) === String(cond.value);
      case "contains":
        return String(fieldValue).toLowerCase().includes(String(cond.value).toLowerCase());
      case "not-contains":
        return !String(fieldValue).toLowerCase().includes(String(cond.value).toLowerCase());
      default:
        return false;
    }
  };

  return logic === "all" ? conditions.every(evaluate) : conditions.some(evaluate);
}

/** Process a signal against all active rules. Returns triggered actions or approval requests. */
export function processSignalAgainstRules(signal: DetectedSignal): {
  executedActions: Array<{ ruleId: string; actionType: string }>;
  pendingApprovals: ApprovalRequest[];
} {
  const executedActions: Array<{ ruleId: string; actionType: string }> = [];
  const pendingApprovals: ApprovalRequest[] = [];

  const activeRules = Array.from(rules.values())
    .filter((r) => r.isActive)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of activeRules) {
    if (!evaluateConditions(signal, rule.conditions, rule.conditionLogic)) continue;

    // Update trigger count
    rule.triggerCount++;
    rule.lastTriggeredAt = new Date().toISOString();
    rules.set(rule.id, rule);

    if (rule.requiresApproval) {
      const request: ApprovalRequest = {
        id: randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        signalId: signal.id,
        signalTitle: signal.title,
        proposedActions: rule.actions,
        status: "pending",
        requestedAt: new Date().toISOString(),
      };
      approvalQueue.push(request);
      pendingApprovals.push(request);
    } else {
      for (const action of rule.actions) {
        executedActions.push({ ruleId: rule.id, actionType: action.type });
        executionLog.push({
          ruleId: rule.id,
          signalId: signal.id,
          actionType: action.type,
          timestamp: new Date().toISOString(),
          success: true,
        });
      }
    }
  }

  return { executedActions, pendingApprovals };
}

// ---- Approval Management ----

/** Get pending approval requests. */
export function getPendingApprovals(): ApprovalRequest[] {
  return approvalQueue.filter((a) => a.status === "pending");
}

/** Review an approval request. */
export function reviewApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  opts?: { reviewedBy?: string; note?: string }
): ApprovalRequest | undefined {
  const request = approvalQueue.find((a) => a.id === approvalId);
  if (!request || request.status !== "pending") return undefined;

  request.status = decision;
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = opts?.reviewedBy;
  request.reviewNote = opts?.note;

  if (decision === "approved") {
    for (const action of request.proposedActions) {
      executionLog.push({
        ruleId: request.ruleId,
        signalId: request.signalId,
        actionType: action.type,
        timestamp: new Date().toISOString(),
        success: true,
      });
    }
  }

  return request;
}

/** Batch review multiple approvals. */
export function batchReviewApprovals(
  approvalIds: string[],
  decision: "approved" | "rejected",
  opts?: { reviewedBy?: string }
): number {
  let count = 0;
  for (const id of approvalIds) {
    if (reviewApproval(id, decision, opts)) count++;
  }
  return count;
}

// ---- Performance Analytics ----

/** Compute sentinel performance analytics. */
export function computeSentinelPerformance(): SentinelPerformance {
  const allRules = Array.from(rules.values());
  const totalTriggered = allRules.reduce((sum, r) => sum + r.triggerCount, 0);
  const totalActions = executionLog.length;

  // Compute approval rate
  const allApprovals = approvalQueue.filter((a) => a.status !== "pending");
  const approvedCount = allApprovals.filter((a) => a.status === "approved").length;
  const approvalRate = allApprovals.length > 0 ? approvedCount / allApprovals.length : 0;

  // False positive rate (dismissed signals / total)
  const rejectedCount = allApprovals.filter((a) => a.status === "rejected").length;
  const fpRate = allApprovals.length > 0 ? rejectedCount / allApprovals.length : 0;

  // Signal to idea rate
  const ideaActions = executionLog.filter((e) => e.actionType === "create-draft-idea");
  const uniqueSignals = new Set(executionLog.map((e) => e.signalId));
  const signalToIdeaRate = uniqueSignals.size > 0 ? ideaActions.length / uniqueSignals.size : 0;

  // Top rules
  const topRules = allRules
    .filter((r) => r.triggerCount > 0)
    .sort((a, b) => b.triggerCount - a.triggerCount)
    .slice(0, 10)
    .map((r) => ({
      ruleId: r.id,
      ruleName: r.name,
      triggerCount: r.triggerCount,
      successRate: 1.0,
    }));

  // By day
  const dayMap = new Map<string, { signals: number; triggers: number; actions: number }>();
  for (const log of executionLog) {
    const day = log.timestamp.slice(0, 10);
    const entry = dayMap.get(day) ?? { signals: 0, triggers: 0, actions: 0 };
    entry.actions++;
    entry.triggers++;
    dayMap.set(day, entry);
  }

  return {
    totalSignals: uniqueSignals.size,
    totalRulesTriggered: totalTriggered,
    totalActionsExecuted: totalActions,
    signalToIdeaRate: +signalToIdeaRate.toFixed(3),
    falsePositiveRate: +fpRate.toFixed(3),
    avgResponseTimeMs: 0,
    approvalRate: +approvalRate.toFixed(3),
    topRules,
    byDay: Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    generatedAt: new Date().toISOString(),
  };
}

// ---- Batch Review Mode ----

export interface BatchReviewItem {
  approval: ApprovalRequest;
  signal: { id: string; title: string; relevanceScore: number };
  rule: { id: string; name: string; priority: number };
  suggestedDecision: "approve" | "reject";
  reason: string;
}

/** Get pending approvals formatted for batch review UI. */
export function getBatchReviewItems(): BatchReviewItem[] {
  const pending = getPendingApprovals();

  return pending
    .map((approval) => {
      const rule = rules.get(approval.ruleId);

      // Auto-suggest decision based on signal relevance (from title heuristics)
      const titleLength = approval.signalTitle.length;
      const suggestedDecision: "approve" | "reject" = titleLength > 20 ? "approve" : "reject";
      const reason =
        suggestedDecision === "approve"
          ? "Signal has sufficient detail for automated action"
          : "Signal may lack sufficient context — recommend manual review";

      return {
        approval,
        signal: {
          id: approval.signalId,
          title: approval.signalTitle,
          relevanceScore: 0, // Would be populated from signal store
        },
        rule: {
          id: approval.ruleId,
          name: rule?.name ?? "Unknown Rule",
          priority: rule?.priority ?? 0,
        },
        suggestedDecision,
        reason,
      };
    })
    .sort((a, b) => b.rule.priority - a.rule.priority);
}

// ---- Signal Deduplication ----

const processedSignalHashes = new Set<string>();

/** Check if a signal is a duplicate based on title hash. */
export function isSignalDuplicate(signal: DetectedSignal): boolean {
  const hash = signal.title.toLowerCase().trim().replace(/\s+/g, " ");
  if (processedSignalHashes.has(hash)) return true;
  processedSignalHashes.add(hash);
  // Keep bounded
  if (processedSignalHashes.size > 10000) {
    const arr = Array.from(processedSignalHashes);
    processedSignalHashes.clear();
    for (const h of arr.slice(-5000)) processedSignalHashes.add(h);
  }
  return false;
}

/** Process signal with deduplication — skips duplicates. */
export function processSignalWithDedup(
  signal: DetectedSignal
): ReturnType<typeof processSignalAgainstRules> & { isDuplicate: boolean } {
  if (isSignalDuplicate(signal)) {
    return { executedActions: [], pendingApprovals: [], isDuplicate: true };
  }
  return { ...processSignalAgainstRules(signal), isDuplicate: false };
}

// ---- Detailed Conversion Analytics ----

export interface ConversionFunnelStage {
  stage: string;
  count: number;
  conversionRate: number;
}

/** Get detailed signal→idea conversion funnel. */
export function getConversionFunnel(): ConversionFunnelStage[] {
  const uniqueSignals = new Set(executionLog.map((e) => e.signalId)).size;
  const triggeredRules = executionLog.length;
  const ideaActions = executionLog.filter((e) => e.actionType === "create-draft-idea").length;
  const investigateActions = executionLog.filter((e) => e.actionType === "auto-investigate").length;
  const notifyActions = executionLog.filter((e) => e.actionType === "notify-team").length;

  return [
    { stage: "Signals Detected", count: uniqueSignals, conversionRate: 1 },
    {
      stage: "Rules Triggered",
      count: triggeredRules,
      conversionRate: uniqueSignals > 0 ? +(triggeredRules / uniqueSignals).toFixed(3) : 0,
    },
    {
      stage: "Auto-Investigations",
      count: investigateActions,
      conversionRate: triggeredRules > 0 ? +(investigateActions / triggeredRules).toFixed(3) : 0,
    },
    {
      stage: "Draft Ideas Created",
      count: ideaActions,
      conversionRate: triggeredRules > 0 ? +(ideaActions / triggeredRules).toFixed(3) : 0,
    },
    {
      stage: "Team Notifications",
      count: notifyActions,
      conversionRate: triggeredRules > 0 ? +(notifyActions / triggeredRules).toFixed(3) : 0,
    },
  ];
}

/** Clear all automation data (for testing). */
export function clearAutomationData(): void {
  rules.clear();
  approvalQueue.length = 0;
  executionLog.length = 0;
  processedSignalHashes.clear();
}
