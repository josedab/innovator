/**
 * @description Effort estimation for implementing innovation ideas.
 */
export const runtime = "nodejs";

import { estimateEffort, estimateEffortBatch, formatEstimateMarkdown } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const EstimateSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().min(1).max(500),
      description: z.string().min(1).max(5000),
    })
  ),
  model: z.string().optional(),
  config: z
    .object({
      teamSize: z.number().int().min(1).max(100).optional(),
      existingStack: z.array(z.string()).optional(),
      complexityBias: z.enum(["conservative", "moderate", "aggressive"]).optional(),
      includeMaintenanceCost: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Estimate implementation effort for innovation ideas.
 *
 * @route POST /api/effort-estimate
 * @param request - JSON body: `{ ideas: Array<{title, description}>, model?, config?: {teamSize, existingStack, complexityBias, includeMaintenanceCost} }`
 * @returns JSON effort estimates on success (200), or `{ error: string }` on failure (400/500).
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

    const parsed = EstimateSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { ideas, model, config } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    let estimates;
    const ideaInputs = ideas.map((i) => ({ ...i, potentialImpact: "", implementationHint: "" }));
    if (ideaInputs.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const estimate = await estimateEffort(ideaInputs[0], config as any);
      estimates = { ideas: [estimate], totalEffort: estimate.totalPersonWeeks };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimates = await estimateEffortBatch(ideaInputs, config as any);
    }

    const markdowns = estimates.ideas.map((e: { totalPersonWeeks: number }) =>
      formatEstimateMarkdown(e as Parameters<typeof formatEstimateMarkdown>[0])
    );

    logger.info("Effort estimation completed", {
      route: "/api/effort-estimate",
      requestId,
      durationMs: Date.now() - startTime,
      ideaCount: ideas.length,
    });

    return Response.json({ ...estimates, markdowns }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Effort estimation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/effort-estimate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Effort estimation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
