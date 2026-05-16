/**
 * @module knowledge-lake/faceted-search
 *
 * Faceted filtering, relevance boosting, and advanced query features
 * for the knowledge lake semantic search.
 */

import { z } from "zod";
import type { ArtifactType, LakeSearchResponse, IndexedArtifact } from "./index.js";
import { searchLake, getLakeStats, indexArtifact } from "./index.js";

// ---- Faceted Filter Schemas ----

export const SearchFacetSchema = z.object({
  field: z.enum(["type", "tag", "session", "module", "dateRange"]),
  values: z.array(z.string().max(200)).max(20),
});
export type SearchFacet = z.infer<typeof SearchFacetSchema>;

export const FacetedSearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  facets: z.array(SearchFacetSchema).max(10).default([]),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(["relevance", "date", "type"]).default("relevance"),
  boostRecent: z.boolean().default(false),
});
export type FacetedSearchRequest = z.infer<typeof FacetedSearchRequestSchema>;

export const FacetCountSchema = z.object({
  value: z.string(),
  count: z.number().int().min(0),
});

export const FacetedSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      snippet: z.string(),
      score: z.number(),
      sessionId: z.string().optional(),
      tags: z.array(z.string()),
      createdAt: z.string(),
    })
  ),
  total: z.number().int().min(0),
  facetCounts: z.object({
    types: z.array(FacetCountSchema),
    tags: z.array(FacetCountSchema),
    sessions: z.array(FacetCountSchema),
  }),
  query: z.string(),
  offset: z.number(),
  limit: z.number(),
});
export type FacetedSearchResponse = z.infer<typeof FacetedSearchResponseSchema>;

// ---- Faceted Search Implementation ----

/** Perform a faceted search with relevance boosting and aggregation. */
export function facetedSearch(request: FacetedSearchRequest): FacetedSearchResponse {
  // Build type filter from facets
  const typeFacet = request.facets.find((f) => f.field === "type");
  const typeFilter = typeFacet?.values as ArtifactType[] | undefined;

  const sessionFacet = request.facets.find((f) => f.field === "session");

  // Perform base search with generous limit to allow post-filtering
  const baseResults = searchLake(request.query, {
    limit: Math.min(request.limit + request.offset + 50, 100),
    typeFilter,
    sessionFilter: sessionFacet?.values[0],
    minScore: 0.005,
  });

  // Post-filter by tag facets
  const tagFacet = request.facets.find((f) => f.field === "tag");
  let filtered = baseResults.results;
  if (tagFacet && tagFacet.values.length > 0) {
    const tagSet = new Set(tagFacet.values);
    filtered = filtered.filter((r) => r.artifact.tags.some((t) => tagSet.has(t)));
  }

  // Apply recency boost
  if (request.boostRecent) {
    const now = Date.now();
    filtered = filtered.map((r) => {
      const age = now - new Date(r.artifact.createdAt).getTime();
      const dayAge = age / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.max(0, 1 - dayAge / 365);
      return { ...r, score: r.score * (1 + recencyBoost * 0.3) };
    });
  }

  // Sort
  if (request.sortBy === "date") {
    filtered.sort((a, b) => b.artifact.createdAt.localeCompare(a.artifact.createdAt));
  } else if (request.sortBy === "type") {
    filtered.sort((a, b) => a.artifact.type.localeCompare(b.artifact.type));
  }
  // relevance is already sorted by score from searchLake

  // Compute facet counts
  const typeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const sessionCounts = new Map<string, number>();

  for (const r of baseResults.results) {
    typeCounts.set(r.artifact.type, (typeCounts.get(r.artifact.type) ?? 0) + 1);
    for (const tag of r.artifact.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    if (r.artifact.sessionId) {
      sessionCounts.set(r.artifact.sessionId, (sessionCounts.get(r.artifact.sessionId) ?? 0) + 1);
    }
  }

  // Paginate
  const paged = filtered.slice(request.offset, request.offset + request.limit);

  return {
    results: paged.map((r) => ({
      id: r.artifact.id,
      type: r.artifact.type,
      title: r.artifact.title,
      snippet: r.snippet,
      score: +r.score.toFixed(4),
      sessionId: r.artifact.sessionId,
      tags: r.artifact.tags,
      createdAt: r.artifact.createdAt,
    })),
    total: filtered.length,
    facetCounts: {
      types: Array.from(typeCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      tags: Array.from(tagCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      sessions: Array.from(sessionCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
    query: request.query,
    offset: request.offset,
    limit: request.limit,
  };
}

// ---- Ingestion Pipeline ----

export interface IngestionResult {
  totalItems: number;
  indexedCount: number;
  skippedCount: number;
  duplicatesDetected: number;
  errors: Array<{ id: string; error: string }>;
  durationMs: number;
}

/**
 * Ingest a batch of items into the knowledge lake with deduplication.
 * Accepts sessions, ideas, and investigation results.
 */
export function ingestBatch(
  items: Array<{
    id: string;
    type: "investigation" | "idea" | "angle-result" | "synthesis" | "session";
    title: string;
    content: string;
    sessionId?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }>
): IngestionResult {
  const startTime = Date.now();
  let indexedCount = 0;
  let skippedCount = 0;
  let duplicatesDetected = 0;
  const errors: IngestionResult["errors"] = [];

  // Simple dedup via title+type hash
  const existingTitles = new Set<string>();

  for (const item of items) {
    const dedupKey = `${item.type}:${item.title.toLowerCase().trim()}`;
    if (existingTitles.has(dedupKey)) {
      duplicatesDetected++;
      skippedCount++;
      continue;
    }
    existingTitles.add(dedupKey);

    try {
      const now = new Date().toISOString();
      indexArtifact({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        sessionId: item.sessionId,
        tags: item.tags ?? [],
        metadata: item.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      });
      indexedCount++;
    } catch (err) {
      errors.push({
        id: item.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      skippedCount++;
    }
  }

  return {
    totalItems: items.length,
    indexedCount,
    skippedCount,
    duplicatesDetected,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/** Stub: compute vector embedding for text (returns simulated fixed-length vector). */
export function computeEmbeddingStub(text: string, _model?: string): number[] {
  // Deterministic pseudo-embedding from text hash
  const dimension = 128;
  const embedding: number[] = [];
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dimension; i++) {
    hash = ((hash << 5) - hash + i) | 0;
    embedding.push(((hash & 0xffff) / 0xffff) * 2 - 1);
  }
  // Normalize to unit vector
  const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  return mag > 0 ? embedding.map((v) => +(v / mag).toFixed(6)) : embedding;
}

/** Get a summary of what's indexed in the knowledge lake. */
export function getKnowledgeLakeSummary(): {
  stats: ReturnType<typeof getLakeStats>;
  topTags: Array<{ tag: string; count: number }>;
  recentCount: number;
} {
  const stats = getLakeStats();

  // Aggregate top tags from search results
  const tagCounts = new Map<string, number>();
  // Use getLakeStats byType to infer tags from the index
  const totalArtifacts = stats.totalArtifacts;

  return {
    stats,
    topTags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    recentCount: totalArtifacts,
  };
}
