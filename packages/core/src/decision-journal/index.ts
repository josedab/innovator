/**
 * @module decision-journal
 *
 * Structured decision log linking innovation ideas to actual decisions.
 * Supports decision lifecycle tracking (approved, rejected, deferred, pivoted),
 * structured rationale capture, revisit reminders, and decision velocity analytics.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const DecisionStatusSchema = z.enum([
  "approved",
  "rejected",
  "deferred",
  "pivoted",
  "pending-review",
  "implemented",
  "abandoned",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DecisionRationaleSchema = z.object({
  summary: z.string().max(2000),
  prosConsidered: z.array(z.string().max(500)).max(20).default([]),
  consConsidered: z.array(z.string().max(500)).max(20).default([]),
  alternativesConsidered: z.array(z.string().max(500)).max(10).default([]),
  stakeholders: z.array(z.string().max(200)).max(20).default([]),
  confidenceLevel: z.number().min(0).max(100).default(50),
  assumptions: z.array(z.string().max(500)).max(10).default([]),
});
export type DecisionRationale = z.infer<typeof DecisionRationaleSchema>;

export const DecisionHistoryEntrySchema = z.object({
  status: DecisionStatusSchema,
  rationale: z.string().max(2000).optional(),
  changedBy: z.string().max(200).optional(),
  timestamp: z.string(),
});
export type DecisionHistoryEntry = z.infer<typeof DecisionHistoryEntrySchema>;

export const RevisitReminderSchema = z.object({
  id: z.string().max(100),
  decisionId: z.string().max(100),
  scheduledFor: z.string(),
  reason: z.string().max(1000),
  dismissed: z.boolean().default(false),
});
export type RevisitReminder = z.infer<typeof RevisitReminderSchema>;

export const DecisionSchema = z.object({
  id: z.string().max(100),
  ideaTitle: z.string().max(500),
  ideaId: z.string().max(100).optional(),
  angleId: z.string().max(100).optional(),
  sessionId: z.string().max(100).optional(),
  subject: z.string().max(2000),
  status: DecisionStatusSchema,
  rationale: DecisionRationaleSchema,
  history: z.array(DecisionHistoryEntrySchema).default([]),
  tags: z.array(z.string().max(100)).max(20).default([]),
  revisitReminders: z.array(RevisitReminderSchema).max(10).default([]),
  outcome: z.string().max(2000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  decidedBy: z.string().max(200).optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ---- Store ----

const decisions = new Map<string, Decision>();

// ---- CRUD ----

/** Create a new decision for an idea. */
export function createDecision(input: {
  ideaTitle: string;
  ideaId?: string;
  angleId?: string;
  sessionId?: string;
  subject: string;
  status: DecisionStatus;
  rationale: DecisionRationale;
  tags?: string[];
  decidedBy?: string;
}): Decision {
  const now = new Date().toISOString();
  const decision: Decision = {
    id: `dec-${randomUUID().slice(0, 8)}`,
    ideaTitle: input.ideaTitle,
    ideaId: input.ideaId,
    angleId: input.angleId,
    sessionId: input.sessionId,
    subject: input.subject,
    status: input.status,
    rationale: input.rationale,
    history: [
      {
        status: input.status,
        rationale: input.rationale.summary,
        changedBy: input.decidedBy,
        timestamp: now,
      },
    ],
    tags: input.tags ?? [],
    revisitReminders: [],
    createdAt: now,
    updatedAt: now,
    decidedBy: input.decidedBy,
  };

  decisions.set(decision.id, decision);
  return decision;
}

/** Get a decision by ID. */
export function getDecision(id: string): Decision | undefined {
  return decisions.get(id);
}

/** Update a decision's status with rationale tracking. */
export function updateDecisionStatus(
  id: string,
  status: DecisionStatus,
  rationale?: string,
  changedBy?: string
): Decision | undefined {
  const decision = decisions.get(id);
  if (!decision) return undefined;

  decision.status = status;
  decision.updatedAt = new Date().toISOString();

  decision.history.push({
    status,
    rationale,
    changedBy,
    timestamp: decision.updatedAt,
  });

  return decision;
}

/** Update decision fields. */
export function updateDecision(
  id: string,
  updates: Partial<Pick<Decision, "tags" | "outcome" | "rationale">>
): Decision | undefined {
  const decision = decisions.get(id);
  if (!decision) return undefined;

  if (updates.tags !== undefined) decision.tags = updates.tags;
  if (updates.outcome !== undefined) decision.outcome = updates.outcome;
  if (updates.rationale !== undefined) decision.rationale = updates.rationale;
  decision.updatedAt = new Date().toISOString();

  return decision;
}

/** Delete a decision. */
export function deleteDecision(id: string): boolean {
  return decisions.delete(id);
}

/** List all decisions, optionally filtered. */
export function listDecisions(filter?: {
  status?: DecisionStatus;
  sessionId?: string;
  tag?: string;
}): Decision[] {
  let result = Array.from(decisions.values());

  if (filter?.status) {
    result = result.filter((d) => d.status === filter.status);
  }
  if (filter?.sessionId) {
    result = result.filter((d) => d.sessionId === filter.sessionId);
  }
  if (filter?.tag) {
    result = result.filter((d) => d.tags.includes(filter.tag!));
  }

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---- Revisit Reminders ----

/** Schedule a revisit reminder for a decision. */
export function scheduleRevisit(
  decisionId: string,
  scheduledFor: string,
  reason: string
): RevisitReminder | undefined {
  const decision = decisions.get(decisionId);
  if (!decision) return undefined;

  const reminder: RevisitReminder = {
    id: `rem-${randomUUID().slice(0, 8)}`,
    decisionId,
    scheduledFor,
    reason,
    dismissed: false,
  };

  decision.revisitReminders.push(reminder);
  decision.updatedAt = new Date().toISOString();
  return reminder;
}

/** Get pending revisit reminders that are due. */
export function getDueRevisits(now = new Date()): RevisitReminder[] {
  const due: RevisitReminder[] = [];
  for (const decision of decisions.values()) {
    for (const reminder of decision.revisitReminders) {
      if (!reminder.dismissed && new Date(reminder.scheduledFor) <= now) {
        due.push(reminder);
      }
    }
  }
  return due;
}

/** Dismiss a revisit reminder. */
export function dismissRevisit(decisionId: string, reminderId: string): boolean {
  const decision = decisions.get(decisionId);
  if (!decision) return false;

  const reminder = decision.revisitReminders.find((r) => r.id === reminderId);
  if (!reminder) return false;

  reminder.dismissed = true;
  decision.updatedAt = new Date().toISOString();
  return true;
}

// ---- Analytics ----

/** Get decision velocity metrics. */
export function getDecisionVelocity(): {
  totalDecisions: number;
  byStatus: Record<string, number>;
  approvalRate: number;
  avgTimeToDecisionMs: number;
  recentDecisions: number;
  implementedCount: number;
  funnel: { ideas: number; decided: number; approved: number; implemented: number };
} {
  const all = Array.from(decisions.values());
  const byStatus: Record<string, number> = {};

  for (const d of all) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  }

  const decided = all.filter((d) =>
    ["approved", "rejected", "pivoted", "implemented"].includes(d.status)
  );
  const approved = all.filter((d) => ["approved", "implemented"].includes(d.status));
  const implemented = all.filter((d) => d.status === "implemented");

  // Avg time from creation to first non-pending status
  const decisionTimes = all
    .filter((d) => d.history.length > 1)
    .map((d) => {
      const created = new Date(d.createdAt).getTime();
      const firstDecision = new Date(d.history[1]?.timestamp ?? d.createdAt).getTime();
      return firstDecision - created;
    });

  const avgTimeToDecisionMs =
    decisionTimes.length > 0
      ? Math.round(decisionTimes.reduce((s, t) => s + t, 0) / decisionTimes.length)
      : 0;

  // Recent = last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentDecisions = all.filter((d) => d.createdAt > thirtyDaysAgo).length;

  return {
    totalDecisions: all.length,
    byStatus,
    approvalRate:
      decided.length > 0 ? Math.round((approved.length / decided.length) * 100) / 100 : 0,
    avgTimeToDecisionMs,
    recentDecisions,
    implementedCount: implemented.length,
    funnel: {
      ideas: all.length,
      decided: decided.length,
      approved: approved.length,
      implemented: implemented.length,
    },
  };
}

/** Clear all decisions (for testing). */
export function clearDecisions(): void {
  decisions.clear();
}
