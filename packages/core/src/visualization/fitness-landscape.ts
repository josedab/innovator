/**
 * @module visualization/fitness-landscape
 *
 * 3D Fitness Landscape — computes 3D coordinates for ideas using
 * dimensionality reduction (t-SNE-inspired), generates terrain meshes,
 * cluster detection, evolution trail paths, and gap analysis for
 * Three.js/React Three Fiber rendering.
 */

import { z } from "zod";
import type { AngleResult, Synthesis } from "../types.js";

// ---- Schemas ----

export const FitnessPointSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(300),
  description: z.string().max(2000),
  angleId: z.string().max(100),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  feasibility: z.number().min(0).max(10),
  impact: z.number().min(0).max(10),
  novelty: z.number().min(0).max(10),
  fitnessScore: z.number().min(0).max(10),
  clusterId: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const TerrainVertexSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  fitness: z.number().min(0).max(10),
  color: z.string(),
});

export const LandscapeClusterSchema = z.object({
  id: z.number().int(),
  centroid: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  label: z.string().max(200),
  pointIds: z.array(z.string().max(100)),
  averageFitness: z.number(),
  dominantAngle: z.string().max(100),
});

export const EvolutionTrailSchema = z.object({
  id: z.string().max(100),
  generation: z.number().int().min(0),
  points: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      fitness: z.number(),
    })
  ),
});

export const GapRegionSchema = z.object({
  centroid: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  radius: z.number(),
  feasibilityRange: z.object({ min: z.number(), max: z.number() }),
  impactRange: z.object({ min: z.number(), max: z.number() }),
  noveltyRange: z.object({ min: z.number(), max: z.number() }),
  suggestedAngles: z.array(z.string().max(100)),
  description: z.string().max(500),
});

export const FitnessLandscapeSchema = z.object({
  points: z.array(FitnessPointSchema),
  terrain: z.array(TerrainVertexSchema),
  clusters: z.array(LandscapeClusterSchema),
  gaps: z.array(GapRegionSchema),
  evolutionTrails: z.array(EvolutionTrailSchema),
  bounds: z.object({
    minX: z.number(),
    maxX: z.number(),
    minY: z.number(),
    maxY: z.number(),
    minZ: z.number(),
    maxZ: z.number(),
  }),
  metadata: z.object({
    totalPoints: z.number(),
    totalClusters: z.number(),
    totalGaps: z.number(),
    averageFitness: z.number(),
    generatedAt: z.string(),
  }),
});

export type FitnessPoint = z.infer<typeof FitnessPointSchema>;
export type TerrainVertex = z.infer<typeof TerrainVertexSchema>;
export type LandscapeCluster = z.infer<typeof LandscapeClusterSchema>;
export type EvolutionTrail = z.infer<typeof EvolutionTrailSchema>;
export type GapRegion = z.infer<typeof GapRegionSchema>;
export type FitnessLandscape = z.infer<typeof FitnessLandscapeSchema>;

// ---- Score Extraction ----

const HIGH_IMPACT_WORDS = [
  "revolutionary",
  "transformative",
  "breakthrough",
  "disruptive",
  "paradigm",
  "game-changing",
];
const _MED_IMPACT_WORDS = ["significant", "substantial", "meaningful", "notable", "important"];
const LOW_IMPACT_WORDS = ["incremental", "minor", "small", "marginal"];

const HIGH_FEASIBILITY_WORDS = [
  "straightforward",
  "existing",
  "proven",
  "ready",
  "simple",
  "available",
];
const LOW_FEASIBILITY_WORDS = [
  "complex",
  "difficult",
  "challenging",
  "requires",
  "advanced",
  "novel",
];

const HIGH_NOVELTY_WORDS = ["novel", "unique", "unprecedented", "innovative", "original", "first"];
const LOW_NOVELTY_WORDS = ["conventional", "traditional", "standard", "existing", "common"];

function scoreFromText(
  text: string,
  highWords: string[],
  lowWords: string[],
  base: number = 5
): number {
  const lower = text.toLowerCase();
  let score = base;
  for (const w of highWords) if (lower.includes(w)) score += 1.2;
  for (const w of lowWords) if (lower.includes(w)) score -= 0.8;
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

function extractScores(idea: {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}): {
  feasibility: number;
  impact: number;
  novelty: number;
} {
  const fullText = `${idea.title} ${idea.description} ${idea.potentialImpact} ${idea.implementationHint}`;
  return {
    feasibility: scoreFromText(fullText, HIGH_FEASIBILITY_WORDS, LOW_FEASIBILITY_WORDS, 5.5),
    impact: scoreFromText(fullText, HIGH_IMPACT_WORDS, LOW_IMPACT_WORDS, 5),
    novelty: scoreFromText(fullText, HIGH_NOVELTY_WORDS, LOW_NOVELTY_WORDS, 5),
  };
}

// ---- Dimensionality Reduction (t-SNE-inspired) ----

/**
 * Compute 3D coordinates from score vectors using a simplified t-SNE-like approach.
 * Maps the 3-dimensional score space (feasibility, impact, novelty) to 3D positions
 * with distance-preserving properties.
 */
function computeCoordinates(
  scores: Array<{ feasibility: number; impact: number; novelty: number }>,
  seed: number = 42
): Array<{ x: number; y: number; z: number }> {
  if (scores.length === 0) return [];

  // Simple seeded PRNG for deterministic output
  let rngState = seed;
  function seededRandom(): number {
    rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
    return rngState / 0x7fffffff;
  }

  // Normalize scores to [0,1] range
  const maxF = Math.max(...scores.map((s) => s.feasibility), 1);
  const maxI = Math.max(...scores.map((s) => s.impact), 1);
  const maxN = Math.max(...scores.map((s) => s.novelty), 1);

  const n = scores.length;
  const positions: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < n; i++) {
    const s = scores[i];
    if (!s) continue;
    // Base position from normalized scores
    let x = (s.feasibility / maxF) * 10;
    let y = (s.impact / maxI) * 10;
    let z = (s.novelty / maxN) * 10;

    // Add deterministic jitter to prevent overlapping points
    const jitter = 0.3;
    x += (seededRandom() - 0.5) * jitter;
    y += (seededRandom() - 0.5) * jitter;
    z += (seededRandom() - 0.5) * jitter;

    // Simple force-directed repulsion from nearby points
    for (let j = 0; j < positions.length; j++) {
      const other = positions[j];
      if (!other) continue;
      const dx = x - other.x;
      const dy = y - other.y;
      const dz = z - other.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.5 && dist > 0) {
        const force = (0.5 - dist) * 0.3;
        x += (dx / dist) * force;
        y += (dy / dist) * force;
        z += (dz / dist) * force;
      }
    }

    positions.push({
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
    });
  }

  return positions;
}

// ---- Terrain Mesh Generation ----

function fitnessColor(fitness: number): string {
  // Blue (low) → Green (medium) → Red (high)
  if (fitness < 3) return `hsl(240, 70%, ${30 + fitness * 5}%)`;
  if (fitness < 6) return `hsl(${120 + (fitness - 3) * 20}, 70%, 45%)`;
  return `hsl(${(10 - fitness) * 12}, 80%, 50%)`;
}

/**
 * Generate terrain mesh vertices interpolating between idea positions.
 */
function generateTerrain(points: FitnessPoint[], resolution: number = 20): TerrainVertex[] {
  if (points.length === 0) return [];

  const minX = Math.min(...points.map((p) => p.x)) - 1;
  const maxX = Math.max(...points.map((p) => p.x)) + 1;
  const minY = Math.min(...points.map((p) => p.y)) - 1;
  const maxY = Math.max(...points.map((p) => p.y)) + 1;

  const vertices: TerrainVertex[] = [];
  const stepX = (maxX - minX) / resolution;
  const stepY = (maxY - minY) / resolution;

  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const gx = minX + i * stepX;
      const gy = minY + j * stepY;

      // Inverse-distance weighted interpolation of fitness scores
      let weightedFitness = 0;
      let totalWeight = 0;

      for (const point of points) {
        const dx = gx - point.x;
        const dy = gy - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const weight = 1 / (dist * dist + 0.5);
        weightedFitness += point.fitnessScore * weight;
        totalWeight += weight;
      }

      const fitness = totalWeight > 0 ? weightedFitness / totalWeight : 0;
      const clampedFitness = Math.max(0, Math.min(10, Math.round(fitness * 100) / 100));

      vertices.push({
        x: Math.round(gx * 100) / 100,
        y: Math.round(gy * 100) / 100,
        z: Math.round(clampedFitness * 100) / 100,
        fitness: clampedFitness,
        color: fitnessColor(clampedFitness),
      });
    }
  }

  return vertices;
}

// ---- Clustering (K-means-like) ----

function clusterPoints(points: FitnessPoint[], k: number = 0): LandscapeCluster[] {
  if (points.length === 0) return [];

  // Auto-determine k if not specified
  const numClusters = k > 0 ? k : Math.min(Math.max(2, Math.floor(points.length / 3)), 8);

  // Initialize centroids from first k points spread across the space
  const centroids: Array<{ x: number; y: number; z: number }> = [];
  const step = Math.floor(points.length / numClusters);
  for (let i = 0; i < numClusters; i++) {
    const p = points[Math.min(i * step, points.length - 1)]!;
    centroids.push({ x: p.x, y: p.y, z: p.z });
  }

  // K-means iterations
  const assignments = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    // Assign points to nearest centroid
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dx = points[i]!.x - centroids[c]!.x;
        const dy = points[i]!.y - centroids[c]!.y;
        const dz = points[i]!.z - centroids[c]!.z;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < minDist) {
          minDist = dist;
          assignments[i] = c;
        }
      }
    }

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

  // Build cluster objects
  return centroids
    .map((centroid, c) => {
      const memberPoints = points.filter((_, i) => assignments[i] === c);
      const avgFitness =
        memberPoints.length > 0
          ? memberPoints.reduce((s, p) => s + p.fitnessScore, 0) / memberPoints.length
          : 0;

      // Dominant angle
      const angleCounts = new Map<string, number>();
      for (const p of memberPoints) {
        angleCounts.set(p.angleId, (angleCounts.get(p.angleId) ?? 0) + 1);
      }
      const dominantAngle =
        Array.from(angleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed";

      return {
        id: c,
        centroid: {
          x: Math.round(centroid.x * 100) / 100,
          y: Math.round(centroid.y * 100) / 100,
          z: Math.round(centroid.z * 100) / 100,
        },
        label: `Cluster ${c + 1} (${dominantAngle})`,
        pointIds: memberPoints.map((p) => p.id),
        averageFitness: Math.round(avgFitness * 100) / 100,
        dominantAngle,
      };
    })
    .filter((c) => c.pointIds.length > 0);
}

// ---- Gap Detection ----

function detectGaps(points: FitnessPoint[], clusters: LandscapeCluster[]): GapRegion[] {
  if (points.length < 3) return [];

  const gaps: GapRegion[] = [];

  // Check for gaps between clusters
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const cA = clusters[i]!;
      const cB = clusters[j]!;

      // Midpoint between clusters
      const mid = {
        x: (cA.centroid.x + cB.centroid.x) / 2,
        y: (cA.centroid.y + cB.centroid.y) / 2,
        z: (cA.centroid.z + cB.centroid.z) / 2,
      };

      // Check if any points are near the midpoint
      const nearby = points.filter((p) => {
        const dx = p.x - mid.x;
        const dy = p.y - mid.y;
        const dz = p.z - mid.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) < 2;
      });

      if (nearby.length === 0) {
        // Infer the score ranges for this gap region
        const feasibilityMid =
          (points.filter((p) => cA.pointIds.includes(p.id)).reduce((s, p) => s + p.feasibility, 0) /
            Math.max(cA.pointIds.length, 1) +
            points
              .filter((p) => cB.pointIds.includes(p.id))
              .reduce((s, p) => s + p.feasibility, 0) /
              Math.max(cB.pointIds.length, 1)) /
          2;

        const impactMid =
          (points.filter((p) => cA.pointIds.includes(p.id)).reduce((s, p) => s + p.impact, 0) /
            Math.max(cA.pointIds.length, 1) +
            points.filter((p) => cB.pointIds.includes(p.id)).reduce((s, p) => s + p.impact, 0) /
              Math.max(cB.pointIds.length, 1)) /
          2;

        // Suggest angles not dominant in either cluster
        const usedAngles = new Set([cA.dominantAngle, cB.dominantAngle]);
        const allAngles = [...new Set(points.map((p) => p.angleId))];
        const suggestedAngles = allAngles.filter((a) => !usedAngles.has(a)).slice(0, 3);

        gaps.push({
          centroid: {
            x: Math.round(mid.x * 100) / 100,
            y: Math.round(mid.y * 100) / 100,
            z: Math.round(mid.z * 100) / 100,
          },
          radius: 2,
          feasibilityRange: {
            min: Math.max(0, Math.round((feasibilityMid - 1.5) * 10) / 10),
            max: Math.min(10, Math.round((feasibilityMid + 1.5) * 10) / 10),
          },
          impactRange: {
            min: Math.max(0, Math.round((impactMid - 1.5) * 10) / 10),
            max: Math.min(10, Math.round((impactMid + 1.5) * 10) / 10),
          },
          noveltyRange: { min: 3, max: 8 },
          suggestedAngles: suggestedAngles.length > 0 ? suggestedAngles : ["cross-domain"],
          description: `Gap between "${cA.label}" and "${cB.label}" — underexplored area`,
        });
      }
    }
  }

  // Check for underexplored high-fitness regions
  const highFitnessThreshold = 7;
  const highFitnessPoints = points.filter((p) => p.fitnessScore >= highFitnessThreshold);
  if (highFitnessPoints.length < points.length * 0.1 && points.length > 5) {
    gaps.push({
      centroid: { x: 7, y: 7, z: 7 },
      radius: 3,
      feasibilityRange: { min: 7, max: 10 },
      impactRange: { min: 7, max: 10 },
      noveltyRange: { min: 5, max: 10 },
      suggestedAngles: ["first-principles", "biomimicry"],
      description: "High-fitness region underexplored — few ideas score well across all dimensions",
    });
  }

  return gaps;
}

// ---- Main API ----

/**
 * Generate a complete 3D fitness landscape from angle results.
 * Ideas are plotted by feasibility (x), impact (y), and novelty (z)
 * with terrain interpolation, clusters, and gap detection.
 */
export function generateFitnessLandscape(
  angleResults: AngleResult[],
  options?: {
    terrainResolution?: number;
    clusterCount?: number;
    synthesis?: Synthesis;
  }
): FitnessLandscape {
  // Extract scores from ideas
  const rawPoints: Array<{
    idea: {
      title: string;
      description: string;
      potentialImpact: string;
      implementationHint: string;
    };
    angleId: string;
    scores: { feasibility: number; impact: number; novelty: number };
  }> = [];

  for (const angle of angleResults) {
    for (const idea of angle.ideas) {
      rawPoints.push({
        idea,
        angleId: angle.angleId,
        scores: extractScores(idea),
      });
    }
  }

  // Compute 3D positions
  const positions = computeCoordinates(rawPoints.map((p) => p.scores));

  // Build fitness points
  const fitnessPoints: FitnessPoint[] = rawPoints.map((rp, i) => {
    const pos = positions[i]!;
    const fitnessScore =
      Math.round(((rp.scores.feasibility + rp.scores.impact + rp.scores.novelty) / 3) * 100) / 100;

    return {
      id: `fp-${rp.angleId}-${i}`,
      label: rp.idea.title,
      description: rp.idea.description,
      angleId: rp.angleId,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      feasibility: rp.scores.feasibility,
      impact: rp.scores.impact,
      novelty: rp.scores.novelty,
      fitnessScore,
    };
  });

  // Generate terrain
  const terrain = generateTerrain(fitnessPoints, options?.terrainResolution ?? 20);

  // Cluster points
  const clusters = clusterPoints(fitnessPoints, options?.clusterCount);

  // Assign cluster IDs back to points
  for (const cluster of clusters) {
    for (const pointId of cluster.pointIds) {
      const point = fitnessPoints.find((p) => p.id === pointId);
      if (point) point.clusterId = cluster.id;
    }
  }

  // Detect gaps
  const gaps = detectGaps(fitnessPoints, clusters);

  // Compute bounds
  const allX = fitnessPoints.map((p) => p.x);
  const allY = fitnessPoints.map((p) => p.y);
  const allZ = fitnessPoints.map((p) => p.z);

  const bounds = {
    minX: allX.length > 0 ? Math.min(...allX) : 0,
    maxX: allX.length > 0 ? Math.max(...allX) : 10,
    minY: allY.length > 0 ? Math.min(...allY) : 0,
    maxY: allY.length > 0 ? Math.max(...allY) : 10,
    minZ: allZ.length > 0 ? Math.min(...allZ) : 0,
    maxZ: allZ.length > 0 ? Math.max(...allZ) : 10,
  };

  const avgFitness =
    fitnessPoints.length > 0
      ? Math.round(
          (fitnessPoints.reduce((s, p) => s + p.fitnessScore, 0) / fitnessPoints.length) * 100
        ) / 100
      : 0;

  return {
    points: fitnessPoints,
    terrain,
    clusters,
    gaps,
    evolutionTrails: [],
    bounds,
    metadata: {
      totalPoints: fitnessPoints.length,
      totalClusters: clusters.length,
      totalGaps: gaps.length,
      averageFitness: avgFitness,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Add evolution trail data showing how ideas move across the landscape
 * over multiple generations.
 */
export function addEvolutionTrail(
  landscape: FitnessLandscape,
  generationResults: AngleResult[][]
): FitnessLandscape {
  const trails: EvolutionTrail[] = [];

  for (let gen = 0; gen < generationResults.length; gen++) {
    const genResults = generationResults[gen]!;
    const genPoints: Array<{ x: number; y: number; z: number; fitness: number }> = [];

    for (const angle of genResults) {
      for (const idea of angle.ideas) {
        const scores = extractScores(idea);
        const fitness = (scores.feasibility + scores.impact + scores.novelty) / 3;
        const pos = computeCoordinates([scores])[0]!;
        genPoints.push({ ...pos, fitness: Math.round(fitness * 100) / 100 });
      }
    }

    trails.push({
      id: `trail-gen-${gen}`,
      generation: gen,
      points: genPoints,
    });
  }

  return {
    ...landscape,
    evolutionTrails: trails,
  };
}

/**
 * Get gap suggestions formatted for triggering targeted investigation.
 */
export function getGapInvestigationSuggestions(landscape: FitnessLandscape): Array<{
  gapDescription: string;
  suggestedSubject: string;
  suggestedAngles: string[];
  targetScores: { feasibility: string; impact: string; novelty: string };
}> {
  return landscape.gaps.map((gap) => ({
    gapDescription: gap.description,
    suggestedSubject: `Ideas in the ${gap.feasibilityRange.min}-${gap.feasibilityRange.max} feasibility range with ${gap.impactRange.min}-${gap.impactRange.max} impact`,
    suggestedAngles: gap.suggestedAngles,
    targetScores: {
      feasibility: `${gap.feasibilityRange.min}-${gap.feasibilityRange.max}`,
      impact: `${gap.impactRange.min}-${gap.impactRange.max}`,
      novelty: `${gap.noveltyRange.min}-${gap.noveltyRange.max}`,
    },
  }));
}
