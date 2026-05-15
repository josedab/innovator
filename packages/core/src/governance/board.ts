/**
 * @module governance/board
 *
 * Innovation Governance Board — approval workflows with sequential, parallel,
 * and conditional routing. Stage-gate integration, SLA tracking, reviewer
 * dashboards, evaluation forms, audit trails, and bottleneck detection.
 */

import { z } from "zod";

// ---- Schemas ----

export const ApprovalStatusSchema = z.enum([
  "pending",
  "in_review",
  "approved",
  "rejected",
  "revision_requested",
  "escalated",
  "expired",
]);

export const WorkflowTypeSchema = z.enum(["sequential", "parallel", "conditional"]);

export const StageGateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000).optional(),
  criteria: z.array(
    z.object({
      name: z.string().max(200),
      threshold: z.number().min(0).max(100),
      weight: z.number().min(0).max(1),
      required: z.boolean(),
    })
  ),
  autoApproveThreshold: z.number().min(0).max(100).optional(),
  autoRejectThreshold: z.number().min(0).max(100).optional(),
});

export const ReviewerSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  email: z.string().max(300),
  role: z.enum(["reviewer", "approver", "admin"]),
  expertise: z.array(z.string().max(100)).max(20),
  currentLoad: z.number().int().min(0),
  maxConcurrentReviews: z.number().int().min(1).max(50).default(10),
});

export const EvaluationFormSchema = z.object({
  ideaId: z.string().max(100),
  reviewerId: z.string().max(100),
  scores: z.record(z.number().min(0).max(10)),
  comments: z.string().max(5000),
  recommendation: ApprovalStatusSchema,
  completedAt: z.string().optional(),
  timeSpentMinutes: z.number().min(0).optional(),
});

export const ApprovalRequestSchema = z.object({
  id: z.string().max(100),
  ideaId: z.string().max(100),
  ideaTitle: z.string().max(500),
  ideaScore: z.number().min(0).max(10),
  gauntletSurvival: z.number().min(0).max(1).optional(),
  workflowType: WorkflowTypeSchema,
  stageGateId: z.string().max(100),
  status: ApprovalStatusSchema,
  assignedReviewers: z.array(z.string().max(100)),
  evaluations: z.array(EvaluationFormSchema),
  slaDeadline: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  escalatedAt: z.string().optional(),
  escalationReason: z.string().max(1000).optional(),
  auditTrail: z.array(
    z.object({
      action: z.string().max(200),
      actor: z.string().max(200),
      timestamp: z.string(),
      details: z.string().max(1000).optional(),
    })
  ),
});

export const GovernanceMetricsSchema = z.object({
  totalRequests: z.number().int().min(0),
  pendingRequests: z.number().int().min(0),
  approvedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  averageTimeToDecisionMs: z.number().min(0),
  slaComplianceRate: z.number().min(0).max(1),
  bottlenecks: z.array(
    z.object({
      reviewerId: z.string().max(100),
      pendingCount: z.number().int().min(0),
      averageDelayMs: z.number().min(0),
    })
  ),
});

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type WorkflowType = z.infer<typeof WorkflowTypeSchema>;
export type StageGate = z.infer<typeof StageGateSchema>;
export type GovReviewer = z.infer<typeof ReviewerSchema>;
export type EvaluationForm = z.infer<typeof EvaluationFormSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type GovernanceMetrics = z.infer<typeof GovernanceMetricsSchema>;

// ---- In-Memory Stores ----

const stageGates = new Map<string, StageGate>();
const reviewers = new Map<string, GovReviewer>();
const approvalRequests = new Map<string, ApprovalRequest>();

// ---- Stage Gate Management ----

/** Create a stage gate definition. */
export function createStageGate(gate: Omit<StageGate, "id">): StageGate {
  const id = `gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const stageGate: StageGate = { id, ...gate };
  stageGates.set(id, stageGate);
  return stageGate;
}

/** Get a stage gate by ID. */
export function getStageGate(id: string): StageGate | undefined {
  return stageGates.get(id);
}

/** List all stage gates. */
export function listStageGates(): StageGate[] {
  return Array.from(stageGates.values());
}

// ---- Reviewer Management ----

/** Register a reviewer. */
export function registerGovReviewer(
  name: string,
  email: string,
  role: GovReviewer["role"] = "reviewer",
  expertise: string[] = []
): GovReviewer {
  const id = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewer: GovReviewer = {
    id,
    name,
    email,
    role,
    expertise,
    currentLoad: 0,
    maxConcurrentReviews: 10,
  };
  reviewers.set(id, reviewer);
  return reviewer;
}

/** Get a reviewer by ID. */
export function getGovReviewer(id: string): GovReviewer | undefined {
  return reviewers.get(id);
}

/** List all reviewers. */
export function listGovReviewers(): GovReviewer[] {
  return Array.from(reviewers.values());
}

// ---- Approval Workflow ----

/** Check if an idea passes the quality gate thresholds. */
export function checkQualityGate(
  ideaScore: number,
  gauntletSurvival: number | undefined,
  stageGateId: string
): { passes: boolean; autoDecision?: ApprovalStatus; failedCriteria: string[] } {
  const gate = stageGates.get(stageGateId);
  if (!gate) return { passes: false, failedCriteria: ["Stage gate not found"] };

  const failedCriteria: string[] = [];

  for (const criterion of gate.criteria) {
    let value: number;
    if (criterion.name === "gauntlet_survival") {
      value = (gauntletSurvival ?? 0) * 100;
    } else {
      value = ideaScore * 10;
    }

    if (criterion.required && value < criterion.threshold) {
      failedCriteria.push(`${criterion.name}: ${value.toFixed(1)} < ${criterion.threshold}`);
    }
  }

  const normalizedScore = ideaScore * 10;
  if (gate.autoApproveThreshold != null && normalizedScore >= gate.autoApproveThreshold) {
    return { passes: true, autoDecision: "approved", failedCriteria: [] };
  }
  if (gate.autoRejectThreshold != null && normalizedScore <= gate.autoRejectThreshold) {
    return { passes: false, autoDecision: "rejected", failedCriteria };
  }

  return { passes: failedCriteria.length === 0, failedCriteria };
}

/** Create an approval request and route it to reviewers. */
export function createApprovalRequest(
  ideaId: string,
  ideaTitle: string,
  ideaScore: number,
  stageGateId: string,
  workflowType: WorkflowType = "sequential",
  reviewerIds: string[] = [],
  slaHours: number = 72,
  gauntletSurvival?: number
): ApprovalRequest {
  const id = `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const slaDeadline = new Date(now.getTime() + slaHours * 3600_000).toISOString();

  let assignedReviewers = reviewerIds;
  if (assignedReviewers.length === 0) {
    assignedReviewers = selectReviewers(workflowType);
  }

  const request: ApprovalRequest = {
    id,
    ideaId,
    ideaTitle,
    ideaScore,
    gauntletSurvival,
    workflowType,
    stageGateId,
    status: "pending",
    assignedReviewers,
    evaluations: [],
    slaDeadline,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    auditTrail: [
      {
        action: "created",
        actor: "system",
        timestamp: now.toISOString(),
        details: `Approval request created with ${workflowType} workflow, SLA: ${slaHours}h`,
      },
    ],
  };

  const gateCheck = checkQualityGate(ideaScore, gauntletSurvival, stageGateId);
  if (gateCheck.autoDecision) {
    request.status = gateCheck.autoDecision;
    request.completedAt = now.toISOString();
    request.auditTrail.push({
      action: `auto_${gateCheck.autoDecision}`,
      actor: "system",
      timestamp: now.toISOString(),
      details: `Auto-${gateCheck.autoDecision} based on stage gate thresholds`,
    });
  }

  for (const revId of assignedReviewers) {
    const rev = reviewers.get(revId);
    if (rev) rev.currentLoad++;
  }

  approvalRequests.set(id, request);
  return request;
}

function selectReviewers(workflowType: WorkflowType): string[] {
  const available = Array.from(reviewers.values())
    .filter((r) => r.currentLoad < r.maxConcurrentReviews)
    .sort((a, b) => a.currentLoad - b.currentLoad);
  if (available.length === 0) return [];

  const count = workflowType === "parallel" ? 3 : workflowType === "sequential" ? 2 : 1;
  return available.slice(0, count).map((r) => r.id);
}

/** Submit an evaluation for an approval request. */
export function submitEvaluation(requestId: string, evaluation: EvaluationForm): boolean {
  const request = approvalRequests.get(requestId);
  if (!request || request.status === "approved" || request.status === "rejected") return false;

  evaluation.completedAt = new Date().toISOString();
  request.evaluations.push(evaluation);
  request.updatedAt = new Date().toISOString();
  request.auditTrail.push({
    action: "evaluation_submitted",
    actor: evaluation.reviewerId,
    timestamp: new Date().toISOString(),
    details: `Recommendation: ${evaluation.recommendation}`,
  });

  const rev = reviewers.get(evaluation.reviewerId);
  if (rev && rev.currentLoad > 0) rev.currentLoad--;

  const allReviewed = request.assignedReviewers.every((revId) =>
    request.evaluations.some((e) => e.reviewerId === revId)
  );

  if (allReviewed) {
    resolveRequest(request);
  }

  return true;
}

function resolveRequest(request: ApprovalRequest): void {
  if (request.status === "approved" || request.status === "rejected") return;

  const approvals = request.evaluations.filter((e) => e.recommendation === "approved").length;
  const rejections = request.evaluations.filter((e) => e.recommendation === "rejected").length;

  request.status =
    request.workflowType === "parallel"
      ? approvals > rejections
        ? "approved"
        : "rejected"
      : rejections === 0
        ? "approved"
        : "rejected";

  request.completedAt = new Date().toISOString();
  request.auditTrail.push({
    action: `resolved_${request.status}`,
    actor: "system",
    timestamp: new Date().toISOString(),
    details: `${approvals} approvals, ${rejections} rejections`,
  });
}

/** Batch approve/reject multiple requests. */
export function batchDecision(
  requestIds: string[],
  decision: "approved" | "rejected",
  reviewerId: string,
  comments: string = ""
): number {
  let count = 0;
  for (const id of requestIds) {
    const request = approvalRequests.get(id);
    if (!request || request.status !== "pending") continue;
    request.status = decision;
    request.completedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    request.auditTrail.push({
      action: `batch_${decision}`,
      actor: reviewerId,
      timestamp: new Date().toISOString(),
      details: comments || `Batch ${decision}`,
    });
    count++;
  }
  return count;
}

/** Escalate a request approaching SLA deadline. */
export function escalateRequest(requestId: string, reason: string): boolean {
  const request = approvalRequests.get(requestId);
  if (!request || request.status !== "pending") return false;
  request.status = "escalated";
  request.escalatedAt = new Date().toISOString();
  request.escalationReason = reason;
  request.updatedAt = new Date().toISOString();
  request.auditTrail.push({
    action: "escalated",
    actor: "system",
    timestamp: new Date().toISOString(),
    details: reason,
  });
  return true;
}

/** Get an approval request by ID. */
export function getApprovalRequest(id: string): ApprovalRequest | undefined {
  return approvalRequests.get(id);
}

/** List approval requests with optional filters. */
export function listApprovalRequests(options?: {
  status?: ApprovalStatus;
  reviewerId?: string;
}): ApprovalRequest[] {
  let results = Array.from(approvalRequests.values());
  if (options?.status) results = results.filter((r) => r.status === options.status);
  if (options?.reviewerId)
    results = results.filter((r) => r.assignedReviewers.includes(options.reviewerId!));
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- Metrics & Bottleneck Detection ----

/** Compute governance metrics including bottleneck detection. */
export function computeGovernanceMetrics(): GovernanceMetrics {
  const requests = Array.from(approvalRequests.values());
  const completed = requests.filter((r) => r.completedAt);
  const pending = requests.filter((r) => r.status === "pending" || r.status === "in_review");

  const decisionTimes = completed.map(
    (r) => new Date(r.completedAt!).getTime() - new Date(r.createdAt).getTime()
  );
  const avgTime =
    decisionTimes.length > 0 ? decisionTimes.reduce((s, t) => s + t, 0) / decisionTimes.length : 0;

  const slaCompliant = completed.filter(
    (r) => new Date(r.completedAt!).getTime() <= new Date(r.slaDeadline).getTime()
  );

  const reviewerPending = new Map<string, number[]>();
  for (const req of pending) {
    for (const revId of req.assignedReviewers) {
      if (!req.evaluations.some((e) => e.reviewerId === revId)) {
        const delays = reviewerPending.get(revId) ?? [];
        delays.push(Date.now() - new Date(req.createdAt).getTime());
        reviewerPending.set(revId, delays);
      }
    }
  }

  return {
    totalRequests: requests.length,
    pendingRequests: pending.length,
    approvedCount: requests.filter((r) => r.status === "approved").length,
    rejectedCount: requests.filter((r) => r.status === "rejected").length,
    averageTimeToDecisionMs: Math.round(avgTime),
    slaComplianceRate:
      completed.length > 0 ? Math.round((slaCompliant.length / completed.length) * 100) / 100 : 1,
    bottlenecks: Array.from(reviewerPending.entries())
      .map(([reviewerId, delays]) => ({
        reviewerId,
        pendingCount: delays.length,
        averageDelayMs: delays.reduce((s, d) => s + d, 0) / delays.length,
      }))
      .sort((a, b) => b.pendingCount - a.pendingCount),
  };
}

/** Generate executive summary markdown. */
export function governanceSummaryToMarkdown(metrics: GovernanceMetrics): string {
  const lines = [
    "# Innovation Governance Summary",
    "",
    `- **Total Requests:** ${metrics.totalRequests}`,
    `- **Pending:** ${metrics.pendingRequests}`,
    `- **Approved:** ${metrics.approvedCount}`,
    `- **Rejected:** ${metrics.rejectedCount}`,
    `- **Avg Decision Time:** ${Math.round(metrics.averageTimeToDecisionMs / 3600_000)}h`,
    `- **SLA Compliance:** ${(metrics.slaComplianceRate * 100).toFixed(1)}%`,
    "",
  ];

  if (metrics.bottlenecks.length > 0) {
    lines.push(
      "## Bottlenecks",
      "| Reviewer | Pending | Avg Delay |",
      "|----------|---------|-----------|"
    );
    for (const b of metrics.bottlenecks.slice(0, 5)) {
      lines.push(
        `| ${b.reviewerId} | ${b.pendingCount} | ${Math.round(b.averageDelayMs / 3600_000)}h |`
      );
    }
  }

  return lines.join("\n");
}

/** Clear all governance state (for testing). */
export function clearGovernanceState(): void {
  stageGates.clear();
  reviewers.clear();
  approvalRequests.clear();
}
