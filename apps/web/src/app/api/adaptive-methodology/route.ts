/**
 * @description Adaptive methodology selection based on project characteristics.
 */
export const runtime = "nodejs";

import {
  getAngleRecommendations,
  getPipelineRecommendation,
  explainRecommendation,
  generateMethodologyInsights,
  insightsToMarkdown,
  recordFeedback,
  getEffectivenessHistory,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  action: z.enum(["recommend-angles", "recommend-pipeline", "insights", "feedback", "history"]),
  domain: z.string().max(200).optional(),
  teamId: z.string().max(100).optional(),
  subject: z.string().max(500).optional(),
  runId: z.string().max(100).optional(),
  feedback: z.object({
    rating: z.number().min(0).max(10).optional(),
    exported: z.boolean().optional(),
    used: z.boolean().optional(),
  }).optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/** POST /api/adaptive-methodology — adapt innovation methodology based on context and history. */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const { action, domain, teamId, subject, runId, feedback, format } = parsed.data;

    switch (action) {
      case "recommend-angles": {
        if (!domain) {
          return new Response(JSON.stringify({ error: "domain required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const recommendations = getAngleRecommendations(domain, teamId);
        return new Response(JSON.stringify({ recommendations }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "recommend-pipeline": {
        if (!subject) {
          return new Response(JSON.stringify({ error: "subject required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const recommendation = getPipelineRecommendation(subject, { domain, teamId });
        const explanation = explainRecommendation(recommendation);
        return new Response(JSON.stringify({ recommendation, explanation }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "insights": {
        const insights = generateMethodologyInsights(domain);
        if (format === "markdown") {
          return new Response(insightsToMarkdown(insights), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify({ insights }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "feedback": {
        if (!runId || !feedback) {
          return new Response(JSON.stringify({ error: "runId and feedback required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        recordFeedback(runId, feedback);
        return new Response(JSON.stringify({ recorded: true }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "history": {
        const history = getEffectivenessHistory({ domain });
        return new Response(JSON.stringify({ history }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Adaptive methodology failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
