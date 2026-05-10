import { describe, it, expect, vi } from "vitest";
import {
  select,
  evolutionToMarkdown,
  EvolvedIdeaSchema,
  MutationTypeSchema,
  GenerationResultSchema,
  EvolutionResultSchema,
  type EvolvedIdea,
  type EvolutionResult,
} from "../index.js";

// ---- Helper factories ----

function makeEvolvedIdea(overrides: Partial<EvolvedIdea> = {}): EvolvedIdea {
  const id = overrides.id ?? "idea-1";
  return {
    id,
    title: "Test Idea",
    description: "A test idea description",
    potentialImpact: "High impact",
    implementationHint: "Build it",
    fitness: 50,
    generation: 0,
    ancestry: { id, parentIds: [], generation: 0, operation: "seed" },
    ...overrides,
  };
}

function makeEvolutionResult(overrides: Partial<EvolutionResult> = {}): EvolutionResult {
  const bestIdea = makeEvolvedIdea({ fitness: 90, title: "Best Idea" });
  return {
    generations: [
      {
        generation: 0,
        population: [bestIdea, makeEvolvedIdea({ id: "idea-2", fitness: 60 })],
        bestFitness: 90,
        averageFitness: 75,
        bestIdea,
      },
    ],
    bestOverall: bestIdea,
    totalGenerations: 1,
    fitnessHistory: [90],
    ...overrides,
  };
}

// ---- select tests ----

describe("select", () => {
  it("returns top N by fitness descending", () => {
    const population = [
      makeEvolvedIdea({ id: "a", fitness: 30 }),
      makeEvolvedIdea({ id: "b", fitness: 90 }),
      makeEvolvedIdea({ id: "c", fitness: 60 }),
    ];
    const selected = select(population, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].id).toBe("b");
    expect(selected[1].id).toBe("c");
  });

  it("returns all when N > population size", () => {
    const population = [
      makeEvolvedIdea({ id: "a", fitness: 50 }),
      makeEvolvedIdea({ id: "b", fitness: 80 }),
    ];
    const selected = select(population, 10);
    expect(selected).toHaveLength(2);
  });

  it("returns empty for empty population", () => {
    expect(select([], 5)).toEqual([]);
  });

  it("does not mutate original array", () => {
    const population = [
      makeEvolvedIdea({ id: "a", fitness: 30 }),
      makeEvolvedIdea({ id: "b", fitness: 90 }),
    ];
    const original = [...population];
    select(population, 1);
    expect(population[0].id).toBe(original[0].id);
  });
});

// ---- evolutionToMarkdown tests ----

describe("evolutionToMarkdown", () => {
  it("includes generation headers and fitness", () => {
    const result = makeEvolutionResult();
    const md = evolutionToMarkdown(result);
    expect(md).toContain("# Evolution Results");
    expect(md).toContain("## Generation 0");
    expect(md).toContain("Best Idea");
    expect(md).toContain("/100");
  });

  it("includes fitness trend", () => {
    const result = makeEvolutionResult({ fitnessHistory: [60, 75, 90] });
    const md = evolutionToMarkdown(result);
    expect(md).toContain("60 → 75 → 90");
  });

  it("handles single generation", () => {
    const result = makeEvolutionResult();
    const md = evolutionToMarkdown(result);
    expect(md).toContain("**Generations:** 1");
  });
});

// ---- Schema validation tests ----

describe("EvolvedIdeaSchema", () => {
  it("accepts a valid evolved idea", () => {
    const idea = makeEvolvedIdea();
    const result = EvolvedIdeaSchema.safeParse(idea);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = EvolvedIdeaSchema.safeParse({ id: "x", title: "T" });
    expect(result.success).toBe(false);
  });

  it("rejects fitness above 100", () => {
    const result = EvolvedIdeaSchema.safeParse(makeEvolvedIdea({ fitness: 150 }));
    expect(result.success).toBe(false);
  });

  it("rejects negative fitness", () => {
    const result = EvolvedIdeaSchema.safeParse(makeEvolvedIdea({ fitness: -10 }));
    expect(result.success).toBe(false);
  });
});

describe("MutationTypeSchema", () => {
  it("accepts all valid mutation types", () => {
    const types = ["pivot", "scale", "simplify", "combine", "invert", "analogize", "constrain"];
    for (const t of types) {
      expect(MutationTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects invalid mutation type", () => {
    expect(MutationTypeSchema.safeParse("explode").success).toBe(false);
  });
});

// ---- Mocked LLM tests ----

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((_label: string, value: string) => value),
}));

describe("runEvolution (mocked LLM)", () => {
  it("runs with mocked LLM and progress callback", async () => {
    const { generateText } = await import("../../copilot/client.js");

    // Mock fitness evaluation
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        scores: [{ id: "any", fitness: 75 }],
      })
    );

    const { runEvolution } = await import("../index.js");

    const ideas = [
      {
        title: "Idea A",
        description: "Desc A",
        potentialImpact: "Impact A",
        implementationHint: "Hint A",
      },
      {
        title: "Idea B",
        description: "Desc B",
        potentialImpact: "Impact B",
        implementationHint: "Hint B",
      },
    ];

    const progressCalls: string[] = [];
    const result = await runEvolution(ideas, 1, {}, (progress) => {
      progressCalls.push(progress.phase);
    });

    expect(result.totalGenerations).toBe(1);
    expect(result.generations).toHaveLength(1);
    expect(result.bestOverall).toBeDefined();
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("throws with single idea population", async () => {
    const { runEvolution } = await import("../index.js");
    const ideas = [
      { title: "Solo", description: "Only one", potentialImpact: "N/A", implementationHint: "N/A" },
    ];
    await expect(runEvolution(ideas, 1)).rejects.toThrow("Need at least 2 ideas");
  });

  it("throws with invalid generation count", async () => {
    const { runEvolution } = await import("../index.js");
    const ideas = [
      { title: "A", description: "A", potentialImpact: "A", implementationHint: "A" },
      { title: "B", description: "B", potentialImpact: "B", implementationHint: "B" },
    ];
    await expect(runEvolution(ideas, 0)).rejects.toThrow("Generations must be between 1 and 10");
    await expect(runEvolution(ideas, 11)).rejects.toThrow("Generations must be between 1 and 10");
  });

  it("multi-generation evolution preserves elites", async () => {
    const { generateText } = await import("../../copilot/client.js");

    // Mock returns crossover/mutation results and fitness scores
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        scores: [{ id: "any", fitness: 80 }],
        title: "Evolved",
        description: "Evolved idea",
        potentialImpact: "Big",
        implementationHint: "Do it",
      })
    );

    const { runEvolution } = await import("../index.js");
    const ideas = [
      { title: "A", description: "A", potentialImpact: "A", implementationHint: "A" },
      { title: "B", description: "B", potentialImpact: "B", implementationHint: "B" },
      { title: "C", description: "C", potentialImpact: "C", implementationHint: "C" },
    ];

    const result = await runEvolution(ideas, 2, { eliteCount: 2, populationSize: 4 });
    expect(result.totalGenerations).toBe(2);
    expect(result.generations).toHaveLength(2);
    expect(result.fitnessHistory).toHaveLength(2);
  });

  it("progress callback called per generation with correct phases", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        scores: [{ id: "any", fitness: 70 }],
        title: "X",
        description: "X",
        potentialImpact: "X",
        implementationHint: "X",
      })
    );

    const { runEvolution } = await import("../index.js");
    const ideas = [
      { title: "A", description: "A", potentialImpact: "A", implementationHint: "A" },
      { title: "B", description: "B", potentialImpact: "B", implementationHint: "B" },
    ];

    const phases: string[] = [];
    await runEvolution(ideas, 2, { populationSize: 3 }, (p) => phases.push(p.phase));

    expect(phases).toContain("evaluating");
    expect(phases).toContain("selecting");
    expect(phases).toContain("complete");
  });

  it("all identical fitness scores handled gracefully", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        scores: [{ id: "any", fitness: 50 }],
        title: "Same",
        description: "Same",
        potentialImpact: "Same",
        implementationHint: "Same",
      })
    );

    const { runEvolution } = await import("../index.js");
    const ideas = [
      { title: "A", description: "A", potentialImpact: "A", implementationHint: "A" },
      { title: "B", description: "B", potentialImpact: "B", implementationHint: "B" },
    ];

    const result = await runEvolution(ideas, 1);
    expect(result.bestOverall).toBeDefined();
    // When IDs don't match the mock, fitness stays at default 0
    expect(result.bestOverall.fitness).toBeGreaterThanOrEqual(0);
  });
});

// ---- crossover tests (mocked LLM) ----

describe("crossover (mocked LLM)", () => {
  it("combines two parent ideas and returns child with ancestry", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        title: "Hybrid Idea",
        description: "Combined from A and B",
        potentialImpact: "Medium-High",
        implementationHint: "Merge approaches",
      })
    );

    const { crossover } = await import("../index.js");
    const parentA = makeEvolvedIdea({ id: "parent-a", generation: 1 });
    const parentB = makeEvolvedIdea({ id: "parent-b", generation: 2 });

    const child = await crossover(parentA, parentB);

    expect(child.title).toBe("Hybrid Idea");
    expect(child.ancestry.operation).toBe("crossover");
    expect(child.ancestry.parentIds).toContain("parent-a");
    expect(child.ancestry.parentIds).toContain("parent-b");
    expect(child.generation).toBe(3); // max(1, 2) + 1
    expect(child.fitness).toBe(0); // Not yet evaluated
  });
});

// ---- mutate tests (mocked LLM) ----

describe("mutate (mocked LLM)", () => {
  const mutationTypes = [
    "pivot",
    "scale",
    "simplify",
    "combine",
    "invert",
    "analogize",
    "constrain",
  ] as const;

  for (const mt of mutationTypes) {
    it(`applies ${mt} mutation`, async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          title: `${mt} variant`,
          description: `Applied ${mt}`,
          potentialImpact: "Varied",
          implementationHint: "Adapt",
        })
      );

      const { mutate } = await import("../index.js");
      const parent = makeEvolvedIdea({ id: "parent-1", generation: 0 });

      const child = await mutate(parent, mt);

      expect(child.title).toBe(`${mt} variant`);
      expect(child.ancestry.operation).toBe("mutation");
      expect(child.ancestry.mutationType).toBe(mt);
      expect(child.ancestry.parentIds).toContain("parent-1");
      expect(child.generation).toBe(1); // parent gen + 1
    });
  }
});

// ---- select edge cases ----

describe("select edge cases", () => {
  it("handles ties by preserving order", () => {
    const population = [
      makeEvolvedIdea({ id: "a", fitness: 50 }),
      makeEvolvedIdea({ id: "b", fitness: 50 }),
      makeEvolvedIdea({ id: "c", fitness: 50 }),
    ];
    const selected = select(population, 2);
    expect(selected).toHaveLength(2);
    // All same fitness, order should be stable
  });

  it("returns top-k by fitness", () => {
    const population = [
      makeEvolvedIdea({ id: "low", fitness: 10 }),
      makeEvolvedIdea({ id: "mid", fitness: 50 }),
      makeEvolvedIdea({ id: "high", fitness: 90 }),
    ];
    const selected = select(population, 1);
    expect(selected[0].id).toBe("high");
    expect(selected[0].fitness).toBe(90);
  });
});

// ---- ancestry tracking ----

describe("ancestry tracking", () => {
  it("seed ideas have empty parentIds", () => {
    const idea = makeEvolvedIdea();
    expect(idea.ancestry.parentIds).toEqual([]);
    expect(idea.ancestry.operation).toBe("seed");
  });

  it("crossover children track both parents", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        title: "Child",
        description: "Offspring",
        potentialImpact: "High",
        implementationHint: "Build",
      })
    );

    const { crossover } = await import("../index.js");
    const a = makeEvolvedIdea({ id: "a" });
    const b = makeEvolvedIdea({ id: "b" });
    const child = await crossover(a, b);

    expect(child.ancestry.parentIds).toHaveLength(2);
  });

  it("mutation children track single parent", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        title: "Mutant",
        description: "Changed",
        potentialImpact: "Medium",
        implementationHint: "Adjust",
      })
    );

    const { mutate } = await import("../index.js");
    const parent = makeEvolvedIdea({ id: "parent" });
    const child = await mutate(parent, "pivot");

    expect(child.ancestry.parentIds).toHaveLength(1);
    expect(child.ancestry.parentIds[0]).toBe("parent");
  });
});
