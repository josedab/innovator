/**
 * @description Monte Carlo simulation for innovation outcome probability.
 */
export const runtime = "nodejs";

import { runMonteCarloSimulation, MonteCarloInputSchema } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  ideaTitle: z.string().min(1).max(500),
  input: MonteCarloInputSchema,
  iterations: z.number().min(100).max(100000).default(10000),
});

/**
 * Run Monte Carlo simulation for an idea's impact.
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

    const result = runMonteCarloSimulation(
      parsed.data.ideaTitle,
      parsed.data.input,
      parsed.data.iterations
    );

    logger.info("Monte Carlo simulation completed", {
      route: "/api/monte-carlo",
      requestId,
      iterations: result.iterations,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Monte Carlo simulation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/monte-carlo",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Monte Carlo simulation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
