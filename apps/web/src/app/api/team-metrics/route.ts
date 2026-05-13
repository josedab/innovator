/**
 * @description Team innovation performance metrics and analytics.
 */
export const runtime = "nodejs";

import {
  recordInnovationEvent,
  getTeamMetrics,
  getTeamLeaderboard,
  getTeamEvents,
  RecordEventSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RecordAction = z.object({
  action: z.literal("record"),
  ...RecordEventSchema.shape,
});

const MetricsAction = z.object({
  action: z.literal("metrics"),
  teamId: z.string().min(1).max(100),
  periodType: z.enum(["weekly", "monthly"]).default("weekly"),
});

const LeaderboardAction = z.object({
  action: z.literal("leaderboard"),
  teamId: z.string().min(1).max(100),
});

const EventsAction = z.object({
  action: z.literal("events"),
  teamId: z.string().min(1).max(100),
  limit: z.number().min(1).max(500).default(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  RecordAction,
  MetricsAction,
  LeaderboardAction,
  EventsAction,
]);

/** POST /api/team-metrics — record events and retrieve team metrics. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

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

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    switch (parsed.data.action) {
      case "record": {
        const { action: _, ...eventData } = parsed.data;
        const event = recordInnovationEvent(eventData);
        return Response.json({ event }, { headers: API_RESPONSE_HEADERS });
      }
      case "metrics": {
        const metrics = getTeamMetrics(parsed.data.teamId, parsed.data.periodType);
        return Response.json({ metrics }, { headers: API_RESPONSE_HEADERS });
      }
      case "leaderboard": {
        const leaderboard = getTeamLeaderboard(parsed.data.teamId);
        return Response.json({ leaderboard }, { headers: API_RESPONSE_HEADERS });
      }
      case "events": {
        const eventsList = getTeamEvents(parsed.data.teamId, parsed.data.limit);
        return Response.json({ events: eventsList }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Team metrics error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/team-metrics",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
