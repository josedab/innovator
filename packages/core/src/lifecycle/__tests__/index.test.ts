import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createLifecycleIdea,
  getLifecycleIdea,
  listLifecycleIdeas,
  advanceLifecycleStage,
  addEvidence,
  getKanbanBoard,
  getStaleIdeas,
  deleteLifecycleIdea,
  clearLifecycle,
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type EvidenceType,
} from "../index.js";

describe("lifecycle", () => {
  beforeEach(() => {
    clearLifecycle();
  });

  // ---- createLifecycleIdea ----
  describe("createLifecycleIdea", () => {
    it("creates idea with all fields", () => {
      const idea = createLifecycleIdea({
        title: "AI Assistant",
        description: "Smart assistant for developers",
        sourceSessionId: "sess-1",
        sourceAngleId: "angle-1",
        assigneeId: "user-1",
        assigneeName: "Alice",
        priority: "high",
        tags: ["ai", "dev-tools"],
      });

      expect(idea.id).toBeTruthy();
      expect(idea.title).toBe("AI Assistant");
      expect(idea.description).toBe("Smart assistant for developers");
      expect(idea.stage).toBe("spark");
      expect(idea.evidence).toEqual([]);
      expect(idea.sourceSessionId).toBe("sess-1");
      expect(idea.sourceAngleId).toBe("angle-1");
      expect(idea.assigneeId).toBe("user-1");
      expect(idea.assigneeName).toBe("Alice");
      expect(idea.priority).toBe("high");
      expect(idea.tags).toEqual(["ai", "dev-tools"]);
      expect(idea.stageHistory).toEqual([]);
      expect(idea.createdAt).toBeTruthy();
    });

    it("creates idea with minimal fields", () => {
      const idea = createLifecycleIdea({
        title: "Quick idea",
        description: "Minimal",
      });

      expect(idea.title).toBe("Quick idea");
      expect(idea.stage).toBe("spark");
      expect(idea.priority).toBe("medium");
      expect(idea.tags).toBeUndefined();
      expect(idea.assigneeId).toBeUndefined();
    });

    it("creates unique IDs for multiple ideas", () => {
      const a = createLifecycleIdea({ title: "A", description: "A" });
      const b = createLifecycleIdea({ title: "B", description: "B" });
      expect(a.id).not.toBe(b.id);
    });

    it("retrieves idea by ID", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      const found = getLifecycleIdea(idea.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe("Test");
    });
  });

  // ---- advanceLifecycleStage ----
  describe("advanceLifecycleStage", () => {
    it("advances Spark → Concept with required evidence", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      addEvidence(idea.id, { type: "market-data", title: "Market report" });

      const result = advanceLifecycleStage(idea.id, "concept");
      expect(result.success).toBe(true);
      expect(result.idea!.stage).toBe("concept");
      expect(result.idea!.stageHistory).toHaveLength(1);
      expect(result.idea!.stageHistory[0].from).toBe("spark");
      expect(result.idea!.stageHistory[0].to).toBe("concept");
    });

    it("advances through full lifecycle Spark → Measured with force", () => {
      const idea = createLifecycleIdea({ title: "Full", description: "Full lifecycle" });
      const stages: LifecycleStage[] = [
        "concept",
        "validated",
        "planned",
        "in-progress",
        "shipped",
        "measured",
      ];

      for (const stage of stages) {
        const result = advanceLifecycleStage(idea.id, stage, { force: true });
        expect(result.success).toBe(true);
        expect(result.idea!.stage).toBe(stage);
      }
    });

    it("rejects skip-stage advancement without force", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      // Try to skip from spark to validated without evidence
      const result = advanceLifecycleStage(idea.id, "validated");
      expect(result.success).toBe(false);
      expect(result.missingEvidence).toContain("user-research");
      expect(result.missingEvidence).toContain("technical-feasibility");
    });

    it("rejects backward movement", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      advanceLifecycleStage(idea.id, "concept", { force: true });

      const result = advanceLifecycleStage(idea.id, "spark");
      expect(result.success).toBe(false);
    });

    it("rejects same-stage advancement", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      const result = advanceLifecycleStage(idea.id, "spark");
      expect(result.success).toBe(false);
    });

    it("fails without evidence when not forced", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      const result = advanceLifecycleStage(idea.id, "concept");
      expect(result.success).toBe(false);
      expect(result.missingEvidence).toContain("market-data");
    });

    it("force:true bypasses evidence requirements", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      const result = advanceLifecycleStage(idea.id, "concept", { force: true });
      expect(result.success).toBe(true);
    });

    it("returns failure for non-existent idea", () => {
      const result = advanceLifecycleStage("nonexistent", "concept");
      expect(result.success).toBe(false);
    });

    it("records userId in stage history", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      advanceLifecycleStage(idea.id, "concept", { userId: "user-42", force: true });

      const found = getLifecycleIdea(idea.id)!;
      expect(found.stageHistory[0].userId).toBe("user-42");
    });

    it("rejects advancing already-Measured idea", () => {
      const idea = createLifecycleIdea({ title: "Done", description: "Done" });
      advanceLifecycleStage(idea.id, "measured", { force: true });

      // measured is the last stage, no further advancement possible
      const result = advanceLifecycleStage(idea.id, "measured");
      expect(result.success).toBe(false);
    });
  });

  // ---- addEvidence ----
  describe("addEvidence", () => {
    it("adds evidence with all fields", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      const result = addEvidence(idea.id, {
        type: "market-data",
        title: "Market Analysis Q1",
        description: "Detailed market analysis",
        url: "https://example.com/report",
        addedBy: "analyst-1",
      });

      expect(result).toBeDefined();
      expect(result!.evidence).toHaveLength(1);
      expect(result!.evidence[0].type).toBe("market-data");
      expect(result!.evidence[0].title).toBe("Market Analysis Q1");
      expect(result!.evidence[0].verified).toBe(false);
      expect(result!.evidence[0].addedAt).toBeTruthy();
    });

    it("returns undefined for non-existent idea", () => {
      const result = addEvidence("nonexistent", { type: "market-data", title: "Test" });
      expect(result).toBeUndefined();
    });

    it("accumulates multiple evidence items", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      addEvidence(idea.id, { type: "market-data", title: "Report 1" });
      addEvidence(idea.id, { type: "user-research", title: "Research 1" });

      const found = getLifecycleIdea(idea.id)!;
      expect(found.evidence).toHaveLength(2);
    });

    it("evidence IDs are unique", () => {
      const idea = createLifecycleIdea({ title: "Test", description: "Test" });
      addEvidence(idea.id, { type: "market-data", title: "E1" });
      addEvidence(idea.id, { type: "user-research", title: "E2" });

      const found = getLifecycleIdea(idea.id)!;
      expect(found.evidence[0].id).not.toBe(found.evidence[1].id);
    });
  });

  // ---- getKanbanBoard ----
  describe("getKanbanBoard", () => {
    it("returns all lifecycle stages as columns", () => {
      const board = getKanbanBoard();
      expect(board.columns).toHaveLength(LIFECYCLE_STAGES.length);
      expect(board.columns.map((c) => c.stage)).toEqual(LIFECYCLE_STAGES.map((s) => s.id));
    });

    it("groups ideas by stage", () => {
      createLifecycleIdea({ title: "Spark 1", description: "S1" });
      createLifecycleIdea({ title: "Spark 2", description: "S2" });
      const concept = createLifecycleIdea({ title: "Concept 1", description: "C1" });
      advanceLifecycleStage(concept.id, "concept", { force: true });

      const board = getKanbanBoard();
      const sparkCol = board.columns.find((c) => c.stage === "spark")!;
      const conceptCol = board.columns.find((c) => c.stage === "concept")!;
      expect(sparkCol.count).toBe(2);
      expect(conceptCol.count).toBe(1);
      expect(board.totalIdeas).toBe(3);
    });

    it("sorts ideas by priority within columns", () => {
      createLifecycleIdea({ title: "Low", description: "L", priority: "low" });
      createLifecycleIdea({ title: "Critical", description: "C", priority: "critical" });
      createLifecycleIdea({ title: "High", description: "H", priority: "high" });

      const board = getKanbanBoard();
      const sparkCol = board.columns.find((c) => c.stage === "spark")!;
      expect(sparkCol.ideas[0].priority).toBe("critical");
      expect(sparkCol.ideas[1].priority).toBe("high");
      expect(sparkCol.ideas[2].priority).toBe("low");
    });

    it("detects stale ideas (>14 days inactive)", () => {
      const idea = createLifecycleIdea({ title: "Old", description: "Old" });
      // Manually backdate updatedAt
      const staleDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const found = getLifecycleIdea(idea.id)!;
      (found as { updatedAt: string }).updatedAt = staleDate;

      const board = getKanbanBoard();
      expect(board.staleCount).toBe(1);
    });

    it("empty board returns 0 totals", () => {
      const board = getKanbanBoard();
      expect(board.totalIdeas).toBe(0);
      expect(board.staleCount).toBe(0);
    });
  });

  // ---- getStaleIdeas ----
  describe("getStaleIdeas", () => {
    it("returns only ideas >14 days inactive", () => {
      const fresh = createLifecycleIdea({ title: "Fresh", description: "F" });
      const stale = createLifecycleIdea({ title: "Stale", description: "S" });

      const staleDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const staleIdea = getLifecycleIdea(stale.id)!;
      (staleIdea as { updatedAt: string }).updatedAt = staleDate;

      const staleIdeas = getStaleIdeas();
      expect(staleIdeas).toHaveLength(1);
      expect(staleIdeas[0].id).toBe(stale.id);
    });

    it("excludes Shipped and Measured ideas", () => {
      const shipped = createLifecycleIdea({ title: "Shipped", description: "S" });
      const measured = createLifecycleIdea({ title: "Measured", description: "M" });
      advanceLifecycleStage(shipped.id, "shipped", { force: true });
      advanceLifecycleStage(measured.id, "measured", { force: true });

      // Backdate both
      const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      (getLifecycleIdea(shipped.id)! as { updatedAt: string }).updatedAt = staleDate;
      (getLifecycleIdea(measured.id)! as { updatedAt: string }).updatedAt = staleDate;

      expect(getStaleIdeas()).toHaveLength(0);
    });

    it("returns empty when no stale ideas", () => {
      createLifecycleIdea({ title: "Fresh", description: "F" });
      expect(getStaleIdeas()).toHaveLength(0);
    });
  });

  // ---- Delete ----
  describe("deleteLifecycleIdea", () => {
    it("deletes existing idea", () => {
      const idea = createLifecycleIdea({ title: "Del", description: "D" });
      expect(deleteLifecycleIdea(idea.id)).toBe(true);
      expect(getLifecycleIdea(idea.id)).toBeUndefined();
    });

    it("returns false for non-existent idea", () => {
      expect(deleteLifecycleIdea("nonexistent")).toBe(false);
    });
  });

  // ---- listLifecycleIdeas ----
  describe("listLifecycleIdeas", () => {
    it("filters by stage", () => {
      createLifecycleIdea({ title: "Spark", description: "S" });
      const concept = createLifecycleIdea({ title: "Concept", description: "C" });
      advanceLifecycleStage(concept.id, "concept", { force: true });

      const sparks = listLifecycleIdeas({ stage: "spark" });
      expect(sparks).toHaveLength(1);
      expect(sparks[0].title).toBe("Spark");
    });

    it("filters by assigneeId", () => {
      createLifecycleIdea({ title: "A", description: "A", assigneeId: "user-1" });
      createLifecycleIdea({ title: "B", description: "B", assigneeId: "user-2" });

      const results = listLifecycleIdeas({ assigneeId: "user-1" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("A");
    });

    it("filters by priority", () => {
      createLifecycleIdea({ title: "High", description: "H", priority: "high" });
      createLifecycleIdea({ title: "Low", description: "L", priority: "low" });

      expect(listLifecycleIdeas({ priority: "high" })).toHaveLength(1);
    });
  });
});
