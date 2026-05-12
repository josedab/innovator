import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const {
  startRunRecord,
  recordPrompt,
  completeRunRecord,
  clearRunRecords,
  buildTimeline,
  getSnapshot,
  createBranchFromSnapshot,
  forkRun,
  listBranchesForRun,
  getExplorationTree,
  timeTravel,
  clearTimeline,
} = await import("../replay/index.js");

describe("replay time-travel", () => {
  let runId: string;

  beforeEach(() => {
    clearRunRecords();
    clearTimeline();

    runId = startRunRecord("test subject", "gpt-4", ["scamper", "inversion"]);
    recordPrompt(runId, "investigate prompt", "investigation", "gpt-4");
    recordPrompt(runId, "scamper prompt", "generation", "gpt-4", "scamper");
    recordPrompt(runId, "inversion prompt", "generation", "gpt-4", "inversion");
    recordPrompt(runId, "synthesis prompt", "synthesis", "gpt-4");
    completeRunRecord(runId, {
      investigation: {
        summary: "test",
        keyAspects: [],
        currentState: "good",
        challenges: [],
        opportunities: [],
      },
      angleResults: [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Idea A",
              description: "desc",
              potentialImpact: "high",
              implementationHint: "hint",
            },
          ],
          reasoning: "applied",
        },
        {
          angleId: "inversion",
          angleName: "Inversion",
          ideas: [
            {
              title: "Idea B",
              description: "desc",
              potentialImpact: "medium",
              implementationHint: "hint",
            },
          ],
          reasoning: "applied",
        },
      ],
      synthesis: { topIdeas: [], themes: [], recommendation: "test" },
    });
  });

  describe("buildTimeline", () => {
    it("creates snapshots for each prompt in a run with correct structure", () => {
      const timeline = buildTimeline(runId);
      expect(timeline).toHaveLength(4);
      expect(timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "investigation" }),
          expect.objectContaining({ stage: "synthesis" }),
        ])
      );
      expect(timeline[0]).toHaveProperty("id");
      expect(timeline[0]).toHaveProperty("timestamp");
      expect(timeline[0].stage).toBe("investigation");
      expect(timeline[1].stage).toBe("generation");
      expect(timeline[1].angleId).toBe("scamper");
      expect(timeline[3].stage).toBe("synthesis");
    });

    it("caches timeline on subsequent calls", () => {
      const t1 = buildTimeline(runId);
      const t2 = buildTimeline(runId);
      expect(t1).toBe(t2);
    });

    it("returns empty for unknown run", () => {
      expect(buildTimeline("nonexistent")).toEqual([]);
    });
  });

  describe("getSnapshot", () => {
    it("retrieves a specific snapshot by ID with correct structure", () => {
      buildTimeline(runId);
      const snap = getSnapshot(`snap-${runId}-1`);
      expect(snap).toMatchObject({
        stage: "generation",
        angleId: "scamper",
      });
      expect(snap).toHaveProperty("id");
      expect(snap).toHaveProperty("timestamp");
    });

    it("returns undefined for unknown snapshot", () => {
      expect(getSnapshot("nonexistent")).toBeUndefined();
    });
  });

  describe("createBranchFromSnapshot", () => {
    it("creates a branch from a timeline point with correct structure", () => {
      const timeline = buildTimeline(runId);
      const branch = createBranchFromSnapshot(runId, timeline[1].id, "alt-scamper");
      expect(branch).toMatchObject({
        parentRunId: runId,
        label: "alt-scamper",
      });
      expect(branch).toHaveProperty("id");
      expect(branch!.branchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("returns undefined for unknown snapshot", () => {
      buildTimeline(runId);
      expect(createBranchFromSnapshot(runId, "bad-id")).toBeUndefined();
    });
  });

  describe("forkRun", () => {
    it("forks from investigation stage with correct structure", () => {
      const forked = forkRun(runId, "investigation");
      expect(forked).toMatchObject({
        subject: "test subject",
        metadata: expect.objectContaining({ forkedFrom: runId }),
      });
      expect(forked!.id).not.toBe(runId);
      expect(forked!.investigation).toBeDefined();
      expect(forked!.angleResults).toBeUndefined();
    });

    it("forks from generation stage", () => {
      const forked = forkRun(runId, "generation");
      expect(forked).toBeDefined();
      expect(forked!.investigation).toBeDefined();
      expect(forked!.angleResults).toBeDefined();
      expect(forked!.synthesis).toBeUndefined();
    });

    it("applies overrides to forked run", () => {
      const forked = forkRun(runId, "investigation", {
        subject: "new subject",
        model: "gpt-5",
      });
      expect(forked!.subject).toBe("new subject");
      expect(forked!.model).toBe("gpt-5");
    });

    it("returns undefined for unknown run", () => {
      expect(forkRun("nonexistent", "investigation")).toBeUndefined();
    });
  });

  describe("listBranchesForRun", () => {
    it("lists all branches for a run", () => {
      const timeline = buildTimeline(runId);
      createBranchFromSnapshot(runId, timeline[0].id, "branch-1");
      createBranchFromSnapshot(runId, timeline[1].id, "branch-2");
      forkRun(runId, "investigation");

      const branches = listBranchesForRun(runId);
      expect(branches.length).toBe(3);
    });

    it("returns empty for run with no branches", () => {
      expect(listBranchesForRun(runId)).toEqual([]);
    });
  });

  describe("getExplorationTree", () => {
    it("returns root run with branches and correct structure", () => {
      forkRun(runId, "investigation", { subject: "fork-1" });
      forkRun(runId, "generation");

      const tree = getExplorationTree(runId);
      expect(tree).toMatchObject({
        root: expect.objectContaining({ id: runId }),
      });
      expect(tree!.branches).toHaveLength(2);
      expect(tree!.branches[0]).toHaveProperty("childRun");
      expect(tree!.branches[0].childRun).toHaveProperty("id");
      expect(tree!.branches[0].childRun).toHaveProperty("subject");
    });

    it("returns undefined for unknown run", () => {
      expect(getExplorationTree("nonexistent")).toBeUndefined();
    });
  });

  describe("timeTravel", () => {
    it("returns state at investigation point with correct structure", () => {
      const state = timeTravel(runId, 0);
      expect(state).toMatchObject({
        stage: "investigation",
      });
      expect(state!.completedPrompts).toHaveLength(1);
      expect(state!.remainingPrompts).toHaveLength(3);
    });

    it("returns state at generation point with accumulated results", () => {
      const state = timeTravel(runId, 2);
      expect(state).toMatchObject({
        stage: "generation",
        angleId: "inversion",
      });
      expect(state!.investigation).toBeDefined();
      expect(state!.completedPrompts).toHaveLength(3);
    });

    it("returns undefined for out-of-range index", () => {
      expect(timeTravel(runId, -1)).toBeUndefined();
      expect(timeTravel(runId, 100)).toBeUndefined();
    });

    it("returns undefined for unknown run", () => {
      expect(timeTravel("nonexistent", 0)).toBeUndefined();
    });

    it("returns state at first snapshot (boundary)", () => {
      const state = timeTravel(runId, 0);
      expect(state).toMatchObject({ stage: "investigation" });
      expect(state!.completedPrompts).toHaveLength(1);
    });

    it("returns state at last snapshot (boundary)", () => {
      const state = timeTravel(runId, 3);
      expect(state).toMatchObject({ stage: "synthesis" });
      expect(state!.completedPrompts).toHaveLength(4);
      expect(state!.remainingPrompts).toHaveLength(0);
    });
  });

  describe("boundary and negative tests", () => {
    it("single-entry timeline from minimal run", () => {
      clearRunRecords();
      clearTimeline();
      const minId = startRunRecord("minimal", "gpt-4", []);
      recordPrompt(minId, "only prompt", "investigation", "gpt-4");
      completeRunRecord(minId, {
        investigation: {
          summary: "s",
          keyAspects: [],
          currentState: "ok",
          challenges: [],
          opportunities: [],
        },
        angleResults: [],
        synthesis: { topIdeas: [], themes: [], recommendation: "" },
      });
      const timeline = buildTimeline(minId);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].stage).toBe("investigation");
    });

    it("first snapshot branch creates valid branch", () => {
      const timeline = buildTimeline(runId);
      const branch = createBranchFromSnapshot(runId, timeline[0].id, "first-branch");
      expect(branch).toMatchObject({
        parentRunId: runId,
        label: "first-branch",
      });
    });

    it("branchless tree has empty branches array", () => {
      const tree = getExplorationTree(runId);
      expect(tree).toMatchObject({
        root: expect.objectContaining({ id: runId }),
      });
      expect(tree!.branches).toHaveLength(0);
    });

    it("non-existent runId returns undefined from forkRun", () => {
      expect(forkRun("does-not-exist", "investigation")).toBeUndefined();
    });

    it("timeTravel with non-existent runId returns undefined", () => {
      expect(timeTravel("does-not-exist", 0)).toBeUndefined();
    });
  });
});
