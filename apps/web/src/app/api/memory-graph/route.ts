/**
 * @description Knowledge memory graph for cross-session concept relationships.
 */
export const runtime = "nodejs";

import {
  retrieveRelatedMemories,
  generateOrgDNA,
  orgDNAToMarkdown,
  getIdeaLineage,
  detectConvergence,
  getMemoryGraph,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  query: z.string().min(1).max(2000),
  threshold: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(50).optional(),
  sessionFilter: z.string().max(100).optional(),
});

/**
 * Query the innovation memory graph for related past ideas, org DNA reports,
 * idea lineage, or convergence patterns.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { query, threshold, limit, sessionFilter } = parsed.data;
    const results = retrieveRelatedMemories(query, {
      threshold: threshold ?? 0.3,
      limit: limit ?? 10,
      sessionFilter: sessionFilter ? [sessionFilter] : undefined,
    });

    logger.info("Memory graph query", { requestId, query: query.slice(0, 100), resultCount: results.nodes.length });

    return new Response(JSON.stringify({ results }), { status: 200, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Memory graph query failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * GET endpoints for org DNA, convergence patterns, lineage, and full graph.
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "graph";

    switch (action) {
      case "org-dna": {
        const format = url.searchParams.get("format");
        const report = generateOrgDNA();
        if (format === "markdown") {
          return new Response(orgDNAToMarkdown(report), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(report), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "convergence": {
        const patterns = detectConvergence();
        return new Response(JSON.stringify({ patterns }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "lineage": {
        const ideaId = url.searchParams.get("ideaId");
        if (!ideaId) {
          return new Response(JSON.stringify({ error: "ideaId parameter required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const lineage = getIdeaLineage(ideaId);
        return new Response(JSON.stringify(lineage), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "graph":
      default: {
        const graph = getMemoryGraph();
        return new Response(JSON.stringify(graph), { status: 200, headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Memory graph GET failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
