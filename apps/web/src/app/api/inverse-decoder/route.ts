/**
 * @description Inverse decoding — reverse-engineer innovations from outcomes.
 */
export const runtime = "nodejs";

import { analyzeProduct } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  productDescription: z.string().min(1).max(5000),
  model: z.string().max(100).optional(),
});

/**
 * Analyze a product and generate an innovation recipe.
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

    const recipe = await analyzeProduct(parsed.data.productDescription, {
      model: parsed.data.model,
    });

    logger.info("Inverse decoder analysis completed", {
      route: "/api/inverse-decoder",
      requestId,
      product: recipe.productAnalysis.productName,
      patterns: recipe.patterns.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(recipe, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Inverse decoder error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/inverse-decoder",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Product analysis failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
