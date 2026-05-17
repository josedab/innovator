import { randomUUID } from "node:crypto";
import { z } from "zod";

function uniqueTraits(traits: string[]): string[] {
  return Array.from(
    new Set(
      traits
        .map((trait) => trait.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function overlapCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((trait) => rightSet.has(trait)).length;
}

function similarity(left: string[], right: string[]): number {
  const union = new Set([...left, ...right]).size;
  return union > 0 ? overlapCount(left, right) / union : 0;
}

// Genome records for ideas, competitors, patents
export const GenomeRecordSchema = z.object({
  id: z.string(),
  type: z.enum(["idea", "competitor", "patent"]),
  title: z.string().max(500),
  description: z.string().max(2000),
  traits: z.array(z.string().max(200)).max(50),
  embedding: z.array(z.number()).optional(),
  source: z.string().max(500).optional(),
  createdAt: z.string(),
});
export type GenomeRecord = z.infer<typeof GenomeRecordSchema>;

export const GenomeClusterSchema = z.object({
  id: z.string(),
  label: z.string().max(500),
  recordIds: z.array(z.string()),
  centroidTraits: z.array(z.string().max(200)).max(20),
  density: z.number().min(0).max(1),
});
export type GenomeCluster = z.infer<typeof GenomeClusterSchema>;

export const WhiteSpaceRegionSchema = z.object({
  id: z.string(),
  description: z.string().max(1000),
  adjacentClusters: z.array(z.string()),
  opportunityScore: z.number().min(0).max(1),
  suggestedTraits: z.array(z.string().max(200)).max(10),
});
export type WhiteSpaceRegion = z.infer<typeof WhiteSpaceRegionSchema>;

export const NoveltyScoreSchema = z.object({
  recordId: z.string(),
  score: z.number().min(0).max(1),
  nearestNeighbors: z
    .array(
      z.object({
        recordId: z.string(),
        similarity: z.number(),
      })
    )
    .max(5),
  collisionRisk: z.enum(["none", "low", "medium", "high"]),
});
export type NoveltyScore = z.infer<typeof NoveltyScoreSchema>;

const genomeRecords = new Map<string, GenomeRecord>();
const genomeClusters = new Map<string, GenomeCluster>();

function cloneRecord(record: GenomeRecord): GenomeRecord {
  return GenomeRecordSchema.parse(record);
}

function cloneCluster(cluster: GenomeCluster): GenomeCluster {
  return GenomeClusterSchema.parse(cluster);
}

// Corpus sequencing
export function addGenomeRecord(
  type: "idea" | "competitor" | "patent",
  title: string,
  description: string,
  traits: string[]
): GenomeRecord {
  const record = GenomeRecordSchema.parse({
    id: randomUUID(),
    type,
    title: title.trim(),
    description: description.trim(),
    traits: uniqueTraits(traits).slice(0, 50),
    createdAt: new Date().toISOString(),
  });
  genomeRecords.set(record.id, record);
  return cloneRecord(record);
}

export function getGenomeRecord(id: string): GenomeRecord | undefined {
  const record = genomeRecords.get(id);
  return record ? cloneRecord(record) : undefined;
}

export function listGenomeRecords(type?: "idea" | "competitor" | "patent"): GenomeRecord[] {
  return Array.from(genomeRecords.values())
    .filter((record) => !type || record.type === type)
    .map((record) => cloneRecord(record));
}

// Clustering (simple trait-overlap based)
export function clusterGenomeRecords(minOverlap: number = 2): GenomeCluster[] {
  const records = Array.from(genomeRecords.values());
  const visited = new Set<string>();
  const clusters: GenomeCluster[] = [];
  genomeClusters.clear();

  for (const record of records) {
    if (visited.has(record.id)) continue;
    const queue = [record.id];
    const component: GenomeRecord[] = [];
    visited.add(record.id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = genomeRecords.get(currentId);
      if (!current) continue;
      component.push(current);

      for (const candidate of records) {
        if (visited.has(candidate.id)) continue;
        if (overlapCount(current.traits, candidate.traits) >= minOverlap) {
          visited.add(candidate.id);
          queue.push(candidate.id);
        }
      }
    }

    const traitCounts = new Map<string, number>();
    for (const item of component) {
      for (const trait of item.traits) {
        traitCounts.set(trait, (traitCounts.get(trait) ?? 0) + 1);
      }
    }

    let edges = 0;
    for (let i = 0; i < component.length; i += 1) {
      for (let j = i + 1; j < component.length; j += 1) {
        if (overlapCount(component[i].traits, component[j].traits) >= minOverlap) {
          edges += 1;
        }
      }
    }

    const possibleEdges = component.length > 1 ? (component.length * (component.length - 1)) / 2 : 1;
    const density = Number(Math.min(1, edges / possibleEdges).toFixed(2));
    const centroidTraits = Array.from(traitCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([trait]) => trait);
    const label = centroidTraits[0]
      ? `Cluster around ${centroidTraits[0]}`
      : component[0]?.title ?? "Singleton cluster";

    const cluster = GenomeClusterSchema.parse({
      id: randomUUID(),
      label: label.slice(0, 500),
      recordIds: component.map((item) => item.id),
      centroidTraits,
      density,
    });
    clusters.push(cluster);
    genomeClusters.set(cluster.id, cluster);
  }

  return clusters.map((cluster) => cloneCluster(cluster));
}

// White-space detection
export function identifyWhiteSpaces(clusters: GenomeCluster[]): WhiteSpaceRegion[] {
  const regions: WhiteSpaceRegion[] = [];

  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const left = clusters[i];
      const right = clusters[j];
      const leftTraits = uniqueTraits(left.centroidTraits);
      const rightTraits = uniqueTraits(right.centroidTraits);
      const shared = new Set(leftTraits.filter((trait) => rightTraits.includes(trait)));
      const suggestedTraits = Array.from(
        new Set([...leftTraits, ...rightTraits].filter((trait) => !shared.has(trait)))
      ).slice(0, 10);
      if (suggestedTraits.length === 0) continue;

      const opportunityScore = Number(
        Math.min(
          1,
          ((suggestedTraits.length / 10) * 0.6 + (1 - (left.density + right.density) / 2) * 0.4)
        ).toFixed(2)
      );
      regions.push(
        WhiteSpaceRegionSchema.parse({
          id: randomUUID(),
          description: `Opportunity space between ${left.label} and ${right.label} using complementary traits.`.slice(0, 1000),
          adjacentClusters: [left.id, right.id],
          opportunityScore,
          suggestedTraits,
        })
      );
    }
  }

  return regions;
}

// Novelty scoring
export function scoreNovelty(recordId: string): NoveltyScore | undefined {
  const record = genomeRecords.get(recordId);
  if (!record) return undefined;

  const neighbors = Array.from(genomeRecords.values())
    .filter((candidate) => candidate.id !== recordId)
    .map((candidate) => ({
      recordId: candidate.id,
      similarity: Number(similarity(record.traits, candidate.traits).toFixed(2)),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 5);

  const maxSimilarity = neighbors[0]?.similarity ?? 0;
  const score = Number((1 - maxSimilarity).toFixed(2));
  const collisionRisk =
    maxSimilarity >= 0.85
      ? "high"
      : maxSimilarity >= 0.65
        ? "medium"
        : maxSimilarity >= 0.45
          ? "low"
          : "none";

  return NoveltyScoreSchema.parse({
    recordId,
    score,
    nearestNeighbors: neighbors,
    collisionRisk,
  });
}

// Recombinant concept generation (combine traits from different clusters)
export function generateRecombinantConcepts(
  cluster1Id: string,
  cluster2Id: string,
  count: number = 3
): GenomeRecord[] {
  const cluster1 = genomeClusters.get(cluster1Id);
  const cluster2 = genomeClusters.get(cluster2Id);
  if (!cluster1 || !cluster2) return [];

  const leftTraits = uniqueTraits(cluster1.centroidTraits);
  const rightTraits = uniqueTraits(cluster2.centroidTraits);
  const records: GenomeRecord[] = [];
  const iterations = Math.max(1, Math.min(count, 10));

  for (let index = 0; index < iterations; index += 1) {
    const combinedTraits = Array.from(
      new Set([
        leftTraits[index % Math.max(leftTraits.length, 1)] ?? leftTraits[0],
        leftTraits[(index + 1) % Math.max(leftTraits.length, 1)] ?? leftTraits[0],
        rightTraits[index % Math.max(rightTraits.length, 1)] ?? rightTraits[0],
        rightTraits[(index + 1) % Math.max(rightTraits.length, 1)] ?? rightTraits[0],
      ].filter(Boolean))
    );

    const record = GenomeRecordSchema.parse({
      id: randomUUID(),
      type: "idea",
      title: `Recombinant Concept ${index + 1}: ${cluster1.label} × ${cluster2.label}`.slice(0, 500),
      description: `A recombinant concept that blends ${cluster1.label} with ${cluster2.label} to explore an unserved innovation pocket.`.slice(0, 2000),
      traits: combinedTraits.slice(0, 50),
      source: `cluster:${cluster1Id}+${cluster2Id}`,
      createdAt: new Date().toISOString(),
    });
    genomeRecords.set(record.id, record);
    records.push(record);
  }

  return records.map((record) => cloneRecord(record));
}

// Export
export function exportPatentBrief(recordId: string): string {
  const record = genomeRecords.get(recordId);
  if (!record) return `# Patent Brief\n\nRecord ${recordId} was not found.`;

  return [
    `# Patent Brief: ${record.title}`,
    "",
    `**Type:** ${record.type}`,
    record.source ? `**Source:** ${record.source}` : "",
    `**Created:** ${record.createdAt}`,
    "",
    "## Abstract",
    "",
    record.description,
    "",
    "## Claim Traits",
    "",
    ...record.traits.map((trait) => `- ${trait}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function clearGenomeAtlasData(): void {
  genomeRecords.clear();
  genomeClusters.clear();
}
