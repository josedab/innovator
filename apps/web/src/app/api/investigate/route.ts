/**
 * @description Subject investigation — analyze landscape, challenges, and opportunities.
 */
export const runtime = "nodejs";

import { investigate } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

/**
 * POST /api/investigate — Investigate a subject with AI.
 *
 * Analyzes the given subject to identify key aspects, current state, challenges,
 * and opportunities for innovation.
 *
 * @requestBody {object} application/json
 *   - `subject` {string} (required, 1–500 chars) — The subject to investigate
 *   - `model` {string} (optional) — LLM model override (e.g. "gpt-4.1", "gpt-5")
 *
 * @response 200 {Investigation} application/json — Successful investigation result
 *   ```json
 *   {
 *     "summary": "string",
 *     "keyAspects": [{ "title": "string", "description": "string" }],
 *     "currentState": "string",
 *     "challenges": ["string"],
 *     "opportunities": ["string"]
 *   }
 *   ```
 * @response 400 {{ error: string }} — Invalid JSON body or failed Zod validation
 * @response 500 {{ error: string }} — LLM or server failure
 *
 * @see {@link RequestSchema} for Zod validation details
 * @see OpenAPI spec at /api/v1/openapi for machine-readable schema
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/investigate",
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
        route: "/api/investigate",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) {
      logger.warn("Invalid model", {
        route: "/api/investigate",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return modelError;
    }

    const investigation = await investigate(subject, model, request.signal);
    logger.info("Investigation completed", {
      route: "/api/investigate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return Response.json(investigation, { headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS } });
  } catch (err) {
    logger.error("Investigation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/investigate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Investigation failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
