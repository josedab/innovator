/**
 * @module rubric
 *
 * Custom Scoring Rubric Builder — define custom evaluation dimensions beyond
 * the built-in 4-axis scoring. Create reusable rubric templates with custom
 * weights for domain-specific criteria (regulatory risk, brand alignment, etc.).
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, Investigation } from "../types.js";

// ---- Schemas ----

/** A custom scoring dimension. */
export const RubricDimensionSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  weight: z.number().min(0).max(1),
  minScore: z.number().default(1),
  maxScore: z.number().default(10),
  scoringGuidelines: z.string().max(2000).optional(),
});

/** A reusable scoring rubric template. */
export const ScoringRubricSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  dimensions: z.array(RubricDimensionSchema).min(1).max(20),
  createdAt: z.number(),
  updatedAt: z.number(),
  author: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(10).default([]),
});

/** Score for a single dimension. */
export const DimensionScoreSchema = z.object({
  dimensionId: z.string().max(100),
  dimensionName: z.string().max(200),
  score: z.number().min(0).max(10),
  rationale: z.string().max(2000),
});

/** Complete rubric score for an idea. */
export const RubricScoreSchema = z.object({
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100),
  dimensionScores: z.array(DimensionScoreSchema).max(20),
  compositeScore: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(2000),
});

/** Full rubric scoring result. */
export const RubricScoringResultSchema = z.object({
  rubricId: z.string().max(100),
  rubricName: z.string().max(200),
  scores: z.array(RubricScoreSchema).max(100),
});

// ---- Types ----

export type RubricDimension = z.infer<typeof RubricDimensionSchema>;
export type ScoringRubric = z.infer<typeof ScoringRubricSchema>;
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;
export type RubricScore = z.infer<typeof RubricScoreSchema>;
export type RubricScoringResult = z.infer<typeof RubricScoringResultSchema>;

// ---- Built-in Templates ----

export const BUILT_IN_RUBRICS: ScoringRubric[] = [
  {
    id: "regulatory-risk",
    name: "Regulatory Risk Assessment",
    description: "Evaluate ideas through regulatory and compliance lenses",
    dimensions: [
      { id: "compliance-burden", name: "Compliance Burden", description: "Level of regulatory compliance required", weight: 0.3, minScore: 1, maxScore: 10 },
      { id: "regulatory-risk", name: "Regulatory Risk", description: "Risk of regulatory pushback or delays", weight: 0.3, minScore: 1, maxScore: 10 },
      { id: "data-privacy", name: "Data Privacy Impact", description: "Impact on user data and privacy regulations", weight: 0.2, minScore: 1, maxScore: 10 },
      { id: "market-access", name: "Market Access", description: "Regulatory barriers to market entry", weight: 0.2, minScore: 1, maxScore: 10 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ["regulatory", "compliance"],
  },
  {
    id: "sustainability-impact",
    name: "Sustainability Impact",
    description: "Evaluate ideas through environmental and social impact lenses",
    dimensions: [
      { id: "environmental", name: "Environmental Impact", description: "Net effect on the environment", weight: 0.3, minScore: 1, maxScore: 10 },
      { id: "social", name: "Social Impact", description: "Positive social outcomes", weight: 0.3, minScore: 1, maxScore: 10 },
      { id: "circular-economy", name: "Circular Economy Fit", description: "Alignment with circular economy principles", weight: 0.2, minScore: 1, maxScore: 10 },
      { id: "long-term-viability", name: "Long-term Viability", description: "Sustainability of the approach over time", weight: 0.2, minScore: 1, maxScore: 10 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ["sustainability", "esg"],
  },
  {
    id: "brand-alignment",
    name: "Brand Alignment",
    description: "Evaluate ideas for brand consistency and strategic fit",
    dimensions: [
      { id: "brand-fit", name: "Brand Fit", description: "Alignment with brand values and positioning", weight: 0.3, minScore: 1, maxScore: 10 },
      { id: "audience-resonance", name: "Audience Resonance", description: "Appeal to target audience", weight: 0.3, minScore: 1, maxScore: 10 },
      { id: "differentiation", name: "Differentiation", description: "How well it differentiates from competitors", weight: 0.2, minScore: 1, maxScore: 10 },
      { id: "story-potential", name: "Story Potential", description: "Narrative and PR potential", weight: 0.2, minScore: 1, maxScore: 10 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ["brand", "marketing"],
  },
];

// ---- In-Memory Store ----

const rubricStore = new Map<string, ScoringRubric>();

// Initialize with built-in rubrics
for (const rubric of BUILT_IN_RUBRICS) {
  rubricStore.set(rubric.id, rubric);
}

// ---- Core Functions ----

/**
 * Create a custom scoring rubric.
 */
export function createRubric(
  rubric: Omit<ScoringRubric, "createdAt" | "updatedAt">
): ScoringRubric {
  // Validate weights sum to ~1.0
  const totalWeight = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight.toFixed(2)}`);
  }

  const now = Date.now();
  const stored: ScoringRubric = { ...rubric, createdAt: now, updatedAt: now };
  rubricStore.set(stored.id, stored);
  return stored;
}

/**
 * Get a rubric by ID.
 */
export function getRubric(id: string): ScoringRubric | undefined {
  return rubricStore.get(id);
}

/**
 * List all available rubrics.
 */
export function listRubrics(): ScoringRubric[] {
  return [...rubricStore.values()];
}

/**
 * Update an existing rubric.
 */
export function updateRubric(
  id: string,
  updates: Partial<Pick<ScoringRubric, "name" | "description" | "dimensions" | "tags">>
): ScoringRubric | undefined {
  const existing = rubricStore.get(id);
  if (!existing) return undefined;

  if (updates.dimensions) {
    const totalWeight = updates.dimensions.reduce((sum, d) => sum + d.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight.toFixed(2)}`);
    }
  }

  const updated: ScoringRubric = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
  rubricStore.set(id, updated);
  return updated;
}

/**
 * Delete a rubric.
 */
export function deleteRubric(id: string): boolean {
  return rubricStore.delete(id);
}

/**
 * Score ideas using a custom rubric.
 *
 * @param rubricId - The rubric to use for scoring
 * @param subject - The innovation subject
 * @param angleResults - Angle results containing ideas to score
 * @param investigation - Optional investigation context
 * @param model - Optional LLM model
 * @param signal - Optional AbortSignal
 */
export async function scoreWithRubric(
  rubricId: string,
  subject: string,
  angleResults: AngleResult[],
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<RubricScoringResult> {
  const rubric = rubricStore.get(rubricId);
  if (!rubric) {
    throw new Error(`Rubric not found: ${rubricId}`);
  }

  if (angleResults.length === 0) {
    return { rubricId, rubricName: rubric.name, scores: [] };
  }

  const ideasSummary = angleResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({
      angleId: ar.angleId,
      title: idea.title,
      description: idea.description,
      potentialImpact: idea.potentialImpact,
      implementationHint: idea.implementationHint,
    }))
  );

  const dimensionDescriptions = rubric.dimensions.map((d) =>
    `- **${d.name}** (id: "${d.id}", weight: ${d.weight}): ${d.description}${d.scoringGuidelines ? ` Guidelines: ${d.scoringGuidelines}` : ""}`
  ).join("\n");

  const context = investigation
    ? `\nCONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}`
    : "";

  const prompt = `You are an expert evaluator scoring ideas using a custom rubric.

${wrapUserInput("SUBJECT", subject)}
${context}

RUBRIC: "${rubric.name}" — ${rubric.description}

DIMENSIONS:
${dimensionDescriptions}

IDEAS TO SCORE:
"""
${sanitizeLlmOutput(JSON.stringify(ideasSummary, null, 2))}
"""

Score EVERY idea on EVERY dimension. For each idea, compute a weighted composite score.

Return valid JSON only:
{
  "scores": [
    {
      "ideaTitle": "Exact title",
      "angleId": "angle-id",
      "dimensionScores": [
        { "dimensionId": "dim-id", "dimensionName": "Dimension Name", "score": 7, "rationale": "Why this score" }
      ],
      "compositeScore": 7.5,
      "confidence": 0.8,
      "summary": "Overall assessment"
    }
  ]
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse rubric scores: ${jsonStr.slice(0, 200)}`);
      }
    },
    { signal, isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse") }
  );

  const result = z.object({ scores: z.array(RubricScoreSchema).max(100) }).parse(parsed);
  return { rubricId, rubricName: rubric.name, ...result };
}

/**
 * Clear all rubrics (for testing).
 */
export function clearRubrics(): void {
  rubricStore.clear();
  for (const rubric of BUILT_IN_RUBRICS) {
    rubricStore.set(rubric.id, rubric);
  }
}
