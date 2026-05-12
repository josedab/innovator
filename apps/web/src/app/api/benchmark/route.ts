export const runtime = "nodejs";

import {
  submitMetricsWithPrivacy,
  compareToPeers,
  getNetworkStats,
  crossOrgBenchmarkToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SubmitSchema = z.object({
  action: z.literal("submit"),
  orgId: z.string().min(1).max(200),
  periodStart: z.string(),
  periodEnd: z.string(),
  sessionCount: z.number().min(0),
  ideaCount: z.number().min(0),
  averageIdeaScore: z.number().min(0).max(10),
  anglesUsed: z.record(z.number()),
  uniqueSubjects: z.number().min(0),
  averageSessionDurationMs: z.number().min(0),
  topAngle: z.string().max(100),
  ideaVelocity: z.number().min(0),
  qualityDistribution: z.object({
    low: z.number().min(0),
    medium: z.number().min(0),
    high: z.number().min(0),
  }),
});

const CompareSchema = z.object({
  action: z.literal("compare"),
  orgId: z.string().min(1).max(200),
  periodStart: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

const StatsSchema = z.object({
  action: z.literal("stats"),
});

const RequestSchema = z.discriminatedUnion("action", [
  SubmitSchema,
  CompareSchema,
  StatsSchema,
]);

/**
 * POST /api/benchmark — Submit, compare, or get network stats.
 * All submissions use differential privacy noise injection.
 */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "submit": {
        const { action: _, orgId, ...metrics } = parsed;
        const record = submitMetricsWithPrivacy(orgId, metrics);
        logger.info("Benchmark metrics submitted (with DP noise)", { orgId: record.orgId });
        return Response.json(
          { record, privacyNote: "Laplace noise applied for differential privacy" },
          { headers: API_RESPONSE_HEADERS }
        );
      }
      case "compare": {
        const comparison = compareToPeers(parsed.orgId, parsed.periodStart);
        if (!comparison) {
          return Response.json(
            { error: "No metrics found for this organization" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        if (parsed.format === "markdown") {
          const md = crossOrgBenchmarkToMarkdown(comparison);
          return new Response(md, {
            headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
          });
        }
        return Response.json({ comparison }, { headers: API_RESPONSE_HEADERS });
      }
      case "stats": {
        const stats = getNetworkStats();
        return Response.json({ stats }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/benchmark" });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/** GET /api/benchmark — Returns aggregate network stats. */
export async function GET() {
  try {
    const stats = getNetworkStats();
    return Response.json({ stats }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return Response.json(
      { error: "Failed to get benchmark stats" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
