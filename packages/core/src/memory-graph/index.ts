/**
 * @module memory-graph
 *
 * Innovation Memory Graph — persistent semantic memory that connects ideas
 * across sessions, teams, and time. Builds on the embeddings module for
 * TF-IDF vector search and clustering, and persists graph data as JSON
 * in ~/.innovator/memory-graph/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Investigation, AngleResult, Synthesis } from "../types.js";
import {
  indexDocument,
  semanticSearch,
  clusterDocuments,
  discoverConnections,
} from "../embeddings/index.js";

// ---- Constants ----

const MEMORY_DIR = join(homedir(), ".innovator", "memory-graph");
const MEMORY_FILE = join(MEMORY_DIR, "graph.json");

// ---- Schemas ----

export const MemoryNodeSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["idea", "investigation", "synthesis", "angle-result", "theme"]),
  title: z.string().max(500),
  content: z.string().max(10000),
  sessionId: z.string().max(100),
  embeddingDocId: z.string().max(200).optional(),
  createdAt: z.string(),
  metadata: z.record(z.string().max(500)).optional(),
});

export const MemoryEdgeSchema = z.object({
  id: z.string().max(200),
  source: z.string().max(200),
  target: z.string().max(200),
  type: z.enum([
    "derived_from",
    "similar_to",
    "converges_with",
    "evolves_into",
    "part_of",
    "inspires",
  ]),
  weight: z.number().min(0).max(1),
  sessionId: z.string().max(100).optional(),
  createdAt: z.string(),
});

export const ThemeClusterSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(500),
  nodeIds: z.array(z.string().max(200)),
  centroidTerms: z.array(z.string().max(100)).max(10),
  sessionCount: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
});

export const BlindSpotSchema = z.object({
  id: z.string().max(200),
  description: z.string().max(2000),
  relatedThemes: z.array(z.string().max(500)).max(10),
  suggestedExplorations: z.array(z.string().max(500)).max(5),
});

export const ConvergencePatternSchema = z.object({
  id: z.string().max(200),
  description: z.string().max(2000),
  sessionIds: z.array(z.string().max(100)),
  nodeIds: z.array(z.string().max(200)),
  similarityScore: z.number().min(0).max(1),
  sharedThemes: z.array(z.string().max(200)).max(10),
});

export const IdeaLineageSchema = z.object({
  ideaId: z.string().max(200),
  title: z.string().max(500),
  ancestors: z.array(
    z.object({
      nodeId: z.string().max(200),
      title: z.string().max(500),
      sessionId: z.string().max(100),
      relationship: z.string().max(100),
      createdAt: z.string(),
    })
  ),
  descendants: z.array(
    z.object({
      nodeId: z.string().max(200),
      title: z.string().max(500),
      sessionId: z.string().max(100),
      relationship: z.string().max(100),
      createdAt: z.string(),
    })
  ),
});

export const OrgDNAReportSchema = z.object({
  generatedAt: z.string(),
  totalSessions: z.number(),
  totalNodes: z.number(),
  totalEdges: z.number(),
  themeClusters: z.array(ThemeClusterSchema),
  blindSpots: z.array(BlindSpotSchema),
  convergencePatterns: z.array(ConvergencePatternSchema),
  ideaLineages: z.array(IdeaLineageSchema),
  topThemes: z.array(z.string().max(500)).max(20),
});

export const MemoryGraphSchema = z.object({
  nodes: z.array(MemoryNodeSchema),
  edges: z.array(MemoryEdgeSchema),
  sessions: z.array(z.string().max(100)),
  lastUpdated: z.string(),
});

export type MemoryNode = z.infer<typeof MemoryNodeSchema>;
export type MemoryEdge = z.infer<typeof MemoryEdgeSchema>;
export type MemoryGraph = z.infer<typeof MemoryGraphSchema>;
export type ThemeCluster = z.infer<typeof ThemeClusterSchema>;
export type BlindSpot = z.infer<typeof BlindSpotSchema>;
export type ConvergencePattern = z.infer<typeof ConvergencePatternSchema>;
export type IdeaLineage = z.infer<typeof IdeaLineageSchema>;
export type OrgDNAReport = z.infer<typeof OrgDNAReportSchema>;

// ---- Retrieval Options ----

export interface RetrievalOptions {
  threshold?: number;
  limit?: number;
  sessionFilter?: string[];
  timeRange?: { from?: string; to?: string };
}

// ---- Persistence ----

function ensureDir(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadGraph(): MemoryGraph {
  ensureDir();
  if (!existsSync(MEMORY_FILE)) {
    return { nodes: [], edges: [], sessions: [], lastUpdated: new Date().toISOString() };
  }
  try {
    return MemoryGraphSchema.parse(JSON.parse(readFileSync(MEMORY_FILE, "utf-8")));
  } catch {
    return { nodes: [], edges: [], sessions: [], lastUpdated: new Date().toISOString() };
  }
}

function saveGraph(graph: MemoryGraph): void {
  ensureDir();
  graph.lastUpdated = new Date().toISOString();
  writeFileSync(MEMORY_FILE, JSON.stringify(graph, null, 2), "utf-8");
}

// ---- Helpers ----

function addNode(graph: MemoryGraph, node: MemoryNode): void {
  if (!graph.nodes.some((n) => n.id === node.id)) {
    graph.nodes.push(node);
  }
}

function addEdge(graph: MemoryGraph, edge: MemoryEdge): void {
  const exists = graph.edges.some(
    (e) => e.source === edge.source && e.target === edge.target && e.type === edge.type
  );
  if (!exists) {
    graph.edges.push(edge);
  }
}

function createMemoryNode(
  type: MemoryNode["type"],
  title: string,
  content: string,
  sessionId: string,
  metadata?: Record<string, string>
): MemoryNode {
  return {
    id: `${type}-${randomUUID().slice(0, 8)}`,
    type,
    title: title.slice(0, 500),
    content: content.slice(0, 10000),
    sessionId,
    createdAt: new Date().toISOString(),
    metadata,
  };
}

// ---- Public API ----

/**
 * Auto-index a completed session into the memory graph.
 * Embeds every idea, investigation, and synthesis using the embeddings module
 * and links them within the persistent graph.
 */
export function autoIndexSession(
  sessionId: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  synthesis?: Synthesis
): MemoryGraph {
  const graph = loadGraph();

  if (!graph.sessions.includes(sessionId)) {
    graph.sessions.push(sessionId);
  }

  // Index investigation
  const invContent = [
    investigation.summary,
    investigation.currentState,
    ...investigation.keyAspects.map((a) => `${a.title}: ${a.description}`),
    ...investigation.challenges,
    ...investigation.opportunities,
  ].join("\n");

  const invNode = createMemoryNode(
    "investigation",
    `Investigation: ${investigation.summary.slice(0, 100)}`,
    invContent,
    sessionId
  );

  const invDoc = indexDocument({
    type: "investigation",
    title: invNode.title,
    content: invNode.content,
    sessionId,
  });
  invNode.embeddingDocId = invDoc.id;
  addNode(graph, invNode);

  // Index each angle result and its ideas
  for (const ar of angleResults) {
    const arNode = createMemoryNode(
      "angle-result",
      `${ar.angleName}: ${ar.reasoning.slice(0, 80)}`,
      ar.reasoning,
      sessionId,
      { angleId: ar.angleId }
    );

    const arDoc = indexDocument({
      type: "angle-result",
      title: arNode.title,
      content: arNode.content,
      sessionId,
    });
    arNode.embeddingDocId = arDoc.id;
    addNode(graph, arNode);

    addEdge(graph, {
      id: randomUUID(),
      source: invNode.id,
      target: arNode.id,
      type: "part_of",
      weight: 0.8,
      sessionId,
      createdAt: new Date().toISOString(),
    });

    for (const idea of ar.ideas) {
      const ideaContent = `${idea.description}\nImpact: ${idea.potentialImpact}\nImplementation: ${idea.implementationHint}`;
      const ideaNode = createMemoryNode("idea", idea.title, ideaContent, sessionId, {
        sourceAngle: ar.angleId,
      });

      const ideaDoc = indexDocument({
        type: "idea",
        title: ideaNode.title,
        content: ideaNode.content,
        sessionId,
      });
      ideaNode.embeddingDocId = ideaDoc.id;
      addNode(graph, ideaNode);

      addEdge(graph, {
        id: randomUUID(),
        source: arNode.id,
        target: ideaNode.id,
        type: "derived_from",
        weight: 0.9,
        sessionId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Index synthesis
  if (synthesis) {
    const synthContent = [
      synthesis.recommendation,
      ...synthesis.themes,
      ...synthesis.topIdeas.map((i) => `${i.title}: ${i.description}`),
    ].join("\n");

    const synthNode = createMemoryNode(
      "synthesis",
      `Synthesis: ${synthesis.recommendation.slice(0, 100)}`,
      synthContent,
      sessionId
    );

    const synthDoc = indexDocument({
      type: "session",
      title: synthNode.title,
      content: synthNode.content,
      sessionId,
    });
    synthNode.embeddingDocId = synthDoc.id;
    addNode(graph, synthNode);

    addEdge(graph, {
      id: randomUUID(),
      source: invNode.id,
      target: synthNode.id,
      type: "evolves_into",
      weight: 1.0,
      sessionId,
      createdAt: new Date().toISOString(),
    });

    // Link synthesis themes as theme nodes
    for (const theme of synthesis.themes) {
      const themeNode = createMemoryNode("theme", theme, theme, sessionId);
      const themeDoc = indexDocument({
        type: "session",
        title: themeNode.title,
        content: themeNode.content,
        sessionId,
      });
      themeNode.embeddingDocId = themeDoc.id;
      addNode(graph, themeNode);

      addEdge(graph, {
        id: randomUUID(),
        source: synthNode.id,
        target: themeNode.id,
        type: "part_of",
        weight: 0.7,
        sessionId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Discover cross-session links for new nodes
  const newNodes = graph.nodes.filter((n) => n.sessionId === sessionId && n.embeddingDocId);
  for (const node of newNodes) {
    if (!node.embeddingDocId) continue;
    const connections = discoverConnections(node.embeddingDocId);
    for (const related of connections.relatedDocuments.slice(0, 5)) {
      const targetNode = graph.nodes.find((n) => n.embeddingDocId === related.document.id);
      if (targetNode && targetNode.sessionId !== sessionId) {
        addEdge(graph, {
          id: randomUUID(),
          source: node.id,
          target: targetNode.id,
          type: "similar_to",
          weight: related.score,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  saveGraph(graph);
  return graph;
}

/**
 * Query the memory graph for related past ideas with similarity threshold tuning.
 */
export function retrieveRelatedMemories(
  query: string,
  options?: RetrievalOptions
): { nodes: MemoryNode[]; scores: Map<string, number> } {
  if (!query || query.trim().length === 0) {
    return { nodes: [], scores: new Map() };
  }
  const threshold = options?.threshold ?? 0.3;
  const limit = options?.limit ?? 10;
  const graph = loadGraph();

  const searchResult = semanticSearch(query, limit * 3);

  const scores = new Map<string, number>();
  const matchedNodes: MemoryNode[] = [];

  for (const result of searchResult.results) {
    if (result.score < threshold) continue;

    const node = graph.nodes.find((n) => n.embeddingDocId === result.document.id);
    if (!node) continue;

    // Apply session filter
    if (options?.sessionFilter && !options.sessionFilter.includes(node.sessionId)) {
      continue;
    }

    // Apply time range filter
    if (options?.timeRange) {
      if (options.timeRange.from && node.createdAt < options.timeRange.from) continue;
      if (options.timeRange.to && node.createdAt > options.timeRange.to) continue;
    }

    if (!matchedNodes.some((n) => n.id === node.id)) {
      matchedNodes.push(node);
      scores.set(node.id, result.score);
    }

    if (matchedNodes.length >= limit) break;
  }

  return { nodes: matchedNodes, scores };
}

/**
 * Detect convergent thinking across unrelated sessions by analyzing embedding clusters.
 */
export function detectConvergence(): ConvergencePattern[] {
  const graph = loadGraph();
  if (graph.nodes.length === 0) return [];

  const clusters = clusterDocuments(Math.max(3, Math.ceil(graph.nodes.length / 5)));
  const patterns: ConvergencePattern[] = [];

  for (const cluster of clusters) {
    // Find graph nodes corresponding to cluster documents
    const clusterNodes = graph.nodes.filter((n) =>
      n.embeddingDocId ? cluster.documentIds.includes(n.embeddingDocId) : false
    );

    // Only interesting if cluster spans multiple sessions
    const sessionIds = [...new Set(clusterNodes.map((n) => n.sessionId))];
    if (sessionIds.length < 2) continue;

    // Compute average cross-session similarity using edge weights
    const crossEdges = graph.edges.filter(
      (e) =>
        e.type === "similar_to" &&
        clusterNodes.some((n) => n.id === e.source) &&
        clusterNodes.some((n) => n.id === e.target)
    );
    const avgSimilarity =
      crossEdges.length > 0
        ? crossEdges.reduce((sum, e) => sum + e.weight, 0) / crossEdges.length
        : 0.5;

    patterns.push({
      id: `convergence-${randomUUID().slice(0, 8)}`,
      description: `Convergent thinking detected across ${sessionIds.length} sessions around: ${cluster.label}`,
      sessionIds,
      nodeIds: clusterNodes.map((n) => n.id),
      similarityScore: Math.round(avgSimilarity * 1000) / 1000,
      sharedThemes: cluster.centroidTerms.slice(0, 10),
    });
  }

  return patterns.sort((a, b) => b.similarityScore - a.similarityScore);
}

/**
 * Generate a cumulative Organizational DNA report showing theme clusters,
 * blind spots, convergence patterns, and idea lineage.
 */
export function generateOrgDNA(): OrgDNAReport {
  const graph = loadGraph();
  const now = new Date().toISOString();

  // Theme clusters
  const clusters = clusterDocuments(Math.max(3, Math.ceil(graph.nodes.length / 5)));
  const themeClusters: ThemeCluster[] = clusters.map((cluster) => {
    const clusterNodes = graph.nodes.filter((n) =>
      n.embeddingDocId ? cluster.documentIds.includes(n.embeddingDocId) : false
    );
    const sessionIds = [...new Set(clusterNodes.map((n) => n.sessionId))];
    const dates = clusterNodes.map((n) => n.createdAt).sort();

    return {
      id: cluster.id,
      label: cluster.label,
      nodeIds: clusterNodes.map((n) => n.id),
      centroidTerms: cluster.centroidTerms,
      sessionCount: sessionIds.length,
      firstSeen: dates[0] ?? now,
      lastSeen: dates[dates.length - 1] ?? now,
    };
  });

  // Blind spots: detect underexplored areas by finding isolated nodes
  const blindSpots: BlindSpot[] = [];
  const nodeEdgeCount = new Map<string, number>();
  for (const node of graph.nodes) {
    nodeEdgeCount.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    nodeEdgeCount.set(edge.source, (nodeEdgeCount.get(edge.source) ?? 0) + 1);
    nodeEdgeCount.set(edge.target, (nodeEdgeCount.get(edge.target) ?? 0) + 1);
  }

  const isolatedNodes = graph.nodes.filter((n) => (nodeEdgeCount.get(n.id) ?? 0) <= 1);
  if (isolatedNodes.length > 0) {
    // Group isolated nodes by rough theme
    const groupedByType = new Map<string, MemoryNode[]>();
    for (const node of isolatedNodes) {
      const key = node.type;
      if (!groupedByType.has(key)) groupedByType.set(key, []);
      groupedByType.get(key)!.push(node);
    }

    for (const [type, nodes] of groupedByType) {
      if (nodes.length < 1) continue;
      blindSpots.push({
        id: `blindspot-${type}-${randomUUID().slice(0, 8)}`,
        description: `${nodes.length} ${type} node(s) with few connections — potentially underexplored`,
        relatedThemes: nodes.slice(0, 10).map((n) => n.title),
        suggestedExplorations: nodes.slice(0, 5).map((n) => `Explore connections for: ${n.title}`),
      });
    }
  }

  // Convergence patterns
  const convergencePatterns = detectConvergence();

  // Idea lineages for top ideas (those with most edges)
  const ideaNodes = graph.nodes
    .filter((n) => n.type === "idea")
    .sort((a, b) => {
      const aEdges = graph.edges.filter((e) => e.source === a.id || e.target === a.id).length;
      const bEdges = graph.edges.filter((e) => e.source === b.id || e.target === b.id).length;
      return bEdges - aEdges;
    })
    .slice(0, 10);

  const ideaLineages = ideaNodes.map((idea) => getIdeaLineage(idea.id));

  // Top themes
  const topThemes = themeClusters
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length)
    .slice(0, 20)
    .map((c) => c.label);

  return {
    generatedAt: now,
    totalSessions: graph.sessions.length,
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    themeClusters,
    blindSpots,
    convergencePatterns,
    ideaLineages,
    topThemes,
  };
}

/**
 * Trace the ancestry (and descendants) of an idea through sessions.
 */
export function getIdeaLineage(ideaId: string): IdeaLineage {
  const graph = loadGraph();
  const idea = graph.nodes.find((n) => n.id === ideaId);

  const lineage: IdeaLineage = {
    ideaId,
    title: idea?.title ?? "Unknown",
    ancestors: [],
    descendants: [],
  };

  if (!idea) return lineage;

  // Trace ancestors (walk edges backward)
  const visitedUp = new Set<string>([ideaId]);
  const queueUp = [ideaId];
  while (queueUp.length > 0) {
    const currentId = queueUp.shift()!;
    const incomingEdges = graph.edges.filter((e) => e.target === currentId);
    for (const edge of incomingEdges) {
      if (visitedUp.has(edge.source)) continue;
      visitedUp.add(edge.source);
      const ancestor = graph.nodes.find((n) => n.id === edge.source);
      if (ancestor) {
        lineage.ancestors.push({
          nodeId: ancestor.id,
          title: ancestor.title,
          sessionId: ancestor.sessionId,
          relationship: edge.type,
          createdAt: ancestor.createdAt,
        });
        queueUp.push(ancestor.id);
      }
    }
  }

  // Trace descendants (walk edges forward)
  const visitedDown = new Set<string>([ideaId]);
  const queueDown = [ideaId];
  while (queueDown.length > 0) {
    const currentId = queueDown.shift()!;
    const outgoingEdges = graph.edges.filter((e) => e.source === currentId);
    for (const edge of outgoingEdges) {
      if (visitedDown.has(edge.target)) continue;
      visitedDown.add(edge.target);
      const descendant = graph.nodes.find((n) => n.id === edge.target);
      if (descendant) {
        lineage.descendants.push({
          nodeId: descendant.id,
          title: descendant.title,
          sessionId: descendant.sessionId,
          relationship: edge.type,
          createdAt: descendant.createdAt,
        });
        queueDown.push(descendant.id);
      }
    }
  }

  // Sort by creation time
  lineage.ancestors.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  lineage.descendants.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return lineage;
}

/**
 * Export an OrgDNA report as formatted Markdown.
 */
export function orgDNAToMarkdown(report: OrgDNAReport): string {
  const lines: string[] = [];

  lines.push("# Organizational Innovation DNA Report");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(
    `**Sessions:** ${report.totalSessions} | **Nodes:** ${report.totalNodes} | **Edges:** ${report.totalEdges}`
  );
  lines.push("");

  // Top Themes
  if (report.topThemes.length > 0) {
    lines.push("## Top Themes");
    lines.push("");
    for (const theme of report.topThemes) {
      lines.push(`- ${theme}`);
    }
    lines.push("");
  }

  // Theme Clusters
  if (report.themeClusters.length > 0) {
    lines.push("## Theme Clusters");
    lines.push("");
    for (const cluster of report.themeClusters) {
      lines.push(`### ${cluster.label}`);
      lines.push("");
      lines.push(`- **Sessions:** ${cluster.sessionCount} | **Nodes:** ${cluster.nodeIds.length}`);
      lines.push(`- **First seen:** ${cluster.firstSeen} | **Last seen:** ${cluster.lastSeen}`);
      lines.push(`- **Key terms:** ${cluster.centroidTerms.join(", ")}`);
      lines.push("");
    }
  }

  // Convergence Patterns
  if (report.convergencePatterns.length > 0) {
    lines.push("## Convergence Patterns");
    lines.push("");
    for (const pattern of report.convergencePatterns) {
      lines.push(`### ${pattern.description}`);
      lines.push("");
      lines.push(`- **Similarity:** ${pattern.similarityScore}`);
      lines.push(`- **Sessions:** ${pattern.sessionIds.length}`);
      lines.push(`- **Shared themes:** ${pattern.sharedThemes.join(", ")}`);
      lines.push("");
    }
  }

  // Blind Spots
  if (report.blindSpots.length > 0) {
    lines.push("## Blind Spots");
    lines.push("");
    for (const spot of report.blindSpots) {
      lines.push(`### ${spot.description}`);
      lines.push("");
      if (spot.relatedThemes.length > 0) {
        lines.push("**Related themes:**");
        for (const theme of spot.relatedThemes) {
          lines.push(`- ${theme}`);
        }
      }
      if (spot.suggestedExplorations.length > 0) {
        lines.push("");
        lines.push("**Suggested explorations:**");
        for (const suggestion of spot.suggestedExplorations) {
          lines.push(`- ${suggestion}`);
        }
      }
      lines.push("");
    }
  }

  // Idea Lineages
  if (report.ideaLineages.length > 0) {
    lines.push("## Idea Lineages");
    lines.push("");
    for (const lineage of report.ideaLineages) {
      lines.push(`### ${lineage.title}`);
      lines.push("");
      if (lineage.ancestors.length > 0) {
        lines.push("**Ancestors:**");
        for (const ancestor of lineage.ancestors) {
          lines.push(
            `- ${ancestor.title} (${ancestor.relationship}, session: ${ancestor.sessionId})`
          );
        }
      }
      if (lineage.descendants.length > 0) {
        lines.push("**Descendants:**");
        for (const descendant of lineage.descendants) {
          lines.push(
            `- ${descendant.title} (${descendant.relationship}, session: ${descendant.sessionId})`
          );
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Get the current memory graph (for inspection/debugging).
 */
export function getMemoryGraph(): MemoryGraph {
  return loadGraph();
}

/**
 * Clear the memory graph (for testing).
 */
export function clearMemoryGraph(): void {
  if (existsSync(MEMORY_FILE)) {
    writeFileSync(
      MEMORY_FILE,
      JSON.stringify({
        nodes: [],
        edges: [],
        sessions: [],
        lastUpdated: new Date().toISOString(),
      }),
      "utf-8"
    );
  }
}
