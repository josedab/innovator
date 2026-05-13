/**
 * @description Usage telemetry collection for product analytics.
 */
export const runtime = "nodejs";

import {
  scoreIdeaDiversity,
  detectHallucinationsInResults,
  getQualityTrends,
  recordPromptEffectiveness,
  buildTelemetryDashboard,
  AngleResultSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const DiversitySchema = z.object({
  action: z.literal("diversity"),
  angleResults: z.array(AngleResultSchema),
});

const HallucinationSchema = z.object({
  action: z.literal("hallucination-check"),
  angleResults: z.array(AngleResultSchema),
});

const TrendsSchema = z.object({
  action: z.literal("trends"),
});

const DashboardSchema = z.object({
  action: z.literal("dashboard"),
});

const RecordEffectivenessSchema = z.object({
  action: z.literal("record-effectiveness"),
  promptId: z.string().min(1).max(200),
  angleId: z.string().min(1).max(100),
  ideasGenerated: z.number().min(0),
  averageIdeaLength: z.number().min(0),
  structureCompliance: z.number().min(0).max(1),
  jsonParseSuccess: z.boolean(),
  hallucinations: z.number().min(0),
  latencyMs: z.number().min(0),
  tokenEstimate: z.number().min(0),
});

const RequestSchema = z.discriminatedUnion("action", [
  DiversitySchema, HallucinationSchema, TrendsSchema, RecordEffectivenessSchema, DashboardSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "diversity": {
        const score = scoreIdeaDiversity(parsed.angleResults);
        return Response.json({ diversity: score }, { headers: API_RESPONSE_HEADERS });
      }
      case "hallucination-check": {
        const { results, overallScore } = detectHallucinationsInResults(parsed.angleResults);
        const detections = Object.fromEntries(results);
        return Response.json({ detections, overallScore }, { headers: API_RESPONSE_HEADERS });
      }
      case "trends": {
        const trends = getQualityTrends();
        return Response.json({ trends }, { headers: API_RESPONSE_HEADERS });
      }
      case "record-effectiveness": {
        const { action: _, ...metrics } = parsed;
        const record = recordPromptEffectiveness(metrics);
        return Response.json({ recorded: record }, { headers: API_RESPONSE_HEADERS });
      }
      case "dashboard": {
        const dashboard = buildTelemetryDashboard();
        return Response.json({ dashboard }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/telemetry" });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
