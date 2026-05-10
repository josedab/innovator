import { describe, it, expect, beforeEach } from "vitest";
import {
  createExperiment,
  getExperiment,
  listExperiments,
  deleteExperiment,
  clearExperiments,
  runExperiment,
  generateStatisticalReport,
  compareVariants,
  experimentToMarkdown,
  type ExperimentConfig,
  type Experiment,
  type PromptVariant,
  type ExperimentResult,
} from "../index.js";

// ---- Helpers ----

function makeConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    subject: "AI in healthcare",
    name: "Test Experiment",
    description: "Testing hypothesis",
    hypothesis: {
      statement: "Variant A produces better ideas",
      metric: "averageScore",
      expectedOutcome: "Higher scores",
      successThreshold: 7,
      confidenceLevel: 0.95,
    },
    variants: [
      { name: "Control", promptModifier: "Generate ideas normally" },
      { name: "Creative", promptModifier: "Be wildly creative" },
    ],
    runsPerVariant: 3,
    ...overrides,
  };
}

function mockRunner(scores: number[] = [8, 7, 6]) {
  let callCount = 0;
  return async (_variant: PromptVariant, _subject: string) => {
    const idx = callCount++ % scores.length;
    return {
      ideas: [
        { title: `Idea ${idx}`, description: `Description ${idx}` },
        { title: `Idea ${idx}b`, description: `Description ${idx}b` },
      ],
      durationMs: 100 + idx * 10,
    };
  };
}

function mockScorer(score: number = 7.5) {
  return async (ideas: Array<{ title: string; description: string }>) => ({
    scores: ideas.map((idea) => ({
      title: idea.title,
      score,
      feasibility: score,
      originality: score - 1,
      impact: score + 0.5,
      clarity: score - 0.5,
    })),
  });
}

// ---- Tests ----

describe("experiments", () => {
  beforeEach(() => {
    clearExperiments();
  });

  // ---- createExperiment ----
  describe("createExperiment", () => {
    it("creates experiment with valid config", () => {
      const exp = createExperiment(makeConfig());
      expect(exp.id).toMatch(/^exp_/);
      expect(exp.name).toBe("Test Experiment");
      expect(exp.subject).toBe("AI in healthcare");
      expect(exp.status).toBe("draft");
      expect(exp.variants).toHaveLength(2);
      expect(exp.runsPerVariant).toBe(3);
      expect(exp.results).toEqual([]);
      expect(exp.createdAt).toBeTruthy();
    });

    it("assigns variant IDs from names", () => {
      const exp = createExperiment(makeConfig());
      expect(exp.variants[0].id).toBe("var_control");
      expect(exp.variants[1].id).toBe("var_creative");
    });

    it("uses default runsPerVariant of 5 when not specified", () => {
      const config = makeConfig();
      delete (config as Record<string, unknown>).runsPerVariant;
      const exp = createExperiment(config);
      expect(exp.runsPerVariant).toBe(5);
    });

    it("uses empty description when not specified", () => {
      const config = makeConfig({ description: undefined });
      const exp = createExperiment(config);
      expect(exp.description).toBe("");
    });

    it("stores experiment in memory and retrieves by ID", () => {
      const exp = createExperiment(makeConfig());
      const found = getExperiment(exp.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(exp.id);
    });

    it("creates unique IDs for multiple experiments", () => {
      const exp1 = createExperiment(makeConfig());
      const exp2 = createExperiment(makeConfig({ name: "Second" }));
      expect(exp1.id).not.toBe(exp2.id);
    });
  });

  // ---- CRUD operations ----
  describe("CRUD", () => {
    it("lists all experiments", () => {
      createExperiment(makeConfig());
      createExperiment(makeConfig({ name: "Second" }));
      expect(listExperiments()).toHaveLength(2);
    });

    it("deletes an experiment", () => {
      const exp = createExperiment(makeConfig());
      expect(deleteExperiment(exp.id)).toBe(true);
      expect(getExperiment(exp.id)).toBeUndefined();
    });

    it("returns false for non-existent delete", () => {
      expect(deleteExperiment("nope")).toBe(false);
    });

    it("returns undefined for non-existent get", () => {
      expect(getExperiment("nope")).toBeUndefined();
    });

    it("clearExperiments removes all", () => {
      createExperiment(makeConfig());
      createExperiment(makeConfig({ name: "Second" }));
      clearExperiments();
      expect(listExperiments()).toHaveLength(0);
    });
  });

  // ---- runExperiment ----
  describe("runExperiment", () => {
    it("runs full lifecycle with mock runner/scorer", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 2 }));
      const result = await runExperiment(exp.id, mockRunner(), mockScorer());

      expect(result.status).toBe("completed");
      expect(result.results).toHaveLength(4); // 2 variants × 2 runs
      expect(result.report).toBeDefined();
      expect(result.completedAt).toBeTruthy();
    });

    it("calls progress callback", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 1 }));
      const phases: string[] = [];
      await runExperiment(exp.id, mockRunner(), mockScorer(), (p) => phases.push(p.phase));

      expect(phases).toContain("running");
      expect(phases).toContain("scoring");
      expect(phases).toContain("analyzing");
    });

    it("produces correct result structure per run", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 1 }));
      const result = await runExperiment(exp.id, mockRunner(), mockScorer(8));

      const r = result.results[0];
      expect(r.variantId).toBe("var_control");
      expect(r.runId).toMatch(/^run_/);
      expect(r.ideasGenerated).toBe(2);
      expect(r.averageScore).toBe(8);
      expect(r.scores.feasibility).toBe(8);
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(r.rawIdeas).toHaveLength(2);
    });

    it("handles runner failure gracefully", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 1 }));
      const failingRunner = async () => {
        throw new Error("Runner failed");
      };
      const result = await runExperiment(exp.id, failingRunner, mockScorer());

      expect(result.status).toBe("completed");
      expect(result.results).toHaveLength(2);
      expect(result.results[0].averageScore).toBe(0);
      expect(result.results[0].ideasGenerated).toBe(0);
    });

    it("throws for non-existent experiment", async () => {
      await expect(runExperiment("nope", mockRunner(), mockScorer())).rejects.toThrow(
        "Experiment not found"
      );
    });

    it("throws for already completed experiment", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 1 }));
      await runExperiment(exp.id, mockRunner(), mockScorer());
      await expect(runExperiment(exp.id, mockRunner(), mockScorer())).rejects.toThrow(
        "already completed"
      );
    });

    it("multi-variant experiment collects results per variant", async () => {
      const config = makeConfig({
        variants: [
          { name: "A", promptModifier: "mod A" },
          { name: "B", promptModifier: "mod B" },
          { name: "C", promptModifier: "mod C" },
        ],
        runsPerVariant: 2,
      });
      const exp = createExperiment(config);
      const result = await runExperiment(exp.id, mockRunner(), mockScorer());

      expect(result.results).toHaveLength(6); // 3 variants × 2 runs
      const variantIds = new Set(result.results.map((r) => r.variantId));
      expect(variantIds.size).toBe(3);
    });
  });

  // ---- generateStatisticalReport ----
  describe("generateStatisticalReport", () => {
    it("computes means and stdDevs per variant", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 3 }));
      await runExperiment(exp.id, mockRunner(), mockScorer(7));

      const report = exp.report!;
      expect(report.experimentId).toBe(exp.id);
      expect(report.sampleSizes["var_control"]).toBe(3);
      expect(report.sampleSizes["var_creative"]).toBe(3);
      expect(report.means["var_control"]).toBeCloseTo(7, 0);
      expect(report.generatedAt).toBeTruthy();
    });

    it("reports no winner when scores are identical", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 5 }));
      await runExperiment(exp.id, mockRunner(), mockScorer(5));

      const report = exp.report!;
      expect(report.significant).toBe(false);
      expect(report.winner).toBeNull();
    });

    it("handles experiment with 0 results", () => {
      const exp = createExperiment(makeConfig());
      const report = generateStatisticalReport(exp);
      expect(report.winner).toBeNull();
      expect(report.pValue).toBe(1);
      expect(report.effectSize).toBe(0);
    });

    it("confidenceLevel matches hypothesis", async () => {
      const exp = createExperiment(
        makeConfig({
          hypothesis: {
            statement: "Test",
            metric: "score",
            expectedOutcome: "Higher",
            successThreshold: 5,
            confidenceLevel: 0.9,
          },
        })
      );
      await runExperiment(exp.id, mockRunner(), mockScorer());

      expect(exp.report!.confidenceLevel).toBe(0.9);
    });

    it("computes effect size (Cohen's d) correctly with known values", () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 5 }));
      // Manually set results with variance in each group
      exp.results = [
        ...makeResults("var_control", [8, 9, 7, 8.5, 7.5]),
        ...makeResults("var_creative", [3, 2, 4, 3.5, 2.5]),
      ];

      const report = generateStatisticalReport(exp);
      // Large effect size expected (means ~8 vs ~3, small stddev)
      expect(Math.abs(report.effectSize)).toBeGreaterThan(0.8);
    });

    it("pValue is between 0 and 1", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 5 }));
      await runExperiment(exp.id, mockRunner(), mockScorer());

      expect(exp.report!.pValue).toBeGreaterThanOrEqual(0);
      expect(exp.report!.pValue).toBeLessThanOrEqual(1);
    });
  });

  // ---- compareVariants ----
  describe("compareVariants", () => {
    it("compares two variants with different means", () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 3 }));
      exp.results = [
        ...makeResults("var_control", [8, 9, 8.5]),
        ...makeResults("var_creative", [4, 5, 4.5]),
      ];

      const comparison = compareVariants(exp, "var_control", "var_creative");
      expect(comparison.meanA).toBeGreaterThan(comparison.meanB);
      expect(comparison.difference).toBeGreaterThan(0);
      expect(comparison.effectSize).not.toBe(0);
    });

    it("returns zeros for non-existent variant", () => {
      const exp = createExperiment(makeConfig());
      const comparison = compareVariants(exp, "nonexistent_a", "nonexistent_b");
      expect(comparison.meanA).toBe(0);
      expect(comparison.meanB).toBe(0);
      expect(comparison.pValue).toBe(1);
      expect(comparison.significant).toBe(false);
    });

    it("equal means produce non-significant result", () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 5 }));
      exp.results = [
        ...makeResults("var_control", [5, 5, 5, 5, 5]),
        ...makeResults("var_creative", [5, 5, 5, 5, 5]),
      ];

      const comparison = compareVariants(exp, "var_control", "var_creative");
      expect(comparison.significant).toBe(false);
      expect(comparison.effectSize).toBe(0);
    });

    it("supports comparing specific metrics", () => {
      const exp = createExperiment(makeConfig());
      exp.results = [
        makeResult("var_control", 7, { feasibility: 9, originality: 5, impact: 8, clarity: 7 }),
        makeResult("var_control", 7, { feasibility: 9, originality: 5, impact: 8, clarity: 7 }),
        makeResult("var_creative", 6, { feasibility: 3, originality: 9, impact: 4, clarity: 6 }),
        makeResult("var_creative", 6, { feasibility: 3, originality: 9, impact: 4, clarity: 6 }),
      ];

      const feasComparison = compareVariants(exp, "var_control", "var_creative", "feasibility");
      expect(feasComparison.meanA).toBeGreaterThan(feasComparison.meanB);
    });

    it("single-sample variant returns pValue 1", () => {
      const exp = createExperiment(makeConfig());
      exp.results = [makeResult("var_control", 7), makeResult("var_creative", 5)];
      // Only 1 sample per variant => t-test requires >= 2
      const comparison = compareVariants(exp, "var_control", "var_creative");
      expect(comparison.pValue).toBe(1);
    });
  });

  // ---- experimentToMarkdown ----
  describe("experimentToMarkdown", () => {
    it("produces markdown with experiment details", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 2 }));
      await runExperiment(exp.id, mockRunner(), mockScorer());

      const md = experimentToMarkdown(exp);
      expect(md).toContain("# Experiment: Test Experiment");
      expect(md).toContain("## Hypothesis");
      expect(md).toContain("## Variants");
      expect(md).toContain("## Results");
      expect(md).toContain("## Statistical Analysis");
      expect(md).toContain("## Recommendation");
    });

    it("handles draft experiment without report", () => {
      const exp = createExperiment(makeConfig());
      const md = experimentToMarkdown(exp);
      expect(md).toContain("# Experiment:");
      expect(md).toContain("**Status:** draft");
      expect(md).not.toContain("## Results");
    });
  });

  // ---- Edge cases ----
  describe("edge cases", () => {
    it("handles 1 run per variant without division-by-zero", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 1 }));
      const result = await runExperiment(exp.id, mockRunner(), mockScorer());

      expect(result.status).toBe("completed");
      expect(result.report).toBeDefined();
      expect(isFinite(result.report!.pValue)).toBe(true);
      expect(isFinite(result.report!.effectSize)).toBe(true);
    });

    it("handles identical scores across all variants", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 3 }));
      await runExperiment(exp.id, mockRunner(), mockScorer(5));

      const report = exp.report!;
      expect(report.significant).toBe(false);
      expect(isFinite(report.pValue)).toBe(true);
    });

    it("handles scorer returning empty scores array", async () => {
      const exp = createExperiment(makeConfig({ runsPerVariant: 1 }));
      const emptyScorer = async () => ({ scores: [] as never[] });
      const result = await runExperiment(exp.id, mockRunner(), emptyScorer);

      expect(result.status).toBe("completed");
      expect(result.results[0].averageScore).toBe(0);
    });
  });
});

// ---- Result factory helpers ----

function makeResult(
  variantId: string,
  avgScore: number,
  scores?: { feasibility: number; originality: number; impact: number; clarity: number }
): ExperimentResult {
  return {
    variantId,
    runId: `run_${Math.random().toString(36).slice(2, 10)}`,
    ideasGenerated: 2,
    averageScore: avgScore,
    scores: scores ?? {
      feasibility: avgScore,
      originality: avgScore,
      impact: avgScore,
      clarity: avgScore,
    },
    durationMs: 100,
    timestamp: new Date().toISOString(),
    rawIdeas: [{ title: "Idea", description: "Desc", score: avgScore }],
  };
}

function makeResults(variantId: string, avgScores: number[]): ExperimentResult[] {
  return avgScores.map((score) => makeResult(variantId, score));
}
