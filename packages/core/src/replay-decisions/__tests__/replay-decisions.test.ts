import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordDecisionPoint,
  getDecisionPoints,
  getDecisionPoint,
  getSessionTree,
  adoptBranch,
  buildTimelineView,
  timelineViewToMarkdown,
  branchComparisonToMarkdown,
  branchFromDecision,
  compareBranches,
  clearDecisionData,
} from "../index.js";
import type { BranchComparison } from "../index.js";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue(
      '{"summary":"test outcome","score":0.75,"ideaCount":3,"uniqueIdeasA":["ideaA"],"uniqueIdeasB":["ideaB"],"recommendation":"Branch A is better"}'
    ),
  extractJson: vi.fn((s: string) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

// Helper to create a decision point with sensible defaults
function makeDecision(runId: string, overrides: Record<string, unknown> = {}) {
  return recordDecisionPoint(runId, {
    stage: "investigating" as const,
    type: "angle-selection" as const,
    description: "Pick research angle",
    chosenOption: "option-a",
    availableOptions: ["option-a", "option-b", "option-c"],
    ...overrides,
  });
}

describe("replay-decisions", () => {
  beforeEach(() => {
    clearDecisionData();
  });

  // ---- recordDecisionPoint ----

  describe("recordDecisionPoint", () => {
    it("records a decision and assigns an ID and timestamp", () => {
      const dp = makeDecision("run-1");
      expect(dp.id).toBeDefined();
      expect(dp.id).toMatch(/^dp-/);
      expect(dp.timestamp).toBeDefined();
      expect(dp.runId).toBe("run-1");
    });

    it("uses a provided id when given", () => {
      const dp = makeDecision("run-1", { id: "custom-id" });
      expect(dp.id).toBe("custom-id");
    });

    it("uses a provided timestamp when given", () => {
      const ts = "2024-01-01T00:00:00.000Z";
      const dp = makeDecision("run-1", { timestamp: ts });
      expect(dp.timestamp).toBe(ts);
    });

    it("preserves stage and type", () => {
      const dp = makeDecision("run-1", {
        stage: "generating",
        type: "synthesis-strategy",
      });
      expect(dp.stage).toBe("generating");
      expect(dp.type).toBe("synthesis-strategy");
    });

    it("stores metadata when provided", () => {
      const dp = makeDecision("run-1", { metadata: { key: "value" } });
      expect(dp.metadata).toEqual({ key: "value" });
    });

    it("adds to the main path for the run", () => {
      const dp1 = makeDecision("run-1", { id: "dp-1" });
      const dp2 = makeDecision("run-1", { id: "dp-2" });
      const tree = getSessionTree("run-1");
      expect(tree.currentPath).toEqual(["dp-1", "dp-2"]);
    });
  });

  // ---- getDecisionPoints ----

  describe("getDecisionPoints", () => {
    it("retrieves all decisions for a runId", () => {
      makeDecision("run-1");
      makeDecision("run-1");
      makeDecision("run-2");
      expect(getDecisionPoints("run-1")).toHaveLength(2);
      expect(getDecisionPoints("run-2")).toHaveLength(1);
    });

    it("returns decisions sorted by timestamp", () => {
      makeDecision("run-1", {
        id: "late",
        timestamp: "2024-06-01T00:00:00Z",
      });
      makeDecision("run-1", {
        id: "early",
        timestamp: "2024-01-01T00:00:00Z",
      });
      const points = getDecisionPoints("run-1");
      expect(points[0].id).toBe("early");
      expect(points[1].id).toBe("late");
    });

    it("returns empty array for unknown runId", () => {
      expect(getDecisionPoints("nonexistent")).toEqual([]);
    });
  });

  // ---- getDecisionPoint ----

  describe("getDecisionPoint", () => {
    it("returns a single decision point by id", () => {
      const dp = makeDecision("run-1", { id: "dp-find" });
      expect(getDecisionPoint("dp-find")).toEqual(dp);
    });

    it("returns undefined for unknown id", () => {
      expect(getDecisionPoint("unknown")).toBeUndefined();
    });
  });

  // ---- getSessionTree ----

  describe("getSessionTree", () => {
    it("builds a tree with decisions and empty branches", () => {
      makeDecision("run-1", { id: "dp-1" });
      makeDecision("run-1", { id: "dp-2" });
      const tree = getSessionTree("run-1");
      expect(tree.rootRunId).toBe("run-1");
      expect(tree.decisionPoints).toHaveLength(2);
      expect(tree.branches).toHaveLength(0);
      expect(tree.currentPath).toEqual(["dp-1", "dp-2"]);
    });

    it("includes branches after branchFromDecision", async () => {
      makeDecision("run-1", { id: "dp-1" });
      await branchFromDecision("dp-1", "option-b");
      const tree = getSessionTree("run-1");
      expect(tree.branches).toHaveLength(1);
      expect(tree.branches[0].chosenOption).toBe("option-b");
      expect(tree.branches[0].parentDecisionId).toBe("dp-1");
    });

    it("handles empty run (no decisions)", () => {
      const tree = getSessionTree("empty-run");
      expect(tree.decisionPoints).toHaveLength(0);
      expect(tree.branches).toHaveLength(0);
      expect(tree.currentPath).toEqual([]);
    });
  });

  // ---- branchFromDecision ----

  describe("branchFromDecision", () => {
    it("creates a branch with outcome from mocked LLM", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const branch = await branchFromDecision("dp-1", "option-b");
      expect(branch).toBeDefined();
      expect(branch!.id).toMatch(/^dbranch-/);
      expect(branch!.parentDecisionId).toBe("dp-1");
      expect(branch!.chosenOption).toBe("option-b");
      expect(branch!.outcome).toBeDefined();
      expect(branch!.outcome!.score).toBeGreaterThanOrEqual(0);
      expect(branch!.outcome!.score).toBeLessThanOrEqual(1);
    });

    it("returns undefined for unknown decision id", async () => {
      const result = await branchFromDecision("unknown", "option-b");
      expect(result).toBeUndefined();
    });

    it("allows branching with novel option not in availableOptions", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const branch = await branchFromDecision("dp-1", "novel-option");
      expect(branch).toBeDefined();
      expect(branch!.chosenOption).toBe("novel-option");
    });

    it("creates multiple branches from the same decision point", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const b1 = await branchFromDecision("dp-1", "option-b");
      const b2 = await branchFromDecision("dp-1", "option-c");
      expect(b1).toBeDefined();
      expect(b2).toBeDefined();
      expect(b1!.id).not.toBe(b2!.id);
      const tree = getSessionTree("run-1");
      expect(tree.branches).toHaveLength(2);
    });
  });

  // ---- adoptBranch ----

  describe("adoptBranch", () => {
    it("marks a branch as adopted and updates chosen option", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const branch = await branchFromDecision("dp-1", "option-b");
      expect(branch).toBeDefined();
      const result = adoptBranch(branch!.id, "run-1");
      expect(result).toBe(true);
      const dp = getDecisionPoint("dp-1");
      expect(dp!.chosenOption).toBe("option-b");
    });

    it("trims the main path to the adopted decision", async () => {
      makeDecision("run-1", { id: "dp-1" });
      makeDecision("run-1", { id: "dp-2" });
      const branch = await branchFromDecision("dp-1", "option-b");
      adoptBranch(branch!.id, "run-1");
      const tree = getSessionTree("run-1");
      expect(tree.currentPath).toEqual(["dp-1"]);
    });

    it("returns false for unknown branch id", () => {
      expect(adoptBranch("unknown-branch", "run-1")).toBe(false);
    });

    it("returns false when branch runId does not match", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const branch = await branchFromDecision("dp-1", "option-b");
      expect(adoptBranch(branch!.id, "run-other")).toBe(false);
    });
  });

  // ---- buildTimelineView ----

  describe("buildTimelineView", () => {
    it("generates timeline with start, decision, and end nodes", () => {
      makeDecision("run-1", {
        id: "dp-1",
        timestamp: "2024-01-01T00:00:00Z",
      });
      const view = buildTimelineView("run-1");
      expect(view.nodes.length).toBeGreaterThanOrEqual(3);
      const types = view.nodes.map((n) => n.type);
      expect(types).toContain("start");
      expect(types).toContain("decision");
      expect(types).toContain("end");
    });

    it("creates edges connecting nodes sequentially", () => {
      makeDecision("run-1", { id: "dp-1" });
      makeDecision("run-1", { id: "dp-2" });
      const view = buildTimelineView("run-1");
      expect(view.edges.length).toBeGreaterThanOrEqual(3);
      expect(view.edges[0].from).toBe(`start-run-1`);
      expect(view.edges[0].to).toBe("dp-1");
      expect(view.edges[0].isBranch).toBe(false);
    });

    it("includes branch edges when branches exist", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const branch = await branchFromDecision("dp-1", "option-b");
      const view = buildTimelineView("run-1");
      const branchEdges = view.edges.filter((e) => e.isBranch);
      expect(branchEdges).toHaveLength(1);
      expect(branchEdges[0].from).toBe("dp-1");
      expect(branchEdges[0].label).toBe("option-b");
    });

    it("computes correct stats", async () => {
      makeDecision("run-1", {
        id: "dp-1",
        stage: "investigating",
      });
      makeDecision("run-1", {
        id: "dp-2",
        stage: "generating",
      });
      await branchFromDecision("dp-1", "option-b");
      const view = buildTimelineView("run-1");
      expect(view.stats.totalDecisions).toBe(2);
      expect(view.stats.totalBranches).toBe(1);
      expect(view.stats.stages).toEqual({
        investigating: 1,
        generating: 1,
      });
      expect(view.stats.maxDepth).toBeGreaterThanOrEqual(2);
    });

    it("sets isBranchPoint on decision nodes with branches", async () => {
      makeDecision("run-1", { id: "dp-1" });
      await branchFromDecision("dp-1", "option-b");
      const view = buildTimelineView("run-1");
      const dpNode = view.nodes.find((n) => n.id === "dp-1");
      expect(dpNode!.isBranchPoint).toBe(true);
      expect(dpNode!.branchCount).toBe(1);
    });

    it("handles empty run", () => {
      const view = buildTimelineView("empty-run");
      expect(view.nodes).toHaveLength(2); // start + end
      expect(view.edges).toHaveLength(1);
      expect(view.stats.totalDecisions).toBe(0);
      expect(view.stats.totalBranches).toBe(0);
      expect(view.stats.maxDepth).toBe(0);
    });

    it("includes mainPath with start and end", () => {
      makeDecision("run-1", { id: "dp-1" });
      const view = buildTimelineView("run-1");
      expect(view.mainPath[0]).toBe("start-run-1");
      expect(view.mainPath[view.mainPath.length - 1]).toBe("end-run-1");
      expect(view.mainPath).toContain("dp-1");
    });
  });

  // ---- timelineViewToMarkdown ----

  describe("timelineViewToMarkdown", () => {
    it("produces markdown with stats and main path", () => {
      makeDecision("run-1", {
        id: "dp-1",
        description: "Choose angle",
        stage: "investigating",
      });
      const view = buildTimelineView("run-1");
      const md = timelineViewToMarkdown(view);
      expect(md).toContain("# Innovation Timeline");
      expect(md).toContain("Total Decisions");
      expect(md).toContain("Main Path");
      expect(md).toContain("Run Start");
      expect(md).toContain("Run End");
    });

    it("includes branch section when branches exist", async () => {
      makeDecision("run-1", { id: "dp-1" });
      await branchFromDecision("dp-1", "option-b");
      const view = buildTimelineView("run-1");
      const md = timelineViewToMarkdown(view);
      expect(md).toContain("## Branches");
    });

    it("includes stage breakdown", () => {
      makeDecision("run-1", { stage: "investigating" });
      makeDecision("run-1", { stage: "generating" });
      const view = buildTimelineView("run-1");
      const md = timelineViewToMarkdown(view);
      expect(md).toContain("Decisions by Stage");
      expect(md).toContain("investigating");
      expect(md).toContain("generating");
    });
  });

  // ---- branchComparisonToMarkdown ----

  describe("branchComparisonToMarkdown", () => {
    it("produces markdown with comparison details", () => {
      const comparison: BranchComparison = {
        branchA: "branch-a",
        branchB: "branch-b",
        commonAncestor: "run-1",
        divergencePoint: "dp-1",
        outcomeComparison: {
          scoreDiff: 0.25,
          uniqueIdeasA: ["idea-1", "idea-2"],
          uniqueIdeasB: ["idea-3"],
          recommendation: "Branch A produced better results",
        },
      };
      const md = branchComparisonToMarkdown(comparison);
      expect(md).toContain("# Branch Comparison Report");
      expect(md).toContain("branch-a");
      expect(md).toContain("branch-b");
      expect(md).toContain("+0.25");
      expect(md).toContain("Unique Ideas — Branch A");
      expect(md).toContain("idea-1");
      expect(md).toContain("Unique Ideas — Branch B");
      expect(md).toContain("idea-3");
      expect(md).toContain("Branch A produced better results");
    });

    it("omits unique ideas sections when empty", () => {
      const comparison: BranchComparison = {
        branchA: "a",
        branchB: "b",
        commonAncestor: "run-1",
        divergencePoint: "dp-1",
        outcomeComparison: {
          scoreDiff: 0,
          uniqueIdeasA: [],
          uniqueIdeasB: [],
          recommendation: "Equal",
        },
      };
      const md = branchComparisonToMarkdown(comparison);
      expect(md).not.toContain("Unique Ideas — Branch A");
      expect(md).not.toContain("Unique Ideas — Branch B");
    });

    it("formats negative score diff correctly", () => {
      const comparison: BranchComparison = {
        branchA: "a",
        branchB: "b",
        commonAncestor: "run-1",
        divergencePoint: "dp-1",
        outcomeComparison: {
          scoreDiff: -0.5,
          uniqueIdeasA: [],
          uniqueIdeasB: [],
          recommendation: "B is better",
        },
      };
      const md = branchComparisonToMarkdown(comparison);
      expect(md).toContain("-0.50");
    });
  });

  // ---- compareBranches ----

  describe("compareBranches", () => {
    it("compares two branches and returns a comparison", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const b1 = await branchFromDecision("dp-1", "option-b");
      const b2 = await branchFromDecision("dp-1", "option-c");
      const comparison = await compareBranches(b1!.id, b2!.id);
      expect(comparison).toBeDefined();
      expect(comparison!.branchA).toBe(b1!.id);
      expect(comparison!.branchB).toBe(b2!.id);
      expect(comparison!.outcomeComparison).toBeDefined();
      expect(comparison!.outcomeComparison.recommendation).toBeDefined();
    });

    it("returns undefined when a branch does not exist", async () => {
      makeDecision("run-1", { id: "dp-1" });
      const b1 = await branchFromDecision("dp-1", "option-b");
      expect(await compareBranches(b1!.id, "nonexistent")).toBeUndefined();
      expect(await compareBranches("nonexistent", b1!.id)).toBeUndefined();
    });

    it("returns undefined when both branches do not exist", async () => {
      expect(await compareBranches("a", "b")).toBeUndefined();
    });
  });

  // ---- clearDecisionData ----

  describe("clearDecisionData", () => {
    it("clears all decision data", async () => {
      makeDecision("run-1", { id: "dp-1" });
      await branchFromDecision("dp-1", "option-b");
      clearDecisionData();
      expect(getDecisionPoints("run-1")).toEqual([]);
      expect(getDecisionPoint("dp-1")).toBeUndefined();
      expect(getSessionTree("run-1").decisionPoints).toHaveLength(0);
      expect(getSessionTree("run-1").branches).toHaveLength(0);
      expect(getSessionTree("run-1").currentPath).toEqual([]);
    });
  });
});
