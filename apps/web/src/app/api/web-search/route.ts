export const runtime = "nodejs";

import {
  groundInnovation,
  detectPriorArt,
  monitorCompetitors,
  groundingToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const GroundSchema = z.object({
  action: z.literal("ground"),
  subject: z.string().min(1).max(5000),
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
  }),
  model: z.string().optional(),
});

const PriorArtSearchSchema = z.object({
  action: z.literal("prior-art"),
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
  }),
  model: z.string().optional(),
});

const CompetitorSearchSchema = z.object({
  action: z.literal("competitors"),
  subject: z.string().min(1).max(5000),
  model: z.string().optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  GroundSchema,
  PriorArtSearchSchema,
  CompetitorSearchSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    const modelError = validateModel(parsed.model);
    if (modelError) return modelError;

    switch (parsed.action) {
      case "ground": {
        logger.info("Grounding innovation", { subject: parsed.subject.slice(0, 100) });
        const grounding = await groundInnovation(parsed.subject, parsed.idea, {
          model: parsed.model,
          signal: request.signal,
        });
        return Response.json({ grounding }, { headers: API_RESPONSE_HEADERS });
      }
      case "prior-art": {
        logger.info("Detecting prior art", { idea: parsed.idea.title.slice(0, 100) });
        const priorArt = await detectPriorArt(parsed.idea, {
          model: parsed.model,
          signal: request.signal,
        });
        return Response.json({ priorArt }, { headers: API_RESPONSE_HEADERS });
      }
      case "competitors": {
        logger.info("Monitoring competitors", { subject: parsed.subject.slice(0, 100) });
        const competitors = await monitorCompetitors(parsed.subject, {
          model: parsed.model,
          signal: request.signal,
        });
        return Response.json({ competitors }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/web-search" });
    return Response.json(
      { error: "Web search grounding failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
