/**
 * @module learning-loop/memory-service
 *
 * Innovation Memory Service — stores and retrieves innovation memories
 * (investigations, ideas, outcomes, insights) with vector similarity search.
 * Provides pre-session recommendations, mid-session nudges, bias detection,
 * and angle effectiveness tracking.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const InnovationMemoryEntrySchema = z.object({
  id: z.string().max(200),
  sessionId: z.string().max(200),
  type: z.enum(["investigation", "idea", "outcome", "insight"]),
  content: z.string().max(10000),
  domain: z.string().max(500),
  embedding: z.array(z.number()).max(1024),
  tags: z.array(z.string().max(100)).max(50),
  qualityScore: z.number().min(0).max(10),
  createdAt: z.string(),
  metadata: z.record(z.string().max(1000)).optional(),
});

export const MemoryQueryOptionsSchema = z.object({
  domain: z.string().max(500).optional(),
  type: z.enum(["investigation", "idea", "outcome", "insight"]).optional(),
  minQuality: z.number().min(0).max(10).optional(),
  limit: z.number().min(1).max(100).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
});

export const AngleEffectivenessSchema = z.object({
  angleId: z.string().max(100),
  domain: z.string().max(500),
  averageQuality: z.number().min(0).max(10),
  sampleCount: z.number().min(0),
});

export const BiasEntrySchema = z.object({
  angleId: z.string().max(100),
  count: z.number().min(0),
  percentage: z.number().min(0).max(100),
});

export const RecommendationSchema = z.object({
  suggestedAngles: z.array(
    z.object({
      angleId: z.string().max(100),
      reason: z.string().max(500),
      score: z.number().min(0).max(1),
    })
  ),
  pastInsights: z.array(
    z.object({
      content: z.string().max(5000),
      domain: z.string().max(500),
      qualityScore: z.number().min(0).max(10),
    })
  ),
  avoidAngles: z.array(
    z.object({
      angleId: z.string().max(100),
      reason: z.string().max(500),
    })
  ),
});

export const MidSessionNudgeSchema = z.object({
  type: z.enum(["try-angle", "explore-domain", "revisit-insight", "bias-warning"]),
  message: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  relatedAngleId: z.string().max(100).optional(),
});

export type InnovationMemoryEntry = z.infer<typeof InnovationMemoryEntrySchema>;
export type MemoryQueryOptions = z.infer<typeof MemoryQueryOptionsSchema>;
export type AngleEffectiveness = z.infer<typeof AngleEffectivenessSchema>;
export type BiasEntry = z.infer<typeof BiasEntrySchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type MidSessionNudge = z.infer<typeof MidSessionNudgeSchema>;

// ---- Helpers ----

/** Compute cosine similarity between two vectors. Returns 0 for empty/mismatched vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ---- Innovation Memory Service ----

export interface SessionContext {
  sessionId: string;
  currentAngles: string[];
  domain: string;
}

export class InnovationMemoryService {
  private entries = new Map<string, InnovationMemoryEntry>();
  private userAngleHistory = new Map<string, string[]>();

  /** Store a memory entry. Generates an ID if not provided. */
  storeEntry(
    entry: Omit<InnovationMemoryEntry, "id" | "createdAt"> & { id?: string; createdAt?: string }
  ): InnovationMemoryEntry {
    const full: InnovationMemoryEntry = {
      id: entry.id ?? `mem-${randomUUID().slice(0, 8)}`,
      createdAt: entry.createdAt ?? new Date().toISOString(),
      ...entry,
    };
    this.entries.set(full.id, full);
    return full;
  }

  /** Query stored memories using cosine similarity against an embedding vector. */
  query(
    embedding: number[],
    options: MemoryQueryOptions = {}
  ): Array<{ entry: InnovationMemoryEntry; score: number }> {
    const { domain, type, minQuality = 0, limit = 10, similarityThreshold = 0.1 } = options;

    const results: Array<{ entry: InnovationMemoryEntry; score: number }> = [];

    for (const entry of this.entries.values()) {
      if (domain && entry.domain !== domain) continue;
      if (type && entry.type !== type) continue;
      if (entry.qualityScore < minQuality) continue;

      const score = cosineSimilarity(embedding, entry.embedding);
      if (score >= similarityThreshold) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Aggregate which angles produced the highest quality ideas for a domain.
   * Returns sorted by average quality descending.
   */
  getEffectiveAngles(domain?: string, limit = 10): AngleEffectiveness[] {
    const angleStats = new Map<string, { totalQuality: number; count: number; domain: string }>();

    for (const entry of this.entries.values()) {
      if (domain && entry.domain !== domain) continue;
      if (entry.type !== "idea" && entry.type !== "outcome") continue;

      const angleId = entry.metadata?.angleId ?? "unknown";
      const key = `${angleId}:${entry.domain}`;
      const existing = angleStats.get(key) ?? { totalQuality: 0, count: 0, domain: entry.domain };
      existing.totalQuality += entry.qualityScore;
      existing.count++;
      angleStats.set(key, existing);
    }

    const results: AngleEffectiveness[] = [];
    for (const [key, stats] of angleStats) {
      const angleId = key.split(":")[0];
      results.push({
        angleId,
        domain: stats.domain,
        averageQuality: Math.round((stats.totalQuality / stats.count) * 100) / 100,
        sampleCount: stats.count,
      });
    }

    results.sort((a, b) => b.averageQuality - a.averageQuality);
    return results.slice(0, limit);
  }

  /**
   * Track which angles/patterns a user over-relies on.
   * Returns frequency distribution of angles used.
   */
  getBiasFrequency(userId: string): BiasEntry[] {
    const history = this.userAngleHistory.get(userId) ?? [];
    if (history.length === 0) return [];

    const counts = new Map<string, number>();
    for (const angleId of history) {
      counts.set(angleId, (counts.get(angleId) ?? 0) + 1);
    }

    const total = history.length;
    const results: BiasEntry[] = [];
    for (const [angleId, count] of counts) {
      results.push({
        angleId,
        count,
        percentage: Math.round((count / total) * 10000) / 100,
      });
    }

    results.sort((a, b) => b.count - a.count);
    return results;
  }

  /** Record that a user used a particular angle (for bias tracking). */
  recordAngleUsage(userId: string, angleId: string): void {
    const history = this.userAngleHistory.get(userId) ?? [];
    history.push(angleId);
    this.userAngleHistory.set(userId, history);
  }

  /**
   * Get pre-session recommendations: suggested angles, past insights, and angles to avoid.
   */
  getRecommendations(domain: string, userId?: string): Recommendation {
    const effectiveness = this.getEffectiveAngles(domain, 20);
    const bias = userId ? this.getBiasFrequency(userId) : [];

    // Top angles by effectiveness
    const suggestedAngles = effectiveness
      .filter((e) => e.sampleCount >= 2)
      .slice(0, 5)
      .map((e) => ({
        angleId: e.angleId,
        reason: `Avg quality ${e.averageQuality.toFixed(1)}/10 across ${e.sampleCount} ideas in this domain`,
        score: Math.min(1, e.averageQuality / 10),
      }));

    // If user has bias, suggest underused angles
    if (bias.length > 0) {
      const overused = new Set(bias.filter((b) => b.percentage > 40).map((b) => b.angleId));
      const _allAngles = new Set(effectiveness.map((e) => e.angleId));
      for (const e of effectiveness) {
        if (!overused.has(e.angleId) && e.averageQuality >= 5) {
          const alreadySuggested = suggestedAngles.some((s) => s.angleId === e.angleId);
          if (!alreadySuggested) {
            suggestedAngles.push({
              angleId: e.angleId,
              reason: "Underused angle with good historical results",
              score: Math.min(1, e.averageQuality / 10) * 0.9,
            });
          }
        }
      }
    }

    // Past high-quality insights for the domain
    const pastInsights: Recommendation["pastInsights"] = [];
    for (const entry of this.entries.values()) {
      if (entry.domain === domain && entry.type === "insight" && entry.qualityScore >= 7) {
        pastInsights.push({
          content: entry.content,
          domain: entry.domain,
          qualityScore: entry.qualityScore,
        });
      }
    }
    pastInsights.sort((a, b) => b.qualityScore - a.qualityScore);

    // Low-performing angles to avoid
    const avoidAngles = effectiveness
      .filter((e) => e.averageQuality < 3 && e.sampleCount >= 3)
      .map((e) => ({
        angleId: e.angleId,
        reason: `Low avg quality (${e.averageQuality.toFixed(1)}/10) across ${e.sampleCount} attempts`,
      }));

    return {
      suggestedAngles: suggestedAngles.slice(0, 8),
      pastInsights: pastInsights.slice(0, 5),
      avoidAngles,
    };
  }

  /**
   * Get mid-session nudges based on current session context vs historical patterns.
   */
  getMidSessionNudges(sessionContext: SessionContext): MidSessionNudge[] {
    const { currentAngles, domain } = sessionContext;
    const nudges: MidSessionNudge[] = [];

    // Suggest effective angles not yet tried in this session
    const effectiveness = this.getEffectiveAngles(domain, 20);
    const currentSet = new Set(currentAngles);

    for (const e of effectiveness) {
      if (!currentSet.has(e.angleId) && e.averageQuality >= 6 && e.sampleCount >= 2) {
        nudges.push({
          type: "try-angle",
          message: `Consider trying "${e.angleId}" — it has averaged ${e.averageQuality.toFixed(1)}/10 quality in "${domain}"`,
          confidence: Math.min(1, e.sampleCount / 10),
          relatedAngleId: e.angleId,
        });
      }
    }

    // Check for relevant cross-domain insights
    for (const entry of this.entries.values()) {
      if (entry.domain !== domain && entry.type === "insight" && entry.qualityScore >= 8) {
        const tagOverlap = entry.tags.some((t) => domain.toLowerCase().includes(t.toLowerCase()));
        if (tagOverlap) {
          nudges.push({
            type: "explore-domain",
            message: `Cross-domain insight from "${entry.domain}": ${entry.content.slice(0, 200)}`,
            confidence: 0.6,
          });
        }
      }
    }

    // Revisit high-quality insights from same domain
    const domainInsights = Array.from(this.entries.values())
      .filter((e) => e.domain === domain && e.type === "insight" && e.qualityScore >= 7)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 2);

    for (const insight of domainInsights) {
      nudges.push({
        type: "revisit-insight",
        message: `Past insight (${insight.qualityScore}/10): ${insight.content.slice(0, 200)}`,
        confidence: 0.7,
      });
    }

    // Sort by confidence descending, limit to top 5
    nudges.sort((a, b) => b.confidence - a.confidence);
    return nudges.slice(0, 5);
  }

  /** Get total count of stored memories. */
  get size(): number {
    return this.entries.size;
  }
}

// ---- Singleton ----

let instance: InnovationMemoryService | undefined;

/** Get or create the shared InnovationMemoryService instance. */
export function getMemoryService(): InnovationMemoryService {
  if (!instance) {
    instance = new InnovationMemoryService();
  }
  return instance;
}
