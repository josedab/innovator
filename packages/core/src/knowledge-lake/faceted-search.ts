/**
 * @module knowledge-lake/faceted-search
 *
 * Faceted filtering, relevance boosting, and advanced query features
 * for the knowledge lake semantic search.
 */

import { z } from "zod";
import type { ArtifactType, IndexedArtifact } from "./index.js";
import { searchLake, getLakeStats, indexArtifact, listIndexedArtifacts } from "./index.js";

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

function parseDateFacet(values: string[]): { start?: number; end?: number } {
  if (values.length === 0) return {};

  const [raw] = values;
  if (raw.startsWith("last-")) {
    const amount = Number.parseInt(raw.slice(5), 10);
    if (!Number.isNaN(amount) && raw.endsWith("d")) {
      return { start: Date.now() - amount * 24 * 60 * 60 * 1000 };
    }
  }

  const [startRaw, endRaw] = raw.split(":", 2);
  const start = startRaw ? new Date(startRaw).getTime() : Number.NaN;
  const end = endRaw ? new Date(endRaw).getTime() : Number.NaN;

  return {
    start: Number.isNaN(start) ? undefined : start,
    end: Number.isNaN(end) ? undefined : end,
  };
}

function isWithinDateRange(
  artifact: IndexedArtifact,
  range: { start?: number; end?: number }
): boolean {
  if (range.start == null && range.end == null) return true;
  const artifactTime = new Date(artifact.updatedAt || artifact.createdAt).getTime();
  if (Number.isNaN(artifactTime)) return false;
  if (range.start != null && artifactTime < range.start) return false;
  if (range.end != null && artifactTime > range.end) return false;
  return true;
}

/** Perform a faceted search with relevance boosting and aggregation. */
export function facetedSearch(request: FacetedSearchRequest): FacetedSearchResponse {
  const parsed = FacetedSearchRequestSchema.parse(request);
  const typeFacet = parsed.facets.find((facet) => facet.field === "type");
  const sessionFacet = parsed.facets.find((facet) => facet.field === "session");
  const tagFacet = parsed.facets.find((facet) => facet.field === "tag");
  const dateFacet = parsed.facets.find((facet) => facet.field === "dateRange");
  const sessionFilter = new Set((sessionFacet?.values ?? []).map((value) => value.toLowerCase()));
  const tagFilter = new Set((tagFacet?.values ?? []).map((value) => value.toLowerCase()));
  const dateRange = parseDateFacet(dateFacet?.values ?? []);

  const baseResults = searchLake(parsed.query, {
    limit: Math.min(parsed.limit + parsed.offset + 100, 200),
    typeFilter: typeFacet?.values as ArtifactType[] | undefined,
    minScore: 0.005,
  });

  let filtered = baseResults.results.filter((result) => {
    if (sessionFilter.size > 0) {
      const sessionId = result.artifact.sessionId?.toLowerCase();
      if (!sessionId || !sessionFilter.has(sessionId)) return false;
    }

    if (tagFilter.size > 0) {
      const resultTags = result.artifact.tags.map((tag) => tag.toLowerCase());
      if (!resultTags.some((tag) => tagFilter.has(tag))) return false;
    }

    return isWithinDateRange(result.artifact, dateRange);
  });

  if (parsed.boostRecent) {
    const now = Date.now();
    filtered = filtered.map((result) => {
      const ageDays = Math.max(
        0,
        (now - new Date(result.artifact.updatedAt || result.artifact.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const recencyBoost = Math.max(0, 1 - ageDays / 180);
      return { ...result, score: result.score * (1 + recencyBoost * 0.35) };
    });
  }

  if (parsed.sortBy === "date") {
    filtered.sort((a, b) => b.artifact.createdAt.localeCompare(a.artifact.createdAt));
  } else if (parsed.sortBy === "type") {
    filtered.sort((a, b) => a.artifact.type.localeCompare(b.artifact.type));
  } else {
    filtered.sort((a, b) => b.score - a.score);
  }

  const typeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const sessionCounts = new Map<string, number>();

  for (const result of filtered) {
    typeCounts.set(result.artifact.type, (typeCounts.get(result.artifact.type) ?? 0) + 1);
    for (const tag of result.artifact.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    if (result.artifact.sessionId) {
      sessionCounts.set(
        result.artifact.sessionId,
        (sessionCounts.get(result.artifact.sessionId) ?? 0) + 1
      );
    }
  }

  const paged = filtered.slice(parsed.offset, parsed.offset + parsed.limit);

  return {
    results: paged.map((result) => ({
      id: result.artifact.id,
      type: result.artifact.type,
      title: result.artifact.title,
      snippet: result.snippet,
      score: +result.score.toFixed(4),
      sessionId: result.artifact.sessionId,
      tags: result.artifact.tags,
      createdAt: result.artifact.createdAt,
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
    query: parsed.query,
    offset: parsed.offset,
    limit: parsed.limit,
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

  const normalizeKey = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const existingDedupKeys = new Set(
    listIndexedArtifacts().map((artifact) => `${artifact.type}:${normalizeKey(artifact.title)}`)
  );
  const existingContentKeys = new Set(
    listIndexedArtifacts().map((artifact) => normalizeKey(artifact.content).slice(0, 500))
  );
  const batchKeys = new Set<string>();

  for (const item of items) {
    const dedupKey = `${item.type}:${normalizeKey(item.title)}`;
    const contentKey = normalizeKey(item.content).slice(0, 500);
    if (
      batchKeys.has(dedupKey) ||
      existingDedupKeys.has(dedupKey) ||
      (contentKey.length > 0 && existingContentKeys.has(contentKey))
    ) {
      duplicatesDetected++;
      skippedCount++;
      continue;
    }
    batchKeys.add(dedupKey);

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
      existingDedupKeys.add(dedupKey);
      if (contentKey.length > 0) existingContentKeys.add(contentKey);
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

/** Compute a deterministic semantic-ish embedding using token and trigram hashing. */
export function computeEmbeddingStub(text: string, _model?: string): number[] {
  const dimension = 128;
  const embedding = Array.from({ length: dimension }, () => 0);
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return embedding;

  const features = new Map<string, number>();
  const tokens = normalized.split(" ").filter(Boolean);
  for (const token of tokens) {
    features.set(`tok:${token}`, (features.get(`tok:${token}`) ?? 0) + 1.25);
    const padded = `^${token}$`;
    for (let i = 0; i <= padded.length - 3; i++) {
      const trigram = padded.slice(i, i + 3);
      features.set(`tri:${trigram}`, (features.get(`tri:${trigram}`) ?? 0) + 0.35);
    }
  }

  for (const [feature, weight] of features) {
    let hash = 0;
    for (let i = 0; i < feature.length; i++) {
      hash = (hash * 31 + feature.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % dimension;
    const sign = (hash & 1) === 0 ? 1 : -1;
    embedding[index] += sign * Math.log1p(weight);
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? embedding.map((value) => +(value / magnitude).toFixed(6)) : embedding;
}

/** Get a summary of what's indexed in the knowledge lake. */
export function getKnowledgeLakeSummary(): {
  stats: ReturnType<typeof getLakeStats>;
  topTags: Array<{ tag: string; count: number }>;
  recentCount: number;
} {
  const stats = getLakeStats();
  const artifacts = listIndexedArtifacts();
  const tagCounts = new Map<string, number>();
  const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let recentCount = 0;

  for (const artifact of artifacts) {
    for (const tag of artifact.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    const updatedAt = new Date(artifact.updatedAt || artifact.createdAt).getTime();
    if (!Number.isNaN(updatedAt) && updatedAt >= recentThreshold) {
      recentCount++;
    }
  }

  return {
    stats,
    topTags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count === a.count ? a.tag.localeCompare(b.tag) : b.count - a.count))
      .slice(0, 20),
    recentCount,
  };
}
