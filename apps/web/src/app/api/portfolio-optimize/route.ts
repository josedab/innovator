/**
 * @description Portfolio optimization — balance risk and impact across ideas.
 */
export const runtime = "nodejs";

import { optimizePortfolio } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IdeaScoreInputSchema = z.object({
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100),
  feasibility: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  timeToImplement: z.enum(["days", "weeks", "months", "quarters", "years"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(2000),
});

const RequestSchema = z.object({
  scores: z.array(IdeaScoreInputSchema).min(2).max(100),
  riskFreeRate: z.number().min(0).max(1).default(0.02),
  monteCarloSimulations: z.number().min(100).max(50000).default(5000),
  maxAllocationPerIdea: z.number().min(0.05).max(1).default(0.4),
});

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
        JSON.stringify({ error: "Invalid request.", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const result = optimizePortfolio(parsed.data.scores, {
      riskFreeRate: parsed.data.riskFreeRate,
      monteCarloSimulations: parsed.data.monteCarloSimulations,
      maxAllocationPerIdea: parsed.data.maxAllocationPerIdea,
    });

    logger.info("Portfolio optimized", {
      route: "/api/portfolio-optimize",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Portfolio optimization error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/portfolio-optimize",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Portfolio optimization failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
