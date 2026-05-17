/**
 * @module prompt-optimizer
 *
 * Self-improving prompt engine using genetic algorithm principles.
 * Tracks prompt variant performance, runs micro-experiments, and
 * auto-evolves prompts toward higher-scored idea generation.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const PromptVariantSchema = z.object({
  id: z.string().max(100),
  angleId: z.string().max(100),
  version: z.number().min(1),
  promptTemplate: z.string().max(10000),
  parentIds: z.array(z.string().max(100)).default([]),
  mutation: z.string().max(500).optional(),
  fitness: z.number().min(0).max(100).default(0),
  usageCount: z.number().min(0).default(0),
  avgScore: z.number().min(0).max(10).default(0),
  totalScore: z.number().min(0).default(0),
  generation: z.number().min(0).default(0),
  createdAt: z.string(),
  active: z.boolean().default(true),
});
export type PromptVariant = z.infer<typeof PromptVariantSchema>;

export const ScoreRecordSchema = z.object({
  variantId: z.string().max(100),
  score: z.number().min(0).max(10),
  ideaCount: z.number().min(0),
  subject: z.string().max(2000),
  timestamp: z.string(),
});
export type ScoreRecord = z.infer<typeof ScoreRecordSchema>;

export const MicroExperimentSchema = z.object({
  id: z.string().max(100),
  angleId: z.string().max(100),
  variants: z.array(z.string().max(100)),
  subject: z.string().max(2000),
  status: z.enum(["pending", "running", "completed", "failed"]),
  results: z
    .array(
      z.object({
        variantId: z.string().max(100),
        avgScore: z.number().min(0).max(10),
        ideaCount: z.number().min(0),
      })
    )
    .default([]),
  winnerId: z.string().max(100).optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});
export type MicroExperiment = z.infer<typeof MicroExperimentSchema>;

export const EvolutionConfigSchema = z.object({
  populationSize: z.number().min(2).max(50).default(10),
  tournamentSize: z.number().min(2).max(10).default(3),
  mutationRate: z.number().min(0).max(1).default(0.3),
  crossoverRate: z.number().min(0).max(1).default(0.5),
  elitismCount: z.number().min(0).max(10).default(2),
  maxGenerations: z.number().min(1).max(100).default(10),
});
export type EvolutionConfig = z.infer<typeof EvolutionConfigSchema>;

export const GenerationStatsSchema = z.object({
  generation: z.number().min(0),
  bestFitness: z.number().min(0).max(100),
  avgFitness: z.number().min(0).max(100),
  bestVariantId: z.string().max(100),
  populationSize: z.number().min(0),
  timestamp: z.string(),
});
export type GenerationStats = z.infer<typeof GenerationStatsSchema>;

// ---- Stores ----

const variants = new Map<string, PromptVariant>();
const scoreRecords: ScoreRecord[] = [];
const experiments = new Map<string, MicroExperiment>();
const generationHistory: GenerationStats[] = [];

// ---- Prompt Versioning ----

/** Register a new prompt variant. */
export function registerVariant(
  angleId: string,
  promptTemplate: string,
  parentIds: string[] = [],
  mutation?: string,
  generation = 0
): PromptVariant {
  const existing = Array.from(variants.values()).filter((v) => v.angleId === angleId);
  const version = existing.length + 1;

  const variant: PromptVariant = {
    id: `pv-${randomUUID().slice(0, 8)}`,
    angleId,
    version,
    promptTemplate,
    parentIds,
    mutation,
    fitness: 0,
    usageCount: 0,
    avgScore: 0,
    totalScore: 0,
    generation,
    createdAt: new Date().toISOString(),
    active: true,
  };

  variants.set(variant.id, variant);
  return variant;
}

/** Get a variant by ID. */
export function getVariant(id: string): PromptVariant | undefined {
  return variants.get(id);
}

/** Get all variants for an angle. */
export function getVariantsByAngle(angleId: string): PromptVariant[] {
  return Array.from(variants.values())
    .filter((v) => v.angleId === angleId)
    .sort((a, b) => b.fitness - a.fitness);
}

/** Get the best performing variant for an angle. */
export function getBestVariant(angleId: string): PromptVariant | undefined {
  const angleVariants = getVariantsByAngle(angleId);
  return angleVariants.find((v) => v.active) ?? angleVariants[0];
}

// ---- Scoring Association ----

/** Record a score for a prompt variant. */
export function recordVariantScore(
  variantId: string,
  score: number,
  ideaCount: number,
  subject: string
): void {
  const variant = variants.get(variantId);
  if (!variant) return;

  const record: ScoreRecord = {
    variantId,
    score,
    ideaCount,
    subject,
    timestamp: new Date().toISOString(),
  };
  scoreRecords.push(record);

  variant.usageCount++;
  variant.totalScore += score;
  variant.avgScore = variant.totalScore / variant.usageCount;
  variant.fitness = calculateFitness(variant);
}

function calculateFitness(variant: PromptVariant): number {
  // Fitness = weighted combination of avg score and consistency
  const scores = scoreRecords.filter((r) => r.variantId === variant.id).map((r) => r.score);

  if (scores.length === 0) return 0;

  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance =
    scores.length > 1
      ? scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (scores.length - 1)
      : 0;
  const consistency = Math.max(0, 1 - Math.sqrt(variance) / 10);

  // Scale to 0-100
  return Math.round((avg * 7 + consistency * 30) * 10) / 10;
}

// ---- Micro-Experiments ----

/** Create a micro-experiment comparing variant performance. */
export function createMicroExperiment(
  angleId: string,
  variantIds: string[],
  subject: string
): MicroExperiment {
  const experiment: MicroExperiment = {
    id: `exp-${randomUUID().slice(0, 8)}`,
    angleId,
    variants: variantIds,
    subject,
    status: "pending",
    results: [],
    createdAt: new Date().toISOString(),
  };

  experiments.set(experiment.id, experiment);
  return experiment;
}

/** Record results for a micro-experiment. */
export function completeMicroExperiment(
  experimentId: string,
  results: Array<{ variantId: string; avgScore: number; ideaCount: number }>
): MicroExperiment | undefined {
  const experiment = experiments.get(experimentId);
  if (!experiment) return undefined;

  experiment.results = results;
  experiment.status = "completed";
  experiment.completedAt = new Date().toISOString();

  // Determine winner
  const best = results.reduce((a, b) => (b.avgScore > a.avgScore ? b : a), results[0]);
  if (best) experiment.winnerId = best.variantId;

  return experiment;
}

/** Get experiment by ID. */
export function getExperiment(id: string): MicroExperiment | undefined {
  return experiments.get(id);
}

/** List experiments for an angle. */
export function listExperiments(angleId?: string): MicroExperiment[] {
  const all = Array.from(experiments.values());
  return angleId ? all.filter((e) => e.angleId === angleId) : all;
}

// ---- Genetic Evolution ----

const MUTATION_STRATEGIES = [
  "add_specificity",
  "simplify",
  "change_perspective",
  "add_constraint",
  "broaden_scope",
  "add_example",
  "change_tone",
] as const;

/** Apply a mutation to a prompt template. */
export function mutatePrompt(
  template: string,
  strategy?: string
): { mutated: string; strategy: string } {
  const chosen =
    strategy ?? MUTATION_STRATEGIES[Math.floor(Math.random() * MUTATION_STRATEGIES.length)];

  const mutations: Record<string, (t: string) => string> = {
    add_specificity: (t) =>
      t +
      "\n\nBe specific and concrete in your suggestions. Include actionable implementation details.",
    simplify: (t) =>
      t
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim(),
    change_perspective: (t) =>
      t + "\n\nConsider this from the perspective of an end user, not just a developer.",
    add_constraint: (t) =>
      t + "\n\nEnsure each idea can be prototyped within 2 weeks with a small team.",
    broaden_scope: (t) =>
      t +
      "\n\nThink beyond the obvious applications. Consider adjacent industries and unconventional use cases.",
    add_example: (t) =>
      t +
      "\n\nFor each idea, provide a brief real-world analogy or example of a similar successful innovation.",
    change_tone: (t) =>
      t +
      "\n\nBe bold and provocative. Challenge assumptions and propose ideas that might seem counterintuitive.",
  };

  const mutator = mutations[chosen] ?? mutations.add_specificity;
  return { mutated: mutator(template), strategy: chosen };
}

/** Crossover two prompt templates. */
export function crossoverPrompts(templateA: string, templateB: string): string {
  const linesA = templateA.split("\n").filter(Boolean);
  const linesB = templateB.split("\n").filter(Boolean);

  const result: string[] = [];
  const maxLen = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLen; i++) {
    if (Math.random() < 0.5 && i < linesA.length) {
      result.push(linesA[i]);
    } else if (i < linesB.length) {
      result.push(linesB[i]);
    } else if (i < linesA.length) {
      result.push(linesA[i]);
    }
  }

  return result.join("\n");
}

/** Run one generation of evolution for an angle's prompts. */
export function evolveGeneration(
  angleId: string,
  config: EvolutionConfig = EvolutionConfigSchema.parse({})
): { newVariants: PromptVariant[]; stats: GenerationStats } {
  const population = getVariantsByAngle(angleId).filter((v) => v.active);

  if (population.length < 2) {
    throw new ValidationError("Need at least 2 active variants to evolve");
  }

  const currentGen = Math.max(...population.map((v) => v.generation), 0);
  const newGen = currentGen + 1;
  const newVariants: PromptVariant[] = [];

  // Elitism: keep top variants
  const elites = population.slice(0, config.elitismCount);

  // Tournament selection
  function tournamentSelect(): PromptVariant {
    const candidates = [];
    for (let i = 0; i < config.tournamentSize; i++) {
      candidates.push(population[Math.floor(Math.random() * population.length)]);
    }
    return candidates.reduce((a, b) => (a.fitness > b.fitness ? a : b));
  }

  // Generate offspring
  while (newVariants.length + elites.length < config.populationSize) {
    if (Math.random() < config.crossoverRate && population.length >= 2) {
      // Crossover
      const parentA = tournamentSelect();
      const parentB = tournamentSelect();
      const offspring = crossoverPrompts(parentA.promptTemplate, parentB.promptTemplate);
      const variant = registerVariant(
        angleId,
        offspring,
        [parentA.id, parentB.id],
        "crossover",
        newGen
      );
      newVariants.push(variant);
    } else if (Math.random() < config.mutationRate) {
      // Mutation
      const parent = tournamentSelect();
      const { mutated, strategy } = mutatePrompt(parent.promptTemplate);
      const variant = registerVariant(
        angleId,
        mutated,
        [parent.id],
        `mutation:${strategy}`,
        newGen
      );
      newVariants.push(variant);
    } else {
      // Clone with slight mutation
      const parent = tournamentSelect();
      const { mutated, strategy } = mutatePrompt(parent.promptTemplate);
      const variant = registerVariant(
        angleId,
        mutated,
        [parent.id],
        `clone+mutation:${strategy}`,
        newGen
      );
      newVariants.push(variant);
    }
  }

  // Calculate stats
  const allActive = [...elites, ...newVariants];
  const fitnesses = allActive.map((v) => v.fitness);
  const stats: GenerationStats = {
    generation: newGen,
    bestFitness: Math.max(...fitnesses, 0),
    avgFitness:
      fitnesses.length > 0
        ? Math.round((fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length) * 10) / 10
        : 0,
    bestVariantId: allActive.reduce((a, b) => (a.fitness > b.fitness ? a : b)).id,
    populationSize: allActive.length,
    timestamp: new Date().toISOString(),
  };

  generationHistory.push(stats);
  return { newVariants, stats };
}

/** Get evolution history (fitness over generations). */
export function getEvolutionHistory(_angleId?: string): GenerationStats[] {
  return [...generationHistory];
}

/** Get a prompt fitness dashboard for all angles. */
export function getPromptFitnessDashboard(): Array<{
  angleId: string;
  variantCount: number;
  bestFitness: number;
  avgFitness: number;
  bestVariantId: string | undefined;
  generations: number;
}> {
  const angles = new Set(Array.from(variants.values()).map((v) => v.angleId));

  return Array.from(angles).map((angleId) => {
    const angleVariants = getVariantsByAngle(angleId);
    const fitnesses = angleVariants.map((v) => v.fitness);
    const maxGen = Math.max(...angleVariants.map((v) => v.generation), 0);

    return {
      angleId,
      variantCount: angleVariants.length,
      bestFitness: Math.max(...fitnesses, 0),
      avgFitness:
        fitnesses.length > 0
          ? Math.round((fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length) * 10) / 10
          : 0,
      bestVariantId: angleVariants[0]?.id,
      generations: maxGen,
    };
  });
}

/** Clear all data (for testing). */
export function clearPromptOptimizer(): void {
  variants.clear();
  scoreRecords.length = 0;
  experiments.clear();
  generationHistory.length = 0;
}
