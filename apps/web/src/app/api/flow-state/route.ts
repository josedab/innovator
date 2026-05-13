/**
 * @description Flow state assessment and intervention selection for innovation work.
 */
export const runtime = "nodejs";

import { assessFlowState, selectIntervention, getInterventionLibrary } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  indicators: z.object({
    sessionDurationMinutes: z.number().min(0),
    ideasGenerated: z.number().min(0),
    anglesExplored: z.number().min(0),
    timeSinceLastIdeaMinutes: z.number().min(0),
    ideaQualityTrend: z.enum(["improving", "stable", "declining"]),
    repetitionRate: z.number().min(0).max(1),
    avgIdeaLengthTrend: z.enum(["increasing", "stable", "decreasing"]),
    userInteractionFrequency: z.enum(["high", "normal", "low", "idle"]),
  }),
});

/**
 * Assess flow state and get intervention recommendations.
 */
export async function POST(request: Request) {
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

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const flowState = assessFlowState(parsed.data.indicators);
    const intervention = selectIntervention(flowState);

    logger.info("Flow state assessed", {
      route: "/api/flow-state",
      requestId,
      state: flowState.state,
      cognitiveLoad: flowState.cognitiveLoad,
    });

    return Response.json({ flowState, intervention }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Flow state error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/flow-state",
      requestId,
    });
    return new Response(
      JSON.stringify({ error: "Flow state assessment failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * Get the full intervention library.
 */
export async function GET() {
  try {
    const library = getInterventionLibrary();
    return Response.json({ interventions: library }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Intervention library error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/flow-state",
    });
    return new Response(
      JSON.stringify({ error: "Failed to get intervention library." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
