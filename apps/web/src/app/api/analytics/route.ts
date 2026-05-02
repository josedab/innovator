export const runtime = "nodejs";

import {
  generateSummary,
  generateInsights,
  trackEvent,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * GET /api/analytics — returns aggregated analytics summary and insights.
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const summary = generateSummary();
    const insights = generateInsights(summary);

    return Response.json(
      { summary, insights },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    logger.error("Analytics error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/analytics",
      requestId,
    });
    return new Response(
      JSON.stringify({ error: "Failed to generate analytics" }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

const TrackEventSchema = z.object({
  type: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/analytics — track an analytics event.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = TrackEventSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid event data" }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const event = trackEvent(
      parsed.data.type as Parameters<typeof trackEvent>[0],
      parsed.data.data
    );

    return Response.json({ event }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Analytics track error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/analytics",
      requestId,
    });
    return new Response(
      JSON.stringify({ error: "Failed to track event" }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
