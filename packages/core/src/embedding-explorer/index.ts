/**
 * @module embedding-explorer
 *
 * 3D Innovation Embedding Explorer: projects all ideas into a 3D vector space
 * using dimensionality reduction (UMAP-inspired/t-SNE-inspired). Identifies
 * innovation white spaces (empty regions between clusters) and enables
 * gap-targeted idea generation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";

// ---- Schemas ----

/** Schema for a 3D point. */
export const Point3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

/** Schema for an embedded idea point. */
export const EmbeddedIdeaSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(2000),
  position: Point3DSchema,
  clusterId: z.number().min(-1),
  tags: z.array(z.string().max(100)).max(10),
  score: z.number().min(0).max(1).optional(),
});

/** Schema for a cluster of ideas. */
export const IdeaClusterSchema = z.object({
  id: z.number().min(0),
  label: z.string().max(200),
  centroid: Point3DSchema,
  ideaCount: z.number().min(0),
  density: z.number().min(0),
  themes: z.array(z.string().max(200)).max(5),
  avgScore: z.number().min(0).max(1).optional(),
});

/** Schema for a detected white space. */
export const WhiteSpaceSchema = z.object({
  id: z.string().max(100),
  position: Point3DSchema,
  nearestClusters: z.array(z.string().max(200)).max(5),
  gapDescription: z.string().max(500),
  innovationPotential: z.enum(["low", "medium", "high", "very-high"]),
  suggestedDirection: z.string().max(500),
});

/** Schema for the full embedding space. */
export const EmbeddingSpaceSchema = z.object({
  ideas: z.array(EmbeddedIdeaSchema),
  clusters: z.array(IdeaClusterSchema).max(50),
  whiteSpaces: z.array(WhiteSpaceSchema).max(20),
  dimensions: z.object({
    xLabel: z.string().max(100),
    yLabel: z.string().max(100),
    zLabel: z.string().max(100),
  }),
  totalIdeas: z.number().min(0),
  generatedAt: z.string(),
});

// ---- Types ----

export type Point3D = z.infer<typeof Point3DSchema>;
export type EmbeddedIdea = z.infer<typeof EmbeddedIdeaSchema>;
export type IdeaCluster = z.infer<typeof IdeaClusterSchema>;
export type WhiteSpace = z.infer<typeof WhiteSpaceSchema>;
export type EmbeddingSpace = z.infer<typeof EmbeddingSpaceSchema>;

// ---- In-memory store ----

const embeddingSpaces: Map<string, EmbeddingSpace> = new Map();

// ---- TF-IDF vectorization (lightweight, no external deps) ----

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
}

function computeTfIdfVectors(documents: string[]): number[][] {
  const allTokens = documents.map(tokenize);
  const vocab = new Map<string, number>();
  let vocabIdx = 0;

  for (const tokens of allTokens) {
    for (const token of new Set(tokens)) {
      if (!vocab.has(token)) vocab.set(token, vocabIdx++);
    }
  }

  const idf = new Map<string, number>();
  for (const [word, _] of vocab) {
    const df = allTokens.filter((tokens) => tokens.includes(word)).length;
    idf.set(word, Math.log((documents.length + 1) / (df + 1)));
  }

  return allTokens.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    const vec = new Array(vocab.size).fill(0);
    for (const [word, idx] of vocab) {
      vec[idx] = (tf.get(word) ?? 0) * (idf.get(word) ?? 0);
    }

    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  });
}

// ---- Dimensionality reduction (simplified t-SNE-inspired) ----

function reduceToThreeD(vectors: number[][], perplexity: number = 30): Point3D[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0, z: 0 }];

  // Initialize random positions
  const positions: [number, number, number][] = vectors.map(() => [
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
  ]);

  // Compute pairwise distances
  const distances: number[][] = vectors.map((v1, i) =>
    vectors.map((v2, j) => {
      if (i === j) return 0;
      return Math.sqrt(v1.reduce((sum, val, k) => sum + (val - (v2[k] ?? 0)) ** 2, 0));
    })
  );

  // Simple force-directed layout (100 iterations)
  const lr = 0.5;
  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < n; i++) {
      let fx = 0, fy = 0, fz = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = positions[j][0] - positions[i][0];
        const dy = positions[j][1] - positions[i][1];
        const dz = positions[j][2] - positions[i][2];
        const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;

        // Attraction proportional to high-D similarity, repulsion for all
        const attraction = Math.max(0, 1 - distances[i][j]) * 0.1;
        const repulsion = 1 / (dist3d * dist3d + 0.01) * 0.01;

        fx += (attraction - repulsion) * (dx / dist3d);
        fy += (attraction - repulsion) * (dy / dist3d);
        fz += (attraction - repulsion) * (dz / dist3d);
      }

      positions[i][0] += fx * lr;
      positions[i][1] += fy * lr;
      positions[i][2] += fz * lr;
    }
  }

  return positions.map(([x, y, z]) => ({
    x: Math.round(x * 1000) / 1000,
    y: Math.round(y * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
  }));
}

// ---- Clustering (k-means) ----

function kMeansCluster(points: Point3D[], k: number): number[] {
  if (points.length === 0) return [];
  const clampedK = Math.min(k, points.length);

  // Initialize centroids randomly
  const centroids: Point3D[] = [];
  const used = new Set<number>();
  while (centroids.length < clampedK) {
    const idx = Math.floor(Math.random() * points.length);
    if (!used.has(idx)) {
      used.add(idx);
      centroids.push({ ...points[idx] });
    }
  }

  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < 50; iter++) {
    // Assign
    const newAssignments = points.map((p) => {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dist = (p.x - centroids[c].x) ** 2 + (p.y - centroids[c].y) ** 2 + (p.z - centroids[c].z) ** 2;
        if (dist < minDist) { minDist = dist; best = c; }
      }
      return best;
    });

    // Check convergence
    if (newAssignments.every((a, i) => a === assignments[i])) break;
    assignments = newAssignments;

    // Update centroids
    for (let c = 0; c < centroids.length; c++) {
      const members = points.filter((_, i) => assignments[i] === c);
      if (members.length > 0) {
        centroids[c] = {
          x: members.reduce((s, p) => s + p.x, 0) / members.length,
          y: members.reduce((s, p) => s + p.y, 0) / members.length,
          z: members.reduce((s, p) => s + p.z, 0) / members.length,
        };
      }
    }
  }

  return assignments;
}

// ---- White space detection ----

function detectWhiteSpaces(clusters: IdeaCluster[], maxSpaces: number = 10): WhiteSpace[] {
  if (clusters.length < 2) return [];
  const whiteSpaces: WhiteSpace[] = [];

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length && whiteSpaces.length < maxSpaces; j++) {
      const midpoint: Point3D = {
        x: (clusters[i].centroid.x + clusters[j].centroid.x) / 2,
        y: (clusters[i].centroid.y + clusters[j].centroid.y) / 2,
        z: (clusters[i].centroid.z + clusters[j].centroid.z) / 2,
      };

      const dist = Math.sqrt(
        (clusters[i].centroid.x - clusters[j].centroid.x) ** 2 +
        (clusters[i].centroid.y - clusters[j].centroid.y) ** 2 +
        (clusters[i].centroid.z - clusters[j].centroid.z) ** 2
      );

      // Only flag gaps where clusters are sufficiently far apart
      if (dist > 2) {
        whiteSpaces.push({
          id: `gap-${i}-${j}`,
          position: midpoint,
          nearestClusters: [clusters[i].label, clusters[j].label],
          gapDescription: `Unexplored space between "${clusters[i].label}" and "${clusters[j].label}"`,
          innovationPotential: dist > 5 ? "very-high" : dist > 3 ? "high" : "medium",
          suggestedDirection: `Combine themes from ${clusters[i].themes[0] ?? clusters[i].label} and ${clusters[j].themes[0] ?? clusters[j].label}`,
        });
      }
    }
  }

  return whiteSpaces.sort((a, b) => {
    const potentialOrder = { "very-high": 0, high: 1, medium: 2, low: 3 };
    return potentialOrder[a.innovationPotential] - potentialOrder[b.innovationPotential];
  });
}

/** Options for building the embedding space. */
export interface BuildEmbeddingSpaceOptions {
  model?: string;
  signal?: AbortSignal;
  clusterCount?: number;
}

/** Input idea for embedding. */
export interface IdeaInput {
  id: string;
  title: string;
  description: string;
  tags?: string[];
  score?: number;
}

/**
 * Build a 3D embedding space from a collection of ideas.
 */
export async function buildEmbeddingSpace(
  ideas: IdeaInput[],
  options: BuildEmbeddingSpaceOptions = {}
): Promise<EmbeddingSpace> {
  if (ideas.length === 0) {
    throw new Error("At least one idea is required");
  }

  const documents = ideas.map((i) => `${i.title} ${i.description} ${(i.tags ?? []).join(" ")}`);
  const vectors = computeTfIdfVectors(documents);
  const positions = reduceToThreeD(vectors);

  const clusterCount = options.clusterCount ?? Math.min(Math.max(2, Math.floor(ideas.length / 3)), 10);
  const assignments = kMeansCluster(positions, clusterCount);

  const embeddedIdeas: EmbeddedIdea[] = ideas.map((idea, i) => ({
    id: idea.id,
    title: idea.title,
    description: idea.description,
    position: positions[i] ?? { x: 0, y: 0, z: 0 },
    clusterId: assignments[i] ?? -1,
    tags: idea.tags ?? [],
    score: idea.score,
  }));

  // Build cluster metadata using LLM for labeling
  const clusterMap = new Map<number, EmbeddedIdea[]>();
  for (const idea of embeddedIdeas) {
    if (!clusterMap.has(idea.clusterId)) clusterMap.set(idea.clusterId, []);
    clusterMap.get(idea.clusterId)!.push(idea);
  }

  let clusters: IdeaCluster[];

  try {
    const clusterDescriptions = Array.from(clusterMap.entries()).map(([id, members]) => ({
      id,
      ideas: members.map((m) => m.title).join(", "),
    }));

    const labelPrompt = `Label these idea clusters. Each cluster contains related innovation ideas.

${clusterDescriptions.map((c) => `Cluster ${c.id}: ${c.ideas}`).join("\n")}

Respond with JSON array:
[
  {"id": 0, "label": "short descriptive label", "themes": ["theme1", "theme2"]}
]`;

    const labels = await withRetry(
      async () => {
        const raw = await generateText({ prompt: labelPrompt, model: options.model, signal: options.signal });
        const jsonStr = extractJson(raw);
        try {
          return JSON.parse(jsonStr) as unknown;
        } catch {
          throw new Error(`Failed to parse cluster labels: ${jsonStr.slice(0, 200)}`);
        }
      },
      {
        signal: options.signal,
        isRetryable: (err) =>
          err instanceof Error &&
          (err.message.includes("Failed to parse") ||
            err.message.includes("No JSON object found") ||
            err.message.includes("Unbalanced JSON braces")),
      }
    );
    const labelArray = Array.isArray(labels) ? labels : (labels as Record<string, unknown>).clusters ?? [];

    clusters = Array.from(clusterMap.entries()).map(([id, members]) => {
      const labelInfo = (labelArray as Array<{ id: number; label?: string; themes?: string[] }>).find((l) => l.id === id);
      const centroid: Point3D = {
        x: members.reduce((s, m) => s + m.position.x, 0) / members.length,
        y: members.reduce((s, m) => s + m.position.y, 0) / members.length,
        z: members.reduce((s, m) => s + m.position.z, 0) / members.length,
      };

      return {
        id,
        label: labelInfo?.label ?? `Cluster ${id}`,
        centroid,
        ideaCount: members.length,
        density: members.length / Math.max(1, Math.sqrt(
          members.reduce((s, m) =>
            s + (m.position.x - centroid.x) ** 2 + (m.position.y - centroid.y) ** 2 + (m.position.z - centroid.z) ** 2, 0)
        )),
        themes: labelInfo?.themes ?? [],
        avgScore: members.filter((m) => m.score != null).length > 0
          ? members.reduce((s, m) => s + (m.score ?? 0), 0) / members.filter((m) => m.score != null).length
          : undefined,
      };
    });
  } catch {
    // Fallback without LLM labeling
    clusters = Array.from(clusterMap.entries()).map(([id, members]) => {
      const centroid: Point3D = {
        x: members.reduce((s, m) => s + m.position.x, 0) / members.length,
        y: members.reduce((s, m) => s + m.position.y, 0) / members.length,
        z: members.reduce((s, m) => s + m.position.z, 0) / members.length,
      };
      return { id, label: `Cluster ${id}`, centroid, ideaCount: members.length, density: 1, themes: [] };
    });
  }

  const whiteSpaces = detectWhiteSpaces(clusters);

  const space: EmbeddingSpace = {
    ideas: embeddedIdeas,
    clusters,
    whiteSpaces,
    dimensions: {
      xLabel: "Feasibility ↔ Novelty",
      yLabel: "Technical ↔ Business",
      zLabel: "Short-term ↔ Long-term",
    },
    totalIdeas: ideas.length,
    generatedAt: new Date().toISOString(),
  };

  const id = `space-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  embeddingSpaces.set(id, space);

  return space;
}

/** Options for gap-targeted generation. */
export interface GenerateInGapOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Generate ideas targeted at a detected white space gap.
 */
export async function generateInWhiteSpace(
  whiteSpace: WhiteSpace,
  existingIdeas: string[],
  subject: string,
  options: GenerateInGapOptions = {}
): Promise<Array<{ title: string; description: string }>> {
  const prompt = `You are an innovation strategist. Generate ideas to fill this innovation gap.

Subject: ${sanitizeUserInput(subject)}
Gap: ${whiteSpace.gapDescription}
Nearby clusters: ${whiteSpace.nearestClusters.join(", ")}
Suggested direction: ${whiteSpace.suggestedDirection}
Innovation potential: ${whiteSpace.innovationPotential}

Existing ideas (avoid duplicates): ${existingIdeas.slice(0, 10).join("; ")}

Generate 3-5 novel ideas that bridge this gap. Respond with JSON:
[
  {"title": "idea title", "description": "brief description"}
]`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse gap ideas: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal: options.signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );
  const ideasArray = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).ideas as unknown[]) ?? [];
  return (ideasArray as Array<{ title: string; description: string }>).map((i) => ({
    title: String(i.title ?? "").slice(0, 500),
    description: String(i.description ?? "").slice(0, 2000),
  }));
}

/**
 * Get a stored embedding space by ID.
 */
export function getEmbeddingSpace(id: string): EmbeddingSpace | undefined {
  return embeddingSpaces.get(id);
}

/**
 * List all stored embedding spaces.
 */
export function listEmbeddingSpaces(): Array<{ id: string; totalIdeas: number; generatedAt: string }> {
  return Array.from(embeddingSpaces.entries()).map(([id, s]) => ({
    id,
    totalIdeas: s.totalIdeas,
    generatedAt: s.generatedAt,
  }));
}

/**
 * Clear all stored embedding spaces.
 */
export function clearEmbeddingSpaces(): void {
  embeddingSpaces.clear();
}
