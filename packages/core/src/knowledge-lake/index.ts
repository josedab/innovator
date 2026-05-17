/**
 * @module knowledge-lake
 *
 * Innovation Knowledge Lake — unified RAG-powered knowledge base that indexes
 * all past sessions, ideas, genomes, signals, and outcomes into a searchable
 * semantic memory with cross-session learning.
 *
 * Components:
 * - Unified Indexer: vector embeddings of all innovation artifacts
 * - Semantic Search API: natural-language queries with relevance scoring
 * - Cross-Session Intelligence: duplicate detection and trend surfacing
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const ArtifactTypeSchema = z.enum([
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
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const IndexedArtifactSchema = z.object({
  id: z.string().max(200),
  type: ArtifactTypeSchema,
  title: z.string().max(500),
  content: z.string().max(50000),
  sessionId: z.string().max(100).optional(),
  sourceModule: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).max(20).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IndexedArtifact = z.infer<typeof IndexedArtifactSchema>;

export const LakeSearchResultSchema = z.object({
  artifact: IndexedArtifactSchema,
  score: z.number().min(0).max(1),
  matchedTerms: z.array(z.string().max(100)).max(20),
  snippet: z.string().max(500),
});
export type LakeSearchResult = z.infer<typeof LakeSearchResultSchema>;

export const LakeSearchResponseSchema = z.object({
  query: z.string().max(2000),
  results: z.array(LakeSearchResultSchema).max(50),
  totalIndexed: z.number().int().min(0),
  searchTimeMs: z.number().min(0),
  suggestions: z.array(z.string().max(200)).max(5),
});
export type LakeSearchResponse = z.infer<typeof LakeSearchResponseSchema>;

export const DuplicateGroupSchema = z.object({
  id: z.string().max(100),
  artifacts: z.array(z.string().max(200)).min(2),
  similarity: z.number().min(0).max(1),
  representativeTitle: z.string().max(500),
});
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

export const TrendSchema = z.object({
  id: z.string().max(100),
  topic: z.string().max(300),
  frequency: z.number().int().min(1),
  firstSeen: z.string(),
  lastSeen: z.string(),
  relatedArtifactIds: z.array(z.string().max(200)).max(50),
  momentum: z.enum(["rising", "stable", "declining"]),
});
export type Trend = z.infer<typeof TrendSchema>;

export const CrossSessionInsightSchema = z.object({
  duplicates: z.array(DuplicateGroupSchema).max(100),
  trends: z.array(TrendSchema).max(50),
  totalArtifacts: z.number().int().min(0),
  uniqueTopics: z.number().int().min(0),
  generatedAt: z.string(),
});
export type CrossSessionInsight = z.infer<typeof CrossSessionInsightSchema>;

// ---- TF-IDF In-Memory Index ----

interface InternalEntry {
  artifact: IndexedArtifact;
  tf: Map<string, number>;
  terms: Map<string, number>; // term -> TF-IDF weight
}

const index = new Map<string, InternalEntry>();
const documentFrequency = new Map<string, number>();
let totalDocuments = 0;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function computeTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const max = Math.max(...freq.values(), 1);
  const tf = new Map<string, number>();
  for (const [term, count] of freq) {
    tf.set(term, 0.5 + 0.5 * (count / max));
  }
  return tf;
}

function rebuildIDF(): void {
  for (const entry of index.values()) {
    entry.terms.clear();
    for (const [term, tfVal] of entry.tf) {
      const idf = Math.log((totalDocuments + 1) / ((documentFrequency.get(term) ?? 0) + 1));
      entry.terms.set(term, tfVal * idf);
    }
  }
}

// ---- Indexing ----

/**
 * Index an artifact into the knowledge lake.
 */
export function indexArtifact(artifact: IndexedArtifact): void {
  const validated = IndexedArtifactSchema.parse(artifact);
  if (index.has(validated.id)) {
    removeFromIndex(validated.id);
  }

  const text = `${validated.title} ${validated.content} ${validated.tags.join(" ")}`;
  const tokens = tokenize(text);
  const tf = computeTF(tokens);

  const uniqueTerms = new Set(tokens);
  for (const term of uniqueTerms) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  totalDocuments++;
  index.set(validated.id, { artifact: validated, tf, terms: new Map() });
  rebuildIDF();
}

/**
 * Bulk index multiple artifacts.
 */
export function indexArtifacts(artifacts: IndexedArtifact[]): number {
  let count = 0;
  for (const artifact of artifacts) {
    try {
      indexArtifact(artifact);
      count++;
    } catch {
      // Skip invalid artifacts
    }
  }
  rebuildIDF();
  return count;
}

/**
 * Remove an artifact from the index.
 */
export function removeFromIndex(artifactId: string): boolean {
  const entry = index.get(artifactId);
  if (!entry) return false;

  const tokens = tokenize(`${entry.artifact.title} ${entry.artifact.content}`);
  const uniqueTerms = new Set(tokens);
  for (const term of uniqueTerms) {
    const count = documentFrequency.get(term) ?? 0;
    if (count <= 1) documentFrequency.delete(term);
    else documentFrequency.set(term, count - 1);
  }

  index.delete(artifactId);
  totalDocuments = Math.max(0, totalDocuments - 1);
  rebuildIDF();
  return true;
}

// ---- Semantic Search ----

/**
 * Search the knowledge lake with a natural-language query.
 */
export function searchLake(
  query: string,
  options?: {
    limit?: number;
    typeFilter?: ArtifactType[];
    sessionFilter?: string;
    minScore?: number;
  }
): LakeSearchResponse {
  const startTime = Date.now();
  const limit = options?.limit ?? 20;
  const minScore = options?.minScore ?? 0.01;

  const queryTokens = tokenize(query);
  const queryTF = computeTF(queryTokens);

  const results: Array<{ artifact: IndexedArtifact; score: number; matchedTerms: string[] }> = [];

  for (const entry of index.values()) {
    // Apply filters
    if (options?.typeFilter && !options.typeFilter.includes(entry.artifact.type)) continue;
    if (options?.sessionFilter && entry.artifact.sessionId !== options.sessionFilter) continue;

    // Compute cosine similarity
    let dotProduct = 0;
    let queryMag = 0;
    let docMag = 0;
    const matched: string[] = [];

    for (const [term, qWeight] of queryTF) {
      const idf = Math.log((totalDocuments + 1) / ((documentFrequency.get(term) ?? 0) + 1));
      const qTfIdf = qWeight * idf;
      queryMag += qTfIdf * qTfIdf;

      const dWeight = entry.terms.get(term) ?? 0;
      if (dWeight > 0) {
        dotProduct += qTfIdf * dWeight;
        matched.push(term);
      }
    }

    for (const dWeight of entry.terms.values()) {
      docMag += dWeight * dWeight;
    }

    const magnitude = Math.sqrt(queryMag) * Math.sqrt(docMag);
    const score = magnitude > 0 ? dotProduct / magnitude : 0;

    if (score >= minScore) {
      results.push({ artifact: entry.artifact, score, matchedTerms: matched });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, limit);

  const searchTimeMs = Date.now() - startTime;

  return {
    query,
    results: topResults.map((r) => ({
      artifact: r.artifact,
      score: r.score,
      matchedTerms: r.matchedTerms,
      snippet: extractSnippet(r.artifact.content, r.matchedTerms),
    })),
    totalIndexed: totalDocuments,
    searchTimeMs,
    suggestions: generateSearchSuggestions(queryTokens),
  };
}

function extractSnippet(content: string, terms: string[]): string {
  const lower = content.toLowerCase();
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(content.length, idx + term.length + 80);
      return (
        (start > 0 ? "..." : "") +
        content.slice(start, end).trim() +
        (end < content.length ? "..." : "")
      );
    }
  }
  return content.slice(0, 200) + (content.length > 200 ? "..." : "");
}

function generateSearchSuggestions(queryTokens: string[]): string[] {
  const suggestions: string[] = [];
  const relatedTerms = new Map<string, number>();

  for (const entry of index.values()) {
    let hasOverlap = false;
    for (const qt of queryTokens) {
      if (entry.terms.has(qt)) {
        hasOverlap = true;
        break;
      }
    }
    if (!hasOverlap) continue;

    for (const [term, weight] of entry.terms) {
      if (!queryTokens.includes(term) && weight > 0.1) {
        relatedTerms.set(term, (relatedTerms.get(term) ?? 0) + weight);
      }
    }
  }

  const sorted = Array.from(relatedTerms.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [term] of sorted) {
    suggestions.push(`Try searching for "${term}"`);
  }
  return suggestions;
}

// ---- Cross-Session Intelligence ----

/**
 * Detect duplicate artifacts across sessions.
 */
export function detectDuplicates(threshold: number = 0.75): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();
  const entries = Array.from(index.values());

  for (let i = 0; i < entries.length; i++) {
    if (processed.has(entries[i].artifact.id)) continue;

    const group: string[] = [entries[i].artifact.id];

    for (let j = i + 1; j < entries.length; j++) {
      if (processed.has(entries[j].artifact.id)) continue;

      const similarity = computeSimilarity(entries[i], entries[j]);
      if (similarity >= threshold) {
        group.push(entries[j].artifact.id);
        processed.add(entries[j].artifact.id);
      }
    }

    if (group.length > 1) {
      processed.add(entries[i].artifact.id);
      groups.push({
        id: randomUUID(),
        artifacts: group,
        similarity: threshold,
        representativeTitle: entries[i].artifact.title,
      });
    }
  }

  return groups;
}

function computeSimilarity(a: InternalEntry, b: InternalEntry): number {
  let dotProduct = 0;
  let aMag = 0;
  let bMag = 0;

  for (const [term, weight] of a.terms) {
    aMag += weight * weight;
    const bWeight = b.terms.get(term) ?? 0;
    dotProduct += weight * bWeight;
  }
  for (const weight of b.terms.values()) {
    bMag += weight * weight;
  }

  const magnitude = Math.sqrt(aMag) * Math.sqrt(bMag);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Surface trending topics across all indexed artifacts.
 */
export function surfaceTrends(minFrequency: number = 3): Trend[] {
  const topicData = new Map<
    string,
    {
      frequency: number;
      firstSeen: string;
      lastSeen: string;
      artifactIds: string[];
    }
  >();

  for (const entry of index.values()) {
    // Extract significant terms as topics
    const sortedTerms = Array.from(entry.terms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [term] of sortedTerms) {
      const existing = topicData.get(term) ?? {
        frequency: 0,
        firstSeen: entry.artifact.createdAt,
        lastSeen: entry.artifact.createdAt,
        artifactIds: [],
      };
      existing.frequency++;
      if (entry.artifact.createdAt < existing.firstSeen)
        existing.firstSeen = entry.artifact.createdAt;
      if (entry.artifact.createdAt > existing.lastSeen)
        existing.lastSeen = entry.artifact.createdAt;
      existing.artifactIds.push(entry.artifact.id);
      topicData.set(term, existing);
    }
  }

  return Array.from(topicData.entries())
    .filter(([, data]) => data.frequency >= minFrequency)
    .map(([topic, data]) => ({
      id: randomUUID(),
      topic,
      frequency: data.frequency,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      relatedArtifactIds: data.artifactIds.slice(0, 50),
      momentum: determineMomentum(data.firstSeen, data.lastSeen, data.frequency),
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 50);
}

function determineMomentum(
  firstSeen: string,
  lastSeen: string,
  frequency: number
): Trend["momentum"] {
  const first = new Date(firstSeen).getTime();
  const last = new Date(lastSeen).getTime();
  const span = last - first;
  const now = Date.now();
  const recency = now - last;

  if (recency < 86400000 && frequency > 5) return "rising"; // Active in last 24h and high frequency
  if (span > 0 && recency < span * 0.5) return "stable";
  return "declining";
}

/**
 * Generate cross-session intelligence report.
 */
export function generateCrossSessionInsights(): CrossSessionInsight {
  const duplicates = detectDuplicates();
  const trends = surfaceTrends();

  const uniqueTopics = new Set<string>();
  for (const entry of index.values()) {
    for (const tag of entry.artifact.tags) {
      uniqueTopics.add(tag);
    }
  }

  return {
    duplicates,
    trends,
    totalArtifacts: totalDocuments,
    uniqueTopics: uniqueTopics.size,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get lake statistics.
 */
export function getLakeStats(): {
  totalArtifacts: number;
  byType: Record<string, number>;
  uniqueTerms: number;
  bySessions: number;
} {
  const byType: Record<string, number> = {};
  const sessions = new Set<string>();

  for (const entry of index.values()) {
    byType[entry.artifact.type] = (byType[entry.artifact.type] ?? 0) + 1;
    if (entry.artifact.sessionId) sessions.add(entry.artifact.sessionId);
  }

  return {
    totalArtifacts: totalDocuments,
    byType,
    uniqueTerms: documentFrequency.size,
    bySessions: sessions.size,
  };
}

/**
 * List all indexed artifacts ordered by most recently updated.
 */
export function listIndexedArtifacts(): IndexedArtifact[] {
  return Array.from(index.values())
    .map((entry) => entry.artifact)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Clear the knowledge lake (for testing).
 */
export function clearKnowledgeLake(): void {
  index.clear();
  documentFrequency.clear();
  totalDocuments = 0;
}
