/**
 * @description Innovation Portfolio Dashboard API — provides dashboard metrics,
 * velocity charts, heatmaps, leaderboards, ROI summaries, and reports.
 *
 * @route POST /api/dashboard
 */
export const runtime = "nodejs";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { getDashboardService } from "@innovator/core";

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("overview"),
    teamId: z.string().max(200).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.object({
    action: z.literal("velocity"),
    granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.object({
    action: z.literal("heatmap"),
  }),
  z.object({
    action: z.literal("leaderboard"),
    limit: z.number().int().min(1).max(100).default(10),
  }),
  z.object({
    action: z.literal("drilldown"),
    sessionId: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("roi_summary"),
    portfolioId: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("report"),
    title: z.string().max(500).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  z.object({
    action: z.literal("executive_summary"),
    period: z.string().max(100).default("last_30_days"),
  }),
]);

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/dashboard",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return contentTypeError;
    }

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
      logger.warn("Invalid request", {
        route: "/api/dashboard",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const service = getDashboardService();
    const data = parsed.data;
    let result: unknown;

    switch (data.action) {
      case "overview":
        result = service.getOverview(data.teamId, { from: data.from, to: data.to });
        break;
      case "velocity":
        result = service.getVelocityChart(data.granularity, { from: data.from, to: data.to });
        break;
      case "heatmap":
        result = service.getQualityHeatmap();
        break;
      case "leaderboard":
        result = service.getTeamComparison([]);
        break;
      case "drilldown":
        result = service.getDrillDown(data.sessionId);
        break;
      case "roi_summary":
        result = service.getROISummary(data.portfolioId);
        break;
      case "report":
        result = {
          markdown: service.generateReport({
            title: data.title,
            startDate: data.startDate,
            endDate: data.endDate,
          }),
        };
        break;
      case "executive_summary":
        result = service.generateExecutiveSummary(data.period);
        break;
    }

    logger.info("Dashboard request completed", {
      route: "/api/dashboard",
      requestId,
      action: data.action,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Dashboard error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/dashboard",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Dashboard request failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
