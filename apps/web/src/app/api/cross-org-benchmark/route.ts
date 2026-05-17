/**
 * GET /api/cross-org-benchmark — Network stats, privacy budget, comparison.
 * POST /api/cross-org-benchmark — Submit metrics, compare to peers.
 */
export const runtime = "nodejs";

import {
  submitMetrics,
  compareToPeers,
  getNetworkStats,
  submitMetricsWithPrivacy,
} from "@innovator/core";
import {
  getPrivacyBudgetSummary,
  buildComparisonUIData,
  privatizeMetrics,
  collectOrgMetrics,
  getMetricsHistory,
  computeBenchmarkTrends,
} from "@innovator/core/dist/cross-org-benchmark/privacy-analytics.js";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * GET /api/cross-org-benchmark — Network stats, privacy budget, or comparison.
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "network-stats";

    if (view === "network-stats") {
      const stats = getNetworkStats();
      return Response.json(stats, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "privacy-budget") {
      const orgId = searchParams.get("orgId");
      if (!orgId) {
        return Response.json(
          { error: "orgId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const budget = getPrivacyBudgetSummary(orgId);
      return Response.json(budget, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "comparison") {
      const orgId = searchParams.get("orgId");
      if (!orgId) {
        return Response.json(
          { error: "orgId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const comparison = compareToPeers(orgId);
      return Response.json(comparison, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "trends") {
      const orgId = searchParams.get("orgId");
      if (!orgId) {
        return Response.json(
          { error: "orgId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const metricsParam = searchParams.get("metrics") ?? "sessions,ideas,averageScore";
      const metricNames = metricsParam.split(",").map((m) => m.trim());
      const trends = computeBenchmarkTrends(orgId, metricNames);
      return Response.json({ trends }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "metrics-history") {
      const orgId = searchParams.get("orgId");
      if (!orgId) {
        return Response.json(
          { error: "orgId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const history = getMetricsHistory(orgId);
      return Response.json({ history }, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json({ error: "Invalid view" }, { status: 400, headers: API_RESPONSE_HEADERS });
  } catch (error) {
    logger.error("Cross-org benchmark GET failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

const SubmitMetricsSchema = z.object({
  action: z.literal("submit"),
  orgId: z.string().min(1).max(200),
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
  usePrivacy: z.boolean().default(true),
});

const CompareSchema = z.object({
  action: z.literal("compare"),
  orgId: z.string().min(1).max(200),
  metrics: z.object({
    sessionCount: z.number().min(0),
    ideaCount: z.number().min(0),
    averageIdeaScore: z.number().min(0).max(10),
    ideaVelocity: z.number().min(0),
  }),
});

const PrivatizeSchema = z.object({
  action: z.literal("privatize"),
  orgId: z.string().min(1).max(200),
  metrics: z.record(z.number()),
  epsilon: z.number().min(0.01).max(10).default(0.1),
  sensitivity: z.number().min(0.01).max(100).default(1),
});

const CollectMetricsSchema = z.object({
  action: z.literal("collect-metrics"),
  orgId: z.string().min(1).max(200),
  metrics: z.record(z.number()),
  period: z.string().max(20).optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  SubmitMetricsSchema,
  CompareSchema,
  PrivatizeSchema,
  CollectMetricsSchema,
]);

/**
 * POST /api/cross-org-benchmark — Submit metrics or compare to peers.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "submit") {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const periodEnd = now.toISOString();

      const metrics = {
        orgId: parsed.orgId,
        periodStart,
        periodEnd,
        sessionCount: parsed.sessionCount,
        ideaCount: parsed.ideaCount,
        averageIdeaScore: parsed.averageIdeaScore,
        anglesUsed: parsed.anglesUsed,
        uniqueSubjects: parsed.uniqueSubjects,
        averageSessionDurationMs: parsed.averageSessionDurationMs,
        topAngle: parsed.topAngle,
        ideaVelocity: parsed.ideaVelocity,
        qualityDistribution: parsed.qualityDistribution,
        submittedAt: now.toISOString(),
      };

      const { orgId, submittedAt, ...benchmarkMetrics } = metrics;

      if (parsed.usePrivacy) {
        const result = submitMetricsWithPrivacy(orgId, benchmarkMetrics);
        return Response.json(
          { submitted: true, noised: true, result },
          { status: 201, headers: API_RESPONSE_HEADERS }
        );
      }

      submitMetrics(orgId, benchmarkMetrics);
      return Response.json({ submitted: true }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "compare") {
      const comparison = compareToPeers(parsed.orgId);
      return Response.json(comparison, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "privatize") {
      try {
        const result = privatizeMetrics(parsed.orgId, parsed.metrics, {
          epsilon: parsed.epsilon,
          sensitivity: parsed.sensitivity,
        });
        return Response.json(result, { headers: API_RESPONSE_HEADERS });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Privatization failed" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
    }

    if (parsed.action === "collect-metrics") {
      collectOrgMetrics(parsed.orgId, parsed.metrics, parsed.period);
      return Response.json({ collected: true }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Unknown action" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation failed", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error("Cross-org benchmark POST failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
