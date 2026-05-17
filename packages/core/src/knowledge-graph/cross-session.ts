/**
 * @module knowledge-graph/cross-session
 *
 * Cross-session knowledge management: entity resolution,
 * temporal evolution tracking, and contextual retrieval
 * for surfacing relevant past discoveries.
 */

import type { EntityNode, KnowledgeGraph } from "./index.js";

// ---- Types ----

export interface TemporalEvolution {
  entityId: string;
  entityLabel: string;
  timeline: Array<{
    sessionId: string;
    timestamp: string;
    occurrenceCount: number;
    relatedEntities: string[];
    context?: string;
  }>;
  trend: "growing" | "stable" | "declining";
  firstSeen: string;
  lastSeen: string;
  totalSessions: number;
}

export interface ContextualMatch {
  entity: EntityNode;
  relevanceScore: number;
  matchReason: string;
  relatedDiscoveries: Array<{
    entityLabel: string;
    relationship: string;
    sessionId: string;
  }>;
}

export interface KnowledgeInsight {
  id: string;
  type: "recurring-theme" | "emerging-trend" | "forgotten-connection" | "convergence";
  title: string;
  description: string;
  entities: string[];
  confidence: number;
}

export interface EntityCluster {
  id: string;
  label: string;
  entities: EntityNode[];
  cohesion: number;
  dominantType: EntityNode["type"];
}

// ---- Entity Resolution ----

/**
 * Resolve entities across sessions by merging duplicates.
 * Uses fuzzy string matching to identify the same concept
 * referred to with different labels.
 */
export function resolveEntities(graph: KnowledgeGraph): Map<string, string[]> {
  const mergeGroups = new Map<string, string[]>();
  const processed = new Set<string>();

  for (const node of graph.nodes) {
    if (processed.has(node.id)) continue;

    const normalizedLabel = normalizeLabel(node.label);
    const duplicates = graph.nodes.filter(
      (other) =>
        other.id !== node.id &&
        !processed.has(other.id) &&
        isSimilarLabel(normalizedLabel, normalizeLabel(other.label))
    );

    if (duplicates.length > 0) {
      const group = [node.id, ...duplicates.map((d) => d.id)];
      mergeGroups.set(node.id, group);
      for (const d of duplicates) {
        processed.add(d.id);
      }
    }
    processed.add(node.id);
  }

  return mergeGroups;
}

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSimilarLabel(a: string, b: string): boolean {
  if (a === b) return true;
  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return true;
  // Simple Levenshtein distance check for short labels
  if (a.length < 20 && b.length < 20) {
    const dist = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return dist / maxLen < 0.3;
  }
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

// ---- Temporal Evolution ----

/**
 * Track how an entity has evolved over sessions.
 */
export function getTemporalEvolution(
  graph: KnowledgeGraph,
  entityId: string
): TemporalEvolution | undefined {
  const entity = graph.nodes.find((n) => n.id === entityId);
  if (!entity) return undefined;

  // Build timeline from session IDs
  const timeline = entity.sourceSessionIds.map((sessionId, i) => {
    const relatedEdges = graph.edges.filter(
      (e) =>
        (e.source === entityId || e.target === entityId) && e.sourceSessionIds.includes(sessionId)
    );
    const relatedEntities = relatedEdges.map((e) => (e.source === entityId ? e.target : e.source));

    const relatedLabels = relatedEntities
      .map((id) => graph.nodes.find((n) => n.id === id)?.label ?? id)
      .slice(0, 5);

    return {
      sessionId,
      timestamp: i === 0 ? entity.firstSeen : entity.lastSeen,
      occurrenceCount: entity.occurrenceCount,
      relatedEntities: relatedLabels,
    };
  });

  // Determine trend
  const sessionCount = entity.sourceSessionIds.length;
  const daysSinceFirst = Math.max(
    1,
    (new Date(entity.lastSeen).getTime() - new Date(entity.firstSeen).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const frequency = sessionCount / daysSinceFirst;

  let trend: TemporalEvolution["trend"] = "stable";
  if (frequency > 0.5) trend = "growing";
  if (daysSinceFirst > 30 && frequency < 0.1) trend = "declining";

  return {
    entityId,
    entityLabel: entity.label,
    timeline,
    trend,
    firstSeen: entity.firstSeen,
    lastSeen: entity.lastSeen,
    totalSessions: sessionCount,
  };
}

// ---- Contextual Retrieval ----

/**
 * Find relevant past discoveries based on a new subject.
 * Returns entities and relationships most relevant to the query.
 */
export function findRelevantDiscoveries(
  graph: KnowledgeGraph,
  subject: string,
  limit = 10
): ContextualMatch[] {
  const subjectWords = new Set(
    subject
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "are",
    "but",
    "not",
    "you",
    "all",
    "can",
    "had",
    "her",
    "was",
    "one",
    "our",
    "out",
    "has",
    "with",
    "this",
    "that",
    "from",
    "they",
    "been",
    "have",
    "many",
    "some",
    "them",
    "than",
    "its",
    "over",
    "such",
  ]);

  const queryWords = [...subjectWords].filter((w) => !stopWords.has(w));

  const matches: ContextualMatch[] = [];

  for (const entity of graph.nodes) {
    const labelWords = new Set(
      entity.label
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    const descWords = new Set(
      (entity.description ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    // Calculate relevance
    let score = 0;
    const matchedWords: string[] = [];

    for (const qw of queryWords) {
      if (labelWords.has(qw)) {
        score += 3;
        matchedWords.push(qw);
      } else if (descWords.has(qw)) {
        score += 1;
        matchedWords.push(qw);
      } else {
        // Partial match
        for (const lw of labelWords) {
          if (lw.includes(qw) || qw.includes(lw)) {
            score += 1.5;
            matchedWords.push(qw);
            break;
          }
        }
      }
    }

    // Boost for high-occurrence entities
    score += Math.min(entity.occurrenceCount * 0.1, 1);

    // Boost for recent entities
    const daysSinceLastSeen =
      (Date.now() - new Date(entity.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSeen < 7) score += 0.5;
    if (daysSinceLastSeen < 30) score += 0.2;

    if (score > 0) {
      // Find related discoveries
      const relatedEdges = graph.edges.filter(
        (e) => e.source === entity.id || e.target === entity.id
      );
      const relatedDiscoveries = relatedEdges
        .map((e) => {
          const relatedId = e.source === entity.id ? e.target : e.source;
          const relatedNode = graph.nodes.find((n) => n.id === relatedId);
          return {
            entityLabel: relatedNode?.label ?? relatedId,
            relationship: e.type,
            sessionId: e.sourceSessionIds[0] ?? "",
          };
        })
        .slice(0, 5);

      matches.push({
        entity,
        relevanceScore: score,
        matchReason: `Matched on: ${matchedWords.join(", ")}`,
        relatedDiscoveries,
      });
    }
  }

  return matches.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
}

// ---- Knowledge Insights ----

/**
 * Generate insights from the knowledge graph.
 */
export function generateKnowledgeInsights(graph: KnowledgeGraph): KnowledgeInsight[] {
  const insights: KnowledgeInsight[] = [];

  // Recurring themes
  const frequentEntities = graph.nodes
    .filter((n) => n.occurrenceCount >= 3)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 5);

  if (frequentEntities.length > 0) {
    insights.push({
      id: "recurring-themes",
      type: "recurring-theme",
      title: "Recurring Innovation Themes",
      description: `These concepts appear across multiple sessions: ${frequentEntities.map((e) => e.label).join(", ")}. Consider deepening your exploration of these areas.`,
      entities: frequentEntities.map((e) => e.id),
      confidence: 0.85,
    });
  }

  // Emerging trends (recent, growing)
  const recentEntities = graph.nodes
    .filter((n) => {
      const daysSince = (Date.now() - new Date(n.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince < 14 && n.sourceSessionIds.length >= 2;
    })
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  if (recentEntities.length > 0) {
    insights.push({
      id: "emerging-trends",
      type: "emerging-trend",
      title: "Emerging Trends",
      description: `Recently active concepts: ${recentEntities
        .slice(0, 3)
        .map((e) => e.label)
        .join(", ")}. These are gaining traction in your recent sessions.`,
      entities: recentEntities.slice(0, 3).map((e) => e.id),
      confidence: 0.7,
    });
  }

  // Forgotten connections (high-weight edges to low-recent entities)
  const forgottenEdges = graph.edges
    .filter((e) => {
      const source = graph.nodes.find((n) => n.id === e.source);
      const target = graph.nodes.find((n) => n.id === e.target);
      if (!source || !target) return false;
      const daysSinceSource =
        (Date.now() - new Date(source.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      const daysSinceTarget =
        (Date.now() - new Date(target.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      return e.weight > 0.5 && (daysSinceSource > 30 || daysSinceTarget > 30);
    })
    .slice(0, 3);

  if (forgottenEdges.length > 0) {
    const edgeLabels = forgottenEdges.map((e) => {
      const source = graph.nodes.find((n) => n.id === e.source)?.label ?? e.source;
      const target = graph.nodes.find((n) => n.id === e.target)?.label ?? e.target;
      return `${source} ↔ ${target}`;
    });

    insights.push({
      id: "forgotten-connections",
      type: "forgotten-connection",
      title: "Forgotten Connections",
      description: `Strong connections you haven't revisited: ${edgeLabels.join("; ")}. These may spark new ideas.`,
      entities: forgottenEdges.flatMap((e) => [e.source, e.target]),
      confidence: 0.6,
    });
  }

  // Convergence (nodes with many connections)
  const hubs = graph.nodes
    .map((node) => ({
      node,
      connections: graph.edges.filter((e) => e.source === node.id || e.target === node.id).length,
    }))
    .filter((h) => h.connections >= 4)
    .sort((a, b) => b.connections - a.connections)
    .slice(0, 3);

  if (hubs.length > 0) {
    insights.push({
      id: "convergence-points",
      type: "convergence",
      title: "Convergence Points",
      description: `Key hub concepts that connect many ideas: ${hubs.map((h) => `${h.node.label} (${h.connections} connections)`).join(", ")}`,
      entities: hubs.map((h) => h.node.id),
      confidence: 0.8,
    });
  }

  return insights;
}

/**
 * Cluster related entities in the knowledge graph.
 */
export function clusterEntities(graph: KnowledgeGraph, maxClusters = 8): EntityCluster[] {
  if (graph.nodes.length === 0) return [];

  // Simple connected-component clustering
  const visited = new Set<string>();
  const clusters: EntityCluster[] = [];

  const adjacency = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }

  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;

    const component: EntityNode[] = [];
    const queue = [node.id];

    while (queue.length > 0 && component.length < 20) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const currentNode = graph.nodes.find((n) => n.id === current);
      if (currentNode) component.push(currentNode);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    if (component.length >= 2) {
      const types = component.map((n) => n.type);
      const typeCounts = types.reduce(
        (acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }),
        {} as Record<string, number>
      );
      const dominantType = Object.entries(typeCounts).sort(
        (a, b) => b[1] - a[1]
      )[0][0] as EntityNode["type"];

      clusters.push({
        id: `cluster-${clusters.length}`,
        label: component[0].label,
        entities: component,
        cohesion: component.length > 1 ? 1 / component.length : 1,
        dominantType,
      });
    }
  }

  return clusters.sort((a, b) => b.entities.length - a.entities.length).slice(0, maxClusters);
}
