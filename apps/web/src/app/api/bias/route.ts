/**
 * @description Cognitive bias detection and mitigation in innovation ideas.
 */
export const runtime = "nodejs";

import {
  recordBiasActivity,
  analyzeBiases,
  getBiasAnalysis,
  getCounterPrompt,
  generateDebiasingChallenges,
  completeDebiasingChallenge,
  buildTeamBiasDashboard,
  COGNITIVE_BIASES,
  UserActivitySchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RecordActivitySchema = z.object({
  action: z.literal("record"),
  activity: UserActivitySchema,
});

const AnalyzeSchema = z.object({
  action: z.literal("analyze"),
  userId: z.string().min(1).max(200),
  model: z.string().optional(),
});

const ChallengesSchema = z.object({
  action: z.literal("challenges"),
  userId: z.string().min(1).max(200),
});

const CompleteChallengeSchema = z.object({
  action: z.literal("complete-challenge"),
  userId: z.string().min(1).max(200),
  challengeId: z.string().min(1).max(200),
});

const TeamDashboardSchema = z.object({
  action: z.literal("team-dashboard"),
  teamId: z.string().min(1).max(200),
  memberIds: z.array(z.string().max(200)).min(1).max(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  RecordActivitySchema,
  AnalyzeSchema,
  ChallengesSchema,
  CompleteChallengeSchema,
  TeamDashboardSchema,
]);

/**
 * Cognitive bias calibration — record activity, analyze biases, manage challenges.
 *
 * @route POST /api/bias
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

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid bias request", {
        route: "/api/bias",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;

    switch (data.action) {
      case "record": {
        recordBiasActivity(data.activity);
        return Response.json({ success: true }, { headers: API_RESPONSE_HEADERS });
      }
      case "analyze": {
        const modelError = validateModel(data.model);
        if (modelError) return modelError;
        const analysis = await analyzeBiases(data.userId, data.model, request.signal);
        logger.info("Bias analysis completed", {
          route: "/api/bias",
          requestId,
          userId: data.userId,
          durationMs: Date.now() - startTime,
        });
        return Response.json(analysis, { headers: API_RESPONSE_HEADERS });
      }
      case "challenges": {
        const challenges = generateDebiasingChallenges(data.userId);
        return Response.json(challenges, { headers: API_RESPONSE_HEADERS });
      }
      case "complete-challenge": {
        const result = completeDebiasingChallenge(data.userId, data.challengeId);
        if (!result) {
          return new Response(
            JSON.stringify({ error: "Challenge not found or already completed" }),
            {
              status: 404,
              headers: API_RESPONSE_HEADERS,
            }
          );
        }
        return Response.json(result, { headers: API_RESPONSE_HEADERS });
      }
      case "team-dashboard": {
        const dashboard = buildTeamBiasDashboard(data.teamId, data.memberIds);
        return Response.json(dashboard, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Bias calibration error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/bias",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Bias calibration failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Get bias analysis or counter-prompt.
 *
 * @route GET /api/bias?userId=user-1 or GET /api/bias?biasId=confirmation
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const biasId = searchParams.get("biasId");

    if (biasId) {
      if (!COGNITIVE_BIASES.includes(biasId as (typeof COGNITIVE_BIASES)[number])) {
        return new Response(JSON.stringify({ error: "Invalid bias ID" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
      }
      return Response.json(
        { biasId, counterPrompt: getCounterPrompt(biasId as (typeof COGNITIVE_BIASES)[number]) },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    if (userId) {
      const analysis = getBiasAnalysis(userId);
      if (!analysis) {
        return new Response(
          JSON.stringify({ error: "No analysis found. Run POST with action=analyze first." }),
          {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          }
        );
      }
      return Response.json(analysis, { headers: API_RESPONSE_HEADERS });
    }

    return new Response(JSON.stringify({ error: "Provide 'userId' or 'biasId' query parameter" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Bias GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve bias data." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
