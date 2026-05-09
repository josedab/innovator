export const runtime = "nodejs";

import {
  indexSearchDocument,
  removeSearchDocument,
  hybridSearch,
  getSearchSuggestions,
  getSearchIndexStats,
  IdeaSearchSchema,
  IndexDocumentSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SearchAction = z.object({
  action: z.literal("search"),
  ...IdeaSearchSchema.shape,
});

const IndexAction = z.object({
  action: z.literal("index"),
  ...IndexDocumentSchema.shape,
});

const RemoveAction = z.object({
  action: z.literal("remove"),
  documentId: z.string().min(1),
});

const SuggestAction = z.object({
  action: z.literal("suggest"),
  prefix: z.string().min(1).max(200),
  limit: z.number().min(1).max(20).default(5),
});

const StatsAction = z.object({
  action: z.literal("stats"),
});

const RequestSchema = z.discriminatedUnion("action", [
  SearchAction,
  IndexAction,
  RemoveAction,
  SuggestAction,
  StatsAction,
]);

/** POST /api/idea-search — hybrid search across innovation sessions. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
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

    switch (parsed.data.action) {
      case "search": {
        const { action: _, ...searchParams } = parsed.data;
        const results = hybridSearch(
          searchParams.query,
          searchParams.limit,
          searchParams.offset,
          searchParams.facets
        );
        return Response.json(results, { headers: API_RESPONSE_HEADERS });
      }
      case "index": {
        const { action: _, ...docData } = parsed.data;
        const doc = indexSearchDocument(docData);
        return Response.json({ document: doc }, { headers: API_RESPONSE_HEADERS });
      }
      case "remove": {
        const removed = removeSearchDocument(parsed.data.documentId);
        return Response.json({ success: removed }, { headers: API_RESPONSE_HEADERS });
      }
      case "suggest": {
        const suggestions = getSearchSuggestions(parsed.data.prefix, parsed.data.limit);
        return Response.json({ suggestions }, { headers: API_RESPONSE_HEADERS });
      }
      case "stats": {
        const stats = getSearchIndexStats();
        return Response.json(stats, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Idea search error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/idea-search",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
