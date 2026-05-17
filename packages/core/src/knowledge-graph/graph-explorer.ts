/**
 * @module knowledge-graph/graph-explorer
 *
 * Visual knowledge graph explorer connecting ideas across sessions
 * with semantic similarity. Discovers cross-pollination opportunities
 * between past and current innovation sessions.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { EntityNode, KnowledgeGraph } from "./index.js";

// ---- Schemas ----

export const SimilarityEdgeSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  similarity: z.number().min(0).max(1),
  sharedTerms: z.array(z.string()).max(20),
  crossSessionLink: z.boolean(),
});

export type SimilarityEdge = z.infer<typeof SimilarityEdgeSchema>;

export const CrossPollinationSchema = z.object({
  id: z.string().max(100),
  /** Source session/idea entity. */
  source: z.object({
    entityId: z.string(),
    label: z.string(),
    sessionIds: z.array(z.string()),
    type: z.string(),
  }),
  /** Target session/idea entity that could benefit from cross-pollination. */
  target: z.object({
    entityId: z.string(),
    label: z.string(),
    sessionIds: z.array(z.string()),
    type: z.string(),
  }),
  /** Similarity score between source and target (0-1). */
  similarity: z.number().min(0).max(1),
  /** Why these two entities are connected. */
  connectionReason: z.string().max(1000),
  /** Shared concepts bridging source and target. */
  bridgeConcepts: z.array(z.string().max(200)).max(10),
  /** Potential innovation opportunity from combining these. */
  opportunity: z.string().max(2000).optional(),
});

export type CrossPollination = z.infer<typeof CrossPollinationSchema>;

export const ExplorationViewSchema = z.object({
  /** Nodes for rendering (positioned). */
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      size: z.number(),
      group: z.string(),
      sessionCount: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
    })
  ),
  /** Edges for rendering. */
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      weight: z.number(),
      type: z.string(),
      isCrossPollination: z.boolean(),
    })
  ),
  /** Clusters detected. */
  clusters: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      nodeIds: z.array(z.string()),
      color: z.string(),
    })
  ),
  /** Cross-pollination opportunities discovered. */
  opportunities: z.array(CrossPollinationSchema),
  stats: z.object({
    totalNodes: z.number(),
    totalEdges: z.number(),
    clusterCount: z.number(),
    crossPollinationCount: z.number(),
    sessionsCovered: z.number(),
  }),
});

export type ExplorationView = z.infer<typeof ExplorationViewSchema>;

// ---- Semantic Similarity ----

/** Build a TF-IDF-like term vector for an entity. */
function buildTermVector(entity: EntityNode): Map<string, number> {
  const terms = new Map<string, number>();
  const text = `${entity.label} ${entity.description ?? ""}`.toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 3);

  for (const word of words) {
    terms.set(word, (terms.get(word) ?? 0) + 1);
  }

  return terms;
}

/** Compute cosine similarity between two term vectors. */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, countA] of a) {
    const countB = b.get(term) ?? 0;
    dotProduct += countA * countB;
    normA += countA * countA;
  }
  for (const [, countB] of b) {
    normB += countB * countB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

/** Find shared terms between two entities. */
function findSharedTerms(a: EntityNode, b: EntityNode): string[] {
  const termsA = buildTermVector(a);
  const termsB = buildTermVector(b);
  return [...termsA.keys()].filter((t) => termsB.has(t));
}

/**
 * Compute semantic similarity edges between all entities in the graph.
 * Only returns edges above the similarity threshold.
 */
export function computeSimilarityEdges(
  graph: KnowledgeGraph,
  threshold: number = 0.15
): SimilarityEdge[] {
  const edges: SimilarityEdge[] = [];
  const vectors = graph.nodes.map((n) => ({
    node: n,
    vector: buildTermVector(n),
  }));

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const similarity = cosineSimilarity(vectors[i].vector, vectors[j].vector);
      if (similarity >= threshold) {
        const nodeA = vectors[i].node;
        const nodeB = vectors[j].node;

        const sessionOverlap = nodeA.sourceSessionIds.some((s) =>
          nodeB.sourceSessionIds.includes(s)
        );

        edges.push({
          sourceId: nodeA.id,
          targetId: nodeB.id,
          similarity,
          sharedTerms: findSharedTerms(nodeA, nodeB),
          crossSessionLink: !sessionOverlap,
        });
      }
    }
  }

  return edges.sort((a, b) => b.similarity - a.similarity);
}

// ---- Cross-Pollination Discovery ----

/**
 * Discover cross-pollination opportunities between entities from different sessions.
 * Finds pairs of entities that are semantically similar but appear in different sessions.
 */
export function discoverCrossPollination(
  graph: KnowledgeGraph,
  maxResults: number = 20,
  minSimilarity: number = 0.2
): CrossPollination[] {
  const simEdges = computeSimilarityEdges(graph, minSimilarity);
  const crossSessionEdges = simEdges.filter((e) => e.crossSessionLink);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  return crossSessionEdges.slice(0, maxResults).map((edge) => {
    const source = nodeMap.get(edge.sourceId)!;
    const target = nodeMap.get(edge.targetId)!;

    return {
      id: `cp-${randomUUID().slice(0, 8)}`,
      source: {
        entityId: source.id,
        label: source.label,
        sessionIds: source.sourceSessionIds,
        type: source.type,
      },
      target: {
        entityId: target.id,
        label: target.label,
        sessionIds: target.sourceSessionIds,
        type: target.type,
      },
      similarity: edge.similarity,
      connectionReason: `Shared concepts: ${edge.sharedTerms.slice(0, 5).join(", ")}`,
      bridgeConcepts: edge.sharedTerms.slice(0, 10),
      opportunity: `Combining insights from "${source.label}" and "${target.label}" could yield novel perspectives at their intersection.`,
    };
  });
}

// ---- Graph Clustering ----

/**
 * Simple graph clustering using connected components with similarity edges.
 * Groups entities that are strongly connected into clusters.
 */
export function clusterGraph(
  graph: KnowledgeGraph,
  similarityThreshold: number = 0.25
): Array<{
  id: string;
  label: string;
  nodeIds: string[];
  color: string;
}> {
  const simEdges = computeSimilarityEdges(graph, similarityThreshold);
  const parent = new Map<string, string>();

  // Union-Find
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  }
  function union(a: string, b: string) {
    parent.set(find(a), find(b));
  }

  // Initialize all nodes
  for (const node of graph.nodes) {
    parent.set(node.id, node.id);
  }

  // Union connected nodes (both explicit edges and similarity edges)
  for (const edge of graph.edges) {
    union(edge.source, edge.target);
  }
  for (const edge of simEdges) {
    if (edge.similarity >= similarityThreshold) {
      union(edge.sourceId, edge.targetId);
    }
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const root = find(node.id);
    const group = groups.get(root) ?? [];
    group.push(node.id);
    groups.set(root, group);
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const colors = [
    "#4285f4",
    "#ea4335",
    "#fbbc04",
    "#34a853",
    "#ff6d01",
    "#46bdc6",
    "#7baaf7",
    "#f07b72",
  ];
  let colorIdx = 0;

  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length > 1) // Only meaningful clusters
    .map(([rootId, nodeIds]) => {
      const rootNode = nodeMap.get(rootId);
      return {
        id: `cluster-${randomUUID().slice(0, 6)}`,
        label: rootNode?.label ?? "Cluster",
        nodeIds,
        color: colors[colorIdx++ % colors.length],
      };
    });
}

// ---- Exploration View Builder ----

/**
 * Build a complete exploration view for rendering the knowledge graph.
 * Includes positioned nodes, edges, clusters, and cross-pollination opportunities.
 */
export function buildExplorationView(
  graph: KnowledgeGraph,
  options?: {
    similarityThreshold?: number;
    maxCrossPollinations?: number;
    focusEntity?: string;
  }
): ExplorationView {
  const threshold = options?.similarityThreshold ?? 0.15;
  const maxCP = options?.maxCrossPollinations ?? 15;

  // Compute similarity
  const simEdges = computeSimilarityEdges(graph, threshold);
  const clusters = clusterGraph(graph, threshold);
  const crossPollinations = discoverCrossPollination(graph, maxCP, threshold);

  // Assign cluster groups
  const nodeCluster = new Map<string, string>();
  for (const cluster of clusters) {
    for (const nodeId of cluster.nodeIds) {
      nodeCluster.set(nodeId, cluster.id);
    }
  }

  // Simple force-directed-like positioning (deterministic layout)
  const nodeCount = graph.nodes.length;
  const radius = Math.max(200, nodeCount * 30);

  const nodes = graph.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodeCount, 1);
    const clusterOffset = nodeCluster.has(node.id)
      ? clusters.findIndex((c) => c.id === nodeCluster.get(node.id)) * 50
      : 0;

    return {
      id: node.id,
      label: node.label,
      type: node.type,
      size: Math.max(10, Math.min(50, node.occurrenceCount * 5)),
      group: nodeCluster.get(node.id) ?? "ungrouped",
      sessionCount: node.sourceSessionIds.length,
      x: Math.cos(angle) * (radius + clusterOffset),
      y: Math.sin(angle) * (radius + clusterOffset),
    };
  });

  // Combine explicit edges and high-similarity edges
  const edges = [
    ...graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      type: e.type,
      isCrossPollination: false,
    })),
    ...simEdges
      .filter((e) => e.crossSessionLink && e.similarity > 0.3)
      .map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        weight: e.similarity,
        type: "similar_to",
        isCrossPollination: true,
      })),
  ];

  const allSessionIds = new Set(graph.nodes.flatMap((n) => n.sourceSessionIds));

  return {
    nodes,
    edges,
    clusters,
    opportunities: crossPollinations,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      clusterCount: clusters.length,
      crossPollinationCount: crossPollinations.length,
      sessionsCovered: allSessionIds.size,
    },
  };
}

/** Format exploration view as markdown. */
export function explorationViewToMarkdown(view: ExplorationView): string {
  const lines: string[] = [
    `# 🔭 Innovation Graph Explorer`,
    "",
    `**Nodes:** ${view.stats.totalNodes} | **Edges:** ${view.stats.totalEdges} | **Clusters:** ${view.stats.clusterCount}`,
    `**Sessions Covered:** ${view.stats.sessionsCovered}`,
    `**Cross-Pollination Opportunities:** ${view.stats.crossPollinationCount}`,
    "",
  ];

  if (view.clusters.length > 0) {
    lines.push("## Clusters", "");
    for (const cluster of view.clusters) {
      lines.push(`### ${cluster.label}`);
      lines.push(`Entities: ${cluster.nodeIds.length}`);
      lines.push("");
    }
  }

  if (view.opportunities.length > 0) {
    lines.push("## Cross-Pollination Opportunities", "");
    for (const cp of view.opportunities) {
      lines.push(`### ${cp.source.label} ↔ ${cp.target.label}`);
      lines.push(`**Similarity:** ${(cp.similarity * 100).toFixed(0)}%`);
      lines.push(`**Bridge Concepts:** ${cp.bridgeConcepts.join(", ")}`);
      if (cp.opportunity) lines.push(`**Opportunity:** ${cp.opportunity}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
