export const runtime = "nodejs";

import { buildEmbeddingSpace } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  ideas: z.array(z.object({
    id: z.string().max(100),
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(2000),
    tags: z.array(z.string().max(100)).max(10).optional(),
    score: z.number().min(0).max(1).optional(),
  })).min(1).max(500),
  model: z.string().max(100).optional(),
  clusterCount: z.number().min(2).max(20).optional(),
});

/**
 * Build a 3D embedding space from ideas.
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

    const space = await buildEmbeddingSpace(parsed.data.ideas, {
      model: parsed.data.model,
      clusterCount: parsed.data.clusterCount,
    });

    logger.info("Embedding space built", {
      route: "/api/embedding-explorer",
      requestId,
      ideas: space.totalIdeas,
      clusters: space.clusters.length,
      whiteSpaces: space.whiteSpaces.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(space, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Embedding explorer error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/embedding-explorer",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Embedding space construction failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
