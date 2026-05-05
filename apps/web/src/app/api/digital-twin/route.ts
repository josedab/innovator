export const runtime = "nodejs";

import {
  registerEcosystem,
  getEcosystem,
  listEcosystems,
  computeEcosystemHealth,
  simulateStrategy,
  compareStrategies,
  EcosystemSnapshotSchema,
  StrategySchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SimulateRequestSchema = z.object({
  ecosystem: EcosystemSnapshotSchema,
  strategies: z.array(StrategySchema).min(1).max(10),
  model: z.string().optional(),
});

/**
 * Simulate innovation strategies against an ecosystem snapshot.
 *
 * @route POST /api/digital-twin
 * @param request - JSON body with `ecosystem` (EcosystemSnapshot) and `strategies` (Strategy[])
 * @returns Strategy comparison result
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

    const parsed = SimulateRequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid digital twin request", {
        route: "/api/digital-twin",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { ecosystem, strategies, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    registerEcosystem(ecosystem);
    const comparison = await compareStrategies(ecosystem, strategies, model, request.signal);

    logger.info("Digital twin simulation completed", {
      route: "/api/digital-twin",
      requestId,
      strategies: strategies.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(comparison, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Digital twin simulation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/digital-twin",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Simulation failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Get ecosystem health or list ecosystems.
 *
 * @route GET /api/digital-twin?id=eco-1
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const ecosystem = getEcosystem(id);
      if (!ecosystem) {
        return new Response(JSON.stringify({ error: "Ecosystem not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const health = computeEcosystemHealth(ecosystem);
      return Response.json({ ecosystem, health }, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json(listEcosystems(), { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Digital twin GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve ecosystem data." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
