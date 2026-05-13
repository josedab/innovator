/**
 * @description Continuous learning loop for improving innovation quality.
 */
export const runtime = "nodejs";

import {
  recordLearningOutcome as recordOutcome,
  recordBatchOutcomes,
  getLearningRecommendations as getRecommendations,
  getLearningAnglePerformance as getAnglePerformance,
  getDomainProfile,
  listDomainProfiles,
  learningInsightsToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RecordSchema = z.object({
  action: z.literal("record"),
  sessionId: z.string().max(200),
  subject: z.string().min(1).max(5000),
  angleId: z.string().max(100),
  rating: z.number().min(0).max(10).optional(),
  exported: z.boolean().optional(),
  timeSpentMs: z.number().min(0).optional(),
  ideaCount: z.number().min(0).optional(),
  selectedIdeas: z.number().min(0).optional(),
});

const BatchRecordSchema = z.object({
  action: z.literal("batch-record"),
  sessionId: z.string().max(200),
  subject: z.string().min(1).max(5000),
  outcomes: z
    .array(
      z.object({
        angleId: z.string().max(100),
        rating: z.number().min(0).max(10).optional(),
        exported: z.boolean().optional(),
        ideaCount: z.number().min(0).optional(),
        selectedIdeas: z.number().min(0).optional(),
      })
    )
    .min(1)
    .max(20),
});

const RecommendSchema = z.object({
  action: z.literal("recommend"),
  subject: z.string().min(1).max(5000),
});

const RequestSchema = z.discriminatedUnion("action", [
  RecordSchema,
  BatchRecordSchema,
  RecommendSchema,
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "record": {
        const signal = recordOutcome(parsed.sessionId, parsed.subject, parsed.angleId, {
          rating: parsed.rating,
          exported: parsed.exported,
          timeSpentMs: parsed.timeSpentMs,
          ideaCount: parsed.ideaCount,
          selectedIdeas: parsed.selectedIdeas,
        });
        logger.info("Learning signal recorded", { sessionId: parsed.sessionId, angleId: parsed.angleId });
        return Response.json({ signal }, { headers: API_RESPONSE_HEADERS });
      }
      case "batch-record": {
        const signals = recordBatchOutcomes(parsed.sessionId, parsed.subject, parsed.outcomes);
        logger.info("Batch learning signals recorded", { sessionId: parsed.sessionId, count: signals.length });
        return Response.json({ signals }, { headers: API_RESPONSE_HEADERS });
      }
      case "recommend": {
        const recommendations = getRecommendations(parsed.subject);
        return Response.json({ recommendations }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/learning-loop" });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "domains") {
      const profiles = listDomainProfiles();
      return Response.json({ profiles }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "angle") {
      const angleId = searchParams.get("angleId");
      if (!angleId) {
        return Response.json({ error: "angleId parameter required" }, { status: 400, headers: API_RESPONSE_HEADERS });
      }
      const performance = getAnglePerformance(angleId);
      return Response.json({ performance }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "insights") {
      const subject = searchParams.get("subject");
      if (!subject) {
        return Response.json({ error: "subject parameter required" }, { status: 400, headers: API_RESPONSE_HEADERS });
      }
      const format = searchParams.get("format");
      if (format === "markdown") {
        const md = learningInsightsToMarkdown(subject);
        return new Response(md, {
          headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
        });
      }
      const recommendations = getRecommendations(subject);
      const profile = getDomainProfile(subject);
      return Response.json({ recommendations, profile }, { headers: API_RESPONSE_HEADERS });
    }

    const profiles = listDomainProfiles();
    return Response.json({ profiles }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Learning loop GET error", { error: String(err) });
    return Response.json({ error: "Internal server error" }, { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
