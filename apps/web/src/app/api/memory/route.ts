export const runtime = "nodejs";

import {
  recordOutcome,
  getOutcomes,
  getModelPerformanceStats,
  compareModelPerformance,
  autoTuneParameters,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * Learning memory API — record outcomes and query model performance.
 *
 * @route POST /api/memory
 * @actions record | query | model-stats | compare-models | auto-tune
 */

const RecordOutcomeSchema = z.object({
  action: z.literal("record"),
  sessionId: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  domain: z.string().max(200).optional(),
  model: z.string().max(100).optional(),
  anglesUsed: z.array(z.string().max(100)).max(20),
  ideaCount: z.number().min(0),
  averageScore: z.number().min(0).max(100).optional(),
  exportCount: z.number().min(0).default(0),
  userRating: z.number().min(0).max(10).optional(),
  dwellTimeMs: z.number().min(0).optional(),
  pipelineDurationMs: z.number().min(0).optional(),
});

const QuerySchema = z.object({
  action: z.literal("query"),
  domain: z.string().max(200).optional(),
});

const ModelStatsSchema = z.object({
  action: z.literal("model-stats"),
  model: z.string().min(1).max(100),
});

const CompareModelsSchema = z.object({
  action: z.literal("compare-models"),
});

const AutoTuneSchema = z.object({
  action: z.literal("auto-tune"),
  domain: z.string().max(200).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  RecordOutcomeSchema,
  QuerySchema,
  ModelStatsSchema,
  CompareModelsSchema,
  AutoTuneSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "record": {
        const { action: _, ...outcomeData } = parsed;
        const outcome = recordOutcome(outcomeData);
        logger.info(`Recorded outcome for session ${outcome.sessionId}`, { route: "/api/memory" });
        return Response.json({ outcome }, { headers: API_RESPONSE_HEADERS });
      }
      case "query": {
        const outcomes = getOutcomes(parsed.domain);
        return Response.json({ outcomes }, { headers: API_RESPONSE_HEADERS });
      }
      case "model-stats": {
        const stats = getModelPerformanceStats(parsed.model);
        return Response.json({ stats }, { headers: API_RESPONSE_HEADERS });
      }
      case "compare-models": {
        const comparison = compareModelPerformance();
        return Response.json({ models: comparison }, { headers: API_RESPONSE_HEADERS });
      }
      case "auto-tune": {
        const params = autoTuneParameters(parsed.domain);
        logger.info(`Auto-tuned parameters (confidence: ${params.confidenceScore})`, { route: "/api/memory" });
        return Response.json({ parameters: params }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/memory" });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
