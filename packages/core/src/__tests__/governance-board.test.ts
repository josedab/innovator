import { describe, it, expect, beforeEach } from "vitest";

import {
  createStageGate,
  getStageGate,
  listStageGates,
  registerGovReviewer,
  getGovReviewer,
  listGovReviewers,
  checkQualityGate,
  createApprovalRequest,
  submitEvaluation,
  batchDecision,
  escalateRequest,
  getApprovalRequest,
  listApprovalRequests,
  computeGovernanceMetrics,
  governanceSummaryToMarkdown,
  clearGovernanceState,
} from "../governance/board.js";

describe("governance/board", () => {
  beforeEach(() => {
    clearGovernanceState();
  });

  describe("stage gates", () => {
    it("creates and retrieves a stage gate", () => {
      const gate = createStageGate({
        name: "Quality Gate 1",
        criteria: [
          { name: "score", threshold: 60, weight: 0.5, required: true },
          { name: "gauntlet_survival", threshold: 70, weight: 0.5, required: true },
        ],
        autoApproveThreshold: 90,
        autoRejectThreshold: 20,
      });
      expect(gate.id).toBeDefined();
      expect(getStageGate(gate.id)?.name).toBe("Quality Gate 1");
    });

    it("lists all stage gates", () => {
      createStageGate({ name: "G1", criteria: [] });
      createStageGate({ name: "G2", criteria: [] });
      expect(listStageGates()).toHaveLength(2);
    });
  });

  describe("reviewers", () => {
    it("registers and retrieves a reviewer", () => {
      const rev = registerGovReviewer("Alice", "alice@co.com", "approver", ["AI", "ML"]);
      expect(rev.name).toBe("Alice");
      expect(getGovReviewer(rev.id)?.email).toBe("alice@co.com");
    });

    it("lists reviewers", () => {
      registerGovReviewer("Bob", "bob@co.com");
      registerGovReviewer("Carol", "carol@co.com");
      expect(listGovReviewers()).toHaveLength(2);
    });
  });

  describe("quality gate checking", () => {
    it("passes when all criteria met", () => {
      const gate = createStageGate({
        name: "Test Gate",
        criteria: [{ name: "score", threshold: 50, weight: 1, required: true }],
      });
      const { passes, failedCriteria } = checkQualityGate(7, undefined, gate.id);
      expect(passes).toBe(true);
      expect(failedCriteria).toHaveLength(0);
    });

    it("fails when criteria not met", () => {
      const gate = createStageGate({
        name: "High Bar",
        criteria: [{ name: "score", threshold: 90, weight: 1, required: true }],
      });
      const { passes, failedCriteria } = checkQualityGate(5, undefined, gate.id);
      expect(passes).toBe(false);
      expect(failedCriteria.length).toBeGreaterThan(0);
    });

    it("auto-approves high scores", () => {
      const gate = createStageGate({
        name: "Auto",
        criteria: [],
        autoApproveThreshold: 80,
      });
      const { autoDecision } = checkQualityGate(9, undefined, gate.id);
      expect(autoDecision).toBe("approved");
    });

    it("auto-rejects low scores", () => {
      const gate = createStageGate({
        name: "Auto",
        criteria: [],
        autoRejectThreshold: 30,
      });
      const { autoDecision } = checkQualityGate(2, undefined, gate.id);
      expect(autoDecision).toBe("rejected");
    });

    it("returns failure for unknown gate", () => {
      const { passes } = checkQualityGate(8, undefined, "nonexistent");
      expect(passes).toBe(false);
    });
  });

  describe("approval requests", () => {
    it("creates approval request", () => {
      const gate = createStageGate({ name: "G", criteria: [] });
      const rev = registerGovReviewer("Rev", "r@c.com");
      const req = createApprovalRequest("idea-1", "Test Idea", 7, gate.id, "sequential", [rev.id]);
      expect(req.status).toBe("pending");
      expect(req.assignedReviewers).toContain(rev.id);
    });

    it("auto-approves when gate threshold met", () => {
      const gate = createStageGate({ name: "Auto", criteria: [], autoApproveThreshold: 80 });
      const req = createApprovalRequest("idea-2", "Great Idea", 9, gate.id);
      expect(req.status).toBe("approved");
      expect(req.completedAt).toBeDefined();
    });

    it("auto-assigns reviewers when none specified", () => {
      const gate = createStageGate({ name: "G", criteria: [] });
      registerGovReviewer("R1", "r1@c.com");
      registerGovReviewer("R2", "r2@c.com");
      const req = createApprovalRequest("idea-3", "Idea", 7, gate.id, "parallel");
      expect(req.assignedReviewers.length).toBeGreaterThan(0);
    });
  });

  describe("evaluation submission", () => {
    it("submits evaluation and resolves request", () => {
      const gate = createStageGate({ name: "G", criteria: [] });
      const rev = registerGovReviewer("Rev", "r@c.com");
      const req = createApprovalRequest("idea-4", "Idea", 7, gate.id, "sequential", [rev.id]);

      const result = submitEvaluation(req.id, {
        ideaId: "idea-4",
        reviewerId: rev.id,
        scores: { innovation: 8, feasibility: 7 },
        comments: "Looks great!",
        recommendation: "approved",
      });
      expect(result).toBe(true);

      const updated = getApprovalRequest(req.id);
      expect(updated?.status).toBe("approved");
      expect(updated?.evaluations).toHaveLength(1);
    });

    it("rejects already-decided request", () => {
      const gate = createStageGate({ name: "G", criteria: [], autoApproveThreshold: 80 });
      const req = createApprovalRequest("idea-5", "Idea", 9, gate.id);
      expect(req.status).toBe("approved");

      const result = submitEvaluation(req.id, {
        ideaId: "idea-5",
        reviewerId: "rev-x",
        scores: {},
        comments: "Too late",
        recommendation: "rejected",
      });
      expect(result).toBe(false);
    });
  });

  describe("batch decisions", () => {
    it("batch approves multiple requests", () => {
      const gate = createStageGate({ name: "G", criteria: [] });
      const r1 = createApprovalRequest("i1", "Idea 1", 6, gate.id);
      const r2 = createApprovalRequest("i2", "Idea 2", 6, gate.id);
      const count = batchDecision([r1.id, r2.id], "approved", "admin-1", "LGTM");
      expect(count).toBe(2);
      expect(getApprovalRequest(r1.id)?.status).toBe("approved");
    });
  });

  describe("escalation", () => {
    it("escalates a pending request", () => {
      const gate = createStageGate({ name: "G", criteria: [] });
      const req = createApprovalRequest("i3", "Idea", 6, gate.id);
      expect(escalateRequest(req.id, "SLA breach")).toBe(true);
      expect(getApprovalRequest(req.id)?.status).toBe("escalated");
      expect(getApprovalRequest(req.id)?.escalationReason).toBe("SLA breach");
    });

    it("cannot escalate already-completed request", () => {
      const gate = createStageGate({ name: "G", criteria: [], autoApproveThreshold: 80 });
      const req = createApprovalRequest("i4", "Idea", 9, gate.id);
      expect(escalateRequest(req.id, "test")).toBe(false);
    });
  });

  describe("metrics", () => {
    it("computes governance metrics", () => {
      const gate = createStageGate({ name: "G", criteria: [], autoApproveThreshold: 80 });
      createApprovalRequest("i5", "A", 9, gate.id); // auto-approved
      createApprovalRequest("i6", "B", 5, gate.id); // pending

      const metrics = computeGovernanceMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.approvedCount).toBe(1);
      expect(metrics.pendingRequests).toBe(1);
    });

    it("generates markdown summary", () => {
      const metrics = computeGovernanceMetrics();
      const md = governanceSummaryToMarkdown(metrics);
      expect(md).toContain("Governance Summary");
      expect(md).toContain("Total Requests");
    });
  });

  describe("listing with filters", () => {
    it("filters by status", () => {
      const gate = createStageGate({ name: "G", criteria: [], autoApproveThreshold: 80 });
      createApprovalRequest("i7", "Good", 9, gate.id);
      createApprovalRequest("i8", "Pending", 5, gate.id);
      expect(listApprovalRequests({ status: "approved" })).toHaveLength(1);
      expect(listApprovalRequests({ status: "pending" })).toHaveLength(1);
    });
  });
});
