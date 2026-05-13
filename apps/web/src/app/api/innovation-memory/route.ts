/**
 * @description Innovation memory API — query memories, get recommendations, nudges, effectiveness, and bias analysis.
 */
export const runtime = "nodejs";

import {
  getInnovationMemoryService,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

// ---- Request Schemas ----

const QueryActionSchema = z.object({
  action: z.literal("query"),
  domain: z.string().max(500).optional(),
  type: z.enum(["investigation", "idea", "outcome", "insight"]).optional(),
  limit: z.number().min(1).max(100).optional(),
});

const RecommendationsActionSchema = z.object({
  action: z.literal("recommendations"),
  domain: z.string().min(1).max(500),
  userId: z.string().max(200).optional(),
});

const NudgesActionSchema = z.object({
  action: z.literal("nudges"),
  sessionId: z.string().min(1).max(200),
  currentAngles: z.array(z.string().max(100)).max(20),
  domain: z.string().min(1).max(500),
});

const EffectivenessActionSchema = z.object({
  action: z.literal("effectiveness"),
  domain: z.string().max(500).optional(),
});

const BiasActionSchema = z.object({
  action: z.literal("bias"),
  userId: z.string().min(1).max(200),
});

const RequestSchema = z.discriminatedUnion("action", [
  QueryActionSchema,
  RecommendationsActionSchema,
  NudgesActionSchema,
  EffectivenessActionSchema,
  BiasActionSchema,
]);

// ---- Route Handler ----

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);
    const memoryService = getInnovationMemoryService();

    switch (parsed.action) {
      case "query": {
        const results = memoryService.query([], {
          domain: parsed.domain,
          type: parsed.type,
          limit: parsed.limit,
          similarityThreshold: 0,
        });
        logger.info("Memory query executed", { route: "/api/innovation-memory", domain: parsed.domain });
        return Response.json({ results }, { headers: API_RESPONSE_HEADERS });
      }
      case "recommendations": {
        const recommendations = memoryService.getRecommendations(parsed.domain, parsed.userId);
        logger.info("Recommendations fetched", { route: "/api/innovation-memory", domain: parsed.domain });
        return Response.json({ recommendations }, { headers: API_RESPONSE_HEADERS });
      }
      case "nudges": {
        const nudges = memoryService.getMidSessionNudges({
          sessionId: parsed.sessionId,
          currentAngles: parsed.currentAngles,
          domain: parsed.domain,
        });
        logger.info("Mid-session nudges generated", { route: "/api/innovation-memory", sessionId: parsed.sessionId });
        return Response.json({ nudges }, { headers: API_RESPONSE_HEADERS });
      }
      case "effectiveness": {
        const effectiveness = memoryService.getEffectiveAngles(parsed.domain);
        return Response.json({ effectiveness }, { headers: API_RESPONSE_HEADERS });
      }
      case "bias": {
        const bias = memoryService.getBiasFrequency(parsed.userId);
        logger.info("Bias analysis fetched", { route: "/api/innovation-memory", userId: parsed.userId });
        return Response.json({ bias }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/innovation-memory" });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
