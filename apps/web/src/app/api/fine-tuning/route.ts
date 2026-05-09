export const runtime = "nodejs";

import {
  collectTrainingData,
  buildFineTuningDataset,
  exportDatasetAsJSONL,
  validateDatasetQuality,
  getFineTuningRecommendations,
  getDatasetStats,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const BuildDatasetSchema = z.object({
  sessions: z.array(
    z.object({
      subject: z.string(),
      investigation: z.record(z.unknown()),
      angleResults: z.array(z.record(z.unknown())),
      synthesis: z.record(z.unknown()).optional(),
      scores: z.array(z.record(z.unknown())).optional(),
    })
  ),
  filter: z
    .object({
      minScore: z.number().min(0).max(10).optional(),
      minFeedbackRating: z.number().min(0).max(5).optional(),
      requireHumanValidation: z.boolean().optional(),
      deduplicateThreshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
  name: z.string().min(1).max(200).optional(),
  format: z.enum(["jsonl", "chat", "instruction"]).optional(),
});

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

    const parsed = BuildDatasetSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const examples = collectTrainingData(parsed.data.sessions as any, parsed.data.filter);
    const dataset = buildFineTuningDataset(examples, {
      name: parsed.data.name ?? "untitled",
      format: parsed.data.format,
    });
    const quality = validateDatasetQuality(dataset);
    const stats = getDatasetStats(dataset);
    const recommendations = getFineTuningRecommendations(stats);
    const jsonl = exportDatasetAsJSONL(dataset);

    logger.info("Fine-tuning dataset built", {
      route: "/api/fine-tuning",
      requestId,
      durationMs: Date.now() - startTime,
      exampleCount: dataset.examples.length,
    });

    return Response.json(
      { dataset, quality, stats, recommendations, jsonlPreview: jsonl.slice(0, 2000) },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    logger.error("Fine-tuning error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/fine-tuning",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Fine-tuning dataset build failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
