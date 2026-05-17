/**
 * @module embeddings
 *
 * Innovation Embeddings & Semantic Search — lightweight vector search using
 * TF-IDF-based embeddings (no external dependencies). Supports indexing
 * investigations, ideas, and sessions for similarity-based retrieval,
 * clustering, and cross-investigation discovery.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const EmbeddingDocumentSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["investigation", "idea", "session", "angle-result"]),
  title: z.string().max(500),
  content: z.string().max(10000),
  metadata: z.record(z.string().max(500)).optional(),
  sessionId: z.string().max(100).optional(),
  createdAt: z.string(),
});

export const SearchResultSchema = z.object({
  document: EmbeddingDocumentSchema,
  score: z.number().min(0).max(1),
});

export const ClusterSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(500),
  documentIds: z.array(z.string().max(200)),
  centroidTerms: z.array(z.string().max(100)).max(10),
});

export const SemanticSearchResultSchema = z.object({
  query: z.string().max(2000),
  results: z.array(SearchResultSchema).max(50),
  totalIndexed: z.number(),
  searchTimeMs: z.number(),
});

export const CrossDiscoveryResultSchema = z.object({
  sourceId: z.string().max(200),
  relatedDocuments: z.array(SearchResultSchema).max(20),
  sharedThemes: z.array(z.string().max(200)).max(10),
});

export type EmbeddingDocument = z.infer<typeof EmbeddingDocumentSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type Cluster = z.infer<typeof ClusterSchema>;
export type SemanticSearchResult = z.infer<typeof SemanticSearchResultSchema>;
export type CrossDiscoveryResult = z.infer<typeof CrossDiscoveryResultSchema>;

// ---- In-Memory Vector Store ----

interface IndexedDocument {
  document: EmbeddingDocument;
  vector: Map<string, number>;
  magnitude: number;
}

const index = new Map<string, IndexedDocument>();
const idfCache = new Map<string, number>();
let idfDirty = true;
const MAX_INDEX_SIZE = 50_000;

// ---- Text Processing ----

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "and",
  "but",
  "or",
  "not",
  "no",
  "if",
  "then",
  "than",
  "that",
  "this",
  "it",
  "its",
  "i",
  "we",
  "you",
  "he",
  "she",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "our",
  "their",
  "what",
  "which",
  "who",
  "when",
  "where",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "so",
  "very",
  "just",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function computeTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  const maxFreq = Math.max(...freq.values(), 1);
  const tf = new Map<string, number>();
  for (const [term, count] of freq) {
    tf.set(term, 0.5 + (0.5 * count) / maxFreq);
  }
  return tf;
}

function recomputeIDF(): void {
  if (!idfDirty) return;
  idfCache.clear();
  const N = index.size;
  if (N === 0) return;

  const docFreq = new Map<string, number>();
  for (const doc of index.values()) {
    for (const term of doc.vector.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  for (const [term, df] of docFreq) {
    idfCache.set(term, Math.log((N + 1) / (df + 1)) + 1);
  }
  idfDirty = false;
}

function computeTFIDF(tokens: string[]): { vector: Map<string, number>; magnitude: number } {
  const tf = computeTF(tokens);
  recomputeIDF();

  const vector = new Map<string, number>();
  let sumSq = 0;

  for (const [term, tfVal] of tf) {
    const idf = idfCache.get(term) ?? Math.log(index.size + 2);
    const tfidf = tfVal * idf;
    vector.set(term, tfidf);
    sumSq += tfidf * tfidf;
  }

  return { vector, magnitude: Math.sqrt(sumSq) };
}

function cosineSimilarity(a: IndexedDocument, b: IndexedDocument): number {
  if (a.magnitude === 0 || b.magnitude === 0) return 0;

  let dotProduct = 0;
  const smaller = a.vector.size < b.vector.size ? a : b;
  const larger = a.vector.size < b.vector.size ? b : a;

  for (const [term, val] of smaller.vector) {
    const otherVal = larger.vector.get(term);
    if (otherVal !== undefined) {
      dotProduct += val * otherVal;
    }
  }

  return dotProduct / (a.magnitude * b.magnitude);
}

// ---- Public API ----

/**
 * Index a document for semantic search.
 */
export function indexDocument(doc: Omit<EmbeddingDocument, "id" | "createdAt">): EmbeddingDocument {
  const document: EmbeddingDocument = {
    ...doc,
    id: doc.type === "idea" ? `idea-${randomUUID().slice(0, 8)}` : randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const tokens = tokenize(`${document.title} ${document.content}`);
  const { vector, magnitude } = computeTFIDF(tokens);

  index.set(document.id, { document, vector, magnitude });
  idfDirty = true;

  // Evict oldest documents when index exceeds capacity
  if (index.size > MAX_INDEX_SIZE) {
    const iter = index.keys();
    const toRemove = index.size - MAX_INDEX_SIZE;
    for (let i = 0; i < toRemove; i++) {
      const oldest = iter.next().value;
      if (oldest !== undefined) index.delete(oldest);
    }
  }

  return document;
}

/**
 * Bulk-index documents.
 */
export function indexDocuments(
  docs: Omit<EmbeddingDocument, "id" | "createdAt">[]
): EmbeddingDocument[] {
  return docs.map((d) => indexDocument(d));
}

/**
 * Remove a document from the index.
 */
export function removeDocument(id: string): boolean {
  const removed = index.delete(id);
  if (removed) idfDirty = true;
  return removed;
}

/**
 * Semantic search across all indexed documents.
 */
export function semanticSearch(query: string, limit: number = 10): SemanticSearchResult {
  const startTime = Date.now();

  if (index.size === 0) {
    return {
      query,
      results: [],
      totalIndexed: 0,
      searchTimeMs: Date.now() - startTime,
    };
  }

  const queryTokens = tokenize(query);
  const queryDoc = computeTFIDF(queryTokens);
  const queryIndexed: IndexedDocument = {
    document: { id: "", type: "idea", title: "", content: query, createdAt: "" },
    vector: queryDoc.vector,
    magnitude: queryDoc.magnitude,
  };

  const scored: SearchResult[] = [];
  for (const indexed of index.values()) {
    const score = cosineSimilarity(queryIndexed, indexed);
    if (score > 0.01) {
      scored.push({ document: indexed.document, score: Math.round(score * 1000) / 1000 });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    query,
    results: scored.slice(0, limit),
    totalIndexed: index.size,
    searchTimeMs: Date.now() - startTime,
  };
}

/**
 * Find documents similar to a given document ID.
 */
export function findSimilar(documentId: string, limit: number = 10): SearchResult[] {
  const source = index.get(documentId);
  if (!source) return [];

  const results: SearchResult[] = [];
  for (const [id, indexed] of index) {
    if (id === documentId) continue;
    const score = cosineSimilarity(source, indexed);
    if (score > 0.05) {
      results.push({ document: indexed.document, score: Math.round(score * 1000) / 1000 });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Cluster indexed documents by similarity using a simple agglomerative approach.
 */
export function clusterDocuments(numClusters: number = 5): Cluster[] {
  if (index.size === 0) return [];

  const docs = Array.from(index.values());
  const assignments = new Array<number>(docs.length);

  // Initialize each document as its own cluster
  const actualClusters = Math.min(numClusters, docs.length);
  for (let i = 0; i < docs.length; i++) {
    assignments[i] = i % actualClusters;
  }

  // K-means-style iterative assignment (simplified)
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;

    for (let i = 0; i < docs.length; i++) {
      let bestCluster = assignments[i];
      let bestSim = -1;

      for (let c = 0; c < actualClusters; c++) {
        const clusterDocs = docs.filter((_, j) => assignments[j] === c && j !== i);
        if (clusterDocs.length === 0) continue;

        const avgSim =
          clusterDocs.reduce((sum, d) => sum + cosineSimilarity(docs[i], d), 0) /
          clusterDocs.length;

        if (avgSim > bestSim) {
          bestSim = avgSim;
          bestCluster = c;
        }
      }

      if (bestCluster !== assignments[i]) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Build cluster objects
  const clusters: Cluster[] = [];
  for (let c = 0; c < actualClusters; c++) {
    const memberIndices = assignments.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0);
    if (memberIndices.length === 0) continue;

    // Find top terms in cluster
    const termFreq = new Map<string, number>();
    for (const idx of memberIndices) {
      for (const [term, weight] of docs[idx].vector) {
        termFreq.set(term, (termFreq.get(term) ?? 0) + weight);
      }
    }
    const centroidTerms = Array.from(termFreq.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([term]) => term);

    clusters.push({
      id: `cluster-${c}`,
      label: centroidTerms.slice(0, 3).join(", "),
      documentIds: memberIndices.map((i) => docs[i].document.id),
      centroidTerms,
    });
  }

  return clusters;
}

/**
 * Discover cross-investigation connections for a specific document.
 */
export function discoverConnections(documentId: string): CrossDiscoveryResult {
  const source = index.get(documentId);
  if (!source) {
    return { sourceId: documentId, relatedDocuments: [], sharedThemes: [] };
  }

  // Find related documents from different sessions
  const related: SearchResult[] = [];
  for (const [id, indexed] of index) {
    if (id === documentId) continue;
    if (indexed.document.sessionId === source.document.sessionId) continue;
    const score = cosineSimilarity(source, indexed);
    if (score > 0.1) {
      related.push({ document: indexed.document, score: Math.round(score * 1000) / 1000 });
    }
  }
  related.sort((a, b) => b.score - a.score);

  // Extract shared themes from top related docs
  const sharedTerms = new Map<string, number>();
  for (const r of related.slice(0, 10)) {
    const indexed = index.get(r.document.id);
    if (!indexed) continue;
    for (const term of source.vector.keys()) {
      if (indexed.vector.has(term)) {
        sharedTerms.set(term, (sharedTerms.get(term) ?? 0) + 1);
      }
    }
  }

  const sharedThemes = Array.from(sharedTerms.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([term]) => term);

  return {
    sourceId: documentId,
    relatedDocuments: related.slice(0, 20),
    sharedThemes,
  };
}

/** Get the total number of indexed documents. */
export function getIndexSize(): number {
  return index.size;
}

/** Clear the entire search index. */
export function clearEmbeddingsIndex(): void {
  index.clear();
  idfCache.clear();
  idfDirty = true;
}
