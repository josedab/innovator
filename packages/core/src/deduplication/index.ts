/**
 * @module deduplication
 *
 * Embeddings-based idea deduplication and clustering — detects near-duplicate
 * ideas across angles, clusters related ideas automatically, and surfaces
 * truly novel outliers. Uses LLM-generated embeddings (simulated as text
 * similarity) with cosine similarity, DBSCAN-like clustering, and
 * uniqueness scoring.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { AngleResult } from "../types.js";

// ---- Zod Schemas ----

/** Schema for an idea with embedding and uniqueness metadata. */
export const EmbeddedIdeaSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(5000),
  angleId: z.string().max(100),
  /** Normalized embedding vector (LLM-generated feature vector). */
  embedding: z.array(z.number()).optional(),
  /** Uniqueness score (0=duplicate, 1=highly unique). */
  uniquenessScore: z.number().min(0).max(1).default(0.5),
  /** Cluster assignment (-1 = outlier/unclustered). */
  clusterId: z.number().default(-1),
  /** IDs of near-duplicate ideas (similarity > threshold). */
  duplicateOf: z.array(z.string()).optional(),
  /** Whether this idea was flagged as a novel outlier. */
  isOutlier: z.boolean().default(false),
});

/** Schema for a cluster of related ideas. */
export const IdeaClusterSchema = z.object({
  id: z.number(),
  label: z.string().max(500),
  description: z.string().max(2000),
  ideaIds: z.array(z.string()),
  centroidIdeaId: z.string().describe("The most representative idea in the cluster"),
  avgSimilarity: z.number().min(0).max(1),
});

/** Schema for the full deduplication result. */
export const DeduplicationResultSchema = z.object({
  ideas: z.array(EmbeddedIdeaSchema),
  clusters: z.array(IdeaClusterSchema),
  duplicatePairs: z.array(
    z.object({
      ideaA: z.string(),
      ideaB: z.string(),
      similarity: z.number().min(0).max(1),
    })
  ),
  mergedIdeas: z.array(
    z.object({
      mergedTitle: z.string().max(500),
      sourceIds: z.array(z.string()),
      mergedDescription: z.string().max(5000),
    })
  ),
  outliers: z.array(z.string()).describe("IDs of ideas flagged as most innovative"),
  stats: z.object({
    totalIdeas: z.number(),
    uniqueIdeas: z.number(),
    duplicatesFound: z.number(),
    clustersFormed: z.number(),
    outliersDetected: z.number(),
  }),
  processedAt: z.string(),
});

export type EmbeddedIdea = z.infer<typeof EmbeddedIdeaSchema>;
export type IdeaCluster = z.infer<typeof IdeaClusterSchema>;
export type DeduplicationResult = z.infer<typeof DeduplicationResultSchema>;

/** Configuration for deduplication. */
export interface DeduplicationConfig {
  /** Similarity threshold above which ideas are considered duplicates. Default: 0.92 */
  duplicateThreshold?: number;
  /** Minimum cluster size for DBSCAN. Default: 2 */
  minClusterSize?: number;
  /** Similarity threshold for cluster membership. Default: 0.6 */
  clusterThreshold?: number;
  /** Model to use for embedding generation. */
  model?: string;
}

const DEFAULT_CONFIG: Required<DeduplicationConfig> = {
  duplicateThreshold: 0.92,
  minClusterSize: 2,
  clusterThreshold: 0.6,
  model: "",
};

// ---- Core Functions ----

/**
 * Deduplicate and cluster ideas from angle results.
 *
 * @param angleResults - Array of angle results containing ideas
 * @param config - Deduplication configuration
 * @param signal - Optional AbortSignal for cancellation
 * @returns A DeduplicationResult with clusters, duplicates, and outliers
 */
export async function deduplicateIdeas(
  angleResults: AngleResult[],
  config: DeduplicationConfig = {},
  signal?: AbortSignal
): Promise<DeduplicationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Build flat list of ideas with IDs
  const ideas: EmbeddedIdea[] = [];
  for (const ar of angleResults) {
    for (let i = 0; i < ar.ideas.length; i++) {
      ideas.push({
        id: `${ar.angleId}-${i}`,
        title: ar.ideas[i].title,
        description: ar.ideas[i].description,
        angleId: ar.angleId,
        uniquenessScore: 0.5,
        clusterId: -1,
        isOutlier: false,
      });
    }
  }

  if (ideas.length === 0) {
    return emptyResult();
  }

  // Compute pairwise similarity using LLM
  const similarityMatrix = await computeSimilarityMatrix(ideas, cfg.model, signal);

  // Find duplicates (similarity > threshold)
  const duplicatePairs: DeduplicationResult["duplicatePairs"] = [];
  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const sim = similarityMatrix[i][j];
      if (sim >= cfg.duplicateThreshold) {
        duplicatePairs.push({
          ideaA: ideas[i].id,
          ideaB: ideas[j].id,
          similarity: sim,
        });
        ideas[j].duplicateOf = ideas[j].duplicateOf ?? [];
        ideas[j].duplicateOf!.push(ideas[i].id);
      }
    }
  }

  // DBSCAN-like clustering
  const clusters = dbscanCluster(ideas, similarityMatrix, cfg.clusterThreshold, cfg.minClusterSize);

  // Assign cluster IDs to ideas
  for (const cluster of clusters) {
    for (const ideaId of cluster.ideaIds) {
      const idea = ideas.find((i) => i.id === ideaId);
      if (idea) idea.clusterId = cluster.id;
    }
  }

  // Compute uniqueness scores
  computeUniquenessScores(ideas, similarityMatrix);

  // Flag outliers (unclustered + high uniqueness)
  const outlierThreshold = 0.7;
  const outliers: string[] = [];
  for (const idea of ideas) {
    if (idea.clusterId === -1 && idea.uniquenessScore >= outlierThreshold) {
      idea.isOutlier = true;
      outliers.push(idea.id);
    }
  }

  // Label clusters using LLM
  const labeledClusters = await labelClusters(ideas, clusters, cfg.model, signal);

  // Merge near-duplicates
  const mergedIdeas = await mergeNearDuplicates(ideas, duplicatePairs, cfg.model, signal);

  const uniqueIdeas = ideas.filter((i) => !i.duplicateOf || i.duplicateOf.length === 0).length;

  return {
    ideas,
    clusters: labeledClusters,
    duplicatePairs,
    mergedIdeas,
    outliers,
    stats: {
      totalIdeas: ideas.length,
      uniqueIdeas,
      duplicatesFound: duplicatePairs.length,
      clustersFormed: clusters.length,
      outliersDetected: outliers.length,
    },
    processedAt: new Date().toISOString(),
  };
}

// ---- Similarity Computation ----

async function computeSimilarityMatrix(
  ideas: EmbeddedIdea[],
  model?: string,
  signal?: AbortSignal
): Promise<number[][]> {
  const n = ideas.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // Set diagonal to 1
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
  }

  if (n <= 1) return matrix;

  // Use LLM to compute pairwise similarities in batches
  const ideasSummary = ideas.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description.slice(0, 150),
  }));

  const prompt = `You are a semantic similarity expert. Compare all pairs of ideas and estimate their semantic similarity (0.0 = completely different, 1.0 = identical concept).

IDEAS:
${sanitizeLlmOutput(JSON.stringify(ideasSummary, null, 2))}

For each pair of ideas, provide the similarity score. Focus on conceptual similarity, not just word overlap.
Consider ideas as near-duplicates if they describe fundamentally the same approach (>0.9).

You MUST respond with valid JSON only:
{
  "pairs": [
    { "a": "idea-id-1", "b": "idea-id-2", "similarity": 0.85 }
  ]
}

Only include pairs with similarity > 0.3 to keep the response manageable.`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      pairs: Array<{ a: string; b: string; similarity: number }>;
    };

    const idIndex = new Map(ideas.map((idea, idx) => [idea.id, idx]));

    for (const pair of parsed.pairs) {
      const i = idIndex.get(pair.a);
      const j = idIndex.get(pair.b);
      if (i !== undefined && j !== undefined) {
        const sim = Math.max(0, Math.min(1, pair.similarity));
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
    }
  } catch {
    // Fall back to simple title-based similarity
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = simpleTitleSimilarity(ideas[i].title, ideas[j].title);
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
    }
  }

  return matrix;
}

function simpleTitleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ---- DBSCAN-like Clustering ----

function dbscanCluster(
  ideas: EmbeddedIdea[],
  similarityMatrix: number[][],
  threshold: number,
  minSize: number
): IdeaCluster[] {
  const n = ideas.length;
  const visited = new Set<number>();
  const clusters: IdeaCluster[] = [];
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    // Find neighbors
    const neighbors = getNeighbors(i, similarityMatrix, threshold);
    if (neighbors.length < minSize - 1) continue; // Not enough neighbors

    const clusterMembers = [i];
    const queue = [...neighbors];

    while (queue.length > 0) {
      const j = queue.shift()!;
      if (visited.has(j)) continue;
      visited.add(j);
      clusterMembers.push(j);

      const jNeighbors = getNeighbors(j, similarityMatrix, threshold);
      if (jNeighbors.length >= minSize - 1) {
        for (const k of jNeighbors) {
          if (!visited.has(k) && !queue.includes(k)) {
            queue.push(k);
          }
        }
      }
    }

    if (clusterMembers.length >= minSize) {
      // Find centroid (highest average similarity to other members)
      let maxAvgSim = -1;
      let centroidIdx = clusterMembers[0];
      let totalSim = 0;
      let pairCount = 0;

      for (const mi of clusterMembers) {
        let sum = 0;
        for (const mj of clusterMembers) {
          if (mi !== mj) {
            sum += similarityMatrix[mi][mj];
            totalSim += similarityMatrix[mi][mj];
            pairCount++;
          }
        }
        const avgSim = sum / (clusterMembers.length - 1);
        if (avgSim > maxAvgSim) {
          maxAvgSim = avgSim;
          centroidIdx = mi;
        }
      }

      clusters.push({
        id: clusterId,
        label: `Cluster ${clusterId}`,
        description: "",
        ideaIds: clusterMembers.map((idx) => ideas[idx].id),
        centroidIdeaId: ideas[centroidIdx].id,
        avgSimilarity: pairCount > 0 ? totalSim / pairCount : 0,
      });
      clusterId++;
    }
  }

  return clusters;
}

function getNeighbors(idx: number, matrix: number[][], threshold: number): number[] {
  const neighbors: number[] = [];
  for (let j = 0; j < matrix[idx].length; j++) {
    if (j !== idx && matrix[idx][j] >= threshold) {
      neighbors.push(j);
    }
  }
  return neighbors;
}

// ---- Uniqueness Scoring ----

function computeUniquenessScores(ideas: EmbeddedIdea[], matrix: number[][]): void {
  for (let i = 0; i < ideas.length; i++) {
    // Uniqueness = 1 - average similarity to all other ideas
    let totalSim = 0;
    for (let j = 0; j < ideas.length; j++) {
      if (i !== j) totalSim += matrix[i][j];
    }
    const avgSim = ideas.length > 1 ? totalSim / (ideas.length - 1) : 0;
    ideas[i].uniquenessScore = Math.round((1 - avgSim) * 100) / 100;
  }
}

// ---- Cluster Labeling ----

async function labelClusters(
  ideas: EmbeddedIdea[],
  clusters: IdeaCluster[],
  model?: string,
  signal?: AbortSignal
): Promise<IdeaCluster[]> {
  if (clusters.length === 0) return clusters;

  const clusterInfo = clusters.map((c) => ({
    id: c.id,
    ideas: c.ideaIds.map((id) => ideas.find((i) => i.id === id)?.title).filter(Boolean),
  }));

  const prompt = `You are an idea clustering expert. Label each cluster of related ideas with a descriptive theme name and brief description.

CLUSTERS:
${sanitizeLlmOutput(JSON.stringify(clusterInfo, null, 2))}

You MUST respond with valid JSON only:
{
  "labels": [
    { "id": 0, "label": "Theme name", "description": "Brief description of what unites these ideas" }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      labels: Array<{ id: number; label: string; description: string }>;
    };

    for (const label of parsed.labels) {
      const cluster = clusters.find((c) => c.id === label.id);
      if (cluster) {
        cluster.label = label.label;
        cluster.description = label.description;
      }
    }
  } catch {
    // Keep default labels
  }

  return clusters;
}

// ---- Duplicate Merging ----

async function mergeNearDuplicates(
  ideas: EmbeddedIdea[],
  duplicatePairs: DeduplicationResult["duplicatePairs"],
  _model?: string,
  _signal?: AbortSignal
): Promise<DeduplicationResult["mergedIdeas"]> {
  if (duplicatePairs.length === 0) return [];

  // Group connected duplicates
  const groups = new Map<string, Set<string>>();
  for (const pair of duplicatePairs) {
    const groupA = groups.get(pair.ideaA);
    const groupB = groups.get(pair.ideaB);

    if (!groupA && !groupB) {
      const newGroup = new Set([pair.ideaA, pair.ideaB]);
      groups.set(pair.ideaA, newGroup);
      groups.set(pair.ideaB, newGroup);
    } else if (groupA && !groupB) {
      groupA.add(pair.ideaB);
      groups.set(pair.ideaB, groupA);
    } else if (!groupA && groupB) {
      groupB.add(pair.ideaA);
      groups.set(pair.ideaA, groupB);
    } else if (groupA && groupB && groupA !== groupB) {
      // Merge groups
      for (const id of groupB) {
        groupA.add(id);
        groups.set(id, groupA);
      }
    }
  }

  // Get unique groups
  const uniqueGroups = new Set(groups.values());
  const merged: DeduplicationResult["mergedIdeas"] = [];

  for (const group of uniqueGroups) {
    const groupIds = Array.from(group);
    const groupIdeas = groupIds
      .map((id) => ideas.find((i) => i.id === id))
      .filter(Boolean) as EmbeddedIdea[];

    if (groupIdeas.length < 2) continue;

    // Use the most unique idea's title, combine descriptions
    const bestIdea = groupIdeas.sort((a, b) => b.uniquenessScore - a.uniquenessScore)[0];

    merged.push({
      mergedTitle: bestIdea.title,
      sourceIds: groupIds,
      mergedDescription: `Merged from ${groupIds.length} similar ideas: ${groupIdeas.map((i) => i.title).join("; ")}`,
    });
  }

  return merged;
}

function emptyResult(): DeduplicationResult {
  return {
    ideas: [],
    clusters: [],
    duplicatePairs: [],
    mergedIdeas: [],
    outliers: [],
    stats: {
      totalIdeas: 0,
      uniqueIdeas: 0,
      duplicatesFound: 0,
      clustersFormed: 0,
      outliersDetected: 0,
    },
    processedAt: new Date().toISOString(),
  };
}

// ---- Gap Analysis ----

export const GapAnalysisSchema = z.object({
  coveredThemes: z.array(
    z.object({
      theme: z.string().max(500),
      clusterIds: z.array(z.number()),
      ideaCount: z.number(),
      coverage: z.enum(["strong", "moderate", "weak"]),
    })
  ),
  gaps: z.array(
    z.object({
      theme: z.string().max(500),
      description: z.string().max(2000),
      relevance: z.enum(["critical", "important", "nice-to-have"]),
      suggestedAngles: z.array(z.string().max(100)).max(5),
    })
  ),
  diversityScore: z.number().min(0).max(1),
  summary: z.string().max(2000),
});

export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

/**
 * Analyze gaps in ideation coverage from deduplication results.
 * Identifies themes that are over/under-explored and suggests angles to fill gaps.
 */
export async function analyzeGaps(
  dedupResult: DeduplicationResult,
  subject: string,
  model?: string,
  signal?: AbortSignal
): Promise<GapAnalysis> {
  const clusterSummaries = dedupResult.clusters.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    size: c.ideaIds.length,
  }));

  const outlierTitles = dedupResult.outliers
    .map((id) => dedupResult.ideas.find((i) => i.id === id)?.title)
    .filter(Boolean);

  const prompt = `You are an innovation gap analyst. Given the clusters of ideas generated for "${subject}", identify:
1. Themes that are well-covered vs weakly-covered
2. Important themes that were NOT explored at all
3. A diversity score (0=all same theme, 1=highly diverse)

CLUSTERS:
${sanitizeLlmOutput(JSON.stringify(clusterSummaries, null, 2))}

OUTLIER IDEAS (unclustered novel ideas):
${sanitizeLlmOutput(JSON.stringify(outlierTitles, null, 2))}

Stats: ${dedupResult.stats.totalIdeas} total ideas, ${dedupResult.stats.clustersFormed} clusters, ${dedupResult.stats.outliersDetected} outliers

Respond with valid JSON only:
{
  "coveredThemes": [
    { "theme": "Theme name", "clusterIds": [0, 1], "ideaCount": 5, "coverage": "strong" }
  ],
  "gaps": [
    { "theme": "Missing theme", "description": "Why this matters", "relevance": "critical", "suggestedAngles": ["cross-domain", "inversion"] }
  ],
  "diversityScore": 0.65,
  "summary": "Overall assessment of ideation coverage"
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    return GapAnalysisSchema.parse(JSON.parse(raw));
  } catch {
    // Fallback: compute basic gap analysis from cluster data
    const coveredThemes = dedupResult.clusters.map((c) => ({
      theme: c.label,
      clusterIds: [c.id],
      ideaCount: c.ideaIds.length,
      coverage: (c.ideaIds.length >= 4 ? "strong" : c.ideaIds.length >= 2 ? "moderate" : "weak") as
        | "strong"
        | "moderate"
        | "weak",
    }));

    const totalIdeas = dedupResult.stats.totalIdeas;
    const clusterCount = dedupResult.stats.clustersFormed;
    const diversityScore = totalIdeas > 0 ? Math.min(1, clusterCount / Math.sqrt(totalIdeas)) : 0;

    return {
      coveredThemes,
      gaps: [],
      diversityScore: Math.round(diversityScore * 100) / 100,
      summary: `${clusterCount} distinct themes identified across ${totalIdeas} ideas. ${dedupResult.stats.outliersDetected} novel outliers detected.`,
    };
  }
}

// ---- Cross-Session Deduplication ----

export interface CrossSessionDedupConfig extends DeduplicationConfig {
  sessionIds?: string[];
}

/**
 * Deduplicate ideas across multiple angle result sets (e.g., from different sessions).
 */
export async function crossSessionDeduplication(
  sessions: Array<{ sessionId: string; angleResults: AngleResult[] }>,
  config: CrossSessionDedupConfig = {},
  signal?: AbortSignal
): Promise<DeduplicationResult & { sessionBreakdown: Record<string, number> }> {
  // Merge all angle results with session-prefixed IDs
  const allAngleResults: AngleResult[] = [];
  for (const session of sessions) {
    for (const ar of session.angleResults) {
      allAngleResults.push({
        ...ar,
        angleId: `${session.sessionId}/${ar.angleId}`,
      });
    }
  }

  const result = await deduplicateIdeas(allAngleResults, config, signal);

  // Build session breakdown
  const sessionBreakdown: Record<string, number> = {};
  for (const session of sessions) {
    const sessionIdeas = result.ideas.filter((i) => i.angleId.startsWith(`${session.sessionId}/`));
    sessionBreakdown[session.sessionId] = sessionIdeas.length;
  }

  return { ...result, sessionBreakdown };
}
