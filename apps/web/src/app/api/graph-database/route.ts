export const runtime = "nodejs";

import { getKnowledgeGraph, getGraphStats, queryRelatedSubjects } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const QuerySchema = z.object({
  subject: z.string().min(1).max(500),
  maxDepth: z.number().int().min(1).max(5).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function GET() {
  try {
    const stats = getGraphStats();
    return Response.json(stats, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Graph stats error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/graph-database",
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve graph stats." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

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

    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Provide a subject to query." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, maxDepth, limit } = parsed.data;
    const result = queryRelatedSubjects(subject, maxDepth, limit);

    logger.info("Graph query completed", {
      route: "/api/graph-database",
      requestId,
      durationMs: Date.now() - startTime,
      nodesFound: result.nodes.length,
    });

    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Graph query error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/graph-database",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Graph query failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
