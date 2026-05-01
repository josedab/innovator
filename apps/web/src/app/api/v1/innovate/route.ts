export const runtime = "nodejs";

import { generateForAngle, investigate, ANGLE_IDS, MAX_CONCURRENCY } from "@innovator/core";
import type { AngleId, AngleResult } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { validateApiKey } from "@/lib/api-auth";
import { checkRateLimit, addRateLimitHeaders } from "@/lib/rate-limit";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  angles: z.array(z.string()).min(1).max(20),
  model: z.string().optional(),
});

/** POST /api/v1/innovate — generate ideas for specific angles. */
export async function POST(request: Request) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const rateLimit = checkRateLimit(auth.keyId ?? "anonymous", { limit: 20, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: addRateLimitHeaders(API_RESPONSE_HEADERS as unknown as Record<string, string>, rateLimit),
    });
  }

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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, angles, model } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const investigation = await investigate(subject, model, request.signal);

    const angleResults: AngleResult[] = [];
    for (let i = 0; i < angles.length; i += MAX_CONCURRENCY) {
      const batch = angles.slice(i, i + MAX_CONCURRENCY);
      const results = await Promise.all(
        batch.map((angleId) =>
          generateForAngle(subject, investigation, angleId as AngleId, model, request.signal)
        )
      );
      angleResults.push(...results);
    }

    logger.info("API v1 innovate completed", {
      route: "/api/v1/innovate",
      angles: angles.length,
      durationMs: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ data: { investigation, angleResults } }),
      { headers: addRateLimitHeaders(API_RESPONSE_HEADERS as unknown as Record<string, string>, rateLimit) }
    );
  } catch (err) {
    logger.error("API v1 innovate error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/v1/innovate",
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Innovation generation failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
