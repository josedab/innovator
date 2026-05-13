/**
 * @description Optimal timing analysis for innovation implementation.
 */
export const runtime = "nodejs";

import { analyzeTimings } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  ideas: z.array(z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
  })).min(1).max(50),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const modelError = validateModel(parsed.data.model);
    if (modelError) return modelError;

    const result = await analyzeTimings(parsed.data.subject, parsed.data.ideas, parsed.data.model, request.signal);

    logger.info("Timing analysis completed", { route: "/api/timing", requestId, durationMs: Date.now() - startTime });
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Timing error", { error: err instanceof Error ? err.message : String(err), route: "/api/timing", requestId, durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: "Timing analysis failed." }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
