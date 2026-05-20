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
import { sanitizeLlmOutput, sanitizeUserInput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, Investigation } from "../types.js";
import { LlmParseError } from "../errors.js";

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
 * Build the LLM prompt for scoring ideas across feasibility, impact, novelty,
 * and time-to-implement dimensions.
 *
 * @param subject - The innovation subject being scored
 * @param investigation - Optional investigation context for more informed scoring
 * @param angleResults - Array of angle results containing the ideas to score
 * @returns A formatted prompt string ready to send to the LLM
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
    ? `\nINVESTIGATION CONTEXT:\nSummary: ${sanitizeUserInput(investigation.summary)}\nChallenges: ${investigation.challenges.map((c) => sanitizeUserInput(c)).join("; ")}\nOpportunities: ${investigation.opportunities.map((o) => sanitizeUserInput(o)).join("; ")}`
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
      const jsonStr = extractJson(sanitizeLlmOutput(raw));
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse scoring response as JSON: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    { signal }
  );

  return ScoringResultSchema.parse(parsed);
}

/**
 * Compute a composite priority score from individual scoring dimensions.
 *
 * The score weights impact most heavily (35%), followed by feasibility (30%),
 * novelty (20%), and speed of implementation (15%). Higher is better.
 *
 * @param score - The {@link IdeaScore} to compute the priority for
 * @returns A composite numeric score (higher = higher priority)
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
 *
 * - **quick-wins**: high feasibility + high impact
 * - **strategic-bets**: low feasibility + high impact
 * - **low-hanging-fruit**: high feasibility + low impact
 * - **reconsider**: low feasibility + low impact
 *
 * The threshold between high/low is a score of 6.
 *
 * @param score - The {@link IdeaScore} to classify
 * @returns One of `"quick-wins"`, `"strategic-bets"`, `"low-hanging-fruit"`, or `"reconsider"`
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
 * Rank scored ideas by composite priority score in descending order.
 *
 * Uses {@link computePriorityScore} to compute each idea's composite score.
 *
 * @param scores - Array of {@link IdeaScore} to rank
 * @returns A new sorted array (does not mutate the input)
 */
export function rankIdeas(scores: IdeaScore[]): IdeaScore[] {
  return [...scores].sort((a, b) => computePriorityScore(b) - computePriorityScore(a));
}

/** Custom weights for priority score computation. All weights should sum to ~1.0. */
export interface PriorityWeights {
  impact?: number;
  feasibility?: number;
  novelty?: number;
  speed?: number;
}

/**
 * Compute a composite priority score with custom weights.
 * Falls back to default weights (impact: 0.35, feasibility: 0.3, novelty: 0.2, speed: 0.15).
 */
export function computeWeightedPriorityScore(score: IdeaScore, weights?: PriorityWeights): number {
  const w = {
    impact: weights?.impact ?? 0.35,
    feasibility: weights?.feasibility ?? 0.3,
    novelty: weights?.novelty ?? 0.2,
    speed: weights?.speed ?? 0.15,
  };
  return (
    score.impact * w.impact +
    score.feasibility * w.feasibility +
    score.novelty * w.novelty +
    (6 - TIME_TO_IMPLEMENT_ORDER[score.timeToImplement]) * w.speed * 2
  );
}

/** Quadrant type for filtering. */
export type Quadrant = "quick-wins" | "strategic-bets" | "low-hanging-fruit" | "reconsider";

/** Filter scored ideas to only those in the specified quadrant(s). */
export function filterIdeasByQuadrant(scores: IdeaScore[], quadrants: Quadrant[]): IdeaScore[] {
  const allowed = new Set(quadrants);
  return scores.filter((s) => allowed.has(getQuadrant(s)));
}

/** Get the top N ideas sorted by a single dimension (descending). */
export function getTopByDimension(
  scores: IdeaScore[],
  dimension: "feasibility" | "impact" | "novelty",
  limit = 5
): IdeaScore[] {
  return [...scores].sort((a, b) => b[dimension] - a[dimension]).slice(0, limit);
}

/** Summary statistics for a set of scored ideas. */
export interface IdeaSummaryStats {
  total: number;
  averageFeasibility: number;
  averageImpact: number;
  averageNovelty: number;
  quadrantCounts: Record<Quadrant, number>;
  topPriorityTitle: string | undefined;
}

/** Compute summary statistics across a set of scored ideas. */
export function getIdeaSummaryStats(scores: IdeaScore[]): IdeaSummaryStats {
  if (scores.length === 0) {
    return {
      total: 0,
      averageFeasibility: 0,
      averageImpact: 0,
      averageNovelty: 0,
      quadrantCounts: {
        "quick-wins": 0,
        "strategic-bets": 0,
        "low-hanging-fruit": 0,
        reconsider: 0,
      },
      topPriorityTitle: undefined,
    };
  }

  const quadrantCounts: Record<Quadrant, number> = {
    "quick-wins": 0,
    "strategic-bets": 0,
    "low-hanging-fruit": 0,
    reconsider: 0,
  };

  let totalFeasibility = 0;
  let totalImpact = 0;
  let totalNovelty = 0;

  for (const s of scores) {
    totalFeasibility += s.feasibility;
    totalImpact += s.impact;
    totalNovelty += s.novelty;
    quadrantCounts[getQuadrant(s)]++;
  }

  const ranked = rankIdeas(scores);

  return {
    total: scores.length,
    averageFeasibility: Math.round((totalFeasibility / scores.length) * 100) / 100,
    averageImpact: Math.round((totalImpact / scores.length) * 100) / 100,
    averageNovelty: Math.round((totalNovelty / scores.length) * 100) / 100,
    quadrantCounts,
    topPriorityTitle: ranked[0]?.ideaTitle,
  };
}

// ---- Configurable Multi-Dimensional Scoring Engine ----

export const ScoringDimensionSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  weight: z.number().min(0).max(1),
  minScore: z.number().default(0),
  maxScore: z.number().default(10),
});

export const ScoringEngineConfigSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  dimensions: z.array(ScoringDimensionSchema).min(1).max(20),
  qualityGates: z
    .array(
      z.object({
        type: z.enum(["min-score", "min-ideas", "min-dimensions", "max-risk"]),
        dimension: z.string().max(100).optional(),
        threshold: z.number(),
        action: z.enum(["warn", "block", "flag"]),
        message: z.string().max(500),
      })
    )
    .max(20)
    .default([]),
  calibration: z
    .object({
      enabled: z.boolean().default(false),
      feedbackWeight: z.number().min(0).max(1).default(0.3),
      minCalibrationSamples: z.number().default(5),
    })
    .default({}),
});

export const MultiDimensionalScoreSchema = z.object({
  ideaTitle: z.string().max(500),
  dimensions: z.array(
    z.object({
      dimensionId: z.string().max(100),
      score: z.number().min(0).max(10),
      rationale: z.string().max(2000),
    })
  ),
  compositeScore: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  gateResults: z.array(
    z.object({
      gate: z.string().max(500),
      passed: z.boolean(),
      action: z.enum(["warn", "block", "flag"]),
      message: z.string().max(500),
    })
  ),
  passedAllGates: z.boolean(),
});

export type ScoringDimension = z.infer<typeof ScoringDimensionSchema>;
export type ScoringEngineConfig = z.infer<typeof ScoringEngineConfigSchema>;
export type MultiDimensionalScore = z.infer<typeof MultiDimensionalScoreSchema>;

// Default dimensions covering feasibility, originality, market fit, technical complexity, strategic alignment
export const DEFAULT_SCORING_DIMENSIONS: ScoringDimension[] = [
  {
    id: "feasibility",
    name: "Feasibility",
    description: "How realistic is implementation given current technology and resources?",
    weight: 0.2,
    minScore: 0,
    maxScore: 10,
  },
  {
    id: "originality",
    name: "Originality",
    description: "How original and non-obvious is this idea compared to existing solutions?",
    weight: 0.2,
    minScore: 0,
    maxScore: 10,
  },
  {
    id: "market-fit",
    name: "Market Fit",
    description: "How well does this address real market needs and user pain points?",
    weight: 0.25,
    minScore: 0,
    maxScore: 10,
  },
  {
    id: "technical-complexity",
    name: "Technical Complexity",
    description: "Inverse complexity — higher score means simpler to implement",
    weight: 0.15,
    minScore: 0,
    maxScore: 10,
  },
  {
    id: "strategic-alignment",
    name: "Strategic Alignment",
    description: "How well does this align with long-term strategy and vision?",
    weight: 0.2,
    minScore: 0,
    maxScore: 10,
  },
];

// ---- Calibration Store (user feedback adjustments) ----

const MAX_CALIBRATION_ENTRIES_PER_KEY = 500;
const calibrationFeedback = new Map<string, Array<{ dimensionId: string; scoreDelta: number }>>();

/** Record user calibration feedback for scoring adjustments. */
export function recordCalibrationFeedback(
  configId: string,
  ideaTitle: string,
  dimensionId: string,
  userScore: number,
  llmScore: number
): void {
  const key = `${configId}:${dimensionId}`;
  const existing = calibrationFeedback.get(key) ?? [];
  existing.push({ dimensionId, scoreDelta: userScore - llmScore });
  // Keep only the most recent entries to prevent unbounded growth
  if (existing.length > MAX_CALIBRATION_ENTRIES_PER_KEY) {
    existing.splice(0, existing.length - MAX_CALIBRATION_ENTRIES_PER_KEY);
  }
  calibrationFeedback.set(key, existing);
}

/** Get calibration adjustment for a dimension based on accumulated feedback. */
function getCalibrationAdjustment(
  configId: string,
  dimensionId: string,
  feedbackWeight: number
): number {
  const key = `${configId}:${dimensionId}`;
  const feedback = calibrationFeedback.get(key);
  if (!feedback || feedback.length === 0) return 0;

  const avgDelta = feedback.reduce((s, f) => s + f.scoreDelta, 0) / feedback.length;
  return avgDelta * feedbackWeight;
}

/**
 * Score ideas using a configurable multi-dimensional scoring engine.
 * Supports LLM-as-judge with calibration from user feedback.
 */
export async function scoreWithEngine(
  subject: string,
  ideas: Array<{ title: string; description: string }>,
  config: ScoringEngineConfig,
  model?: string,
  signal?: AbortSignal
): Promise<MultiDimensionalScore[]> {
  if (ideas.length === 0) return [];

  const dimensionDescriptions = config.dimensions
    .map(
      (d) =>
        `- **${d.name}** (${d.id}): ${d.description} [${d.minScore}-${d.maxScore}, weight: ${d.weight}]`
    )
    .join("\n");

  const prompt = `You are an expert innovation evaluator using a configurable scoring engine.

${wrapUserInput("SUBJECT", subject)}

SCORING DIMENSIONS:
${dimensionDescriptions}

IDEAS TO SCORE:
${sanitizeLlmOutput(
  JSON.stringify(
    ideas.map((i) => ({ title: i.title, description: i.description.slice(0, 300) })),
    null,
    2
  )
)}

Score EVERY idea on EVERY dimension. Be calibrated — use the full scale.

Respond with valid JSON only:
{
  "scores": [
    {
      "ideaTitle": "Title",
      "dimensions": [
        { "dimensionId": "feasibility", "score": 7.5, "rationale": "Why" }
      ],
      "confidence": 0.85
    }
  ]
}`;

  let rawScores: Array<{
    ideaTitle: string;
    dimensions: Array<{ dimensionId: string; score: number; rationale: string }>;
    confidence: number;
  }>;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(sanitizeLlmOutput(result));
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { scores: typeof rawScores };
    rawScores = parsed.scores;
  } catch (err) {
    // Fallback: generate uniform default scores when LLM is unavailable.
    // Confidence is set very low (0.1) to clearly signal these are defaults, not LLM-scored.
    const reason = err instanceof Error ? err.message : "Unknown error";
    rawScores = ideas.map((idea) => ({
      ideaTitle: idea.title,
      dimensions: config.dimensions.map((d) => ({
        dimensionId: d.id,
        score: 5,
        rationale: `Scoring unavailable (${reason}) — using default`,
      })),
      confidence: 0.1,
    }));
  }

  // Build dimension lookup map once (avoids repeated O(n) finds per idea)
  const dimensionMap = new Map(config.dimensions.map((d) => [d.id, d]));

  // Apply calibration and compute composite scores
  return rawScores.map((rawScore) => {
    const calibratedDimensions = rawScore.dimensions.map((dim) => {
      const adjustment = config.calibration.enabled
        ? getCalibrationAdjustment(config.id, dim.dimensionId, config.calibration.feedbackWeight)
        : 0;

      const dimension = dimensionMap.get(dim.dimensionId);
      const maxScore = dimension?.maxScore ?? 10;
      const minScore = dimension?.minScore ?? 0;

      return {
        ...dim,
        score: Math.max(minScore, Math.min(maxScore, dim.score + adjustment)),
      };
    });

    // Weighted composite score
    let compositeScore = 0;
    let totalWeight = 0;
    for (const dim of calibratedDimensions) {
      const dimension = dimensionMap.get(dim.dimensionId);
      if (dimension) {
        compositeScore += dim.score * dimension.weight;
        totalWeight += dimension.weight;
      }
    }
    compositeScore = totalWeight > 0 ? compositeScore / totalWeight : 0;

    // Evaluate quality gates
    const gateResults = config.qualityGates.map((gate) => {
      let passed = true;

      switch (gate.type) {
        case "min-score": {
          if (gate.dimension) {
            const dim = calibratedDimensions.find((d) => d.dimensionId === gate.dimension);
            passed = (dim?.score ?? 0) >= gate.threshold;
          } else {
            passed = compositeScore >= gate.threshold;
          }
          break;
        }
        case "min-dimensions": {
          // Count dimensions scoring above the threshold; require majority to pass
          const passingDims = calibratedDimensions.filter((d) => d.score >= gate.threshold);
          const requiredCount = Math.ceil(calibratedDimensions.length / 2);
          passed = passingDims.length >= requiredCount;
          break;
        }
        case "max-risk": {
          const riskDim = calibratedDimensions.find((d) => d.dimensionId === "feasibility");
          passed = (riskDim?.score ?? 10) >= gate.threshold;
          break;
        }
        default:
          passed = true;
      }

      return {
        gate: gate.message,
        passed,
        action: gate.action,
        message: passed ? "Passed" : gate.message,
      };
    });

    const passedAllGates = gateResults.every((g) => g.passed || g.action !== "block");

    return {
      ideaTitle: rawScore.ideaTitle,
      dimensions: calibratedDimensions,
      compositeScore: Math.round(compositeScore * 100) / 100,
      confidence: rawScore.confidence,
      gateResults,
      passedAllGates,
    };
  });
}

/** Clear calibration data (for testing). */
export function clearCalibration(): void {
  calibrationFeedback.clear();
}

// ---- Scoring Comparison ----

/** Delta for a single idea between two scoring sets. */
export interface IdeaScoreDelta {
  /** Title of the compared idea. */
  ideaTitle: string;
  /** Feasibility change (positive = improved). */
  feasibilityDelta: number;
  /** Impact change (positive = improved). */
  impactDelta: number;
  /** Novelty change (positive = improved). */
  noveltyDelta: number;
  /** Composite priority score change (positive = improved). */
  priorityDelta: number;
  /** Quadrant in the baseline set. */
  baselineQuadrant: Quadrant;
  /** Quadrant in the comparison set. */
  comparisonQuadrant: Quadrant;
  /** Whether the idea moved to a different quadrant. */
  quadrantChanged: boolean;
}

/** Result of comparing two scoring sets. */
export interface ScoringComparison {
  /** Per-idea deltas for ideas present in both sets. */
  deltas: IdeaScoreDelta[];
  /** Ideas only in the baseline set. */
  onlyInBaseline: string[];
  /** Ideas only in the comparison set. */
  onlyInComparison: string[];
  /** Average feasibility change across matched ideas. */
  avgFeasibilityDelta: number;
  /** Average impact change across matched ideas. */
  avgImpactDelta: number;
  /** Average novelty change across matched ideas. */
  avgNoveltyDelta: number;
  /** Number of ideas that changed quadrant. */
  quadrantChanges: number;
}

/**
 * Compare two sets of scored ideas to identify changes in scores and quadrant shifts.
 * Useful for before/after analysis when re-scoring with different models or after refinement.
 *
 * Ideas are matched by title (case-insensitive). Ideas present in only one set
 * are reported separately.
 *
 * @param baseline - The original set of idea scores
 * @param comparison - The new set of idea scores to compare against
 * @returns A {@link ScoringComparison} with per-idea deltas and summary statistics
 */
export function compareScoringSets(
  baseline: IdeaScore[],
  comparison: IdeaScore[]
): ScoringComparison {
  const baseMap = new Map(baseline.map((s) => [s.ideaTitle.toLowerCase(), s]));
  const compMap = new Map(comparison.map((s) => [s.ideaTitle.toLowerCase(), s]));

  const deltas: IdeaScoreDelta[] = [];
  const onlyInBaseline: string[] = [];
  const onlyInComparison: string[] = [];

  // Find matched ideas
  for (const [key, baseScore] of baseMap) {
    const compScore = compMap.get(key);
    if (!compScore) {
      onlyInBaseline.push(baseScore.ideaTitle);
      continue;
    }

    const baselineQuadrant = getQuadrant(baseScore);
    const comparisonQuadrant = getQuadrant(compScore);

    deltas.push({
      ideaTitle: baseScore.ideaTitle,
      feasibilityDelta: compScore.feasibility - baseScore.feasibility,
      impactDelta: compScore.impact - baseScore.impact,
      noveltyDelta: compScore.novelty - baseScore.novelty,
      priorityDelta: computePriorityScore(compScore) - computePriorityScore(baseScore),
      baselineQuadrant,
      comparisonQuadrant,
      quadrantChanged: baselineQuadrant !== comparisonQuadrant,
    });
  }

  // Find ideas only in comparison
  for (const [key, compScore] of compMap) {
    if (!baseMap.has(key)) {
      onlyInComparison.push(compScore.ideaTitle);
    }
  }

  const n = deltas.length;
  const round2 = (v: number) => Math.round(v * 100) / 100;

  return {
    deltas,
    onlyInBaseline,
    onlyInComparison,
    avgFeasibilityDelta: n > 0 ? round2(deltas.reduce((s, d) => s + d.feasibilityDelta, 0) / n) : 0,
    avgImpactDelta: n > 0 ? round2(deltas.reduce((s, d) => s + d.impactDelta, 0) / n) : 0,
    avgNoveltyDelta: n > 0 ? round2(deltas.reduce((s, d) => s + d.noveltyDelta, 0) / n) : 0,
    quadrantChanges: deltas.filter((d) => d.quadrantChanged).length,
  };
}
