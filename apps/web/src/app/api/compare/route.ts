/**
 * @description Multi-subject parallel investigation and comparison.
 */
export const runtime = "nodejs";

import { runParallelInvestigation } from "@innovator/core/innovation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subjects: z.array(z.string().min(1).max(500)).min(2).max(10),
  model: z.string().optional(),
  includeCompetitiveMap: z.boolean().optional().default(true),
});

/**
 * Comparative innovation analysis endpoint.
 * Run parallel investigations across multiple subjects with cross-subject synthesis.
 */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    const modelError = validateModel(parsed.model);
    if (modelError) return modelError;

    logger.info(`Starting parallel investigation for ${parsed.subjects.length} subjects`, {
      route: "/api/compare",
    });

    const result = await runParallelInvestigation(parsed.subjects, {
      model: parsed.model,
      signal: request.signal,
      includeCompetitiveMap: parsed.includeCompetitiveMap,
    });

    logger.info(`Comparative analysis ${result.stage}: ${parsed.subjects.length} subjects`, {
      route: "/api/compare",
    });

    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", {
      route: "/api/compare",
    });
    return Response.json(
      { error: "Comparative analysis failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
