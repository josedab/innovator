/**
 * @module auto-taxonomy
 *
 * Hierarchical idea clustering with automatic categorization and gap analysis.
 * Uses embeddings and LLM-based classification to organize ideas into a
 * taxonomy, identify thematic clusters, and highlight innovation gaps.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

export const TaxonomyNodeSchema: z.ZodType<TaxonomyNode> = z.lazy(() =>
  z.object({
    id: z.string().max(200),
    label: z.string().max(500),
    description: z.string().max(2000),
    parentId: z.string().max(200).nullable(),
    children: z.array(TaxonomyNodeSchema).max(100),
    ideaCount: z.number().int().min(0),
    level: z.number().int().min(0),
    confidence: z.number().min(0).max(1),
  })
);

export const TaxonomyTreeSchema = z.object({
  root: TaxonomyNodeSchema,
  totalNodes: z.number().int().min(0),
  totalIdeas: z.number().int().min(0),
  maxDepth: z.number().int().min(0),
  createdAt: z.string(),
});

export const IdeaClassificationSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaId: z.string().max(200),
  categoryPath: z.array(z.string().max(500)),
  confidence: z.number().min(0).max(1),
  alternateCategories: z.array(
    z.object({
      path: z.array(z.string().max(500)),
      confidence: z.number().min(0).max(1),
    })
  ),
});

export const TaxonomyGapSchema = z.object({
  parentCategory: z.string().max(500),
  suggestedCategory: z.string().max(500),
  reasoning: z.string().max(2000),
  adjacentCategories: z.array(z.string().max(500)),
  gapScore: z.number().min(0).max(1),
});

export const TaxonomyConfigSchema = z.object({
  maxDepth: z.number().int().min(1).default(4),
  minClusterSize: z.number().int().min(1).default(3),
  similarityThreshold: z.number().min(0).max(1).default(0.6),
  useEmbeddings: z.boolean().default(true),
  useLLM: z.boolean().default(true),
});

export const ClusterResultSchema = z.object({
  clusterId: z.string().max(200),
  label: z.string().max(500),
  ideas: z.array(z.string().max(500)),
  centroid: z.array(z.number()),
  coherenceScore: z.number().min(0).max(1),
});

// ---- Types ----

export interface TaxonomyNode {
  id: string;
  label: string;
  description: string;
  parentId: string | null;
  children: TaxonomyNode[];
  ideaCount: number;
  level: number;
  confidence: number;
}

export type TaxonomyTree = z.infer<typeof TaxonomyTreeSchema>;
export type IdeaClassification = z.infer<typeof IdeaClassificationSchema>;
export type TaxonomyGap = z.infer<typeof TaxonomyGapSchema>;
export type TaxonomyConfig = z.infer<typeof TaxonomyConfigSchema>;
export type ClusterResult = z.infer<typeof ClusterResultSchema>;

// ---- Text Processing (TF-IDF) ----

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "and", "but", "or", "not", "no", "if", "then",
  "than", "that", "this", "it", "its", "i", "we", "you", "he", "she",
  "they", "me", "him", "her", "us", "them", "my", "your", "his", "our",
  "their", "what", "which", "who", "when", "where", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "only",
  "own", "same", "so", "very", "just",
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

function computeTFIDFVector(
  tokens: string[],
  docFreq: Map<string, number>,
  totalDocs: number
): { vector: Map<string, number>; magnitude: number } {
  const tf = computeTF(tokens);
  const vector = new Map<string, number>();
  let sumSq = 0;

  for (const [term, tfVal] of tf) {
    const df = docFreq.get(term) ?? 0;
    const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
    const tfidf = tfVal * idf;
    vector.set(term, tfidf);
    sumSq += tfidf * tfidf;
  }

  return { vector, magnitude: Math.sqrt(sumSq) };
}

function cosineSimilarity(
  a: { vector: Map<string, number>; magnitude: number },
  b: { vector: Map<string, number>; magnitude: number }
): number {
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

// ---- Internal Helpers ----

interface IdeaEntry {
  id: string;
  title: string;
  description?: string;
  vector: Map<string, number>;
  magnitude: number;
}

/**
 * Cluster ideas using cosine similarity on TF-IDF vectors
 * with an agglomerative approach.
 */
function clusterIdeas(ideas: IdeaEntry[], threshold: number): ClusterResult[] {
  if (ideas.length === 0) return [];

  const assignments = new Array<number>(ideas.length).fill(-1);
  let nextClusterId = 0;

  for (let i = 0; i < ideas.length; i++) {
    if (assignments[i] !== -1) continue;
    assignments[i] = nextClusterId;

    // Expand cluster by finding neighbors
    const queue = [i];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (let j = 0; j < ideas.length; j++) {
        if (assignments[j] !== -1) continue;
        const sim = cosineSimilarity(
          { vector: ideas[current].vector, magnitude: ideas[current].magnitude },
          { vector: ideas[j].vector, magnitude: ideas[j].magnitude }
        );
        if (sim >= threshold) {
          assignments[j] = nextClusterId;
          queue.push(j);
        }
      }
    }
    nextClusterId++;
  }

  // Build cluster results
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < assignments.length; i++) {
    const cid = assignments[i];
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid)!.push(i);
  }

  const results: ClusterResult[] = [];
  for (const [cid, memberIndices] of clusterMap) {
    // Compute centroid vector
    const centroidTerms = new Map<string, number>();
    for (const idx of memberIndices) {
      for (const [term, weight] of ideas[idx].vector) {
        centroidTerms.set(term, (centroidTerms.get(term) ?? 0) + weight);
      }
    }
    const centroid = Array.from(centroidTerms.values()).map(
      (v) => v / memberIndices.length
    );

    // Compute coherence (average pairwise similarity)
    let totalSim = 0;
    let pairs = 0;
    for (let a = 0; a < memberIndices.length; a++) {
      for (let b = a + 1; b < memberIndices.length; b++) {
        totalSim += cosineSimilarity(
          { vector: ideas[memberIndices[a]].vector, magnitude: ideas[memberIndices[a]].magnitude },
          { vector: ideas[memberIndices[b]].vector, magnitude: ideas[memberIndices[b]].magnitude }
        );
        pairs++;
      }
    }

    const topTerms = Array.from(centroidTerms.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([term]) => term);

    results.push({
      clusterId: `cluster-${cid}`,
      label: topTerms.join(", ") || `Cluster ${cid}`,
      ideas: memberIndices.map((i) => ideas[i].title),
      centroid,
      coherenceScore: pairs > 0 ? Math.round((totalSim / pairs) * 1000) / 1000 : 1,
    });
  }

  return results;
}

/**
 * Generate a human-readable label for a cluster using LLM.
 */
async function labelCluster(
  ideas: string[],
  model?: string,
  signal?: AbortSignal
): Promise<{ label: string; description: string }> {
  const prompt = `You are a taxonomy expert. Given these related ideas, provide a concise category label and brief description.

IDEAS:
${sanitizeLlmOutput(ideas.map((t, i) => `${i + 1}. ${t}`).join("\n"))}

You MUST respond with valid JSON only:
{ "label": "Category Name", "description": "Brief description of what unites these ideas" }`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { label: string; description: string };
    return { label: parsed.label || "Unnamed Category", description: parsed.description || "" };
  } catch {
    return { label: ideas[0]?.slice(0, 50) || "Unnamed Category", description: "" };
  }
}

/**
 * Recursively build a TaxonomyNode hierarchy from flat clusters.
 */
function buildHierarchy(
  clusters: ClusterResult[],
  labels: Map<string, { label: string; description: string }>,
  maxDepth: number,
  minClusterSize: number,
  currentLevel: number = 0,
  parentId: string | null = null
): TaxonomyNode[] {
  if (clusters.length === 0 || currentLevel >= maxDepth) return [];

  const nodes: TaxonomyNode[] = [];

  for (const cluster of clusters) {
    const nodeId = `node-${randomUUID().slice(0, 8)}`;
    const labelInfo = labels.get(cluster.clusterId) ?? {
      label: cluster.label,
      description: "",
    };

    const node: TaxonomyNode = {
      id: nodeId,
      label: labelInfo.label,
      description: labelInfo.description,
      parentId,
      children: [],
      ideaCount: cluster.ideas.length,
      level: currentLevel,
      confidence: cluster.coherenceScore,
    };

    // Sub-cluster large clusters to create hierarchy
    if (cluster.ideas.length >= minClusterSize * 2 && currentLevel + 1 < maxDepth) {
      const subEntries = ideaEntriesToVectors(cluster.ideas);
      const subClusters = clusterIdeas(subEntries, 0.7);
      if (subClusters.length > 1) {
        const subLabels = new Map<string, { label: string; description: string }>();
        for (const sc of subClusters) {
          subLabels.set(sc.clusterId, { label: sc.label, description: "" });
        }
        node.children = buildHierarchy(
          subClusters,
          subLabels,
          maxDepth,
          minClusterSize,
          currentLevel + 1,
          nodeId
        );
      }
    }

    nodes.push(node);
  }

  return nodes;
}

/**
 * Convert idea title strings to IdeaEntry objects with TF-IDF vectors.
 */
function ideaEntriesToVectors(ideas: string[]): IdeaEntry[] {
  const allTokens = ideas.map((title) => tokenize(title));
  const docFreq = new Map<string, number>();
  for (const tokens of allTokens) {
    const unique = new Set(tokens);
    for (const term of unique) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  return ideas.map((title, i) => {
    const { vector, magnitude } = computeTFIDFVector(allTokens[i], docFreq, ideas.length);
    return { id: `idea-${i}`, title, vector, magnitude };
  });
}

// ---- Core Functions ----

/**
 * Build a hierarchical taxonomy from a set of ideas using TF-IDF clustering and LLM labeling.
 */
export async function buildTaxonomy(
  ideas: Array<{ title: string; description?: string }>,
  config?: Partial<TaxonomyConfig>,
  signal?: AbortSignal
): Promise<TaxonomyTree> {
  const cfg = TaxonomyConfigSchema.parse(config ?? {});
  const titles = ideas.map((i) => i.title);

  // Build TF-IDF vectors and cluster
  const entries = ideaEntriesToVectors(titles);
  const clusters = clusterIdeas(entries, cfg.similarityThreshold);

  // Label clusters using LLM if enabled
  const labels = new Map<string, { label: string; description: string }>();
  if (cfg.useLLM) {
    for (const cluster of clusters) {
      const labelInfo = await labelCluster(cluster.ideas, undefined, signal);
      labels.set(cluster.clusterId, labelInfo);
    }
  }

  // Build hierarchy
  const children = buildHierarchy(
    clusters,
    labels,
    cfg.maxDepth,
    cfg.minClusterSize,
    1,
    "root"
  );

  const root: TaxonomyNode = {
    id: "root",
    label: "All Ideas",
    description: "Root of the taxonomy",
    parentId: null,
    children,
    ideaCount: ideas.length,
    level: 0,
    confidence: 1,
  };

  const totalNodes = countNodes(root);
  const maxDepth = computeMaxDepth(root);

  return {
    root,
    totalNodes,
    totalIdeas: ideas.length,
    maxDepth,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Classify a single idea into an existing taxonomy.
 */
export async function classifyIdea(
  idea: { title: string; description?: string; id?: string },
  taxonomy: TaxonomyTree,
  signal?: AbortSignal
): Promise<IdeaClassification> {
  const categories = flattenTaxonomy(taxonomy);
  const categoryList = categories.map((c) => c.path.join(" > ")).join("\n");

  const prompt = `You are a taxonomy classifier. Classify the following idea into the most appropriate category.

IDEA: ${sanitizeLlmOutput(idea.title)}
${idea.description ? `DESCRIPTION: ${sanitizeLlmOutput(idea.description)}` : ""}

AVAILABLE CATEGORIES:
${sanitizeLlmOutput(categoryList)}

You MUST respond with valid JSON only:
{
  "categoryPath": ["Top Level", "Sub Category"],
  "confidence": 0.85,
  "alternateCategories": [
    { "path": ["Other", "Category"], "confidence": 0.4 }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      categoryPath: string[];
      confidence: number;
      alternateCategories: Array<{ path: string[]; confidence: number }>;
    };

    return {
      ideaTitle: idea.title,
      ideaId: idea.id ?? `idea-${randomUUID().slice(0, 8)}`,
      categoryPath: parsed.categoryPath,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      alternateCategories: (parsed.alternateCategories ?? []).map((ac) => ({
        path: ac.path,
        confidence: Math.max(0, Math.min(1, ac.confidence)),
      })),
    };
  } catch {
    // Fallback: use TF-IDF similarity to find best matching category
    const ideaTokens = tokenize(`${idea.title} ${idea.description ?? ""}`);
    const docFreq = new Map<string, number>();
    for (const cat of categories) {
      const catTokens = new Set(tokenize(cat.path.join(" ")));
      for (const term of catTokens) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }
    const ideaVec = computeTFIDFVector(ideaTokens, docFreq, categories.length);

    let bestPath: string[] = ["Uncategorized"];
    let bestScore = 0;

    for (const cat of categories) {
      const catTokens = tokenize(cat.path.join(" "));
      const catVec = computeTFIDFVector(catTokens, docFreq, categories.length);
      const sim = cosineSimilarity(ideaVec, catVec);
      if (sim > bestScore) {
        bestScore = sim;
        bestPath = cat.path;
      }
    }

    return {
      ideaTitle: idea.title,
      ideaId: idea.id ?? `idea-${randomUUID().slice(0, 8)}`,
      categoryPath: bestPath,
      confidence: Math.round(bestScore * 100) / 100,
      alternateCategories: [],
    };
  }
}

/**
 * Batch classify multiple ideas into an existing taxonomy.
 */
export async function classifyIdeas(
  ideas: Array<{ title: string; description?: string; id?: string }>,
  taxonomy: TaxonomyTree,
  signal?: AbortSignal
): Promise<IdeaClassification[]> {
  const results: IdeaClassification[] = [];
  for (const idea of ideas) {
    if (signal?.aborted) break;
    results.push(await classifyIdea(idea, taxonomy, signal));
  }
  return results;
}

/**
 * Find innovation gaps in a taxonomy using LLM analysis.
 */
export async function identifyGaps(
  taxonomy: TaxonomyTree,
  subject?: string,
  signal?: AbortSignal
): Promise<TaxonomyGap[]> {
  const categories = flattenTaxonomy(taxonomy);
  const categoryList = categories.map((c) => ({
    path: c.path.join(" > "),
    ideaCount: c.ideaCount,
  }));

  const prompt = `You are an innovation gap analyst. Analyze this taxonomy and identify missing categories that would fill gaps in coverage.

${subject ? `SUBJECT: ${sanitizeLlmOutput(subject)}` : ""}

EXISTING CATEGORIES:
${sanitizeLlmOutput(JSON.stringify(categoryList, null, 2))}

For each gap, suggest a new category, explain why it matters, and list adjacent existing categories.

You MUST respond with valid JSON only:
{
  "gaps": [
    {
      "parentCategory": "Parent Category Name",
      "suggestedCategory": "New Category Name",
      "reasoning": "Why this gap matters",
      "adjacentCategories": ["Existing Cat 1", "Existing Cat 2"],
      "gapScore": 0.8
    }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { gaps: TaxonomyGap[] };
    return (parsed.gaps ?? []).map((g) => TaxonomyGapSchema.parse(g));
  } catch {
    return [];
  }
}

/**
 * Merge multiple taxonomies into a unified taxonomy.
 */
export function mergeTaxonomies(taxonomies: TaxonomyTree[]): TaxonomyTree {
  if (taxonomies.length === 0) {
    return {
      root: createEmptyRoot(),
      totalNodes: 1,
      totalIdeas: 0,
      maxDepth: 0,
      createdAt: new Date().toISOString(),
    };
  }

  if (taxonomies.length === 1) return taxonomies[0];

  const mergedChildren: TaxonomyNode[] = [];
  let totalIdeas = 0;

  for (const taxonomy of taxonomies) {
    for (const child of taxonomy.root.children) {
      // Check if a similar category already exists
      const existing = mergedChildren.find(
        (c) => c.label.toLowerCase() === child.label.toLowerCase()
      );
      if (existing) {
        existing.ideaCount += child.ideaCount;
        existing.children.push(...child.children);
        existing.confidence = (existing.confidence + child.confidence) / 2;
      } else {
        mergedChildren.push({ ...child, parentId: "root" });
      }
    }
    totalIdeas += taxonomy.totalIdeas;
  }

  const root: TaxonomyNode = {
    id: "root",
    label: "All Ideas",
    description: "Merged taxonomy root",
    parentId: null,
    children: mergedChildren,
    ideaCount: totalIdeas,
    level: 0,
    confidence: 1,
  };

  return {
    root,
    totalNodes: countNodes(root),
    totalIdeas,
    maxDepth: computeMaxDepth(root),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Refine a taxonomy based on user feedback (rename, merge, or split categories).
 */
export function refineTaxonomy(
  taxonomy: TaxonomyTree,
  feedback: Array<{
    action: "rename" | "merge" | "split";
    nodeId: string;
    newLabel?: string;
    mergeIntoId?: string;
    splitLabels?: string[];
  }>
): TaxonomyTree {
  const root = structuredClone(taxonomy.root);

  for (const fb of feedback) {
    const node = findNode(root, fb.nodeId);
    if (!node) continue;

    switch (fb.action) {
      case "rename":
        if (fb.newLabel) node.label = fb.newLabel;
        break;

      case "merge":
        if (fb.mergeIntoId) {
          const target = findNode(root, fb.mergeIntoId);
          if (target) {
            target.children.push(...node.children);
            target.ideaCount += node.ideaCount;
            removeNode(root, fb.nodeId);
          }
        }
        break;

      case "split":
        if (fb.splitLabels && fb.splitLabels.length >= 2 && node.parentId) {
          const parent = findNode(root, node.parentId);
          if (parent) {
            const ideasPerSplit = Math.ceil(node.ideaCount / fb.splitLabels.length);
            const newNodes: TaxonomyNode[] = fb.splitLabels.map((label, i) => ({
              id: `node-${randomUUID().slice(0, 8)}`,
              label,
              description: `Split from ${node.label}`,
              parentId: parent.id,
              children: [],
              ideaCount: i === fb.splitLabels!.length - 1
                ? node.ideaCount - ideasPerSplit * (fb.splitLabels!.length - 1)
                : ideasPerSplit,
              level: node.level,
              confidence: node.confidence * 0.8,
            }));
            parent.children.push(...newNodes);
            removeNode(root, fb.nodeId);
          }
        }
        break;
    }
  }

  return {
    root,
    totalNodes: countNodes(root),
    totalIdeas: taxonomy.totalIdeas,
    maxDepth: computeMaxDepth(root),
    createdAt: taxonomy.createdAt,
  };
}

/**
 * Export a taxonomy as indented markdown.
 */
export function exportTaxonomyAsMarkdown(taxonomy: TaxonomyTree): string {
  const lines: string[] = [];
  lines.push(`# ${taxonomy.root.label}`);
  lines.push("");
  lines.push(`> ${taxonomy.totalIdeas} ideas across ${taxonomy.totalNodes} categories (depth: ${taxonomy.maxDepth})`);
  lines.push("");

  function renderNode(node: TaxonomyNode, indent: number): void {
    const prefix = "  ".repeat(indent);
    const bullet = indent === 0 ? "##" : "-";
    if (indent === 0) {
      // Skip root in rendering, already handled above
    } else {
      lines.push(
        `${prefix}${bullet} **${node.label}** (${node.ideaCount} ideas, confidence: ${(node.confidence * 100).toFixed(0)}%)`
      );
      if (node.description) {
        lines.push(`${prefix}  _${node.description}_`);
      }
    }
    for (const child of node.children) {
      renderNode(child, indent + 1);
    }
  }

  renderNode(taxonomy.root, 0);
  return lines.join("\n");
}

/**
 * Get statistics about a taxonomy structure.
 */
export function getTaxonomyStats(taxonomy: TaxonomyTree): {
  totalNodes: number;
  totalIdeas: number;
  maxDepth: number;
  avgBranchingFactor: number;
  leafCount: number;
  avgIdeasPerLeaf: number;
} {
  const leaves: TaxonomyNode[] = [];
  let totalBranching = 0;
  let branchNodes = 0;

  function walk(node: TaxonomyNode): void {
    if (node.children.length === 0) {
      leaves.push(node);
    } else {
      totalBranching += node.children.length;
      branchNodes++;
      for (const child of node.children) walk(child);
    }
  }
  walk(taxonomy.root);

  const leafIdeaTotal = leaves.reduce((sum, l) => sum + l.ideaCount, 0);

  return {
    totalNodes: taxonomy.totalNodes,
    totalIdeas: taxonomy.totalIdeas,
    maxDepth: taxonomy.maxDepth,
    avgBranchingFactor: branchNodes > 0 ? Math.round((totalBranching / branchNodes) * 100) / 100 : 0,
    leafCount: leaves.length,
    avgIdeasPerLeaf: leaves.length > 0 ? Math.round((leafIdeaTotal / leaves.length) * 100) / 100 : 0,
  };
}

/**
 * Get all leaf categories as a flat list with full paths.
 */
export function flattenTaxonomy(
  taxonomy: TaxonomyTree
): Array<{ path: string[]; nodeId: string; ideaCount: number }> {
  const results: Array<{ path: string[]; nodeId: string; ideaCount: number }> = [];

  function walk(node: TaxonomyNode, path: string[]): void {
    const currentPath = node.parentId === null ? [] : [...path, node.label];
    if (node.children.length === 0 && node.parentId !== null) {
      results.push({ path: currentPath, nodeId: node.id, ideaCount: node.ideaCount });
    } else {
      for (const child of node.children) {
        walk(child, currentPath);
      }
    }
  }

  walk(taxonomy.root, []);
  return results;
}

/**
 * Suggest new categories for uncategorized ideas.
 */
export async function suggestNewCategories(
  taxonomy: TaxonomyTree,
  ideas: Array<{ title: string; description?: string }>,
  signal?: AbortSignal
): Promise<Array<{ suggestedCategory: string; parentPath: string[]; ideas: string[] }>> {
  const existingCategories = flattenTaxonomy(taxonomy)
    .map((c) => c.path.join(" > "));

  const prompt = `You are a taxonomy expert. Given existing categories and new ideas that don't fit well, suggest new categories to add.

EXISTING CATEGORIES:
${sanitizeLlmOutput(existingCategories.join("\n"))}

NEW IDEAS:
${sanitizeLlmOutput(ideas.map((i) => `- ${i.title}`).join("\n"))}

Suggest new categories that would accommodate these ideas. Group ideas that belong together.

You MUST respond with valid JSON only:
{
  "suggestions": [
    {
      "suggestedCategory": "New Category Name",
      "parentPath": ["Top Level"],
      "ideas": ["Idea title 1", "Idea title 2"]
    }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      suggestions: Array<{ suggestedCategory: string; parentPath: string[]; ideas: string[] }>;
    };
    return parsed.suggestions ?? [];
  } catch {
    return [];
  }
}

// ---- Utility Helpers ----

function createEmptyRoot(): TaxonomyNode {
  return {
    id: "root",
    label: "All Ideas",
    description: "Root of the taxonomy",
    parentId: null,
    children: [],
    ideaCount: 0,
    level: 0,
    confidence: 1,
  };
}

function countNodes(node: TaxonomyNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

function computeMaxDepth(node: TaxonomyNode): number {
  if (node.children.length === 0) return node.level;
  return Math.max(...node.children.map(computeMaxDepth));
}

function findNode(node: TaxonomyNode, id: string): TaxonomyNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function removeNode(root: TaxonomyNode, id: string): boolean {
  const idx = root.children.findIndex((c) => c.id === id);
  if (idx !== -1) {
    root.children.splice(idx, 1);
    return true;
  }
  for (const child of root.children) {
    if (removeNode(child, id)) return true;
  }
  return false;
}
