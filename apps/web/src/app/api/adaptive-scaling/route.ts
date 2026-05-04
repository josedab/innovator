export const runtime = "nodejs";

import { classifyComplexityHeuristic, generateExecutionPlan } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(2000),
  expertise: z.object({
    level: z.enum(["novice", "intermediate", "advanced", "expert"]).default("intermediate"),
    domains: z.array(z.string().max(100)).max(10).default([]),
    preferredDepth: z.enum(["overview", "standard", "deep", "exhaustive"]).default("standard"),
    sessionCount: z.number().min(0).default(0),
  }).default({}),
  budget: z.object({
    maxCostUsd: z.number().min(0).optional(),
    maxTimeSeconds: z.number().min(0).optional(),
    maxAngles: z.number().min(1).max(20).optional(),
    prioritizeSpeed: z.boolean().default(false),
    prioritizeQuality: z.boolean().default(false),
  }).default({}),
});

/**
 * Classify subject complexity and generate an adaptive execution plan.
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

    const complexity = classifyComplexityHeuristic(parsed.data.subject);
    const plan = generateExecutionPlan(
      parsed.data.subject,
      complexity,
      parsed.data.expertise,
      parsed.data.budget
    );

    logger.info("Adaptive scaling plan generated", {
      route: "/api/adaptive-scaling",
      requestId,
      complexity: complexity.level,
      depth: plan.recommendedDepth,
      savings: `${plan.costSavingsPercent.toFixed(0)}%`,
      durationMs: Date.now() - startTime,
    });

    return Response.json(plan, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Adaptive scaling error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/adaptive-scaling",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Adaptive scaling failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
