export const runtime = "nodejs";

import { mineProcess, analyticsToProcessEvents, readEvents } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  events: z
    .array(
      z.object({
        id: z.string(),
        caseId: z.string(),
        activity: z.string(),
        timestamp: z.string(),
        durationMs: z.number().optional(),
        actor: z.string().optional(),
      })
    )
    .optional(),
  useAnalytics: z.boolean().optional(),
  algorithm: z.enum(["alpha", "inductive"]).optional(),
  minFrequency: z.number().min(1).optional(),
  bottleneckThresholdMs: z.number().min(0).optional(),
});

/**
 * Run process mining on innovation pipeline data.
 * Can use provided events or derive from analytics data.
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

    let events = parsed.data.events;
    if (!events && parsed.data.useAnalytics) {
      const analyticsEvents = readEvents();
      events = analyticsToProcessEvents(analyticsEvents);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No events provided. Pass events array or set useAnalytics: true.",
        }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const result = mineProcess(events, {
      algorithm: parsed.data.algorithm,
      minFrequency: parsed.data.minFrequency,
      bottleneckThresholdMs: parsed.data.bottleneckThresholdMs,
    });

    logger.info("Process mining completed", {
      route: "/api/process-mining",
      requestId,
      durationMs: Date.now() - startTime,
      cases: result.statistics.totalCases,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Process mining error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/process-mining",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Process mining failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
