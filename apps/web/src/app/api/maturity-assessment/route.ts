/**
 * GET /api/maturity-assessment — Questions, results, coaching, learning paths.
 * POST /api/maturity-assessment — Submit assessment, generate coaching.
 */
export const runtime = "nodejs";

import {
  getAssessmentQuestions,
  scoreAssessment,
  getAssessmentResult,
  getMaturityRoadmap as getRoadmap,
} from "@innovator/core";
import {
  generateCoachingPrompts,
  generateLearningPath,
  mapGapsToFeatures,
  validateMaturityLevel,
  computeCompletionAnalytics,
} from "@innovator/core/dist/maturity-assessment/learning-paths.js";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * GET /api/maturity-assessment — Returns questions, results, coaching prompts.
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "questions";

    if (view === "questions") {
      const dimension = searchParams.get("dimension") ?? undefined;
      const questions = getAssessmentQuestions();
      const filtered = dimension ? questions.filter((q) => q.dimension === dimension) : questions;
      return Response.json({ questions: filtered }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "result") {
      const assessmentId = searchParams.get("assessmentId");
      if (!assessmentId) {
        return Response.json(
          { error: "assessmentId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const result = getAssessmentResult(assessmentId);
      if (!result) {
        return Response.json(
          { error: "Assessment not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "roadmap") {
      const assessmentId = searchParams.get("assessmentId");
      if (!assessmentId) {
        return Response.json(
          { error: "assessmentId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const roadmap = getRoadmap(assessmentId);
      if (!roadmap) {
        return Response.json(
          { error: "Roadmap not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return Response.json(roadmap, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "coaching") {
      const dimension = searchParams.get("dimension") ?? "strategy";
      const level = parseInt(searchParams.get("level") ?? "1", 10);
      const prompts = generateCoachingPrompts(dimension, level);
      return Response.json({ prompts }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "learning-path") {
      const dimension = searchParams.get("dimension") ?? "strategy";
      const currentLevel = parseInt(searchParams.get("currentLevel") ?? "1", 10);
      const targetLevel = parseInt(searchParams.get("targetLevel") ?? String(currentLevel + 1), 10);
      const path = generateLearningPath(dimension, currentLevel, targetLevel);
      return Response.json(path, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "completion-analytics") {
      // Generate learning paths for all 8 dimensions to compute analytics
      const dimensions = [
        "strategy",
        "process",
        "culture",
        "resources",
        "metrics",
        "tools",
        "knowledge",
        "ecosystem",
      ];
      const paths = dimensions.map((d) => generateLearningPath(d, 1, 3));
      const analytics = computeCompletionAnalytics(paths);
      return Response.json(analytics, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json({ error: "Invalid view" }, { status: 400, headers: API_RESPONSE_HEADERS });
  } catch (error) {
    logger.error("Maturity assessment GET failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

const SubmitAssessmentSchema = z.object({
  action: z.literal("submit"),
  organizationId: z.string().min(1).max(200),
  responses: z
    .array(
      z.object({
        questionId: z.string(),
        selectedOption: z.number().int().min(0).max(4),
      })
    )
    .min(1),
});

const GapAnalysisSchema = z.object({
  action: z.literal("gap-analysis"),
  dimensionScores: z.array(
    z.object({
      dimension: z.string(),
      score: z.number().min(0).max(5),
      benchmark: z.number().min(0).max(5),
    })
  ),
});

const ValidateEvidenceSchema = z.object({
  action: z.literal("validate-evidence"),
  dimension: z.string().min(1).max(200),
  claimedLevel: z.number().int().min(1).max(5),
  evidence: z.array(
    z.object({
      type: z.enum([
        "session_count",
        "idea_count",
        "shipped_count",
        "feature_usage",
        "team_participation",
        "documentation",
        "process_adoption",
        "tool_integration",
      ]),
      value: z.number(),
    })
  ),
});

const PostBodySchema = z.discriminatedUnion("action", [
  SubmitAssessmentSchema,
  GapAnalysisSchema,
  ValidateEvidenceSchema,
]);

/**
 * POST /api/maturity-assessment — Submit assessment or run gap analysis.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "submit") {
      const result = scoreAssessment(
        parsed.organizationId,
        parsed.responses.map((response) => ({
          questionId: response.questionId,
          value: response.selectedOption,
        }))
      );
      return Response.json(result, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "gap-analysis") {
      const mappings = mapGapsToFeatures(parsed.dimensionScores);
      return Response.json({ mappings }, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "validate-evidence") {
      const result = validateMaturityLevel(parsed.dimension, parsed.claimedLevel, parsed.evidence);
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
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
    logger.error("Maturity assessment POST failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
