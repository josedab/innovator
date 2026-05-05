export const runtime = "nodejs";

import {
  indexDocument,
  semanticSearch,
  findSimilarDocuments,
  clusterDocuments,
  discoverConnections,
  getIndexSize,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IndexSchema = z.object({
  action: z.literal("index"),
  type: z.enum(["investigation", "idea", "session", "angle-result"]),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(10000),
  metadata: z.record(z.string().max(500)).optional(),
  sessionId: z.string().max(100).optional(),
});

const SearchSchema = z.object({
  action: z.literal("search"),
  query: z.string().min(1).max(2000),
  limit: z.number().min(1).max(50).optional(),
});

const SimilarSchema = z.object({
  action: z.literal("similar"),
  documentId: z.string().min(1).max(200),
  limit: z.number().min(1).max(50).optional(),
});

const ClusterSchema = z.object({
  action: z.literal("cluster"),
  numClusters: z.number().min(2).max(20).optional(),
});

const DiscoverSchema = z.object({
  action: z.literal("discover"),
  documentId: z.string().min(1).max(200),
});

const RequestSchema = z.discriminatedUnion("action", [
  IndexSchema,
  SearchSchema,
  SimilarSchema,
  ClusterSchema,
  DiscoverSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "index": {
        const { action: _, ...docData } = parsed;
        const doc = indexDocument(docData);
        return Response.json({ document: doc, indexSize: getIndexSize() }, { headers: API_RESPONSE_HEADERS });
      }
      case "search": {
        const results = semanticSearch(parsed.query, parsed.limit);
        return Response.json(results, { headers: API_RESPONSE_HEADERS });
      }
      case "similar": {
        const results = findSimilarDocuments(parsed.documentId, parsed.limit);
        return Response.json({ results }, { headers: API_RESPONSE_HEADERS });
      }
      case "cluster": {
        const clusters = clusterDocuments(parsed.numClusters);
        return Response.json({ clusters }, { headers: API_RESPONSE_HEADERS });
      }
      case "discover": {
        const connections = discoverConnections(parsed.documentId);
        return Response.json(connections, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/search" });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
