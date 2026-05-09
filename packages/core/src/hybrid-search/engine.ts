/**
 * Hybrid search engine combining BM25 keyword search with semantic similarity.
 * Provides faceted filtering and relevance ranking.
 */
import type {
  SearchableDocument,
  IdeaSearchResult,
  SearchResponse,
  SearchFacets,
} from "./types.js";

const documents = new Map<string, SearchableDocument>();

// BM25 parameters
const K1 = 1.2;
const B = 0.75;

// Stop words for BM25
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "that",
  "this",
  "was",
  "are",
  "be",
  "has",
  "had",
  "have",
  "will",
  "can",
  "do",
  "does",
  "did",
  "not",
  "as",
  "we",
  "our",
  "they",
  "he",
  "she",
  "its",
  "my",
  "your",
]);

/** Index a document for searching. */
export function indexSearchDocument(
  doc: Omit<SearchableDocument, "id" | "createdAt">
): SearchableDocument {
  const searchDoc: SearchableDocument = {
    ...doc,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  documents.set(searchDoc.id, searchDoc);
  return searchDoc;
}

/** Remove a document from the index. */
export function removeSearchDocument(id: string): boolean {
  return documents.delete(id);
}

/** Perform hybrid search (BM25 + semantic similarity). */
export function hybridSearch(
  query: string,
  limit: number = 20,
  offset: number = 0,
  facets?: SearchFacets
): SearchResponse {
  const startTime = Date.now();
  const queryTokens = tokenize(query);

  // Get all documents, apply facet filters
  let candidates = Array.from(documents.values());
  candidates = applyFacets(candidates, facets);

  // Compute BM25 scores
  const avgDocLen = computeAvgDocLength();
  const docCount = documents.size;
  const bm25Scores = new Map<string, number>();
  const keywordHighlights = new Map<string, string[]>();

  for (const doc of candidates) {
    const docTokens = tokenize(doc.title + " " + doc.content);
    let bm25Score = 0;
    const highlights: string[] = [];

    for (const term of queryTokens) {
      const tf = docTokens.filter((t) => t === term).length;
      const df = countDocFrequency(term);
      const idf = Math.log((docCount - df + 0.5) / (df + 0.5) + 1);
      const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docTokens.length / avgDocLen)));
      bm25Score += idf * tfNorm;

      if (tf > 0) {
        const snippet = findSnippet(doc.content, term);
        if (snippet) highlights.push(snippet);
      }
    }

    bm25Scores.set(doc.id, bm25Score);
    keywordHighlights.set(doc.id, highlights.slice(0, 3));
  }

  // Compute semantic similarity using token overlap (TF-IDF-like)
  const semanticScores = new Map<string, number>();
  const querySet = new Set(queryTokens);

  for (const doc of candidates) {
    const docTokens = new Set(tokenize(doc.title + " " + doc.content));
    let overlap = 0;
    for (const token of querySet) {
      if (docTokens.has(token)) overlap++;
    }
    semanticScores.set(doc.id, querySet.size > 0 ? overlap / querySet.size : 0);
  }

  // Combine scores (60% BM25 + 40% semantic)
  const results: IdeaSearchResult[] = candidates.map((doc) => {
    const bm25 = bm25Scores.get(doc.id) ?? 0;
    const semantic = semanticScores.get(doc.id) ?? 0;
    const maxBm25 = Math.max(...Array.from(bm25Scores.values()), 1);
    const normalizedBm25 = bm25 / maxBm25;
    const combined = normalizedBm25 * 0.6 + semantic * 0.4;

    return {
      document: doc,
      relevanceScore: Math.round(combined * 1000) / 1000,
      matchType: (bm25 > 0 && semantic > 0
        ? "hybrid"
        : bm25 > 0
          ? "keyword"
          : "semantic") as IdeaSearchResult["matchType"],
      highlights: keywordHighlights.get(doc.id) ?? [],
    };
  });

  // Sort by relevance
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Filter out zero-relevance results
  const filtered = results.filter((r) => r.relevanceScore > 0);

  // Compute facet counts
  const facetCounts = computeFacetCounts(candidates);

  return {
    results: filtered.slice(offset, offset + limit),
    totalResults: filtered.length,
    facetCounts,
    query,
    durationMs: Date.now() - startTime,
  };
}

/** Get search suggestions based on indexed content. */
export function getSearchSuggestions(prefix: string, limit: number = 5): string[] {
  const prefixLower = prefix.toLowerCase();
  const suggestions = new Set<string>();

  for (const doc of documents.values()) {
    if (doc.title.toLowerCase().includes(prefixLower)) {
      suggestions.add(doc.title);
    }
    if (suggestions.size >= limit) break;
  }

  return Array.from(suggestions).slice(0, limit);
}

/** Get index statistics. */
export function getSearchIndexStats(): {
  totalDocuments: number;
  byType: Record<string, number>;
  byAngle: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byAngle: Record<string, number> = {};

  for (const doc of documents.values()) {
    byType[doc.type] = (byType[doc.type] ?? 0) + 1;
    if (doc.angleId) {
      byAngle[doc.angleId] = (byAngle[doc.angleId] ?? 0) + 1;
    }
  }

  return { totalDocuments: documents.size, byType, byAngle };
}

/** Clear the search index. */
export function clearSearchIndex(): void {
  documents.clear();
}

// --- Internal helpers ---

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function computeAvgDocLength(): number {
  if (documents.size === 0) return 1;
  let total = 0;
  for (const doc of documents.values()) {
    total += tokenize(doc.title + " " + doc.content).length;
  }
  return total / documents.size;
}

function countDocFrequency(term: string): number {
  let count = 0;
  for (const doc of documents.values()) {
    if (tokenize(doc.title + " " + doc.content).includes(term)) {
      count++;
    }
  }
  return count;
}

function findSnippet(content: string, term: string): string | null {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + term.length + 60);
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
}

function applyFacets(docs: SearchableDocument[], facets?: SearchFacets): SearchableDocument[] {
  if (!facets) return docs;

  return docs.filter((doc) => {
    if (facets.type?.length && !facets.type.includes(doc.type)) return false;
    if (facets.angleId?.length && doc.angleId && !facets.angleId.includes(doc.angleId))
      return false;
    if (facets.dateFrom && doc.createdAt < facets.dateFrom) return false;
    if (facets.dateTo && doc.createdAt > facets.dateTo) return false;
    if (facets.minScore !== undefined && (doc.score ?? 0) < facets.minScore) return false;
    if (facets.maxScore !== undefined && (doc.score ?? 100) > facets.maxScore) return false;
    if (facets.tags?.length && doc.tags && !facets.tags.some((t) => doc.tags?.includes(t)))
      return false;
    return true;
  });
}

function computeFacetCounts(docs: SearchableDocument[]): SearchResponse["facetCounts"] {
  const types: Record<string, number> = {};
  const angles: Record<string, number> = {};
  const tags: Record<string, number> = {};

  for (const doc of docs) {
    types[doc.type] = (types[doc.type] ?? 0) + 1;
    if (doc.angleId) angles[doc.angleId] = (angles[doc.angleId] ?? 0) + 1;
    if (doc.tags) {
      for (const tag of doc.tags) {
        tags[tag] = (tags[tag] ?? 0) + 1;
      }
    }
  }

  return { types, angles, tags };
}
