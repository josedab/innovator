/**
 * @module combinatorial
 *
 * Morphological analysis engine that combines ideas across innovation angles
 * to discover emergent innovations at intersections.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult } from "../types.js";
import type {
  CombinatorialConfig,
  CombinatorialProgress,
  CombinatorialResult,
  CombinatorialIdea,
  PairwiseResult,
  AnglePair,
  MorphologicalCell,
} from "./types.js";

export {
  CombinatorialIdeaSchema,
  PairwiseResultSchema,
  CombinatorialResultSchema,
} from "./types.js";
export type {
  CombinatorialConfig,
  CombinatorialProgress,
  CombinatorialResult,
  CombinatorialIdea,
  PairwiseResult,
  AnglePair,
  MorphologicalCell,
} from "./types.js";

// ---- Prompt Builders ----

function buildPairwisePrompt(subject: string, resultA: AngleResult, resultB: AngleResult): string {
  const ideasA = resultA.ideas.map((i) => ({ title: i.title, description: i.description }));
  const ideasB = resultB.ideas.map((i) => ({ title: i.title, description: i.description }));

  return `You are an innovation synthesis engine performing morphological analysis.

${wrapUserInput("SUBJECT", subject)}

ANGLE A: ${resultA.angleName} (${resultA.angleId})
IDEAS FROM A:
"""
${sanitizeLlmOutput(JSON.stringify(ideasA, null, 2))}
"""

ANGLE B: ${resultB.angleName} (${resultB.angleId})
IDEAS FROM B:
"""
${sanitizeLlmOutput(JSON.stringify(ideasB, null, 2))}
"""

Find emergent innovations that arise ONLY from combining these two perspectives.
Look for synergies, complementary aspects, and novel combinations that neither angle would produce alone.

Respond with JSON only:
{
  "ideas": [
    {
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "implementationHint": "...",
      "synergyScore": 0-100,
      "noveltyBoost": 0-100,
      "emergentProperties": ["property1", "property2"]
    }
  ],
  "synergyRating": 0-100,
  "reasoning": "Why these angles combine well (or not)"
}`;
}

function buildHigherOrderPrompt(subject: string, topPairwiseIdeas: CombinatorialIdea[]): string {
  const summaries = topPairwiseIdeas.map((i) => ({
    title: i.title,
    sourceAngles: i.sourceAngles,
    synergyScore: i.synergyScore,
  }));

  return `You are synthesizing higher-order combinations from pairwise innovation results.

${wrapUserInput("SUBJECT", subject)}

TOP PAIRWISE IDEAS:
"""
${sanitizeLlmOutput(JSON.stringify(summaries, null, 2))}
"""

Find 3-5 META-INNOVATIONS that combine 3+ of the pairwise results into even more powerful innovations.

Respond with JSON only:
{
  "ideas": [
    {
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "implementationHint": "...",
      "sourceAngles": ["angle1", "angle2", "angle3"],
      "synergyScore": 0-100,
      "noveltyBoost": 0-100,
      "emergentProperties": ["property1"]
    }
  ]
}`;
}

const PairwiseResponseSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
      potentialImpact: z.string().max(2000),
      implementationHint: z.string().max(2000),
      synergyScore: z.number().min(0).max(100),
      noveltyBoost: z.number().min(0).max(100),
      emergentProperties: z.array(z.string().max(500)).max(10).default([]),
    })
  ),
  synergyRating: z.number().min(0).max(100),
  reasoning: z.string().max(2000),
});

const HigherOrderResponseSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
      potentialImpact: z.string().max(2000),
      implementationHint: z.string().max(2000),
      sourceAngles: z.array(z.string().max(100)).min(2),
      synergyScore: z.number().min(0).max(100),
      noveltyBoost: z.number().min(0).max(100),
      emergentProperties: z.array(z.string().max(500)).max(10).default([]),
    })
  ),
});

// ---- Core Functions ----

/** Generate all unique pairs from angle results. */
export function generateAnglePairs(angleResults: AngleResult[]): AnglePair[] {
  const pairs: AnglePair[] = [];
  for (let i = 0; i < angleResults.length; i++) {
    for (let j = i + 1; j < angleResults.length; j++) {
      pairs.push({
        angleA: angleResults[i].angleId,
        angleB: angleResults[j].angleId,
      });
    }
  }
  return pairs;
}

/** Build a morphological matrix from angle results. */
export function buildMorphologicalMatrix(angleResults: AngleResult[]): MorphologicalCell[] {
  const dimensions = [
    "problem-space",
    "solution-approach",
    "target-user",
    "technology",
    "business-model",
  ];
  return angleResults.map((result) => ({
    angleId: result.angleId,
    dimension: dimensions[Math.floor(Math.random() * dimensions.length)],
    values: result.ideas.slice(0, 5).map((i) => i.title),
  }));
}

/**
 * Run combinatorial synthesis on existing angle results.
 *
 * @param subject - The innovation subject
 * @param angleResults - Scored angle results from previous pipeline run
 * @param onProgress - Progress callback
 * @param config - Synthesis configuration
 * @returns Full combinatorial result with pairwise and higher-order ideas
 */
export async function runCombinatorialSynthesis(
  subject: string,
  angleResults: AngleResult[],
  onProgress?: (progress: CombinatorialProgress) => void,
  config: CombinatorialConfig = {}
): Promise<CombinatorialResult> {
  if (angleResults.length < 2) {
    throw new Error("Need at least 2 angle results for combinatorial synthesis");
  }

  const includeHigherOrder = config.includeHigherOrder ?? true;
  const minSynergy = config.minSynergyThreshold ?? 30;
  const model = config.model;
  const signal = config.signal;

  const allPairs = generateAnglePairs(angleResults);
  const pairs = config.maxPairs ? allPairs.slice(0, config.maxPairs) : allPairs;

  const pairwiseResults: PairwiseResult[] = [];
  const allCombinatorialIdeas: CombinatorialIdea[] = [];

  // Phase 1: Pairwise combinations
  onProgress?.({
    stage: "pairing",
    completedPairs: 0,
    totalPairs: pairs.length,
    ideasGenerated: 0,
  });

  for (let i = 0; i < pairs.length; i++) {
    if (signal?.aborted) break;

    const pair = pairs[i];
    const resultA = angleResults.find((r) => r.angleId === pair.angleA);
    const resultB = angleResults.find((r) => r.angleId === pair.angleB);
    if (!resultA || !resultB) continue;

    onProgress?.({
      stage: "combining",
      completedPairs: i,
      totalPairs: pairs.length,
      ideasGenerated: allCombinatorialIdeas.length,
      currentPair: pair,
    });

    try {
      const prompt = buildPairwisePrompt(subject, resultA, resultB);
      const raw = await withRetry(
        async () => {
          const text = await generateText({ prompt, model, signal });
          return text;
        },
        { signal }
      );

      const jsonStr = extractJson(raw);
      const parsed = PairwiseResponseSchema.parse(JSON.parse(jsonStr));

      const ideas: CombinatorialIdea[] = parsed.ideas.map((idea) => ({
        id: randomUUID(),
        ...idea,
        sourceAngles: [pair.angleA, pair.angleB],
      }));

      pairwiseResults.push({
        pair,
        ideas,
        synergyRating: parsed.synergyRating,
        reasoning: parsed.reasoning,
      });

      allCombinatorialIdeas.push(...ideas);
    } catch {
      // Continue with remaining pairs on failure
    }
  }

  // Phase 2: Higher-order combinations (optional)
  let higherOrderIdeas: CombinatorialIdea[] = [];
  if (includeHigherOrder && allCombinatorialIdeas.length >= 3) {
    onProgress?.({
      stage: "higher-order",
      completedPairs: pairs.length,
      totalPairs: pairs.length,
      ideasGenerated: allCombinatorialIdeas.length,
    });

    const topIdeas = [...allCombinatorialIdeas]
      .sort((a, b) => b.synergyScore - a.synergyScore)
      .slice(0, 10);

    try {
      const prompt = buildHigherOrderPrompt(subject, topIdeas);
      const raw = await withRetry(
        async () => {
          const text = await generateText({ prompt, model, signal });
          return text;
        },
        { signal }
      );

      const jsonStr = extractJson(raw);
      const parsed = HigherOrderResponseSchema.parse(JSON.parse(jsonStr));
      higherOrderIdeas = parsed.ideas.map((idea) => ({
        id: randomUUID(),
        ...idea,
      }));
    } catch {
      // Higher-order synthesis is optional
    }
  }

  // Phase 3: Rank top combinations
  onProgress?.({
    stage: "ranking",
    completedPairs: pairs.length,
    totalPairs: pairs.length,
    ideasGenerated: allCombinatorialIdeas.length + higherOrderIdeas.length,
  });

  const allIdeas = [...allCombinatorialIdeas, ...higherOrderIdeas];
  const topCombinations = [...allIdeas]
    .filter((i) => i.synergyScore >= minSynergy)
    .sort((a, b) => b.synergyScore + b.noveltyBoost - (a.synergyScore + a.noveltyBoost))
    .slice(0, 10);

  const result: CombinatorialResult = {
    subject,
    pairwiseResults,
    higherOrderIdeas,
    morphologicalMatrix: buildMorphologicalMatrix(angleResults),
    topCombinations,
    totalCombinationsExplored: pairs.length,
    coveragePercentage: Math.round((pairs.length / allPairs.length) * 100),
    createdAt: new Date().toISOString(),
  };

  onProgress?.({
    stage: "complete",
    completedPairs: pairs.length,
    totalPairs: pairs.length,
    ideasGenerated: allIdeas.length,
  });

  return result;
}

/** Format combinatorial results as markdown. */
export function combinatorialToMarkdown(result: CombinatorialResult): string {
  const lines: string[] = [
    `# Combinatorial Synthesis: ${result.subject}`,
    "",
    `**Pairs explored:** ${result.totalCombinationsExplored}`,
    `**Coverage:** ${result.coveragePercentage}%`,
    `**Ideas generated:** ${result.pairwiseResults.reduce((s, p) => s + p.ideas.length, 0) + result.higherOrderIdeas.length}`,
    "",
    "## Top Combinations",
    "",
  ];

  for (const idea of result.topCombinations) {
    lines.push(`### ${idea.title}`);
    lines.push(`**Angles:** ${idea.sourceAngles.join(" × ")}`);
    lines.push(
      `**Synergy:** ${idea.synergyScore}/100 | **Novelty Boost:** ${idea.noveltyBoost}/100`
    );
    lines.push(idea.description);
    if (idea.emergentProperties.length > 0) {
      lines.push(`**Emergent:** ${idea.emergentProperties.join(", ")}`);
    }
    lines.push("");
  }

  if (result.higherOrderIdeas.length > 0) {
    lines.push("## Higher-Order Innovations", "");
    for (const idea of result.higherOrderIdeas) {
      lines.push(
        `- **${idea.title}** (${idea.sourceAngles.join(" + ")}): ${idea.description.slice(0, 200)}...`
      );
    }
  }

  return lines.join("\n");
}
