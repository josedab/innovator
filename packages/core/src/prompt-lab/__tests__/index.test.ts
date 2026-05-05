import { describe, it, expect, beforeEach } from "vitest";
import {
  createExperiment,
  startExperiment,
  getExperiment,
  listExperiments,
  assignVariant,
  recordExperimentScore,
  welchTTest,
  analyzeExperiment,
  commitPromptVersion,
  activatePromptVersion,
  getActivePromptVersion,
  getPromptVersionHistory,
  rollbackPromptVersion,
  clearPromptLab,
  type PromptVariant,
} from "../index.js";

function makeVariants(count = 2): PromptVariant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i}`,
    name: `Variant ${i}`,
    template: `Template ${i}`,
    createdAt: new Date().toISOString(),
  }));
}

describe("prompt-lab", () => {
  beforeEach(() => {
    clearPromptLab();
  });

  describe("welchTTest", () => {
    it("detects significance with known different distributions", () => {
      const scoresA = Array.from({ length: 30 }, () => 5 + Math.random());
      const scoresB = Array.from({ length: 30 }, () => 8 + Math.random());
      const result = welchTTest(scoresA, scoresB);
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.winner).toBeDefined();
      expect(result.effectSize).not.toBe(0);
    });

    it("non-significance with identical distributions", () => {
      const scores = Array.from({ length: 30 }, () => 5 + Math.random() * 0.01);
      const result = welchTTest(scores, [...scores]);
      expect(result.isSignificant).toBe(false);
      expect(result.winner).toBeUndefined();
    });

    it("handles single sample gracefully", () => {
      const result = welchTTest([5], [8]);
      expect(result.tStatistic).toBeDefined();
      expect(result.isSignificant).toBe(false); // requires n >= 5
    });

    it("handles empty arrays gracefully", () => {
      const result = welchTTest([], []);
      expect(result.tStatistic).toBe(0);
      expect(result.isSignificant).toBe(false);
    });

    it("has correct control/treatment IDs", () => {
      const result = welchTTest([1, 2, 3], [4, 5, 6]);
      expect(result.controlId).toBe("A");
      expect(result.treatmentId).toBe("B");
    });

    it("pValue is between 0 and 1", () => {
      const result = welchTTest(
        Array.from({ length: 20 }, () => Math.random() * 10),
        Array.from({ length: 20 }, () => Math.random() * 10)
      );
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });
  });

  describe("experiment lifecycle", () => {
    it("creates experiment in draft status", () => {
      const exp = createExperiment({
        id: "exp1",
        name: "Test Experiment",
        angleId: "scamper",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      expect(exp.status).toBe("draft");
      expect(exp.createdAt).toBeTruthy();
    });

    it("starts a draft experiment (draft → running)", () => {
      createExperiment({
        id: "exp1",
        name: "Test",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      const started = startExperiment("exp1");
      expect(started).toBeDefined();
      expect(started!.status).toBe("running");
    });

    it("startExperiment returns undefined for non-draft", () => {
      createExperiment({
        id: "exp1",
        name: "Test",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      startExperiment("exp1");
      expect(startExperiment("exp1")).toBeUndefined(); // already running
    });

    it("startExperiment returns undefined for non-existent", () => {
      expect(startExperiment("nonexistent")).toBeUndefined();
    });

    it("getExperiment returns experiment by id", () => {
      createExperiment({
        id: "exp1",
        name: "Test",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      expect(getExperiment("exp1")).toBeDefined();
      expect(getExperiment("nonexistent")).toBeUndefined();
    });

    it("listExperiments returns all or filtered by status", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      createExperiment({
        id: "exp2",
        name: "B",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      startExperiment("exp2");

      expect(listExperiments()).toHaveLength(2);
      expect(listExperiments("draft")).toHaveLength(1);
      expect(listExperiments("running")).toHaveLength(1);
    });
  });

  describe("assignVariant", () => {
    it("returns undefined for non-running experiment", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      expect(assignVariant("exp1")).toBeUndefined(); // still draft
    });

    it("random strategy returns a valid variant", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      startExperiment("exp1");
      const variant = assignVariant("exp1");
      expect(variant).toBeDefined();
      expect(["v0", "v1"]).toContain(variant!.id);
    });

    it("round-robin strategy cycles through variants", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(3),
        allocation: "round-robin",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      startExperiment("exp1");
      const ids = [];
      for (let i = 0; i < 6; i++) {
        ids.push(assignVariant("exp1")!.id);
      }
      expect(ids).toEqual(["v0", "v1", "v2", "v0", "v1", "v2"]);
    });

    it("epsilon-greedy mostly exploits best variant", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "epsilon-greedy",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      startExperiment("exp1");
      // Record scores: v1 is much better
      for (let i = 0; i < 20; i++) {
        recordExperimentScore("exp1", "v0", 2);
        recordExperimentScore("exp1", "v1", 9);
      }
      // Assign many variants and check that v1 is chosen most often
      const counts: Record<string, number> = { v0: 0, v1: 0 };
      for (let i = 0; i < 100; i++) {
        const v = assignVariant("exp1")!;
        counts[v.id]++;
      }
      expect(counts["v1"]).toBeGreaterThan(counts["v0"]);
    });
  });

  describe("recordExperimentScore / analyzeExperiment", () => {
    it("records scores and produces analysis", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 5,
      });
      startExperiment("exp1");

      for (let i = 0; i < 30; i++) {
        recordExperimentScore("exp1", "v0", 3 + Math.random());
        recordExperimentScore("exp1", "v1", 8 + Math.random());
      }

      const analysis = analyzeExperiment("exp1");
      expect(analysis).toBeDefined();
      expect(analysis!.variantResults).toHaveLength(2);
      expect(analysis!.tests.length).toBeGreaterThan(0);
    });

    it("auto-promotes when p < 0.05 and min sample met", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 5,
      });
      startExperiment("exp1");

      for (let i = 0; i < 30; i++) {
        recordExperimentScore("exp1", "v0", 2 + Math.random() * 0.5);
        recordExperimentScore("exp1", "v1", 9 + Math.random() * 0.5);
      }

      const analysis = analyzeExperiment("exp1");
      expect(analysis!.experiment.status).toBe("completed");
      expect(analysis!.experiment.winnerId).toBeTruthy();
      expect(analysis!.recommendation).toContain("Promote");
    });

    it("returns undefined for non-existent experiment", () => {
      expect(analyzeExperiment("nonexistent")).toBeUndefined();
    });

    it("handles 0 scores gracefully", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 5,
      });
      startExperiment("exp1");
      const analysis = analyzeExperiment("exp1");
      expect(analysis).toBeDefined();
      expect(analysis!.recommendation).toContain("Insufficient");
    });
  });

  describe("prompt versioning", () => {
    it("commitPromptVersion creates incrementing versions", () => {
      const v1 = commitPromptVersion("angle1", "template v1", "Initial version");
      expect(v1.version).toBe(1);
      expect(v1.parentVersion).toBeUndefined();
      expect(v1.isActive).toBe(false);

      const v2 = commitPromptVersion("angle1", "template v2", "Updated");
      expect(v2.version).toBe(2);
      expect(v2.parentVersion).toBe(1);
    });

    it("activatePromptVersion sets isActive and deactivates others", () => {
      commitPromptVersion("angle1", "t1", "v1");
      commitPromptVersion("angle1", "t2", "v2");
      activatePromptVersion("angle1", 1);
      expect(getActivePromptVersion("angle1")!.version).toBe(1);

      activatePromptVersion("angle1", 2);
      expect(getActivePromptVersion("angle1")!.version).toBe(2);
    });

    it("activatePromptVersion returns undefined for non-existent version", () => {
      expect(activatePromptVersion("angle1", 99)).toBeUndefined();
    });

    it("getActivePromptVersion returns undefined when none active", () => {
      commitPromptVersion("angle1", "t1", "v1");
      expect(getActivePromptVersion("angle1")).toBeUndefined();
    });

    it("getPromptVersionHistory returns versions in reverse order", () => {
      commitPromptVersion("angle1", "t1", "v1");
      commitPromptVersion("angle1", "t2", "v2");
      commitPromptVersion("angle1", "t3", "v3");
      const history = getPromptVersionHistory("angle1");
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(3);
      expect(history[2].version).toBe(1);
    });

    it("rollbackPromptVersion activates a previous version", () => {
      commitPromptVersion("angle1", "t1", "v1");
      commitPromptVersion("angle1", "t2", "v2");
      activatePromptVersion("angle1", 2);
      rollbackPromptVersion("angle1", 1);
      expect(getActivePromptVersion("angle1")!.version).toBe(1);
    });

    it("versions are scoped to angleId", () => {
      commitPromptVersion("angle1", "t1", "v1");
      commitPromptVersion("angle2", "t1", "v1");
      expect(getPromptVersionHistory("angle1")).toHaveLength(1);
      expect(getPromptVersionHistory("angle2")).toHaveLength(1);
    });
  });

  describe("clearPromptLab", () => {
    it("clears all experiments and versions", () => {
      createExperiment({
        id: "exp1",
        name: "A",
        angleId: "a",
        variants: makeVariants(),
        allocation: "random",
        successMetric: "idea-score",
        minSampleSize: 10,
      });
      commitPromptVersion("angle1", "t1", "v1");
      clearPromptLab();
      expect(listExperiments()).toHaveLength(0);
      expect(getPromptVersionHistory("angle1")).toHaveLength(0);
    });
  });
});
