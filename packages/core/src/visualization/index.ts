/**
 * @module visualization
 *
 * Idea relationship extraction and graph data generation.
 * Extracts shared keywords and computes similarity between ideas
 * to build an interactive idea map.
 */

import type { AngleResult, Synthesis } from "../types.js";

/** A node in the idea graph. */
export interface IdeaNode {
  id: string;
  label: string;
  description: string;
  angleId: string;
  angleName: string;
  impactScore: number;
  group: string;
}

/** An edge connecting two related ideas. */
export interface IdeaEdge {
  source: string;
  target: string;
  weight: number;
  sharedKeywords: string[];
}

/** Complete graph data for visualization. */
export interface IdeaGraph {
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  clusters: Array<{ name: string; nodeIds: string[] }>;
}

/** Common stop words to exclude from keyword extraction. */
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
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "not",
  "no",
  "as",
  "if",
  "then",
  "than",
  "so",
  "very",
  "just",
  "about",
  "up",
  "out",
  "also",
  "more",
  "each",
  "every",
  "all",
  "any",
  "some",
  "such",
  "into",
  "over",
  "after",
  "before",
  "between",
  "under",
  "through",
  "using",
  "based",
]);

/** Extract significant keywords from text. */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .reduce<string[]>((acc, word) => {
      if (!acc.includes(word)) acc.push(word);
      return acc;
    }, []);
}

/** Compute Jaccard similarity between two keyword sets. */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

/** Estimate impact score (0-10) based on text analysis. */
function estimateImpact(idea: { potentialImpact: string; description: string }): number {
  const text = `${idea.potentialImpact} ${idea.description}`.toLowerCase();
  let score = 5;
  const highImpact = ["revolutionary", "transformative", "breakthrough", "disruptive", "paradigm"];
  const medImpact = ["significant", "substantial", "considerable", "meaningful", "notable"];
  const lowImpact = ["incremental", "minor", "slight", "marginal", "small"];

  for (const w of highImpact) if (text.includes(w)) score += 1.5;
  for (const w of medImpact) if (text.includes(w)) score += 0.5;
  for (const w of lowImpact) if (text.includes(w)) score -= 1;

  return Math.max(1, Math.min(10, Math.round(score)));
}

/** Build an idea graph from angle results for visualization. */
export function buildIdeaGraph(
  angleResults: AngleResult[],
  synthesis?: Synthesis,
  similarityThreshold = 0.1
): IdeaGraph {
  const nodes: IdeaNode[] = [];
  const edges: IdeaEdge[] = [];
  const keywordsMap = new Map<string, string[]>();

  // Create nodes from all ideas
  for (const angle of angleResults) {
    for (let i = 0; i < angle.ideas.length; i++) {
      const idea = angle.ideas[i];
      const nodeId = `${angle.angleId}-${i}`;
      const keywords = extractKeywords(`${idea.title} ${idea.description}`);
      keywordsMap.set(nodeId, keywords);

      nodes.push({
        id: nodeId,
        label: idea.title,
        description: idea.description,
        angleId: angle.angleId,
        angleName: angle.angleName,
        impactScore: estimateImpact(idea),
        group: angle.angleName,
      });
    }
  }

  // Create edges based on keyword similarity
  const nodeIds = nodes.map((n) => n.id);
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const kwA = keywordsMap.get(nodeIds[i]) ?? [];
      const kwB = keywordsMap.get(nodeIds[j]) ?? [];
      const similarity = jaccardSimilarity(kwA, kwB);

      if (similarity >= similarityThreshold) {
        const shared = kwA.filter((w) => kwB.includes(w));
        edges.push({
          source: nodeIds[i],
          target: nodeIds[j],
          weight: similarity,
          sharedKeywords: shared,
        });
      }
    }
  }

  // Build clusters from angles
  const clusters = angleResults.map((angle) => ({
    name: angle.angleName,
    nodeIds: nodes.filter((n) => n.angleId === angle.angleId).map((n) => n.id),
  }));

  return { nodes, edges, clusters };
}

/** Get color for an angle (for consistent visualization). */
export function getAngleColor(angleId: string): string {
  const colors: Record<string, string> = {
    scamper: "#3B82F6",
    "first-principles": "#EF4444",
    "cross-domain": "#10B981",
    constraints: "#F59E0B",
    inversion: "#8B5CF6",
    perspectives: "#EC4899",
    "what-if": "#06B6D4",
    "trend-collision": "#F97316",
  };
  return colors[angleId] ?? "#6B7280";
}
