/**
 * @module genome-sequencer
 *
 * Idea Genome Sequencer — decomposes innovation ideas into fundamental
 * traits ("genome"), enabling similarity search, recombination, and
 * prior-art detection across the innovation memory.
 */

import { z } from "zod";

// ---- Genome Traits ----

export const GenomeTraitTypeSchema = z.enum([
  "problem-space",
  "solution-mechanism",
  "value-proposition",
  "target-audience",
  "enabling-technology",
  "risk-profile",
  "competitive-differentiation",
]);

export type GenomeTraitType = z.infer<typeof GenomeTraitTypeSchema>;

export const GenomeTraitSchema = z.object({
  type: GenomeTraitTypeSchema,
  value: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string().max(200)).max(10),
});

export type GenomeTrait = z.infer<typeof GenomeTraitSchema>;

// ---- Idea Genome ----

export const IdeaGenomeSchema = z.object({
  id: z.string().max(200),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  traits: z.array(GenomeTraitSchema),
  sequencedAt: z.string(),
  sessionId: z.string().max(200).optional(),
  angleId: z.string().max(100).optional(),
  metadata: z.record(z.string().max(2000)).optional(),
});

export type IdeaGenome = z.infer<typeof IdeaGenomeSchema>;

// ---- Similarity ----

export interface GenomeSimilarity {
  genomeA: string;
  genomeB: string;
  overallSimilarity: number;
  traitSimilarities: Array<{
    trait: GenomeTraitType;
    similarity: number;
  }>;
}

// ---- Recombination ----

export interface RecombinantIdea {
  title: string;
  description: string;
  sourceGenomes: string[];
  traitSources: Array<{
    trait: GenomeTraitType;
    sourceGenomeId: string;
    value: string;
  }>;
  noveltyScore: number;
}

// ---- Genome Library ----

export const GenomeLibrarySchema = z.object({
  version: z.literal(1),
  genomes: z.array(IdeaGenomeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GenomeLibrary = z.infer<typeof GenomeLibrarySchema>;
