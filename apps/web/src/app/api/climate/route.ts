/**
 * @description Climate and sustainability impact analysis for innovations.
 */
export const runtime = "nodejs";

import { assessClimate, quickAssess, getSurveyQuestions } from "@innovator/core";
import type { ClimateSurveyResponse } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SurveyResponseSchema = z.object({
  dimension: z.string(),
  question: z.string(),
  score: z.number().min(1).max(10),
  comment: z.string().optional(),
});

const RequestSchema = z.object({
  organizationName: z.string().min(1).max(200),
  industry: z.string().min(1).max(200),
  surveyData: z.array(SurveyResponseSchema).min(1).max(200).optional(),
  quickScores: z.record(z.string(), z.number().min(1).max(10)).optional(),
  model: z.string().optional(),
});

/**
 * Run an innovation climate assessment.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

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

    const { organizationName, industry, surveyData, quickScores, model } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    let result;
    if (surveyData && surveyData.length > 0) {
      result = await assessClimate(surveyData as ClimateSurveyResponse[], {
        organizationName,
        industry,
        model,
        signal: request.signal,
      });
    } else if (quickScores) {
      result = quickAssess(
        quickScores as Record<string, number> as never,
        organizationName,
        industry
      );
    } else {
      return new Response(JSON.stringify({ error: "Provide either surveyData or quickScores" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    logger.info("Climate assessment completed", {
      route: "/api/climate",
      requestId,
      durationMs: Date.now() - startTime,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Climate assessment error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/climate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Climate assessment failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** Get survey questions for the climate assessment. */
export async function GET() {
  return new Response(JSON.stringify(getSurveyQuestions()), {
    status: 200,
    headers: API_RESPONSE_HEADERS,
  });
}
