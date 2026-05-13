/**
 * @description Innovation diffusion simulation across adoption curves.
 */
export const runtime = "nodejs";

import { simulateDiffusion } from "@innovator/core";
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
  runMonteCarlo: z.boolean().default(true),
  monteCarloIterations: z.number().min(10).max(5000).default(500),
  marketSize: z.string().max(200).optional(),
});

/**
 * Simulate idea diffusion and adoption.
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

    const result = await simulateDiffusion(
      parsed.data.idea,
      {
        model: parsed.data.model,
        runMonteCarlo: parsed.data.runMonteCarlo,
        monteCarloIterations: parsed.data.monteCarloIterations,
        marketSize: parsed.data.marketSize,
      }
    );

    logger.info("Diffusion simulation completed", {
      route: "/api/diffusion",
      requestId,
      peakMonth: result.peakAdoptionMonth,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Diffusion simulation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/diffusion",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Diffusion simulation failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
