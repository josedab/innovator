export const runtime = "nodejs";

import {
  smartRecommend,
  classifySubject,
  recordAngleFeedback,
  getAngleFeedback,
  computeAngleEffectiveness,
  getDataPoints,
  ANGLES,
} from "@innovator/core";
import type { RecommendationResult, AngleFeedbackEntry, SubjectDomain } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RecommendRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
  count: z.number().int().min(1).max(8).default(4),
  useThompsonSampling: z.boolean().default(true),
});

const FeedbackRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  angleId: z.string().min(1).max(100),
  qualityScore: z.number().min(0).max(10),
  userRating: z.number().min(1).max(5).optional(),
});

// Thompson sampling: sample from Beta(alpha, beta) for each angle
function betaSample(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) return 0.5;
  // Approximation using the Joehnk method for Beta distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const x = Math.pow(u1, 1 / alpha);
  const y = Math.pow(u2, 1 / beta);
  if (x + y === 0 || !isFinite(x) || !isFinite(y)) return 0.5;
  return x / (x + y);
}

interface ThompsonResult {
  angleId: string;
  label: string;
  sampledScore: number;
  alpha: number;
  beta: number;
  isExploration: boolean;
}

function thompsonSamplingRank(
  feedback: AngleFeedbackEntry[],
  domain: SubjectDomain,
  count: number
): ThompsonResult[] {
  // Build per-angle success/failure counts from feedback
  const angleCounts = new Map<string, { successes: number; failures: number }>();

  for (const angle of ANGLES) {
    angleCounts.set(angle.id, { successes: 1, failures: 1 }); // Prior: Beta(1,1)
  }

  for (const entry of feedback) {
    if (entry.domain !== domain) continue;
    const counts = angleCounts.get(entry.angleId);
    if (!counts) continue;
    if (entry.qualityScore >= 6) {
      counts.successes++;
    } else {
      counts.failures++;
    }
  }

  // Sample from Beta distribution for each angle
  const results: ThompsonResult[] = [];
  for (const angle of ANGLES) {
    const counts = angleCounts.get(angle.id)!;
    const alpha = counts.successes;
    const beta = counts.failures;
    const sampled = betaSample(alpha, beta);
    const totalTrials = alpha + beta - 2; // Subtract prior
    results.push({
      angleId: angle.id,
      label: angle.name,
      sampledScore: sampled,
      alpha,
      beta,
      isExploration: totalTrials < 3, // Few trials = exploration
    });
  }

  return results.sort((a, b) => b.sampledScore - a.sampledScore).slice(0, count);
}

/**
 * Recommend optimal innovation angles for a subject.
 * Uses LLM-based subject classification + Thompson sampling for exploration/exploitation.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RecommendRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Provide a subject." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, model, count, useThompsonSampling } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    // Step 1: Classify subject
    const classification = await classifySubject(subject, model, request.signal);

    // Step 2: Get base recommendations from heuristic + LLM
    const baseResult: RecommendationResult = await smartRecommend(subject, count, model, request.signal);

    // Step 3: Optionally apply Thompson sampling
    let finalRecommendations = baseResult.recommendations.slice(0, count);
    let thompsonData: ThompsonResult[] | undefined;

    if (useThompsonSampling) {
      const feedback = getAngleFeedback();
      thompsonData = thompsonSamplingRank(feedback, classification.domain, count);

      // Blend: 60% heuristic, 40% Thompson sampling
      const heuristicMap = new Map(baseResult.recommendations.map((r) => [r.angleId, r.relevance]));
      const blended = thompsonData.map((t) => ({
        angleId: t.angleId,
        relevance: Math.round(((heuristicMap.get(t.angleId) ?? 0.5) * 0.6 + t.sampledScore * 0.4) * 100) / 100,
        rationale: baseResult.recommendations.find((r) => r.angleId === t.angleId)?.rationale
          ?? `${t.isExploration ? "🔍 Exploring" : "⭐ Recommended"} based on ${t.alpha + t.beta - 2} observations`,
        isExploration: t.isExploration,
      }));

      blended.sort((a, b) => b.relevance - a.relevance);
      finalRecommendations = blended.slice(0, count);
    }

    logger.info("Angle recommendation completed", {
      route: "/api/recommend-angles",
      requestId,
      domain: classification.domain,
      recommended: finalRecommendations.map((r) => r.angleId),
      durationMs: Date.now() - startTime,
    });

    return Response.json(
      {
        classification,
        recommendations: finalRecommendations,
        suggestedCount: count,
        thompson: thompsonData,
      },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Request cancelled" }), {
        status: 499,
        headers: API_RESPONSE_HEADERS,
      });
    }

    logger.error("Angle recommendation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/recommend-angles",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Recommendation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Record feedback on angle quality for Thompson sampling learning.
 */
export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = FeedbackRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid feedback data." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const classification = await classifySubject(parsed.data.subject);

    recordAngleFeedback({
      domain: classification.domain,
      angleId: parsed.data.angleId,
      qualityScore: parsed.data.qualityScore,
      userRating: parsed.data.userRating,
      timestamp: Date.now(),
    });

    logger.info("Angle feedback recorded", {
      route: "/api/recommend-angles",
      requestId,
      angleId: parsed.data.angleId,
      qualityScore: parsed.data.qualityScore,
    });

    return Response.json({ success: true }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to record feedback." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
