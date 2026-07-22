/**
 * @description Stakeholder simulation — model how roles evaluate innovations.
 */
export const runtime = "nodejs";

import {
  simulateStakeholdersBatch,
  computeReadinessScores,
  DEFAULT_PERSONAS,
} from "@innovator/core";
import type { InnovationIdea } from "@innovator/core/innovation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IdeaSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(2000),
  potentialImpact: z.string().max(1000).default(""),
  implementationHint: z.string().max(1000).default(""),
});

const RequestSchema = z.object({
  ideas: z.array(IdeaSchema).min(1).max(10),
  model: z.string().optional(),
});

/**
 * Simulate stakeholder reactions for a set of ideas.
 * Returns simulations with conflict matrices and readiness scores.
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
        JSON.stringify({ error: "Invalid request. Provide an array of ideas." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { ideas, model } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const innovationIdeas: InnovationIdea[] = ideas.map((i) => ({
      title: i.title,
      description: i.description,
      potentialImpact: i.potentialImpact,
      implementationHint: i.implementationHint,
    }));

    const simulations = await simulateStakeholdersBatch(
      innovationIdeas,
      undefined,
      model,
      request.signal
    );

    const conflictMatrices = computeReadinessScores(simulations);

    logger.info("Stakeholder simulation completed", {
      route: "/api/stakeholders",
      requestId,
      ideasCount: ideas.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(
      {
        simulations,
        conflictMatrices,
        personas: DEFAULT_PERSONAS,
      },
      { headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS } }
    );
  } catch (err) {
    logger.error("Stakeholder simulation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/stakeholders",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Stakeholder simulation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
