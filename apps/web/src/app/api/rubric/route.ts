/**
 * @description Custom evaluation rubric creation and management.
 */
export const runtime = "nodejs";

import { createRubric, getRubric, listRubrics, scoreWithRubric } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

export async function GET() {
  const rubrics = listRubrics();
  return Response.json(rubrics, { headers: API_RESPONSE_HEADERS });
}

const CreateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  dimensions: z.array(z.object({
    id: z.string().max(100),
    name: z.string().max(200),
    description: z.string().max(1000),
    weight: z.number().min(0).max(1),
    minScore: z.number().default(1),
    maxScore: z.number().default(10),
    scoringGuidelines: z.string().max(2000).optional(),
  })).min(1).max(20),
  tags: z.array(z.string().max(100)).max(10).default([]),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request.", details: parsed.error.flatten() }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const rubric = createRubric(parsed.data);
    logger.info("Rubric created", { route: "/api/rubric", requestId, rubricId: rubric.id, durationMs: Date.now() - startTime });
    return Response.json(rubric, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Rubric creation error", { error: err instanceof Error ? err.message : String(err), route: "/api/rubric", requestId, durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Rubric creation failed." }), { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
