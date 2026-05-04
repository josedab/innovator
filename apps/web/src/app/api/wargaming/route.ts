export const runtime = "nodejs";

import { runWargaming } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  ideaTitle: z.string().min(1).max(500),
  ideaDescription: z.string().min(1).max(5000),
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
  rounds: z.number().min(1).max(5).default(3),
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
      logger.warn("Invalid request", { route: "/api/wargaming", requestId, details: parsed.error.flatten() });
      return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const modelError = validateModel(parsed.data.model);
    if (modelError) return modelError;

    const result = await runWargaming(parsed.data.ideaTitle, parsed.data.ideaDescription, parsed.data.subject, {
      model: parsed.data.model,
      rounds: parsed.data.rounds,
      signal: request.signal,
    });

    logger.info("Wargaming completed", { route: "/api/wargaming", requestId, durationMs: Date.now() - startTime });
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Wargaming error", { error: err instanceof Error ? err.message : String(err), route: "/api/wargaming", requestId, durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: "Wargaming failed. Please try again." }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
