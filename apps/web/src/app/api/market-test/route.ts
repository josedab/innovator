/**
 * @description Market testing simulation for innovation ideas.
 */
export const runtime = "nodejs";

import { runMarketTest } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(3000),
    potentialImpact: z.string().max(500).default(""),
    implementationHint: z.string().max(500).default(""),
  }),
  model: z.string().max(100).optional(),
  personaCount: z.number().min(10).max(10000).default(1000),
  segments: z.array(z.string().max(200)).max(20).optional(),
  basePrice: z.number().min(0).optional(),
});

/**
 * Run a synthetic market test for an idea.
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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const result = await runMarketTest(parsed.data.idea, {
      model: parsed.data.model,
      personaCount: parsed.data.personaCount,
      segments: parsed.data.segments,
      basePrice: parsed.data.basePrice,
    });

    logger.info("Market test completed", {
      route: "/api/market-test",
      requestId,
      personas: result.totalPersonas,
      adoption: result.overallAdoptionRate,
      viability: result.marketViability,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Market test error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/market-test",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Market test failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
