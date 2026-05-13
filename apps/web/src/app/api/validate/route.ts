/**
 * @description Input validation endpoint for subjects and models.
 */
export const runtime = "nodejs";

import { validateIdea, validateIdeas } from "@innovator/core";
import type { InnovationIdea } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IdeaInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  potentialImpact: z.string().max(2000).default(""),
  implementationHint: z.string().max(2000).default(""),
});

const RequestSchema = z.object({
  ideas: z.array(IdeaInputSchema).min(1).max(50),
  domain: z.string().min(1).max(200),
  model: z.string().optional(),
});

/**
 * Validate innovation ideas against patent, market, and feasibility checks.
 *
 * @param request - JSON body: `{ ideas: InnovationIdea[], domain: string, model?: string }`
 * @returns JSON response with a ValidationScorecard on success (200),
 *          or `{ error: string }` on failure (400/500).
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/validate",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return contentTypeError;
    }

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
      logger.warn("Invalid request", {
        route: "/api/validate",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { ideas, domain, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) {
      logger.warn("Invalid model", {
        route: "/api/validate",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return modelError;
    }

    const scorecard = await validateIdeas(
      ideas as InnovationIdea[],
      domain,
      model,
      request.signal
    );

    logger.info("Validation completed", {
      route: "/api/validate",
      requestId,
      ideaCount: ideas.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(scorecard, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Validation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/validate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Validation failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
