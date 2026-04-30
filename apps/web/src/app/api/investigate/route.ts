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
      logger.warn("Invalid request", {
        route: "/api/investigate",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    const startTime = Date.now();
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
    });
    return new Response(JSON.stringify({ error: "Investigation failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
