/**
 * GET /api/knowledge-lake — Search, stats, trends, duplicates.
 * POST /api/knowledge-lake — Index artifacts, faceted search.
 */
export const runtime = "nodejs";

import {
  searchLake,
  indexArtifact,
  getLakeStats,
  surfaceTrends,
  detectDuplicates,
  generateCrossSessionInsights,
} from "@innovator/core";
import {
  facetedSearch,
  ingestBatch,
  computeEmbeddingStub,
} from "@innovator/core/dist/knowledge-lake/faceted-search.js";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * GET /api/knowledge-lake — Query the knowledge lake.
 *
 * @queryParam view — "search" | "stats" | "trends" | "duplicates" | "insights"
 * @queryParam q — Search query (required for view=search)
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "stats";

    if (view === "search") {
      const query = searchParams.get("q");
      if (!query) {
        return Response.json(
          { error: "Query parameter 'q' is required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const limit = parseInt(searchParams.get("limit") ?? "20", 10);
      const typeFilter = searchParams.get("type")?.split(",") as Parameters<
        typeof searchLake
      >[1] extends { typeFilter?: infer T }
        ? T
        : never;
      const results = searchLake(query, { limit, typeFilter: typeFilter ?? undefined });
      return Response.json(results, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "stats") {
      const stats = getLakeStats();
      return Response.json(stats, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "trends") {
      const minFreq = parseInt(searchParams.get("minFrequency") ?? "3", 10);
      const trends = surfaceTrends(minFreq);
      return Response.json({ trends }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "duplicates") {
      const threshold = parseFloat(searchParams.get("threshold") ?? "0.75");
      const duplicates = detectDuplicates(threshold);
      return Response.json({ duplicates }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "insights") {
      const insights = generateCrossSessionInsights();
      return Response.json(insights, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Invalid view parameter" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    logger.error("Knowledge lake GET failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

const IndexRequestSchema = z.object({
  action: z.literal("index"),
  artifact: z.object({
    id: z.string().max(200),
    type: z.enum([
      "investigation",
      "idea",
      "angle-result",
      "synthesis",
      "session",
      "genome",
      "signal",
      "outcome",
      "artifact",
      "vote",
      "comment",
    ]),
    title: z.string().max(500),
    content: z.string().max(50000),
    sessionId: z.string().max(100).optional(),
    sourceModule: z.string().max(100).optional(),
    tags: z.array(z.string().max(100)).max(20).default([]),
    metadata: z.record(z.unknown()).default({}),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
});

const FacetedSearchRequestSchema = z.object({
  action: z.literal("faceted-search"),
  query: z.string().min(1).max(2000),
  facets: z
    .array(
      z.object({
        field: z.enum(["type", "tag", "session", "module", "dateRange"]),
        values: z.array(z.string().max(200)).max(20),
      })
    )
    .max(10)
    .default([]),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(["relevance", "date", "type"]).default("relevance"),
  boostRecent: z.boolean().default(false),
});

const IngestBatchSchema = z.object({
  action: z.literal("ingest-batch"),
  items: z
    .array(
      z.object({
        id: z.string().max(200),
        type: z.enum(["investigation", "idea", "angle-result", "synthesis", "session"]),
        title: z.string().max(500),
        content: z.string().max(50000),
        sessionId: z.string().max(100).optional(),
        tags: z.array(z.string().max(100)).max(20).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .min(1)
    .max(200),
});

const EmbeddingRequestSchema = z.object({
  action: z.literal("compute-embedding"),
  text: z.string().min(1).max(10000),
});

const PostBodySchema = z.discriminatedUnion("action", [
  IndexRequestSchema,
  FacetedSearchRequestSchema,
  IngestBatchSchema,
  EmbeddingRequestSchema,
]);

/**
 * POST /api/knowledge-lake — Index artifacts or perform faceted search.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "index") {
      const now = new Date().toISOString();
      indexArtifact({
        ...parsed.artifact,
        createdAt: parsed.artifact.createdAt ?? now,
        updatedAt: parsed.artifact.updatedAt ?? now,
      });
      return Response.json({ success: true }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "faceted-search") {
      const results = facetedSearch({
        query: parsed.query,
        facets: parsed.facets,
        limit: parsed.limit,
        offset: parsed.offset,
        sortBy: parsed.sortBy,
        boostRecent: parsed.boostRecent,
      });
      return Response.json(results, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "ingest-batch") {
      const result = ingestBatch(parsed.items);
      return Response.json(result, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "compute-embedding") {
      const embedding = computeEmbeddingStub(parsed.text);
      return Response.json(
        { embedding, dimensions: embedding.length },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    return Response.json(
      { error: "Unknown action" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation failed", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error("Knowledge lake POST failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
