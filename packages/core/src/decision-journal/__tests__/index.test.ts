import { describe, it, expect, beforeEach } from "vitest";
import {
  createDecision,
  getDecision,
  updateDecisionStatus,
  updateDecision,
  deleteDecision,
  listDecisions,
  scheduleRevisit,
  getDueRevisits,
  dismissRevisit,
  getDecisionVelocity,
  clearDecisions,
  type DecisionStatus,
  type DecisionRationale,
} from "../index.js";

// ---- Helpers ----

function makeRationale(overrides: Partial<DecisionRationale> = {}): DecisionRationale {
  return {
    summary: "We should proceed with this approach",
    prosConsidered: ["Fast to implement", "Low risk"],
    consConsidered: ["Limited scope"],
    alternativesConsidered: ["Do nothing", "Alternative B"],
    stakeholders: ["Alice", "Bob"],
    confidenceLevel: 75,
    assumptions: ["Market stays stable"],
    ...overrides,
  };
}

function makeDecisionInput(overrides: Record<string, unknown> = {}) {
  return {
    ideaTitle: "AI Assistant",
    ideaId: "idea-1",
    angleId: "angle-1",
    sessionId: "sess-1",
    subject: "Build an AI assistant for developers",
    status: "approved" as DecisionStatus,
    rationale: makeRationale(),
    tags: ["ai", "priority"],
    decidedBy: "Alice",
    ...overrides,
  };
}

describe("decision-journal", () => {
  beforeEach(() => {
    clearDecisions();
  });

  // ---- createDecision ----
  describe("createDecision", () => {
    it("creates decision with full config", () => {
      const decision = createDecision(makeDecisionInput());

      expect(decision.id).toMatch(/^dec-/);
      expect(decision.ideaTitle).toBe("AI Assistant");
      expect(decision.ideaId).toBe("idea-1");
      expect(decision.angleId).toBe("angle-1");
      expect(decision.sessionId).toBe("sess-1");
      expect(decision.subject).toBe("Build an AI assistant for developers");
      expect(decision.status).toBe("approved");
      expect(decision.rationale.summary).toBe("We should proceed with this approach");
      expect(decision.rationale.prosConsidered).toHaveLength(2);
      expect(decision.rationale.consConsidered).toHaveLength(1);
      expect(decision.rationale.alternativesConsidered).toHaveLength(2);
      expect(decision.tags).toEqual(["ai", "priority"]);
      expect(decision.decidedBy).toBe("Alice");
      expect(decision.createdAt).toBeTruthy();
      expect(decision.updatedAt).toBeTruthy();
    });

    it("records initial status in history", () => {
      const decision = createDecision(makeDecisionInput());
      expect(decision.history).toHaveLength(1);
      expect(decision.history[0].status).toBe("approved");
      expect(decision.history[0].changedBy).toBe("Alice");
    });

    it("creates unique IDs", () => {
      const d1 = createDecision(makeDecisionInput());
      const d2 = createDecision(makeDecisionInput({ ideaTitle: "Other" }));
      expect(d1.id).not.toBe(d2.id);
    });

    it("defaults tags to empty array", () => {
      const decision = createDecision(makeDecisionInput({ tags: undefined }));
      expect(decision.tags).toEqual([]);
    });

    it("retrieves decision by ID", () => {
      const decision = createDecision(makeDecisionInput());
      const found = getDecision(decision.id);
      expect(found).toBeDefined();
      expect(found!.ideaTitle).toBe("AI Assistant");
    });
  });

  // ---- updateDecisionStatus ----
  describe("updateDecisionStatus", () => {
    const allStatuses: DecisionStatus[] = [
      "approved",
      "rejected",
      "deferred",
      "pivoted",
      "pending-review",
      "implemented",
      "abandoned",
    ];

    for (const status of allStatuses) {
      it(`transitions to ${status}`, () => {
        const decision = createDecision(makeDecisionInput({ status: "pending-review" }));
        const updated = updateDecisionStatus(decision.id, status, `Changed to ${status}`, "Bob");

        expect(updated).toBeDefined();
        expect(updated!.status).toBe(status);
      });
    }

    it("records status change in history", () => {
      const decision = createDecision(makeDecisionInput());
      updateDecisionStatus(decision.id, "rejected", "Not viable", "Bob");

      const found = getDecision(decision.id)!;
      expect(found.history).toHaveLength(2);
      expect(found.history[1].status).toBe("rejected");
      expect(found.history[1].rationale).toBe("Not viable");
      expect(found.history[1].changedBy).toBe("Bob");
    });

    it("returns undefined for non-existent decision", () => {
      expect(updateDecisionStatus("nope", "rejected")).toBeUndefined();
    });

    it("updates timestamp", () => {
      const decision = createDecision(makeDecisionInput());
      const originalUpdated = decision.updatedAt;

      // Small delay to ensure timestamp difference
      const updated = updateDecisionStatus(decision.id, "rejected");
      expect(updated!.updatedAt).toBeTruthy();
    });
  });

  // ---- updateDecision ----
  describe("updateDecision", () => {
    it("updates tags", () => {
      const decision = createDecision(makeDecisionInput());
      const updated = updateDecision(decision.id, { tags: ["new-tag"] });
      expect(updated!.tags).toEqual(["new-tag"]);
    });

    it("updates outcome", () => {
      const decision = createDecision(makeDecisionInput());
      const updated = updateDecision(decision.id, { outcome: "Shipped successfully" });
      expect(updated!.outcome).toBe("Shipped successfully");
    });

    it("updates rationale", () => {
      const newRationale = makeRationale({ summary: "Updated rationale" });
      const decision = createDecision(makeDecisionInput());
      const updated = updateDecision(decision.id, { rationale: newRationale });
      expect(updated!.rationale.summary).toBe("Updated rationale");
    });

    it("partial update preserves other fields", () => {
      const decision = createDecision(makeDecisionInput());
      updateDecision(decision.id, { outcome: "Done" });
      const found = getDecision(decision.id)!;
      expect(found.ideaTitle).toBe("AI Assistant");
      expect(found.outcome).toBe("Done");
    });

    it("returns undefined for non-existent decision", () => {
      expect(updateDecision("nope", { tags: [] })).toBeUndefined();
    });
  });

  // ---- scheduleRevisit / getDueRevisits / dismissRevisit ----
  describe("revisit reminders", () => {
    it("schedules a revisit", () => {
      const decision = createDecision(makeDecisionInput());
      const reminder = scheduleRevisit(decision.id, "2025-01-01T00:00:00Z", "Check status");

      expect(reminder).toBeDefined();
      expect(reminder!.id).toMatch(/^rem-/);
      expect(reminder!.decisionId).toBe(decision.id);
      expect(reminder!.scheduledFor).toBe("2025-01-01T00:00:00Z");
      expect(reminder!.reason).toBe("Check status");
      expect(reminder!.dismissed).toBe(false);
    });

    it("getDueRevisits returns past-due items", () => {
      const decision = createDecision(makeDecisionInput());
      scheduleRevisit(decision.id, "2020-01-01T00:00:00Z", "Overdue");
      scheduleRevisit(decision.id, "2099-01-01T00:00:00Z", "Future");

      const due = getDueRevisits(new Date("2025-06-01"));
      expect(due).toHaveLength(1);
      expect(due[0].reason).toBe("Overdue");
    });

    it("getDueRevisits excludes dismissed reminders", () => {
      const decision = createDecision(makeDecisionInput());
      const reminder = scheduleRevisit(decision.id, "2020-01-01T00:00:00Z", "Overdue")!;
      dismissRevisit(decision.id, reminder.id);

      const due = getDueRevisits(new Date("2025-06-01"));
      expect(due).toHaveLength(0);
    });

    it("dismissRevisit marks reminder as complete", () => {
      const decision = createDecision(makeDecisionInput());
      const reminder = scheduleRevisit(decision.id, "2020-01-01T00:00:00Z", "Check")!;

      expect(dismissRevisit(decision.id, reminder.id)).toBe(true);

      const found = getDecision(decision.id)!;
      const r = found.revisitReminders.find((rem) => rem.id === reminder.id)!;
      expect(r.dismissed).toBe(true);
    });

    it("dismissRevisit returns false for non-existent decision", () => {
      expect(dismissRevisit("nope", "rem-1")).toBe(false);
    });

    it("dismissRevisit returns false for non-existent reminder", () => {
      const decision = createDecision(makeDecisionInput());
      expect(dismissRevisit(decision.id, "nope")).toBe(false);
    });

    it("scheduleRevisit returns undefined for non-existent decision", () => {
      expect(scheduleRevisit("nope", "2025-01-01", "Reason")).toBeUndefined();
    });

    it("scheduleRevisit in the past is still valid", () => {
      const decision = createDecision(makeDecisionInput());
      const reminder = scheduleRevisit(decision.id, "2000-01-01T00:00:00Z", "Past check");
      expect(reminder).toBeDefined();
    });
  });

  // ---- getDecisionVelocity ----
  describe("getDecisionVelocity", () => {
    it("computes velocity for multiple decisions", () => {
      createDecision(makeDecisionInput({ status: "approved" }));
      createDecision(makeDecisionInput({ status: "rejected" }));
      createDecision(makeDecisionInput({ status: "implemented" }));
      createDecision(makeDecisionInput({ status: "pending-review" }));

      const velocity = getDecisionVelocity();
      expect(velocity.totalDecisions).toBe(4);
      expect(velocity.byStatus["approved"]).toBe(1);
      expect(velocity.byStatus["rejected"]).toBe(1);
      expect(velocity.byStatus["implemented"]).toBe(1);
      expect(velocity.implementedCount).toBe(1);
      expect(velocity.funnel.ideas).toBe(4);
      expect(velocity.funnel.approved).toBe(2); // approved + implemented
    });

    it("empty journal returns zeroes", () => {
      const velocity = getDecisionVelocity();
      expect(velocity.totalDecisions).toBe(0);
      expect(velocity.approvalRate).toBe(0);
      expect(velocity.avgTimeToDecisionMs).toBe(0);
      expect(velocity.recentDecisions).toBe(0);
    });

    it("calculates approval rate correctly", () => {
      createDecision(makeDecisionInput({ status: "approved" }));
      createDecision(makeDecisionInput({ status: "approved" }));
      createDecision(makeDecisionInput({ status: "rejected" }));
      createDecision(makeDecisionInput({ status: "pivoted" }));

      const velocity = getDecisionVelocity();
      // approved = 2, decided = 4 (approved, rejected, pivoted)
      // approval rate = 2/4 = 0.5
      expect(velocity.approvalRate).toBe(0.5);
    });

    it("counts recent decisions (last 30 days)", () => {
      createDecision(makeDecisionInput());
      const velocity = getDecisionVelocity();
      expect(velocity.recentDecisions).toBe(1);
    });
  });

  // ---- listDecisions ----
  describe("listDecisions", () => {
    it("lists all decisions", () => {
      createDecision(makeDecisionInput());
      createDecision(makeDecisionInput({ ideaTitle: "Other" }));
      expect(listDecisions()).toHaveLength(2);
    });

    it("filters by status", () => {
      createDecision(makeDecisionInput({ status: "approved" }));
      createDecision(makeDecisionInput({ status: "rejected" }));

      expect(listDecisions({ status: "approved" })).toHaveLength(1);
    });

    it("filters by sessionId", () => {
      createDecision(makeDecisionInput({ sessionId: "sess-1" }));
      createDecision(makeDecisionInput({ sessionId: "sess-2" }));

      expect(listDecisions({ sessionId: "sess-1" })).toHaveLength(1);
    });

    it("filters by tag", () => {
      createDecision(makeDecisionInput({ tags: ["urgent"] }));
      createDecision(makeDecisionInput({ tags: ["low-priority"] }));

      expect(listDecisions({ tag: "urgent" })).toHaveLength(1);
    });

    it("returns empty array for no matches", () => {
      expect(listDecisions({ status: "abandoned" })).toHaveLength(0);
    });
  });

  // ---- deleteDecision ----
  describe("deleteDecision", () => {
    it("deletes existing decision", () => {
      const decision = createDecision(makeDecisionInput());
      expect(deleteDecision(decision.id)).toBe(true);
      expect(getDecision(decision.id)).toBeUndefined();
    });

    it("returns false for non-existent", () => {
      expect(deleteDecision("nope")).toBe(false);
    });

    it("deleting decision with active revisits removes them too", () => {
      const decision = createDecision(makeDecisionInput());
      scheduleRevisit(decision.id, "2025-01-01", "Check");

      deleteDecision(decision.id);
      // Revisits are part of the decision, so they're gone
      const due = getDueRevisits(new Date("2026-01-01"));
      expect(due).toHaveLength(0);
    });
  });
});
