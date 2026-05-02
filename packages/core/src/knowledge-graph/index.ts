/**
 * @module knowledge-graph
 *
 * Persistent knowledge graph across investigations. Extracts entities,
 * concepts, and relationships from investigation results and stores them
 * in an adjacency-list graph structure for cross-session insights.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Investigation, AngleResult, Synthesis } from "../types.js";

const GRAPH_DIR = join(homedir(), ".innovator", "knowledge-graph");
const GRAPH_FILE = join(GRAPH_DIR, "graph.json");

// ---- Types ----

export const EntityNodeSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  type: z.enum(["concept", "technology", "challenge", "opportunity", "person", "organization", "domain"]),
  description: z.string().max(2000).optional(),
  sourceSessionIds: z.array(z.string()),
  firstSeen: z.string(),
  lastSeen: z.string(),
  occurrenceCount: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RelationshipEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum(["related_to", "enables", "challenges", "part_of", "derived_from", "contrasts_with"]),
  weight: z.number().min(0).max(1),
  sourceSessionIds: z.array(z.string()),
  label: z.string().max(200).optional(),
});

export const KnowledgeGraphSchema = z.object({
  nodes: z.array(EntityNodeSchema),
  edges: z.array(RelationshipEdgeSchema),
  lastUpdated: z.string(),
  sessionCount: z.number(),
});

export type EntityNode = z.infer<typeof EntityNodeSchema>;
export type RelationshipEdge = z.infer<typeof RelationshipEdgeSchema>;
export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

// ---- Persistence ----

function ensureDir(): void {
  if (!existsSync(GRAPH_DIR)) mkdirSync(GRAPH_DIR, { recursive: true });
}

function loadGraph(): KnowledgeGraph {
  ensureDir();
  if (!existsSync(GRAPH_FILE)) {
    return { nodes: [], edges: [], lastUpdated: new Date().toISOString(), sessionCount: 0 };
  }
  try {
    return KnowledgeGraphSchema.parse(JSON.parse(readFileSync(GRAPH_FILE, "utf-8")));
  } catch {
    return { nodes: [], edges: [], lastUpdated: new Date().toISOString(), sessionCount: 0 };
  }
}

function saveGraph(graph: KnowledgeGraph): void {
  ensureDir();
  writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), "utf-8");
}

// ---- NLP Entity Extraction (rule-based, no external deps) ----

/** Extract key terms from text using simple NLP heuristics. */
function extractTerms(text: string): string[] {
  // Remove common stop words and extract significant terms
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "both", "each",
    "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very",
    "and", "but", "or", "if", "while", "this", "that", "these", "those",
    "it", "its", "they", "them", "their", "we", "our", "us",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Extract bigrams for compound concepts
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  // Count term frequency
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  for (const b of bigrams) {
    freq.set(b, (freq.get(b) ?? 0) + 2); // Boost bigrams
  }

  // Return top terms by frequency
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([term]) => term);
}

/** Classify an extracted term into an entity type. */
function classifyTerm(
  term: string,
  context: { challenges: string[]; opportunities: string[] }
): EntityNode["type"] {
  const techKeywords = ["api", "sdk", "framework", "platform", "database", "algorithm", "protocol", "software", "hardware", "cloud", "server", "web", "mobile", "machine learning", "neural", "blockchain"];
  const challengeKeywords = ["challenge", "problem", "issue", "risk", "limitation", "barrier", "obstacle"];
  const opportunityKeywords = ["opportunity", "potential", "growth", "innovation", "advantage", "benefit"];

  if (techKeywords.some((k) => term.includes(k))) return "technology";
  if (challengeKeywords.some((k) => term.includes(k))) return "challenge";
  if (opportunityKeywords.some((k) => term.includes(k))) return "opportunity";
  if (context.challenges.some((c) => c.toLowerCase().includes(term))) return "challenge";
  if (context.opportunities.some((o) => o.toLowerCase().includes(term))) return "opportunity";
  return "concept";
}

// ---- Core Functions ----

/**
 * Extract entities and relationships from investigation results
 * and merge them into the persistent knowledge graph.
 */
export function ingestInvestigation(
  sessionId: string,
  subject: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  synthesis?: Synthesis
): KnowledgeGraph {
  const graph = loadGraph();
  const now = new Date().toISOString();

  // Extract text corpus
  const corpus = [
    subject,
    investigation.summary,
    investigation.currentState,
    ...investigation.keyAspects.map((a) => `${a.title} ${a.description}`),
    ...investigation.challenges,
    ...investigation.opportunities,
    ...angleResults.flatMap((ar) =>
      ar.ideas.map((idea) => `${idea.title} ${idea.description} ${idea.potentialImpact}`)
    ),
    ...(synthesis?.themes ?? []),
    ...(synthesis?.topIdeas.map((i) => `${i.title} ${i.description}`) ?? []),
  ].join(" ");

  const terms = extractTerms(corpus);
  const context = { challenges: investigation.challenges, opportunities: investigation.opportunities };

  // Add subject as a primary node
  const subjectNode = findOrCreateNode(graph, subject.toLowerCase(), {
    label: subject,
    type: "domain",
    sessionId,
    now,
  });

  // Add extracted entities
  const newNodes: EntityNode[] = [subjectNode];
  for (const term of terms) {
    const type = classifyTerm(term, context);
    const node = findOrCreateNode(graph, term, {
      label: term,
      type,
      sessionId,
      now,
    });
    newNodes.push(node);
  }

  // Create relationships between co-occurring terms
  for (let i = 0; i < newNodes.length; i++) {
    for (let j = i + 1; j < newNodes.length && j < i + 5; j++) {
      findOrCreateEdge(graph, newNodes[i].id, newNodes[j].id, {
        type: "related_to",
        sessionId,
        weight: 1 / (j - i + 1),
      });
    }
  }

  // Key aspects as entities linked to subject
  for (const aspect of investigation.keyAspects) {
    const node = findOrCreateNode(graph, aspect.title.toLowerCase(), {
      label: aspect.title,
      type: "concept",
      description: aspect.description,
      sessionId,
      now,
    });
    findOrCreateEdge(graph, subjectNode.id, node.id, {
      type: "part_of",
      sessionId,
      weight: 0.9,
    });
  }

  graph.lastUpdated = now;
  graph.sessionCount++;
  saveGraph(graph);
  return graph;
}

function findOrCreateNode(
  graph: KnowledgeGraph,
  normalizedLabel: string,
  params: {
    label: string;
    type: EntityNode["type"];
    description?: string;
    sessionId: string;
    now: string;
  }
): EntityNode {
  const existing = graph.nodes.find(
    (n) => n.label.toLowerCase() === normalizedLabel
  );

  if (existing) {
    existing.occurrenceCount++;
    existing.lastSeen = params.now;
    if (!existing.sourceSessionIds.includes(params.sessionId)) {
      existing.sourceSessionIds.push(params.sessionId);
    }
    if (params.description && !existing.description) {
      existing.description = params.description;
    }
    return existing;
  }

  const node: EntityNode = {
    id: randomUUID(),
    label: params.label,
    type: params.type,
    description: params.description,
    sourceSessionIds: [params.sessionId],
    firstSeen: params.now,
    lastSeen: params.now,
    occurrenceCount: 1,
  };
  graph.nodes.push(node);
  return node;
}

function findOrCreateEdge(
  graph: KnowledgeGraph,
  sourceId: string,
  targetId: string,
  params: { type: RelationshipEdge["type"]; sessionId: string; weight: number }
): RelationshipEdge {
  const existing = graph.edges.find(
    (e) =>
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId)
  );

  if (existing) {
    existing.weight = Math.min(1, existing.weight + params.weight * 0.1);
    if (!existing.sourceSessionIds.includes(params.sessionId)) {
      existing.sourceSessionIds.push(params.sessionId);
    }
    return existing;
  }

  const edge: RelationshipEdge = {
    id: randomUUID(),
    source: sourceId,
    target: targetId,
    type: params.type,
    weight: params.weight,
    sourceSessionIds: [params.sessionId],
  };
  graph.edges.push(edge);
  return edge;
}

/**
 * Query the knowledge graph for entities related to a subject.
 */
export function queryRelatedSubjects(
  subject: string,
  maxDepth: number = 2,
  limit: number = 20
): { nodes: EntityNode[]; edges: RelationshipEdge[] } {
  const graph = loadGraph();
  const subjectLower = subject.toLowerCase();

  // Find seed nodes matching the subject
  const seedNodes = graph.nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(subjectLower) ||
      subjectLower.includes(n.label.toLowerCase())
  );

  if (seedNodes.length === 0) return { nodes: [], edges: [] };

  // BFS to find related nodes
  const visited = new Set<string>(seedNodes.map((n) => n.id));
  const resultNodes: EntityNode[] = [...seedNodes];
  const resultEdges: RelationshipEdge[] = [];
  let frontier = seedNodes.map((n) => n.id);

  for (let depth = 0; depth < maxDepth && frontier.length > 0 && resultNodes.length < limit; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const edges = graph.edges.filter(
        (e) => e.source === nodeId || e.target === nodeId
      );

      for (const edge of edges) {
        const neighborId = edge.source === nodeId ? edge.target : edge.source;
        if (!visited.has(neighborId) && resultNodes.length < limit) {
          visited.add(neighborId);
          const neighbor = graph.nodes.find((n) => n.id === neighborId);
          if (neighbor) {
            resultNodes.push(neighbor);
            resultEdges.push(edge);
            nextFrontier.push(neighborId);
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return { nodes: resultNodes, edges: resultEdges };
}

/**
 * Get the full knowledge graph.
 */
export function getKnowledgeGraph(): KnowledgeGraph {
  return loadGraph();
}

/**
 * Get graph statistics.
 */
export function getGraphStats(): {
  nodeCount: number;
  edgeCount: number;
  sessionCount: number;
  topEntities: Array<{ label: string; type: string; occurrences: number }>;
} {
  const graph = loadGraph();
  const topEntities = [...graph.nodes]
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 10)
    .map((n) => ({ label: n.label, type: n.type, occurrences: n.occurrenceCount }));

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    sessionCount: graph.sessionCount,
    topEntities,
  };
}

/**
 * Filter graph nodes by criteria.
 */
export function filterGraphNodes(filters: {
  type?: EntityNode["type"];
  fromDate?: string;
  toDate?: string;
  minOccurrences?: number;
}): EntityNode[] {
  const graph = loadGraph();
  let nodes = graph.nodes;

  if (filters.type) {
    nodes = nodes.filter((n) => n.type === filters.type);
  }
  if (filters.fromDate) {
    nodes = nodes.filter((n) => n.firstSeen >= filters.fromDate!);
  }
  if (filters.toDate) {
    nodes = nodes.filter((n) => n.lastSeen <= filters.toDate!);
  }
  if (filters.minOccurrences) {
    nodes = nodes.filter((n) => n.occurrenceCount >= filters.minOccurrences!);
  }

  return nodes.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/**
 * Clear the knowledge graph (for testing).
 */
export function clearKnowledgeGraph(): void {
  if (existsSync(GRAPH_FILE)) {
    writeFileSync(
      GRAPH_FILE,
      JSON.stringify({ nodes: [], edges: [], lastUpdated: new Date().toISOString(), sessionCount: 0 }),
      "utf-8"
    );
  }
}
