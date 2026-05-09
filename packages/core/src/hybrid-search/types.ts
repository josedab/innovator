import { z } from "zod";

/** A searchable document in the idea knowledge base. */
export interface SearchableDocument {
  id: string;
  type: "investigation" | "idea" | "synthesis" | "session";
  title: string;
  content: string;
  sessionId?: string;
  angleId?: string;
  score?: number;
  tags?: string[];
  createdAt: string;
}

/** Faceted filter options. */
export interface SearchFacets {
  type?: string[];
  angleId?: string[];
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  maxScore?: number;
  tags?: string[];
}

/** A single search result with relevance scoring. */
export interface IdeaSearchResult {
  document: SearchableDocument;
  relevanceScore: number;
  matchType: "semantic" | "keyword" | "hybrid";
  highlights: string[];
}

/** Full search response with results and facet counts. */
export interface SearchResponse {
  results: IdeaSearchResult[];
  totalResults: number;
  facetCounts: {
    types: Record<string, number>;
    angles: Record<string, number>;
    tags: Record<string, number>;
  };
  query: string;
  durationMs: number;
}

/** Zod schema for search request. */
export const IdeaSearchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  facets: z
    .object({
      type: z.array(z.string()).optional(),
      angleId: z.array(z.string()).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

/** Zod schema for indexing a document. */
export const IndexDocumentSchema = z.object({
  type: z.enum(["investigation", "idea", "synthesis", "session"]),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  sessionId: z.string().max(100).optional(),
  angleId: z.string().max(100).optional(),
  score: z.number().min(0).max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});
