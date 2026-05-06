export const runtime = "nodejs";

import { simulateRegulatory, getRegulatoryFrameworks } from "@innovator/core";
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
  jurisdictions: z.array(z.string().max(100)).max(20).optional(),
});

/**
 * Simulate regulatory compliance across jurisdictions.
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

    const result = await simulateRegulatory(parsed.data.idea, {
      model: parsed.data.model,
      jurisdictions: parsed.data.jurisdictions,
    });

    logger.info("Regulatory simulation completed", {
      route: "/api/regulatory",
      requestId,
      jurisdictions: result.jurisdictions.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Regulatory simulation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/regulatory",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Regulatory simulation failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * Get available regulatory frameworks.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jurisdiction = url.searchParams.get("jurisdiction") ?? undefined;
    const frameworks = getRegulatoryFrameworks(jurisdiction);
    return Response.json({ frameworks }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Regulatory frameworks error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/regulatory",
    });
    return new Response(
      JSON.stringify({ error: "Failed to get regulatory frameworks." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
