/**
 * @description Knowledge distillation — compress complex results into key insights.
 */
export const runtime = "nodejs";

import { routeRequest, getCostDashboard } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RouteRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  premiumModel: z.string().max(100).default("gpt-4o"),
  distilledModel: z.string().max(100).default("ollama-local"),
  qualityThreshold: z.number().min(0).max(1).default(0.8),
});

/**
 * Route a request through the distillation cost optimizer, or get cost dashboard.
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

    const parsed = RouteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const decision = routeRequest(
      parsed.data.input,
      parsed.data.premiumModel,
      parsed.data.distilledModel,
      parsed.data.qualityThreshold
    );

    logger.info("Distillation routing completed", {
      route: "/api/distillation",
      requestId,
      selectedModel: decision.selectedModel,
      durationMs: Date.now() - startTime,
    });

    return Response.json(decision, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Distillation routing error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/distillation",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Routing failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function GET() {
  try {
    const dashboard = getCostDashboard();
    return Response.json(dashboard, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Cost dashboard error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/distillation",
    });
    return new Response(
      JSON.stringify({ error: "Failed to get cost dashboard." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
