/**
 * @module fingerprint
 *
 * Generate a unique innovation genome (fingerprint) for each idea encoding
 * novelty vector, domain blend, constraint profile, and feasibility signature.
 * Supports embedding-based cosine similarity matching and cross-session search.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for the novelty vector dimensions. */
export const NoveltyVectorSchema = z.object({
  technicalNovelty: z.number().min(0).max(1),
  marketNovelty: z.number().min(0).max(1),
  processNovelty: z.number().min(0).max(1),
  conceptualNovelty: z.number().min(0).max(1),
});

/** Schema for the domain blend descriptor. */
export const DomainBlendSchema = z.object({
  primaryDomain: z.string().max(200),
  secondaryDomains: z.array(z.string().max(200)).max(10),
  blendScore: z.number().min(0).max(1).describe("How cross-domain the idea is"),
});

/** Schema for the constraint profile. */
export const ConstraintProfileSchema = z.object({
  technicalConstraints: z.array(z.string().max(500)).max(10),
  resourceConstraints: z.array(z.string().max(500)).max(10),
  regulatoryConstraints: z.array(z.string().max(500)).max(10),
  constraintSeverity: z.number().min(0).max(1),
});

/** Schema for the feasibility signature. */
export const FeasibilitySignatureSchema = z.object({
  technicalReadiness: z.number().min(0).max(1),
  marketReadiness: z.number().min(0).max(1),
  resourceAvailability: z.number().min(0).max(1),
  timeToValue: z.enum(["immediate", "short-term", "medium-term", "long-term"]),
});

/** Schema for the complete idea fingerprint. */
export const IdeaFingerprintSchema = z.object({
  ideaTitle: z.string().max(500),
  hash: z.string().max(64).describe("Deterministic hash of the fingerprint"),
  noveltyVector: NoveltyVectorSchema,
  domainBlend: DomainBlendSchema,
  constraintProfile: ConstraintProfileSchema,
  feasibilitySignature: FeasibilitySignatureSchema,
  embedding: z.array(z.number()).max(128).describe("Numeric embedding vector"),
  tags: z.array(z.string().max(100)).max(20),
  createdAt: z.string(),
});

/** Schema for similarity match result. */
export const SimilarityMatchSchema = z.object({
  fingerprint: IdeaFingerprintSchema,
  similarity: z.number().min(0).max(1),
});

// ---- Types ----

export type NoveltyVector = z.infer<typeof NoveltyVectorSchema>;
export type DomainBlend = z.infer<typeof DomainBlendSchema>;
export type ConstraintProfile = z.infer<typeof ConstraintProfileSchema>;
export type FeasibilitySignature = z.infer<typeof FeasibilitySignatureSchema>;
export type IdeaFingerprint = z.infer<typeof IdeaFingerprintSchema>;
export type SimilarityMatch = z.infer<typeof SimilarityMatchSchema>;

// ---- In-memory fingerprint store ----

const fingerprintStore: Map<string, IdeaFingerprint> = new Map();

// ---- Utility functions ----

/**
 * Compute cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const minLen = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < minLen; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Generate a deterministic hash from fingerprint components.
 */
function generateHash(idea: InnovationIdea): string {
  const source = `${idea.title}:${idea.description}`.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ---- Prompt builder ----

function buildFingerprintPrompt(idea: InnovationIdea, investigation?: Investigation): string {
  const context = investigation
    ? `\nCONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}`
    : "";

  return `You are an innovation analyst specializing in idea classification and fingerprinting.

Analyze the following idea and generate a detailed innovation fingerprint.

${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL_IMPACT", idea.potentialImpact)}
${context}

Generate a fingerprint with:
1. **noveltyVector**: Rate each dimension 0-1 (technicalNovelty, marketNovelty, processNovelty, conceptualNovelty)
2. **domainBlend**: Identify primary domain, secondary domains, and cross-domain blend score (0-1)
3. **constraintProfile**: List technical, resource, and regulatory constraints with overall severity (0-1)
4. **feasibilitySignature**: Rate technicalReadiness, marketReadiness, resourceAvailability (0-1), and timeToValue
5. **embedding**: Generate a 32-dimensional numeric vector (values between -1 and 1) representing the idea's semantic position
6. **tags**: Up to 10 classification tags

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "noveltyVector": { "technicalNovelty": 0.8, "marketNovelty": 0.6, "processNovelty": 0.4, "conceptualNovelty": 0.9 },
  "domainBlend": { "primaryDomain": "...", "secondaryDomains": ["..."], "blendScore": 0.7 },
  "constraintProfile": { "technicalConstraints": ["..."], "resourceConstraints": ["..."], "regulatoryConstraints": ["..."], "constraintSeverity": 0.5 },
  "feasibilitySignature": { "technicalReadiness": 0.7, "marketReadiness": 0.6, "resourceAvailability": 0.5, "timeToValue": "medium-term" },
  "embedding": [0.1, -0.3, ...],
  "tags": ["tag1", "tag2"]
}`;
}

// ---- Core functions ----

/**
 * Generate a fingerprint for an innovation idea using AI analysis.
 */
export async function generateFingerprint(
  idea: InnovationIdea,
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<IdeaFingerprint> {
  const prompt = buildFingerprintPrompt(idea, investigation);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse fingerprint response as JSON: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const components = z
    .object({
      noveltyVector: NoveltyVectorSchema,
      domainBlend: DomainBlendSchema,
      constraintProfile: ConstraintProfileSchema,
      feasibilitySignature: FeasibilitySignatureSchema,
      embedding: z.array(z.number()).max(128),
      tags: z.array(z.string().max(100)).max(20),
    })
    .parse(parsed);

  const fingerprint: IdeaFingerprint = {
    ideaTitle: idea.title,
    hash: generateHash(idea),
    ...components,
    createdAt: new Date().toISOString(),
  };

  fingerprintStore.set(fingerprint.hash, fingerprint);
  return fingerprint;
}

/**
 * Find similar ideas using cosine similarity on embeddings.
 */
export function findSimilar(
  fingerprint: IdeaFingerprint,
  threshold: number = 0.7,
  maxResults: number = 10
): SimilarityMatch[] {
  if (threshold < 0 || threshold > 1) {
    throw new Error("Threshold must be between 0 and 1");
  }

  const matches: SimilarityMatch[] = [];
  for (const [hash, stored] of fingerprintStore) {
    if (hash === fingerprint.hash) continue;
    const similarity = cosineSimilarity(fingerprint.embedding, stored.embedding);
    if (similarity >= threshold) {
      matches.push({ fingerprint: stored, similarity });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, maxResults);
}

/**
 * Search fingerprints by tags, domain, or text query.
 */
export function searchFingerprints(query: {
  tags?: string[];
  domain?: string;
  minNovelty?: number;
  minFeasibility?: number;
}): IdeaFingerprint[] {
  const results: IdeaFingerprint[] = [];

  for (const fp of fingerprintStore.values()) {
    if (query.tags?.length && !query.tags.some((t) => fp.tags.includes(t))) continue;
    if (query.domain && fp.domainBlend.primaryDomain.toLowerCase() !== query.domain.toLowerCase()) {
      if (
        !fp.domainBlend.secondaryDomains.some(
          (d) => d.toLowerCase() === query.domain!.toLowerCase()
        )
      ) {
        continue;
      }
    }
    if (query.minNovelty !== undefined) {
      const avgNovelty =
        (fp.noveltyVector.technicalNovelty +
          fp.noveltyVector.marketNovelty +
          fp.noveltyVector.processNovelty +
          fp.noveltyVector.conceptualNovelty) /
        4;
      if (avgNovelty < query.minNovelty) continue;
    }
    if (query.minFeasibility !== undefined) {
      const avgFeasibility =
        (fp.feasibilitySignature.technicalReadiness +
          fp.feasibilitySignature.marketReadiness +
          fp.feasibilitySignature.resourceAvailability) /
        3;
      if (avgFeasibility < query.minFeasibility) continue;
    }
    results.push(fp);
  }

  return results;
}

/**
 * Store a fingerprint for cross-session retrieval.
 */
export function storeFingerprint(fingerprint: IdeaFingerprint): void {
  fingerprintStore.set(fingerprint.hash, fingerprint);
}

/**
 * Retrieve a fingerprint by hash.
 */
export function getFingerprint(hash: string): IdeaFingerprint | undefined {
  return fingerprintStore.get(hash);
}

/**
 * List all stored fingerprints.
 */
export function listFingerprints(): IdeaFingerprint[] {
  return Array.from(fingerprintStore.values());
}

/**
 * Clear all stored fingerprints.
 */
export function clearFingerprints(): void {
  fingerprintStore.clear();
}

/**
 * Compute the distance between two fingerprints across all dimensions.
 */
export function fingerprintDistance(a: IdeaFingerprint, b: IdeaFingerprint): number {
  const embeddingSim = cosineSimilarity(a.embedding, b.embedding);

  const noveltyDist =
    Math.abs(a.noveltyVector.technicalNovelty - b.noveltyVector.technicalNovelty) +
    Math.abs(a.noveltyVector.marketNovelty - b.noveltyVector.marketNovelty) +
    Math.abs(a.noveltyVector.processNovelty - b.noveltyVector.processNovelty) +
    Math.abs(a.noveltyVector.conceptualNovelty - b.noveltyVector.conceptualNovelty);

  const feasDist =
    Math.abs(
      a.feasibilitySignature.technicalReadiness - b.feasibilitySignature.technicalReadiness
    ) +
    Math.abs(a.feasibilitySignature.marketReadiness - b.feasibilitySignature.marketReadiness) +
    Math.abs(
      a.feasibilitySignature.resourceAvailability - b.feasibilitySignature.resourceAvailability
    );

  // Weighted composite: embedding similarity contributes most
  return embeddingSim * 0.5 + (1 - noveltyDist / 4) * 0.25 + (1 - feasDist / 3) * 0.25;
}
