/**
 * @module genome-sequencer
 *
 * Decomposes ideas into genome traits, computes similarity, finds prior art,
 * and generates recombinant ideas. Persists in ~/.innovator/genome-library/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { ValidationError } from "../errors.js";
import type { InnovationIdea } from "../types.js";
import {
  GenomeTraitSchema,
  GenomeLibrarySchema,
  type IdeaGenome,
  type GenomeTrait,
  type GenomeTraitType,
  type GenomeSimilarity,
  type RecombinantIdea,
  type GenomeLibrary,
} from "./types.js";

// ---- Constants ----

const DEFAULT_DIR = join(homedir(), ".innovator", "genome-library");
const LIBRARY_FILE = "library.json";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- Library Persistence ----

/**
 * Load the genome library from disk.
 *
 * @param dir - Directory containing the library file (defaults to `~/.innovator/genome-library`).
 * @returns The parsed genome library, or a fresh empty library if none exists.
 */
export function loadLibrary(dir: string = DEFAULT_DIR): GenomeLibrary {
  ensureDir(dir);
  const path = join(dir, LIBRARY_FILE);
  if (existsSync(path)) {
    return GenomeLibrarySchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  }
  const now = new Date().toISOString();
  return { version: 1, genomes: [], createdAt: now, updatedAt: now };
}

function saveLibrary(library: GenomeLibrary, dir: string = DEFAULT_DIR): void {
  ensureDir(dir);
  library.updatedAt = new Date().toISOString();
  atomicWrite(join(dir, LIBRARY_FILE), JSON.stringify(library, null, 2));
}

// ---- Sequencing ----

const SequenceResponseSchema = z.object({
  traits: z.array(GenomeTraitSchema).min(1).max(7),
});

/**
 * Sequence an idea into its genome — decompose into fundamental traits.
 */
export async function sequenceIdea(
  idea: InnovationIdea,
  options: {
    sessionId?: string;
    angleId?: string;
    model?: string;
    signal?: AbortSignal;
    dir?: string;
  } = {}
): Promise<IdeaGenome> {
  if (!idea.title?.trim()) {
    throw new ValidationError("Idea title is required for genome sequencing");
  }
  if (!idea.description?.trim()) {
    throw new ValidationError("Idea description is required for genome sequencing");
  }

  const prompt = `Decompose the following innovation idea into its fundamental "genome" traits.
Each trait captures one dimension of the idea's DNA.

${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL_IMPACT", idea.potentialImpact)}

For each trait type, extract the core value and 2-5 keywords.

Trait types:
- problem-space: What fundamental problem does this solve?
- solution-mechanism: How does it solve it? (the core mechanism/approach)
- value-proposition: What value does the user get?
- target-audience: Who is this for?
- enabling-technology: What technology makes this possible?
- risk-profile: What are the key risks?
- competitive-differentiation: What makes this different from alternatives?

Respond in JSON:
{
  "traits": [
    {
      "type": "problem-space",
      "value": "description of the problem space",
      "confidence": 0.0-1.0,
      "keywords": ["keyword1", "keyword2"]
    }
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: options.model,
        signal: options.signal,
      });
      return SequenceResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
    },
    { signal: options.signal }
  );

  const genome: IdeaGenome = {
    id: `genome-${randomUUID().slice(0, 12)}`,
    ideaTitle: idea.title,
    ideaDescription: idea.description,
    traits: result.traits,
    sequencedAt: new Date().toISOString(),
    sessionId: options.sessionId,
    angleId: options.angleId,
  };

  // Auto-save to library
  const dir = options.dir ?? DEFAULT_DIR;
  const library = loadLibrary(dir);
  library.genomes.push(genome);
  saveLibrary(library, dir);

  return genome;
}

// ---- Similarity ----

/** Compute keyword-based Jaccard similarity between two trait values. */
function traitSimilarity(a: GenomeTrait, b: GenomeTrait): number {
  if (a.type !== b.type) return 0;

  const setA = new Set(a.keywords.map((k) => k.toLowerCase()));
  const setB = new Set(b.keywords.map((k) => k.toLowerCase()));

  if (setA.size === 0 && setB.size === 0) {
    // Fallback to word-level overlap
    const wordsA = new Set(a.value.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.value.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }

  const intersection = [...setA].filter((k) => setB.has(k)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Compute overall genome similarity between two idea genomes.
 * Compares matching trait types using keyword-based Jaccard similarity
 * and averages the per-trait scores.
 *
 * @param genomeA - First genome to compare.
 * @param genomeB - Second genome to compare.
 * @returns A {@link GenomeSimilarity} with overall and per-trait similarity scores.
 */
export function computeGenomeSimilarity(
  genomeA: IdeaGenome,
  genomeB: IdeaGenome
): GenomeSimilarity {
  const traitTypes: GenomeTraitType[] = [
    "problem-space",
    "solution-mechanism",
    "value-proposition",
    "target-audience",
    "enabling-technology",
    "risk-profile",
    "competitive-differentiation",
  ];

  const traitSimilarities: GenomeSimilarity["traitSimilarities"] = [];
  let totalSim = 0;
  let count = 0;

  for (const type of traitTypes) {
    const traitA = genomeA.traits.find((t) => t.type === type);
    const traitB = genomeB.traits.find((t) => t.type === type);

    if (traitA && traitB) {
      const sim = traitSimilarity(traitA, traitB);
      traitSimilarities.push({ trait: type, similarity: sim });
      totalSim += sim;
      count++;
    }
  }

  return {
    genomeA: genomeA.id,
    genomeB: genomeB.id,
    overallSimilarity: count > 0 ? Math.round((totalSim / count) * 100) / 100 : 0,
    traitSimilarities,
  };
}

/**
 * Find the most similar genomes in the library to a given genome.
 *
 * @param genome - The reference genome to compare against.
 * @param topN - Maximum number of results to return (default: 5).
 * @param dir - Library directory (defaults to `~/.innovator/genome-library`).
 * @returns Array of similarity results sorted by descending similarity, each annotated with the idea title.
 */
export function findSimilar(
  genome: IdeaGenome,
  topN: number = 5,
  dir: string = DEFAULT_DIR
): Array<GenomeSimilarity & { ideaTitle: string }> {
  const library = loadLibrary(dir);

  const results = library.genomes
    .filter((g) => g.id !== genome.id)
    .map((other) => ({
      ...computeGenomeSimilarity(genome, other),
      ideaTitle: other.ideaTitle,
    }))
    .sort((a, b) => b.overallSimilarity - a.overallSimilarity)
    .slice(0, topN);

  return results;
}

// ---- Recombination ----

/**
 * Generate a recombinant idea by combining the best traits from two genomes.
 */
export async function recombine(
  genomeA: IdeaGenome,
  genomeB: IdeaGenome,
  options: { model?: string; signal?: AbortSignal } = {}
): Promise<RecombinantIdea> {
  if (genomeA.traits.length === 0 && genomeB.traits.length === 0) {
    throw new ValidationError("At least one genome must have traits for recombination");
  }

  const traitSources: RecombinantIdea["traitSources"] = [];

  // Pick the highest-confidence trait from each genome for each type
  const allTraitTypes = new Set([
    ...genomeA.traits.map((t) => t.type),
    ...genomeB.traits.map((t) => t.type),
  ]);

  for (const type of allTraitTypes) {
    const traitA = genomeA.traits.find((t) => t.type === type);
    const traitB = genomeB.traits.find((t) => t.type === type);

    const best = !traitA
      ? traitB!
      : !traitB
        ? traitA
        : traitA.confidence >= traitB.confidence
          ? traitA
          : traitB;
    const sourceId = best === traitA ? genomeA.id : genomeB.id;

    traitSources.push({
      trait: type as GenomeTraitType,
      sourceGenomeId: sourceId,
      value: best.value,
    });
  }

  // Use LLM to synthesize a coherent recombinant idea
  const traitContext = traitSources.map((ts) => `- ${ts.trait}: ${ts.value}`).join("\n");

  const prompt = `You are given the "genome" of a new innovation idea — traits extracted from two different ideas and combined.
Create a coherent, novel idea that synthesizes these traits into something new.

Source ideas:
A: "${genomeA.ideaTitle}"
B: "${genomeB.ideaTitle}"

Combined traits:
${traitContext}

Respond in JSON:
{
  "title": "new idea title",
  "description": "description of the recombinant idea (2-3 sentences)",
  "noveltyScore": 0.0-1.0
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: options.model,
        signal: options.signal,
      });
      const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
      return z
        .object({
          title: z.string().max(500),
          description: z.string().max(5000),
          noveltyScore: z.number().min(0).max(1),
        })
        .parse(parsed);
    },
    { signal: options.signal }
  );

  return {
    title: result.title,
    description: result.description,
    sourceGenomes: [genomeA.id, genomeB.id],
    traitSources,
    noveltyScore: result.noveltyScore,
  };
}

// ---- Library Queries ----

/**
 * Get all genomes stored in the library.
 *
 * @param dir - Library directory (defaults to `~/.innovator/genome-library`).
 * @returns Array of all stored idea genomes.
 */
export function getAllGenomes(dir: string = DEFAULT_DIR): IdeaGenome[] {
  return loadLibrary(dir).genomes;
}

/**
 * Get a single genome by its unique ID.
 *
 * @param genomeId - The genome identifier to look up.
 * @param dir - Library directory (defaults to `~/.innovator/genome-library`).
 * @returns The matching genome, or `undefined` if not found.
 */
export function getGenome(genomeId: string, dir: string = DEFAULT_DIR): IdeaGenome | undefined {
  return loadLibrary(dir).genomes.find((g) => g.id === genomeId);
}

/**
 * Search genomes by keyword across titles, trait values, and trait keywords.
 *
 * @param keyword - Case-insensitive search term.
 * @param dir - Library directory (defaults to `~/.innovator/genome-library`).
 * @returns Array of genomes matching the keyword.
 */
export function searchGenomes(keyword: string, dir: string = DEFAULT_DIR): IdeaGenome[] {
  const normalized = keyword.toLowerCase();
  return loadLibrary(dir).genomes.filter(
    (g) =>
      g.ideaTitle.toLowerCase().includes(normalized) ||
      g.traits.some(
        (t) =>
          t.value.toLowerCase().includes(normalized) ||
          t.keywords.some((k) => k.toLowerCase().includes(normalized))
      )
  );
}

// ---- Formatting ----

/**
 * Format a genome as a human-readable Markdown table.
 *
 * @param genome - The idea genome to format.
 * @returns Markdown string with title, metadata, and a trait table.
 */
export function genomeToMarkdown(genome: IdeaGenome): string {
  const lines: string[] = [
    `# 🧬 Idea Genome: ${genome.ideaTitle}`,
    "",
    `**Sequenced:** ${genome.sequencedAt.split("T")[0]}`,
    genome.angleId ? `**Angle:** ${genome.angleId}` : "",
    "",
    "| Trait | Value | Confidence | Keywords |",
    "|-------|-------|------------|----------|",
  ];

  for (const trait of genome.traits) {
    lines.push(
      `| ${trait.type} | ${trait.value.slice(0, 80)} | ${Math.round(trait.confidence * 100)}% | ${trait.keywords.join(", ")} |`
    );
  }

  return lines.filter(Boolean).join("\n");
}
