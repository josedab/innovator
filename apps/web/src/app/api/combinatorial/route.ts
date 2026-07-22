/**
 * @description Combinatorial synthesis — cross-angle idea combinations.
 */
export const runtime = "nodejs";

import { runCombinatorialSynthesis } from "@innovator/core";
import type { AngleResult } from "@innovator/core/innovation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  angleResults: z
    .array(
      z.object({
        angleId: z.string(),
        angleName: z.string(),
        ideas: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
            potentialImpact: z.string(),
            implementationHint: z.string(),
          })
        ),
        reasoning: z.string(),
      })
    )
    .min(2),
  model: z.string().optional(),
  maxPairs: z.number().min(1).max(100).optional(),
  includeHigherOrder: z.boolean().optional(),
});

/**
 * Run combinatorial synthesis on existing angle results.
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

    const { subject, angleResults, model, maxPairs, includeHigherOrder } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const result = await runCombinatorialSynthesis(
      subject,
      angleResults as AngleResult[],
      undefined,
      { maxPairs, includeHigherOrder, model, signal: request.signal }
    );

    logger.info("Combinatorial synthesis completed", {
      route: "/api/combinatorial",
      requestId,
      durationMs: Date.now() - startTime,
      ideasGenerated: result.topCombinations.length,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Combinatorial synthesis error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/combinatorial",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Combinatorial synthesis failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
