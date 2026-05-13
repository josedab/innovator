/**
 * @module evolution
 *
 * Genetic-algorithm-inspired idea evolution engine.
 * Implements crossover, mutation, selection, and multi-generation evolution
 * with ancestry tracking and progress streaming.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

/** Zod schema for mutation type identifiers (pivot, scale, simplify, combine, invert, analogize, constrain). */
export const MutationTypeSchema = z.enum([
  "pivot",
  "scale",
  "simplify",
  "combine",
  "invert",
  "analogize",
  "constrain",
]);

/** Zod schema for ancestry tracking: links an idea to its parents, generation, and operation type. */
export const AncestryNodeSchema = z.object({
  id: z.string().max(100),
  parentIds: z.array(z.string().max(100)),
  generation: z.number().min(0),
  operation: z.enum(["seed", "crossover", "mutation", "selection"]),
  mutationType: MutationTypeSchema.optional(),
});

/** Zod schema for an evolved idea with fitness score, generation number, and ancestry. */
export const EvolvedIdeaSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  implementationHint: z.string().max(2000),
  fitness: z.number().min(0).max(100),
  generation: z.number().min(0),
  ancestry: AncestryNodeSchema,
});

/** Zod schema for one generation's results: population, best/average fitness, and top idea. */
export const GenerationResultSchema = z.object({
  generation: z.number().min(0),
  population: z.array(EvolvedIdeaSchema).max(50),
  bestFitness: z.number().min(0).max(100),
  averageFitness: z.number().min(0).max(100),
  bestIdea: EvolvedIdeaSchema,
});

/** Zod schema for the complete evolution result spanning all generations. */
export const EvolutionResultSchema = z.object({
  generations: z.array(GenerationResultSchema).max(20),
  bestOverall: EvolvedIdeaSchema,
  totalGenerations: z.number().min(1),
  fitnessHistory: z.array(z.number()).max(20),
});

/** The type of mutation applied during evolution. */
export type MutationType = z.infer<typeof MutationTypeSchema>;
/** An ancestry node tracking lineage of an evolved idea. */
export type AncestryNode = z.infer<typeof AncestryNodeSchema>;
/** An idea with fitness score and ancestry metadata from the evolution process. */
export type EvolvedIdea = z.infer<typeof EvolvedIdeaSchema>;
/** Results of a single generation in the evolution process. */
export type GenerationResult = z.infer<typeof GenerationResultSchema>;
/** Complete results of a multi-generation evolution run. */
export type EvolutionResult = z.infer<typeof EvolutionResultSchema>;

/** Configuration for the evolutionary idea generation process. */
export interface EvolutionConfig {
  populationSize?: number;
  mutationRate?: number;
  crossoverRate?: number;
  eliteCount?: number;
  model?: string;
  signal?: AbortSignal;
}

/** Progress callback payload emitted during evolution. */
export interface EvolutionProgress {
  generation: number;
  totalGenerations: number;
  bestFitness: number;
  averageFitness: number;
  bestIdea: EvolvedIdea;
  phase: "evaluating" | "selecting" | "crossover" | "mutating" | "complete";
}

// ---- Utility ----

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now().toString(36)}`;
}

function ideaToEvolved(idea: InnovationIdea, generation: number): EvolvedIdea {
  const id = nextId("seed");
  return {
    id,
    title: idea.title,
    description: idea.description,
    potentialImpact: idea.potentialImpact,
    implementationHint: idea.implementationHint,
    fitness: 0,
    generation,
    ancestry: { id, parentIds: [], generation, operation: "seed" },
  };
}

// ---- Prompt Builders ----

function buildCrossoverPrompt(ideaA: EvolvedIdea, ideaB: EvolvedIdea): string {
  return `You are an innovation crossover engine. Combine the best aspects of two ideas into a novel hybrid.

IDEA A:
${wrapUserInput("TITLE", ideaA.title)}
${wrapUserInput("DESCRIPTION", ideaA.description)}
${wrapUserInput("IMPACT", ideaA.potentialImpact)}

IDEA B:
${wrapUserInput("TITLE", ideaB.title)}
${wrapUserInput("DESCRIPTION", ideaB.description)}
${wrapUserInput("IMPACT", ideaB.potentialImpact)}

Create ONE hybrid idea that combines the strongest elements of both.
Respond with JSON only:
{
  "title": "...",
  "description": "...",
  "potentialImpact": "...",
  "implementationHint": "..."
}`;
}

function buildMutationPrompt(idea: EvolvedIdea, mutationType: MutationType): string {
  const mutationInstructions: Record<MutationType, string> = {
    pivot: "Change the target market or use case while keeping the core innovation",
    scale: "Dramatically increase or decrease the scale of the idea",
    simplify: "Strip down to the absolute minimal viable version",
    combine: "Merge with an adjacent technology or industry trend",
    invert: "Flip a core assumption on its head",
    analogize: "Apply the same principle in a completely different domain",
    constrain: "Add a significant constraint and redesign around it",
  };

  return `You are an innovation mutation engine. Apply a "${mutationType}" mutation.

ORIGINAL IDEA:
${wrapUserInput("TITLE", idea.title)}
${wrapUserInput("DESCRIPTION", idea.description)}
${wrapUserInput("IMPACT", idea.potentialImpact)}

MUTATION INSTRUCTION: ${mutationInstructions[mutationType]}

Create ONE mutated idea that applies this transformation.
Respond with JSON only:
{
  "title": "...",
  "description": "...",
  "potentialImpact": "...",
  "implementationHint": "..."
}`;
}

function buildFitnessPrompt(ideas: EvolvedIdea[]): string {
  const summaries = ideas.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    potentialImpact: i.potentialImpact,
  }));

  return `You are an innovation fitness evaluator. Score each idea from 0-100 based on:
- Novelty (how unique and original)
- Feasibility (how realistic to implement)
- Impact (how significant the potential impact)
- Clarity (how well-defined and actionable)

IDEAS:
"""
${sanitizeLlmOutput(JSON.stringify(summaries, null, 2))}
"""

Respond with JSON only:
{
  "scores": [
    { "id": "...", "fitness": 0-100 }
  ]
}`;
}

const CrossoverResponseSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  implementationHint: z.string().max(2000),
});

const FitnessResponseSchema = z.object({
  scores: z.array(z.object({ id: z.string(), fitness: z.number().min(0).max(100) })),
});

// ---- Core Functions ----

/**
 * Crossover two parent ideas to produce a hybrid offspring via LLM.
 * @param ideaA - First parent idea.
 * @param ideaB - Second parent idea.
 * @param config - Optional model and abort signal.
 * @returns A new {@link EvolvedIdea} combining the strongest elements of both parents.
 */
export async function crossover(
  ideaA: EvolvedIdea,
  ideaB: EvolvedIdea,
  config: { model?: string; signal?: AbortSignal } = {}
): Promise<EvolvedIdea> {
  const prompt = buildCrossoverPrompt(ideaA, ideaB);
  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      const jsonStr = extractJson(raw);
      return CrossoverResponseSchema.parse(JSON.parse(jsonStr));
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );

  const id = nextId("cross");
  return {
    id,
    ...result,
    fitness: 0,
    generation: Math.max(ideaA.generation, ideaB.generation) + 1,
    ancestry: {
      id,
      parentIds: [ideaA.id, ideaB.id],
      generation: Math.max(ideaA.generation, ideaB.generation) + 1,
      operation: "crossover",
    },
  };
}

/**
 * Mutate an idea using a specified mutation strategy (e.g., pivot, simplify, invert).
 * @param idea - The idea to mutate.
 * @param mutationType - The mutation strategy to apply.
 * @param config - Optional model and abort signal.
 * @returns A new {@link EvolvedIdea} with the mutation applied.
 */
export async function mutate(
  idea: EvolvedIdea,
  mutationType: MutationType,
  config: { model?: string; signal?: AbortSignal } = {}
): Promise<EvolvedIdea> {
  const prompt = buildMutationPrompt(idea, mutationType);
  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      const jsonStr = extractJson(raw);
      return CrossoverResponseSchema.parse(JSON.parse(jsonStr));
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );

  const id = nextId("mut");
  return {
    id,
    ...result,
    fitness: 0,
    generation: idea.generation + 1,
    ancestry: {
      id,
      parentIds: [idea.id],
      generation: idea.generation + 1,
      operation: "mutation",
      mutationType,
    },
  };
}

/**
 * Select the top individuals from a population based on fitness scores (elitism).
 * @param population - The current population of evolved ideas.
 * @param count - Number of top individuals to select.
 * @returns Array of the highest-fitness ideas, up to `count` entries.
 */
export function select(population: EvolvedIdea[], count: number): EvolvedIdea[] {
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  return sorted.slice(0, Math.min(count, sorted.length));
}

/**
 * Evaluate fitness for a population using LLM-based scoring.
 */
async function evaluateFitness(
  population: EvolvedIdea[],
  config: { model?: string; signal?: AbortSignal }
): Promise<EvolvedIdea[]> {
  if (population.length === 0) return [];

  const prompt = buildFitnessPrompt(population);
  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      const jsonStr = extractJson(raw);
      return FitnessResponseSchema.parse(JSON.parse(jsonStr));
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );

  const scoreMap = new Map(result.scores.map((s) => [s.id, s.fitness]));
  return population.map((idea) => ({
    ...idea,
    fitness: scoreMap.get(idea.id) ?? idea.fitness,
  }));
}

/**
 * Run a multi-generation evolutionary process on a population of ideas.
 *
 * Each generation: evaluate fitness → select elites → crossover → mutate → repeat.
 *
 * @param initialPopulation - Seed ideas (minimum 2 required).
 * @param generations - Number of generations to run (1-10, default 3).
 * @param config - Evolution parameters (population size, mutation/crossover rates, model).
 * @param onProgress - Optional callback invoked at each evolution phase.
 * @returns An {@link EvolutionResult} with all generations, best overall idea, and fitness history.
 * @throws If generations is outside 1-10 or fewer than 2 seed ideas are provided.
 */
export async function runEvolution(
  initialPopulation: InnovationIdea[],
  generations: number = 3,
  config: EvolutionConfig = {},
  onProgress?: (progress: EvolutionProgress) => void
): Promise<EvolutionResult> {
  const popSize = config.populationSize ?? Math.max(initialPopulation.length, 6);
  const mutationRate = config.mutationRate ?? 0.3;
  const crossoverRate = config.crossoverRate ?? 0.5;
  const eliteCount = config.eliteCount ?? 2;

  if (generations < 1 || generations > 10) {
    throw new Error("Generations must be between 1 and 10");
  }
  if (initialPopulation.length < 2) {
    throw new Error("Need at least 2 ideas for evolution");
  }

  const mutationTypes: MutationType[] = [
    "pivot",
    "scale",
    "simplify",
    "combine",
    "invert",
    "analogize",
    "constrain",
  ];
  let population = initialPopulation.map((idea) => ideaToEvolved(idea, 0));
  const genResults: GenerationResult[] = [];
  const fitnessHistory: number[] = [];

  for (let gen = 0; gen < generations; gen++) {
    // Evaluate fitness
    onProgress?.({
      generation: gen,
      totalGenerations: generations,
      bestFitness: 0,
      averageFitness: 0,
      bestIdea: population[0],
      phase: "evaluating",
    });

    population = await evaluateFitness(population, config);

    const avgFitness = population.reduce((s, i) => s + i.fitness, 0) / population.length;
    const bestIdea = [...population].sort((a, b) => b.fitness - a.fitness)[0];

    fitnessHistory.push(bestIdea.fitness);

    genResults.push({
      generation: gen,
      population: [...population],
      bestFitness: bestIdea.fitness,
      averageFitness: Math.round(avgFitness * 10) / 10,
      bestIdea,
    });

    onProgress?.({
      generation: gen,
      totalGenerations: generations,
      bestFitness: bestIdea.fitness,
      averageFitness: avgFitness,
      bestIdea,
      phase: "selecting",
    });

    if (gen === generations - 1) break; // Last generation, no need to evolve further

    // Selection: keep elites
    const elites = select(population, eliteCount);
    const newPopulation = [...elites];

    // Crossover
    const crossoverCount = Math.floor((popSize - eliteCount) * crossoverRate);
    for (let c = 0; c < crossoverCount && newPopulation.length < popSize; c++) {
      const parentA = population[Math.floor(Math.random() * population.length)];
      const parentB = population[Math.floor(Math.random() * population.length)];
      if (parentA.id !== parentB.id) {
        try {
          const child = await crossover(parentA, parentB, config);
          newPopulation.push(child);
        } catch {
          // Skip failed crossover
        }
      }
    }

    // Mutation
    onProgress?.({
      generation: gen,
      totalGenerations: generations,
      bestFitness: bestIdea.fitness,
      averageFitness: avgFitness,
      bestIdea,
      phase: "mutating",
    });

    while (newPopulation.length < popSize) {
      const parent = population[Math.floor(Math.random() * population.length)];
      if (Math.random() < mutationRate) {
        const mt = mutationTypes[Math.floor(Math.random() * mutationTypes.length)];
        try {
          const child = await mutate(parent, mt, config);
          newPopulation.push(child);
        } catch {
          newPopulation.push({ ...parent, id: nextId("clone"), generation: gen + 1 });
        }
      } else {
        newPopulation.push({ ...parent, id: nextId("surv"), generation: gen + 1 });
      }
    }

    population = newPopulation.slice(0, popSize);
  }

  const allIdeas = genResults.flatMap((g) => g.population);
  const bestOverall = [...allIdeas].sort((a, b) => b.fitness - a.fitness)[0];

  onProgress?.({
    generation: generations - 1,
    totalGenerations: generations,
    bestFitness: bestOverall.fitness,
    averageFitness: 0,
    bestIdea: bestOverall,
    phase: "complete",
  });

  return {
    generations: genResults,
    bestOverall,
    totalGenerations: generations,
    fitnessHistory,
  };
}

/**
 * Format evolution results as markdown with fitness trends and per-generation summaries.
 * @param result - The evolution result to format.
 * @returns A markdown string.
 */
export function evolutionToMarkdown(result: EvolutionResult): string {
  const lines: string[] = [
    "# Evolution Results",
    "",
    `**Generations:** ${result.totalGenerations}`,
    `**Fitness trend:** ${result.fitnessHistory.map((f) => f.toFixed(0)).join(" → ")}`,
    "",
    "## Best Idea Overall",
    `### ${result.bestOverall.title}`,
    result.bestOverall.description,
    `**Fitness:** ${result.bestOverall.fitness}/100`,
    `**Impact:** ${result.bestOverall.potentialImpact}`,
    "",
  ];

  for (const gen of result.generations) {
    lines.push(`## Generation ${gen.generation}`);
    lines.push(`Best: ${gen.bestFitness}/100 | Avg: ${gen.averageFitness}/100`);
    lines.push(`**Best:** ${gen.bestIdea.title}`);
    lines.push("");
    for (const idea of gen.population.slice(0, 5)) {
      lines.push(`- ${idea.title} (fitness: ${idea.fitness}, via ${idea.ancestry.operation})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
