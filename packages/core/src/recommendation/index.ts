/**
 * @module recommendation
 *
 * Context-aware smart angle selection using heuristic classification
 * and historical feedback to recommend optimal innovation angles.
 * Includes SubjectClassifier for domain/complexity/intent extraction
 * and AngleRecommender for ranked angle suggestions.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import { ANGLE_IDS, type AngleId } from "../types.js";

// ---- Schemas ----

/** Classification of a subject's domain. */
export const SubjectDomainSchema = z.enum([
  "technology",
  "healthcare",
  "education",
  "finance",
  "sustainability",
  "consumer",
  "enterprise",
  "creative",
  "science",
  "social",
  "other",
]);

/** Complexity level of the subject. */
export const ComplexityLevelSchema = z.enum(["simple", "moderate", "complex"]);

/** Intent behind the innovation exploration. */
export const InnovationIntentSchema = z.enum(["disrupt", "optimize", "explore", "solve", "create"]);

/** Full subject classification result. */
export const SubjectClassificationSchema = z.object({
  domain: SubjectDomainSchema,
  subDomain: z.string().max(200),
  complexity: ComplexityLevelSchema,
  intent: InnovationIntentSchema,
  keywords: z.array(z.string().max(100)).max(10),
  confidence: z.number().min(0).max(1),
});

/** A recommended angle with relevance score and rationale. */
export const AngleRecommendationSchema = z.object({
  angleId: z.string().max(100),
  relevance: z.number().min(0).max(1),
  rationale: z.string().max(500),
});

/** Full recommendation result with classification context. */
export const RecommendationResultSchema = z.object({
  classification: SubjectClassificationSchema,
  recommendations: z.array(AngleRecommendationSchema).max(8),
  suggestedCount: z.number().min(1).max(8),
});

// ---- Types ----

export type SubjectDomain = z.infer<typeof SubjectDomainSchema>;
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;
export type InnovationIntent = z.infer<typeof InnovationIntentSchema>;
export type SubjectClassification = z.infer<typeof SubjectClassificationSchema>;
export type AngleRecommendation = z.infer<typeof AngleRecommendationSchema>;
export type RecommendationResult = z.infer<typeof RecommendationResultSchema>;

/** Historical feedback entry for A/B tracking. */
export interface AngleFeedbackEntry {
  domain: SubjectDomain;
  angleId: string;
  qualityScore: number;
  userRating?: number;
  timestamp: number;
}

// ---- Heuristic Mappings ----

/** Domain-to-angle effectiveness heuristics (initial weights before feedback). */
const DOMAIN_ANGLE_WEIGHTS: Record<string, Partial<Record<AngleId, number>>> = {
  technology: {
    "first-principles": 0.9,
    "trend-collision": 0.85,
    "what-if": 0.8,
    "cross-domain": 0.75,
    scamper: 0.7,
    constraints: 0.65,
    inversion: 0.6,
    perspectives: 0.55,
  },
  healthcare: {
    perspectives: 0.9,
    constraints: 0.85,
    "first-principles": 0.8,
    "cross-domain": 0.8,
    scamper: 0.7,
    "what-if": 0.65,
    inversion: 0.6,
    "trend-collision": 0.55,
  },
  education: {
    perspectives: 0.9,
    scamper: 0.85,
    "what-if": 0.8,
    "cross-domain": 0.75,
    "first-principles": 0.7,
    constraints: 0.65,
    "trend-collision": 0.6,
    inversion: 0.55,
  },
  finance: {
    "first-principles": 0.9,
    constraints: 0.85,
    inversion: 0.8,
    "trend-collision": 0.75,
    perspectives: 0.7,
    scamper: 0.65,
    "what-if": 0.6,
    "cross-domain": 0.55,
  },
  sustainability: {
    "first-principles": 0.9,
    "cross-domain": 0.85,
    constraints: 0.85,
    "what-if": 0.8,
    perspectives: 0.75,
    scamper: 0.7,
    "trend-collision": 0.65,
    inversion: 0.6,
  },
};

const DEFAULT_WEIGHTS: Record<AngleId, number> = {
  scamper: 0.7,
  "first-principles": 0.75,
  "cross-domain": 0.75,
  constraints: 0.7,
  inversion: 0.65,
  perspectives: 0.7,
  "what-if": 0.7,
  "trend-collision": 0.7,
};

// ---- In-Memory Feedback Store ----

const feedbackStore: AngleFeedbackEntry[] = [];

/**
 * Record feedback for A/B testing of angle recommendations.
 *
 * @param entry - The feedback entry to record
 */
export function recordAngleFeedback(entry: AngleFeedbackEntry): void {
  feedbackStore.push(entry);
}

/**
 * Get all recorded angle feedback entries.
 *
 * @returns Array of feedback entries
 */
export function getAngleFeedback(): AngleFeedbackEntry[] {
  return [...feedbackStore];
}

/**
 * Clear all recorded feedback data.
 */
export function clearAngleFeedback(): void {
  feedbackStore.length = 0;
}

// ---- Core Functions ----

/**
 * Classify a subject to extract domain, complexity, and intent.
 *
 * @param subject - The innovation subject text
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns SubjectClassification with domain analysis
 */
export async function classifySubject(
  subject: string,
  model?: string,
  signal?: AbortSignal
): Promise<SubjectClassification> {
  const prompt = `You are an expert at classifying innovation subjects.

${wrapUserInput("SUBJECT", subject)}

Classify this subject:
- domain: one of [technology, healthcare, education, finance, sustainability, consumer, enterprise, creative, science, social, other]
- subDomain: specific sub-area (e.g., "machine learning", "fintech")
- complexity: simple | moderate | complex
- intent: disrupt | optimize | explore | solve | create
- keywords: up to 10 key terms
- confidence: 0-1 how confident you are

Return valid JSON only:
{
  "domain": "technology",
  "subDomain": "machine learning",
  "complexity": "moderate",
  "intent": "explore",
  "keywords": ["AI", "automation"],
  "confidence": 0.85
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse classification response: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
    }
  );

  return SubjectClassificationSchema.parse(parsed);
}

/**
 * Recommend optimal angles based on subject classification and historical feedback.
 *
 * @param classification - The subject classification
 * @param topN - Number of angles to recommend (default: 4)
 * @returns Array of ranked angle recommendations
 */
export function recommendAngles(
  classification: SubjectClassification,
  topN: number = 4
): AngleRecommendation[] {
  const domainWeights = DOMAIN_ANGLE_WEIGHTS[classification.domain] ?? {};

  const scored: AngleRecommendation[] = ANGLE_IDS.map((angleId) => {
    const baseWeight = domainWeights[angleId] ?? DEFAULT_WEIGHTS[angleId] ?? 0.5;

    // Adjust based on historical feedback for this domain + angle
    const relevantFeedback = feedbackStore.filter(
      (f) => f.domain === classification.domain && f.angleId === angleId
    );
    let feedbackBoost = 0;
    if (relevantFeedback.length > 0) {
      const avgQuality =
        relevantFeedback.reduce((sum, f) => sum + f.qualityScore, 0) / relevantFeedback.length;
      feedbackBoost = (avgQuality - 5) * 0.02; // +/- 0.1 max
    }

    // Complexity adjustment: complex subjects benefit from structured angles
    let complexityBoost = 0;
    if (classification.complexity === "complex") {
      if (angleId === "first-principles" || angleId === "constraints") {
        complexityBoost = 0.1;
      }
    } else if (classification.complexity === "simple") {
      if (angleId === "what-if" || angleId === "scamper") {
        complexityBoost = 0.1;
      }
    }

    const relevance = Math.min(1, Math.max(0, baseWeight + feedbackBoost + complexityBoost));

    return {
      angleId,
      relevance: Math.round(relevance * 100) / 100,
      rationale: buildRationale(angleId, classification),
    };
  });

  return scored.sort((a, b) => b.relevance - a.relevance).slice(0, topN);
}

/**
 * Full smart recommendation: classify subject then recommend angles.
 *
 * @param subject - The innovation subject
 * @param topN - Number of angles to recommend (default: 4)
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Full recommendation result with classification and ranked angles
 */
export async function smartRecommend(
  subject: string,
  topN: number = 4,
  model?: string,
  signal?: AbortSignal
): Promise<RecommendationResult> {
  const classification = await classifySubject(subject, model, signal);
  const recommendations = recommendAngles(classification, topN);

  return {
    classification,
    recommendations,
    suggestedCount: Math.min(topN, recommendations.length),
  };
}

// ---- Helpers ----

function buildRationale(angleId: string, classification: SubjectClassification): string {
  const rationales: Record<string, string> = {
    scamper: `SCAMPER's structured modifications work well for ${classification.domain} innovations`,
    "first-principles": `Breaking down ${classification.subDomain} to fundamentals reveals hidden opportunities`,
    "cross-domain": `Importing patterns from other fields into ${classification.domain} yields novel solutions`,
    constraints: `Applying deliberate constraints in ${classification.subDomain} forces creative solutions`,
    inversion: `Inverting ${classification.domain} assumptions can reveal non-obvious approaches`,
    perspectives: `Multiple viewpoints are essential for ${classification.complexity} ${classification.domain} challenges`,
    "what-if": `Speculative scenarios help explore ${classification.intent} possibilities in ${classification.subDomain}`,
    "trend-collision": `Combining emerging trends creates disruptive ${classification.domain} opportunities`,
  };
  return (
    rationales[angleId] ?? `This angle offers a useful lens for ${classification.domain} innovation`
  );
}
