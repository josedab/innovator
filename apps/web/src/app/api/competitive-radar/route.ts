/**
 * @description Competitive landscape radar analysis.
 */
export const runtime = "nodejs";

import {
  addCompetitor,
  listCompetitors,
  runGapAnalysis,
  runMultiCompetitorGapAnalysis,
  gapReportToMarkdown,
  generateRadarDashboard,
  radarDashboardToMarkdown,
  checkForAlerts,
  getCompetitiveContext,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ActionSchema = z.object({
  action: z.enum(["add-competitor", "gap-analysis", "multi-gap", "radar", "alerts", "context"]),
  competitor: z
    .object({
      id: z.string().max(100),
      name: z.string().max(200),
      website: z.string().max(500).optional(),
      description: z.string().max(2000),
      capabilities: z.array(z.string().max(200)).max(50),
      strengths: z.array(z.string().max(200)).max(20),
      weaknesses: z.array(z.string().max(200)).max(20),
      threatLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
    })
    .optional(),
  competitorId: z.string().max(100).optional(),
  competitorIds: z.array(z.string().max(100)).max(20).optional(),
  ourCapabilities: z.array(z.string().max(200)).max(50).optional(),
  subject: z.string().max(500).optional(),
  model: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/** POST /api/competitive-radar — run competitive analysis, landscape mapping, or gap analysis. */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const {
      action,
      competitor,
      competitorId,
      competitorIds,
      ourCapabilities,
      subject,
      model,
      format,
    } = parsed.data;

    switch (action) {
      case "add-competitor": {
        if (!competitor)
          return new Response(JSON.stringify({ error: "competitor required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const added = addCompetitor({
          ...competitor,
          recentMoves: [],
          threatLevel: competitor.threatLevel ?? "medium",
          lastUpdated: new Date().toISOString(),
        });
        return new Response(JSON.stringify(added), { status: 201, headers: API_RESPONSE_HEADERS });
      }
      case "gap-analysis": {
        if (!competitorId || !ourCapabilities?.length) {
          return new Response(
            JSON.stringify({ error: "competitorId and ourCapabilities required" }),
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        const report = await runGapAnalysis(competitorId, ourCapabilities, model);
        if (format === "markdown") {
          return new Response(gapReportToMarkdown(report), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(report), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "multi-gap": {
        if (!competitorIds?.length || !ourCapabilities?.length) {
          return new Response(
            JSON.stringify({ error: "competitorIds and ourCapabilities required" }),
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        const reports = await runMultiCompetitorGapAnalysis(competitorIds, ourCapabilities, model);
        return new Response(JSON.stringify({ reports }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "radar": {
        const dashboard = await generateRadarDashboard({ model });
        if (format === "markdown") {
          return new Response(radarDashboardToMarkdown(dashboard), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(dashboard), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "alerts": {
        const alerts = await checkForAlerts({ model });
        return new Response(JSON.stringify({ alerts }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "context": {
        if (!subject)
          return new Response(JSON.stringify({ error: "subject required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const context = await getCompetitiveContext(subject, { model });
        return new Response(JSON.stringify({ context }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
    }
  } catch (err) {
    logger.error("Competitive radar failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/competitive-radar — list tracked competitors. */
export async function GET() {
  try {
    const competitors = listCompetitors();
    return new Response(JSON.stringify({ competitors }), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
