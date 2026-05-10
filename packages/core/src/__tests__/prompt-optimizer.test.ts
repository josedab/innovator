import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPromptOptimizer,
  completeMicroExperiment,
  createMicroExperiment,
  crossoverPrompts,
  evolveGeneration,
  getBestVariant,
  getEvolutionHistory,
  getExperiment,
  getPromptFitnessDashboard,
  getVariant,
  getVariantsByAngle,
  listExperiments,
  mutatePrompt,
  recordVariantScore,
  registerVariant,
} from "../prompt-optimizer/index.js";

describe("prompt-optimizer", () => {
  beforeEach(() => {
    clearPromptOptimizer();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("variant registration and retrieval", () => {
    it("registers variants with auto-incrementing versions per angle", () => {
      const first = registerVariant("angle-a", "Prompt A");
      const second = registerVariant(
        "angle-a",
        "Prompt B",
        [first.id],
        "mutation:add_specificity",
        1
      );
      const otherAngle = registerVariant("angle-b", "Prompt C");

      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
      expect(second.parentIds).toEqual([first.id]);
      expect(second.mutation).toBe("mutation:add_specificity");
      expect(second.generation).toBe(1);
      expect(otherAngle.version).toBe(1);
      expect(getVariant(first.id)).toEqual(first);
    });

    it("sorts variants by fitness and prefers active variants when selecting the best one", () => {
      const active = registerVariant("angle-a", "Active prompt");
      const inactive = registerVariant("angle-a", "Inactive prompt");

      recordVariantScore(active.id, 7, 3, "subject-1");
      recordVariantScore(inactive.id, 9, 3, "subject-1");
      inactive.active = false;

      expect(getVariantsByAngle("angle-a").map((variant) => variant.id)).toEqual([
        inactive.id,
        active.id,
      ]);
      expect(getBestVariant("angle-a")?.id).toBe(active.id);
      expect(getBestVariant("missing")).toBeUndefined();
    });
  });

  describe("recordVariantScore", () => {
    it("updates usage count, average score, and fitness using consistency weighting", () => {
      const stable = registerVariant("angle-a", "Stable prompt");
      const volatile = registerVariant("angle-a", "Volatile prompt");

      recordVariantScore(stable.id, 8, 4, "subject-1");
      recordVariantScore(stable.id, 8, 5, "subject-2");

      recordVariantScore(volatile.id, 10, 4, "subject-1");
      recordVariantScore(volatile.id, 6, 2, "subject-2");

      expect(getVariant(stable.id)).toEqual(
        expect.objectContaining({ usageCount: 2, totalScore: 16, avgScore: 8, fitness: 86 })
      );
      expect(getVariant(volatile.id)).toEqual(
        expect.objectContaining({ usageCount: 2, totalScore: 16, avgScore: 8, fitness: 77.5 })
      );
      expect(getVariant(stable.id)?.fitness).toBeGreaterThan(getVariant(volatile.id)?.fitness ?? 0);
    });

    it("ignores scores for unknown variants", () => {
      expect(() => recordVariantScore("missing", 8, 3, "subject")).not.toThrow();
    });
  });

  describe("micro experiments", () => {
    it("creates, completes, retrieves, and lists experiments", () => {
      const first = registerVariant("angle-a", "Prompt A");
      const second = registerVariant("angle-a", "Prompt B");
      const other = registerVariant("angle-b", "Prompt C");

      const experiment = createMicroExperiment(
        "angle-a",
        [first.id, second.id],
        "launch a new feature"
      );

      expect(experiment.status).toBe("pending");

      const completed = completeMicroExperiment(experiment.id, [
        { variantId: first.id, avgScore: 7.2, ideaCount: 4 },
        { variantId: second.id, avgScore: 8.6, ideaCount: 3 },
      ]);

      createMicroExperiment("angle-b", [other.id], "another subject");
      expect(completed).toEqual(
        expect.objectContaining({
          id: experiment.id,
          status: "completed",
          winnerId: second.id,
          completedAt: expect.any(String),
        })
      );
      expect(getExperiment(experiment.id)).toEqual(completed);
      expect(listExperiments("angle-a")).toEqual([completed]);
      expect(listExperiments()).toHaveLength(2);
      expect(completeMicroExperiment("missing", [])).toBeUndefined();
    });
  });

  describe("mutatePrompt", () => {
    it.each([
      ["add_specificity", "Be specific and concrete in your suggestions."],
      ["change_perspective", "Consider this from the perspective of an end user"],
      ["add_constraint", "Ensure each idea can be prototyped within 2 weeks"],
      ["broaden_scope", "Think beyond the obvious applications."],
      ["add_example", "provide a brief real-world analogy or example"],
      ["change_tone", "Be bold and provocative."],
    ])("applies the %s strategy", (strategy, expectedSnippet) => {
      const result = mutatePrompt("Base prompt", strategy);

      expect(result.strategy).toBe(strategy);
      expect(result.mutated).toContain(expectedSnippet);
    });

    it("simplifies whitespace-heavy prompts", () => {
      const result = mutatePrompt("Line one   with  spaces\n\n\nLine two", "simplify");

      expect(result.strategy).toBe("simplify");
      expect(result.mutated).toBe("Line one with spaces Line two");
    });
  });

  describe("crossoverPrompts", () => {
    it("combines lines from both parents without dropping all content", () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);

      const crossed = crossoverPrompts("A1\nA2", "B1\nB2");

      expect(crossed).toBe("A1\nB2");
      expect(crossed.length).toBeGreaterThan(0);
      randomSpy.mockRestore();
    });
  });

  describe("evolveGeneration / analytics", () => {
    it("throws when fewer than two active variants are available", () => {
      registerVariant("angle-a", "Only prompt");

      expect(() => evolveGeneration("angle-a")).toThrow(
        "Need at least 2 active variants to evolve"
      );
    });

    it("creates a new generation, records history, and updates the dashboard", () => {
      const first = registerVariant("angle-a", "Parent A line 1\nParent A line 2");
      const second = registerVariant("angle-a", "Parent B line 1\nParent B line 2");
      recordVariantScore(first.id, 9, 4, "subject-1");
      recordVariantScore(second.id, 6, 2, "subject-1");

      const randomSpy = vi
        .spyOn(Math, "random")
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.9);

      const result = evolveGeneration("angle-a", {
        populationSize: 2,
        tournamentSize: 2,
        mutationRate: 0,
        crossoverRate: 1,
        elitismCount: 1,
        maxGenerations: 1,
      });

      randomSpy.mockRestore();

      expect(result.newVariants).toHaveLength(1);
      expect(result.newVariants[0]).toEqual(
        expect.objectContaining({
          generation: 1,
          mutation: "crossover",
          parentIds: [first.id, second.id],
          promptTemplate: "Parent A line 1\nParent B line 2",
        })
      );
      expect(result.stats).toEqual(
        expect.objectContaining({
          generation: 1,
          bestVariantId: first.id,
          bestFitness: getVariant(first.id)?.fitness,
          populationSize: 2,
        })
      );
      expect(getEvolutionHistory()).toEqual([result.stats]);
      expect(getPromptFitnessDashboard()).toEqual([
        expect.objectContaining({
          angleId: "angle-a",
          variantCount: 3,
          bestVariantId: first.id,
          bestFitness: getVariant(first.id)?.fitness,
          generations: 1,
        }),
      ]);
    });
  });
});
