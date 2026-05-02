/**
 * @module scoring
 *
 * AI-powered scoring of generated ideas across feasibility, impact, novelty,
 * and time-to-implement dimensions. Produces structured IdeaScore objects
 * that can be visualized in a priority matrix.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, Investigation } from "../types.js";

/** Zod schema for a scored idea. */
export const IdeaScoreSchema = z.object({
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100),
  feasibility: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  timeToImplement: z.enum(["days", "weeks", "months", "quarters", "years"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(2000),
});

/** Zod schema for the full scoring response. */
export const ScoringResultSchema = z.object({
  scores: z.array(IdeaScoreSchema).max(100),
});

/** A scored idea with multi-dimensional ratings. */
export type IdeaScore = z.infer<typeof IdeaScoreSchema>;

/** Full scoring result containing all idea scores. */
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/** Time-to-implement ordinal mapping for numeric comparison. */
export const TIME_TO_IMPLEMENT_ORDER: Record<IdeaScore["timeToImplement"], number> = {
  days: 1,
  weeks: 2,
  months: 3,
  quarters: 4,
  years: 5,
};

/**
 * Build the scoring prompt for the LLM.
 */
function buildScoringPrompt(
  subject: string,
  investigation: Investigation | undefined,
  angleResults: AngleResult[]
): string {
  const ideasSummary = angleResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({
      angleId: ar.angleId,
      angleName: ar.angleName,
      title: idea.title,
      description: idea.description,
      potentialImpact: idea.potentialImpact,
      implementationHint: idea.implementationHint,
    }))
  );

  const context = investigation
    ? `\nINVESTIGATION CONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}\nOpportunities: ${investigation.opportunities.join("; ")}`
    : "";

  return `You are an expert innovation evaluator. Score each idea across multiple dimensions.

${wrapUserInput("SUBJECT", subject)}
${context}

IDEAS TO SCORE:
"""
${sanitizeLlmOutput(JSON.stringify(ideasSummary, null, 2))}
"""

Score EVERY idea listed above. For each idea, evaluate:
- **feasibility** (1-10): How realistic is implementation given current technology and resources?
- **impact** (1-10): How significant would the positive effect be if implemented?
- **novelty** (1-10): How original and non-obvious is this idea?
- **timeToImplement**: Estimated time: "days", "weeks", "months", "quarters", or "years"
- **confidence** (0-1): How confident are you in this assessment?
- **rationale**: Brief explanation of the scores

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "scores": [
    {
      "ideaTitle": "Exact title of the idea",
      "angleId": "angle-id",
      "feasibility": 7,
      "impact": 9,
      "novelty": 6,
      "timeToImplement": "months",
      "confidence": 0.8,
      "rationale": "Brief explanation"
    }
  ]
}`;
}

/**
 * Score all ideas from angle results using AI evaluation.
 *
 * @param subject - The innovation subject
 * @param angleResults - Array of angle results containing ideas to score
 * @param investigation - Optional investigation context for better scoring
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns A ScoringResult with scores for each idea
 */
export async function scoreIdeas(
  subject: string,
  angleResults: AngleResult[],
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<ScoringResult> {
  if (angleResults.length === 0) {
    return { scores: [] };
  }

  const prompt = buildScoringPrompt(subject, investigation, angleResults);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse scoring response as JSON: ${jsonStr.slice(0, 200)}`);
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

  return ScoringResultSchema.parse(parsed);
}

/**
 * Compute a composite priority score from individual dimensions.
 * Higher is better. Weighs impact most heavily.
 */
export function computePriorityScore(score: IdeaScore): number {
  return (
    score.impact * 0.35 +
    score.feasibility * 0.3 +
    score.novelty * 0.2 +
    (6 - TIME_TO_IMPLEMENT_ORDER[score.timeToImplement]) * 0.15 * 2
  );
}

/**
 * Classify an idea into a priority quadrant based on feasibility and impact.
 */
export function getQuadrant(
  score: IdeaScore
): "quick-wins" | "strategic-bets" | "low-hanging-fruit" | "reconsider" {
  const highFeasibility = score.feasibility >= 6;
  const highImpact = score.impact >= 6;
  if (highFeasibility && highImpact) return "quick-wins";
  if (!highFeasibility && highImpact) return "strategic-bets";
  if (highFeasibility && !highImpact) return "low-hanging-fruit";
  return "reconsider";
}

/**
 * Rank scored ideas by composite priority score (descending).
 */
export function rankIdeas(scores: IdeaScore[]): IdeaScore[] {
  return [...scores].sort((a, b) => computePriorityScore(b) - computePriorityScore(a));
}
