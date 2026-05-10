/**
 * @module canvas/ai-canvas
 *
 * AI-powered canvas features: auto-clustering, connection suggestions,
 * consensus detection, and synthesis from spatial arrangements.
 */

import { randomUUID } from "node:crypto";
import type { CanvasNode, CanvasEdge, InnovationCanvas } from "./index.js";

// ---- Types ----

export interface CanvasCluster {
  id: string;
  label: string;
  nodeIds: string[];
  centroid: { x: number; y: number };
  color: string;
  confidence: number;
  theme?: string;
}

export interface ConnectionSuggestion {
  id: string;
  sourceId: string;
  targetId: string;
  type: "related" | "enables" | "conflicts" | "synergy";
  reason: string;
  confidence: number;
}

export interface ConsensusResult {
  nodeId: string;
  title: string;
  totalVotes: number;
  positiveVotes: number;
  negativeVotes: number;
  consensusLevel: "strong" | "moderate" | "weak" | "contested";
  score: number;
}

export interface CanvasSynthesis {
  id: string;
  clusters: CanvasCluster[];
  topIdeas: Array<{ nodeId: string; title: string; votes: number; cluster?: string }>;
  connections: number;
  themes: string[];
  summary: string;
  createdAt: string;
}

// ---- Auto-Clustering ----

const CLUSTER_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#14B8A6",
];

/**
 * Auto-cluster canvas nodes based on spatial proximity.
 * Uses a simple grid-based clustering algorithm.
 */
export function autoClusterNodes(
  nodes: CanvasNode[],
  options?: { gridSize?: number; minClusterSize?: number }
): CanvasCluster[] {
  const gridSize = options?.gridSize ?? 300;
  const minSize = options?.minClusterSize ?? 2;

  if (nodes.length < minSize) return [];

  const ideaNodes = nodes.filter((n) => n.type === "idea");
  if (ideaNodes.length < minSize) return [];

  // Grid-based clustering
  const gridCells = new Map<string, CanvasNode[]>();
  for (const node of ideaNodes) {
    const cellX = Math.floor(node.position.x / gridSize);
    const cellY = Math.floor(node.position.y / gridSize);
    const key = `${cellX}:${cellY}`;
    const cell = gridCells.get(key) ?? [];
    cell.push(node);
    gridCells.set(key, cell);
  }

  // Merge adjacent cells with few nodes
  const clusters: CanvasCluster[] = [];
  let colorIdx = 0;

  for (const [_key, cellNodes] of gridCells) {
    if (cellNodes.length < minSize) continue;

    const nodeIds = cellNodes.map((n) => n.id);
    const centroidX = cellNodes.reduce((s, n) => s + n.position.x, 0) / cellNodes.length;
    const centroidY = cellNodes.reduce((s, n) => s + n.position.y, 0) / cellNodes.length;

    // Generate label from node content
    const titles = cellNodes.map((n) => n.title ?? "").filter(Boolean);
    const words = titles.flatMap((t) =>
      t
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
    const wordCounts = new Map<string, number>();
    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
    const topWord = [...wordCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "cluster";
    const label = topWord.charAt(0).toUpperCase() + topWord.slice(1);

    clusters.push({
      id: randomUUID(),
      label,
      nodeIds,
      centroid: { x: centroidX, y: centroidY },
      color: CLUSTER_COLORS[colorIdx % CLUSTER_COLORS.length],
      confidence: Math.min(1, cellNodes.length / 5),
      theme: label,
    });

    colorIdx++;
  }

  return clusters;
}

// ---- Connection Suggestions ----

/**
 * Suggest connections between nodes based on content similarity.
 */
export function suggestConnections(
  nodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  maxSuggestions: number = 5
): ConnectionSuggestion[] {
  const ideaNodes = nodes.filter((n) => n.type === "idea" && n.title);
  const existingPairs = new Set(existingEdges.map((e) => `${e.sourceId}:${e.targetId}`));

  const suggestions: ConnectionSuggestion[] = [];

  for (let i = 0; i < ideaNodes.length; i++) {
    for (let j = i + 1; j < ideaNodes.length; j++) {
      const a = ideaNodes[i];
      const b = ideaNodes[j];

      const pairKey = `${a.id}:${b.id}`;
      const reversePairKey = `${b.id}:${a.id}`;
      if (existingPairs.has(pairKey) || existingPairs.has(reversePairKey)) continue;

      const similarity = computeTextSimilarity(
        a.title + " " + (a.description ?? ""),
        b.title + " " + (b.description ?? "")
      );

      if (similarity > 0.2) {
        const type = determineConnectionType(a, b, similarity);
        suggestions.push({
          id: randomUUID(),
          sourceId: a.id,
          targetId: b.id,
          type,
          reason: `These ideas share ${Math.round(similarity * 100)}% keyword overlap`,
          confidence: similarity,
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, maxSuggestions);
}

function computeTextSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(
    textA
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const wordsB = new Set(
    textB
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function determineConnectionType(
  a: CanvasNode,
  b: CanvasNode,
  similarity: number
): ConnectionSuggestion["type"] {
  // Same angle → likely related
  if (a.angleId && b.angleId && a.angleId === b.angleId) return "related";

  // High similarity → synergy
  if (similarity > 0.5) return "synergy";

  // Different angles → enables
  if (a.angleId && b.angleId && a.angleId !== b.angleId) return "enables";

  return "related";
}

// ---- Consensus Detection ----

/**
 * Detect consensus from voting data on canvas nodes.
 */
export function detectConsensus(
  nodes: CanvasNode[],
  votes: Array<{ nodeId: string; value: number }>
): ConsensusResult[] {
  const votesByNode = new Map<string, { positive: number; negative: number }>();

  for (const vote of votes) {
    const current = votesByNode.get(vote.nodeId) ?? { positive: 0, negative: 0 };
    if (vote.value > 0) current.positive++;
    else current.negative++;
    votesByNode.set(vote.nodeId, current);
  }

  return nodes
    .filter((n) => n.type === "idea")
    .map((node) => {
      const nodeVotes = votesByNode.get(node.id) ?? { positive: 0, negative: 0 };
      const total = nodeVotes.positive + nodeVotes.negative;
      const score = total > 0 ? (nodeVotes.positive - nodeVotes.negative) / total : 0;

      let consensusLevel: ConsensusResult["consensusLevel"];
      if (total < 2) consensusLevel = "weak";
      else if (score > 0.7) consensusLevel = "strong";
      else if (score > 0.3) consensusLevel = "moderate";
      else if (score < -0.3) consensusLevel = "contested";
      else consensusLevel = "weak";

      return {
        nodeId: node.id,
        title: node.title ?? node.id,
        totalVotes: total,
        positiveVotes: nodeVotes.positive,
        negativeVotes: nodeVotes.negative,
        consensusLevel,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ---- Canvas Synthesis ----

/**
 * Synthesize insights from the canvas state.
 */
export function synthesizeCanvas(canvas: InnovationCanvas): CanvasSynthesis {
  const clusters = autoClusterNodes(canvas.nodes);

  // Collect votes from node metadata
  const allVotes: Array<{ nodeId: string; value: number }> = [];
  for (const node of canvas.nodes) {
    const votes = node.metadata?.votes;
    if (votes && Array.isArray(votes)) {
      for (const v of votes as Array<{ value: number }>) {
        allVotes.push({ nodeId: node.id, value: v.value });
      }
    }
  }

  const consensus = detectConsensus(canvas.nodes, allVotes);

  const topIdeas = consensus
    .filter((c) => c.consensusLevel === "strong" || c.consensusLevel === "moderate")
    .slice(0, 5)
    .map((c) => {
      const cluster = clusters.find((cl) => cl.nodeIds.includes(c.nodeId));
      return {
        nodeId: c.nodeId,
        title: c.title,
        votes: c.positiveVotes,
        cluster: cluster?.label,
      };
    });

  const themes = clusters.map((c) => c.theme).filter(Boolean) as string[];

  const summaryParts: string[] = [];
  summaryParts.push(
    `Canvas contains ${canvas.nodes.length} nodes and ${canvas.edges.length} connections.`
  );
  if (clusters.length > 0) {
    summaryParts.push(`Identified ${clusters.length} theme clusters: ${themes.join(", ")}.`);
  }
  if (topIdeas.length > 0) {
    summaryParts.push(`Top consensus ideas: ${topIdeas.map((i) => i.title).join(", ")}.`);
  }

  return {
    id: randomUUID(),
    clusters,
    topIdeas,
    connections: canvas.edges.length,
    themes,
    summary: summaryParts.join(" "),
    createdAt: new Date().toISOString(),
  };
}
