export const runtime = "nodejs";

import {
  generateSummary,
  generateInsights,
  trackEvent,
  getTimeSeries,
  getActivityHeatmap,
  getLeaderboard,
  generateReport,
  reportToMarkdown,
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
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "timeseries") {
      const metric = (searchParams.get("metric") ?? "sessions") as
        | "sessions"
        | "ideas"
        | "angles"
        | "duration"
        | "quality";
      const granularity = (searchParams.get("granularity") ?? "day") as
        | "hour"
        | "day"
        | "week"
        | "month";
      const result = getTimeSeries(metric, {
        startDate: searchParams.get("start") ?? undefined,
        endDate: searchParams.get("end") ?? undefined,
        granularity,
      });
      return Response.json({ timeSeries: result }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "heatmap") {
      const type = (searchParams.get("type") ?? "hour-day") as
        | "hour-day"
        | "angle-topic"
        | "model-angle";
      const heatmap = getActivityHeatmap(type);
      return Response.json({ heatmap }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "leaderboard") {
      const metric = (searchParams.get("metric") ?? "ideas") as
        | "sessions"
        | "ideas"
        | "quality"
        | "diversity"
        | "streaks";
      const limit = parseInt(searchParams.get("limit") ?? "10", 10);
      const leaderboard = getLeaderboard(metric, Math.min(limit, 50));
      return Response.json({ leaderboard }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "report") {
      const report = generateReport({
        startDate: searchParams.get("start") ?? undefined,
        endDate: searchParams.get("end") ?? undefined,
        title: searchParams.get("title") ?? undefined,
      });
      const format = searchParams.get("format");
      if (format === "markdown") {
        const md = reportToMarkdown(report);
        return new Response(md, {
          headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
        });
      }
      return Response.json({ report }, { headers: API_RESPONSE_HEADERS });
    }

    const summary = generateSummary();
    const insights = generateInsights(summary);

    return Response.json({ summary, insights }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Analytics error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/analytics",
      requestId,
    });
    return new Response(JSON.stringify({ error: "Failed to generate analytics" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
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
      return new Response(JSON.stringify({ error: "Invalid event data" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
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
    return new Response(JSON.stringify({ error: "Failed to track event" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
