/**
 * GET /api/outcome-tracking — Dashboard data, telemetry, model effectiveness.
 * POST /api/outcome-tracking — Create outcomes, record telemetry events.
 */
export const runtime = "nodejs";

import {
  createROIOutcome as createOutcome,
  listROIOutcomes as listOutcomes,
  transitionOutcome,
  buildROIDashboard,
} from "@innovator/core";
import {
  recordTelemetryEvent,
  getTelemetryEvents,
  getModelEffectiveness,
  buildTeamHeatmap,
  buildAngleROIChart,
  buildExecutiveDashboardExport,
  exportDashboardToMarkdown,
  exportDashboardToCSV,
} from "@innovator/core/dist/outcome-tracking/telemetry.js";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * GET /api/outcome-tracking — Returns outcome dashboard, telemetry, or model effectiveness.
 *
 * @queryParam view — "dashboard" | "telemetry" | "model-effectiveness" | "team-heatmap"
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "dashboard";

    if (view === "dashboard") {
      const dashboard = buildROIDashboard();
      return Response.json(dashboard, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "telemetry") {
      const type = searchParams.get("type") as Parameters<typeof getTelemetryEvents>[0] extends {
        type?: infer T;
      }
        ? T
        : never;
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 100;
      const events = getTelemetryEvents({ type: type ?? undefined, limit });
      return Response.json({ events }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "model-effectiveness") {
      const metrics = getModelEffectiveness();
      return Response.json({ metrics }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "team-heatmap") {
      const fromDate = searchParams.get("from") ?? undefined;
      const toDate = searchParams.get("to") ?? undefined;
      const heatmap = buildTeamHeatmap({ fromDate, toDate });
      return Response.json(heatmap, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "outcomes") {
      const stage = searchParams.get("stage") ?? undefined;
      const outcomes = listOutcomes(stage ? { stage: stage as "idea" | "shipped" } : undefined);
      return Response.json({ outcomes }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "angle-roi") {
      const chart = buildAngleROIChart();
      return Response.json({ chart }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "executive-export") {
      const from = searchParams.get("from") ?? undefined;
      const to = searchParams.get("to") ?? undefined;
      const format = searchParams.get("format") ?? "json";
      const dashboard = buildExecutiveDashboardExport({ from, to });

      if (format === "markdown") {
        const md = exportDashboardToMarkdown(dashboard);
        return new Response(md, {
          headers: {
            ...API_RESPONSE_HEADERS,
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": "attachment; filename=innovation-report.md",
          },
        });
      }
      if (format === "csv") {
        const csv = exportDashboardToCSV(dashboard);
        return new Response(csv, {
          headers: {
            ...API_RESPONSE_HEADERS,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=innovation-report.csv",
          },
        });
      }
      return Response.json(dashboard, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Invalid view parameter" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    logger.error("Outcome tracking GET failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

const CreateOutcomeSchema = z.object({
  action: z.literal("create-outcome"),
  ideaTitle: z.string().min(1).max(500),
  ideaDescription: z.string().max(5000).optional(),
  sessionId: z.string().optional(),
  angleId: z.string().max(100).optional(),
  teamMemberId: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

const TransitionSchema = z.object({
  action: z.literal("transition"),
  outcomeId: z.string().min(1),
  stage: z.enum([
    "idea",
    "validated",
    "planned",
    "in-development",
    "shipped",
    "measured",
    "abandoned",
  ]),
  userId: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

const TelemetrySchema = z.object({
  action: z.literal("telemetry"),
  type: z.enum([
    "idea_created",
    "idea_validated",
    "idea_planned",
    "idea_in_development",
    "idea_shipped",
    "idea_measured",
    "idea_abandoned",
    "model_invoked",
    "model_succeeded",
    "model_failed",
    "team_contribution",
    "review_completed",
    "feedback_received",
  ]),
  sessionId: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  angleId: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  CreateOutcomeSchema,
  TransitionSchema,
  TelemetrySchema,
]);

/**
 * POST /api/outcome-tracking — Create outcomes, transition stages, or record telemetry.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "create-outcome") {
      const outcome = createOutcome({
        ideaTitle: parsed.ideaTitle,
        ideaDescription: parsed.ideaDescription,
        sessionId: parsed.sessionId,
        angleId: parsed.angleId,
        teamMemberId: parsed.teamMemberId,
        tags: parsed.tags,
      });
      return Response.json({ outcome }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "transition") {
      const outcome = transitionOutcome(parsed.outcomeId, parsed.stage, {
        userId: parsed.userId,
        note: parsed.note,
      });
      if (!outcome) {
        return Response.json(
          { error: "Outcome not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return Response.json({ outcome }, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "telemetry") {
      const event = recordTelemetryEvent(parsed.type, {
        sessionId: parsed.sessionId,
        userId: parsed.userId,
        model: parsed.model,
        angleId: parsed.angleId,
        metadata: parsed.metadata,
      });
      return Response.json({ event }, { status: 201, headers: API_RESPONSE_HEADERS });
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
    logger.error("Outcome tracking POST failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
