import { z } from "zod";
import { ANGLE_IDS } from "../types.js";
import type { InnovationEvent } from "./types.js";

export const AngleWeightSchema = z.object({
  angleId: z.string().max(100),
  baseWeight: z.number().min(0).max(1).default(0.5),
  domainModifier: z.number().min(-0.5).max(0.5).default(0),
  recencyBoost: z.number().min(0).max(0.3).default(0),
  effectiveWeight: z.number().min(0).max(1),
});
export type AngleWeight = z.infer<typeof AngleWeightSchema>;

export const WeightingContextSchema = z.object({
  subject: z.string().max(2000),
  domain: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  weights: z.array(AngleWeightSchema),
  strategy: z.enum(["balanced", "exploit", "explore"]).default("balanced"),
  generatedAt: z.string(),
});
export type WeightingContext = z.infer<typeof WeightingContextSchema>;

type WeightingStrategy = WeightingContext["strategy"];

type AngleStats = {
  usage: number;
  qualityTotal: number;
  qualityCount: number;
  lastUsedAt?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 3);
}

function inferDomain(events: InnovationEvent[], subject: string): string | undefined {
  const subjectTokens = new Set(tokenize(subject));
  const domainScores = new Map<string, number>();

  for (const event of events) {
    const domain = event.metadata?.domain;
    if (!domain) continue;
    const domainTokens = tokenize(domain);
    let score = domainTokens.some((token) => subjectTokens.has(token)) ? 2 : 0;
    const eventSubjectTokens = tokenize(event.metadata?.subject ?? "");
    score += eventSubjectTokens.filter((token) => subjectTokens.has(token)).length;
    domainScores.set(domain, (domainScores.get(domain) ?? 0) + score + 1);
  }

  return Array.from(domainScores.entries()).sort((left, right) => right[1] - left[1])[0]?.[0];
}

function collectAngleStats(events: InnovationEvent[], domain?: string): Map<string, AngleStats> {
  const stats = new Map<string, AngleStats>();
  const filteredEvents = domain
    ? events.filter((event) => event.metadata?.domain?.toLowerCase() === domain.toLowerCase())
    : events;

  for (const angleId of ANGLE_IDS) {
    stats.set(angleId, { usage: 0, qualityTotal: 0, qualityCount: 0 });
  }

  for (const event of filteredEvents) {
    const angleId = event.metadata?.angleId;
    if (!angleId) continue;
    const current = stats.get(angleId) ?? { usage: 0, qualityTotal: 0, qualityCount: 0 };
    if (event.type === "angle.generated" || event.type === "angle.rated") {
      current.usage += 1;
    }
    if (typeof event.metadata?.qualityScore === "number") {
      current.qualityTotal += event.metadata.qualityScore;
      current.qualityCount += 1;
    }
    if (!current.lastUsedAt || event.timestamp > current.lastUsedAt) {
      current.lastUsedAt = event.timestamp;
    }
    stats.set(angleId, current);
  }

  return stats;
}

function computeBaseWeight(
  stats: AngleStats,
  maxUsage: number,
  strategy: WeightingStrategy
): number {
  const effectiveness = stats.qualityCount > 0 ? stats.qualityTotal / stats.qualityCount / 100 : 0.5;
  const usageRatio = maxUsage > 0 ? stats.usage / maxUsage : 0;

  switch (strategy) {
    case "exploit":
      return clamp(0.3 + effectiveness * 0.5 + usageRatio * 0.15, 0, 1);
    case "explore":
      return clamp(0.8 - usageRatio * 0.45 + (0.5 - effectiveness) * 0.1, 0, 1);
    case "balanced":
    default:
      return clamp(0.45 + effectiveness * 0.2 - usageRatio * 0.05, 0, 1);
  }
}

function computeDomainModifier(stats: AngleStats): number {
  const effectiveness = stats.qualityCount > 0 ? stats.qualityTotal / stats.qualityCount / 100 : 0.5;
  return clamp((effectiveness - 0.5) * 0.6, -0.5, 0.5);
}

function computeRecencyBoost(lastUsedAt?: string): number {
  if (!lastUsedAt) return 0;
  const ageMs = Date.now() - new Date(lastUsedAt).getTime();
  if (ageMs <= 0) return 0.3;
  const boost = 0.3 * Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));
  return clamp(boost, 0, 0.3);
}

export function computeAngleWeights(
  events: InnovationEvent[],
  subject: string,
  strategy: WeightingStrategy = "balanced"
): WeightingContext {
  const domain = inferDomain(events, subject);
  const stats = collectAngleStats(events, domain);
  const maxUsage = Math.max(...Array.from(stats.values()).map((entry) => entry.usage), 0);
  const userId = events.find((event) => event.userId)?.userId;

  const weights = ANGLE_IDS.map((angleId) => {
    const angleStats = stats.get(angleId) ?? { usage: 0, qualityTotal: 0, qualityCount: 0 };
    const baseWeight = computeBaseWeight(angleStats, maxUsage, strategy);
    const domainModifier = computeDomainModifier(angleStats);
    const recencyBoost = computeRecencyBoost(angleStats.lastUsedAt);
    return AngleWeightSchema.parse({
      angleId,
      baseWeight,
      domainModifier,
      recencyBoost,
      effectiveWeight: clamp(baseWeight + domainModifier + recencyBoost, 0, 1),
    });
  });

  return WeightingContextSchema.parse({
    subject,
    domain,
    userId,
    weights,
    strategy,
    generatedAt: new Date().toISOString(),
  });
}

export function selectTopAngles(weights: AngleWeight[], count: number): AngleWeight[] {
  return [...weights]
    .sort((left, right) => {
      if (right.effectiveWeight === left.effectiveWeight) {
        if (right.recencyBoost === left.recencyBoost) {
          return right.domainModifier - left.domainModifier;
        }
        return right.recencyBoost - left.recencyBoost;
      }
      return right.effectiveWeight - left.effectiveWeight;
    })
    .slice(0, Math.max(0, count));
}

export function autoWeightAngles(events: InnovationEvent[], domain?: string): AngleWeight[] {
  const stats = collectAngleStats(events, domain);
  const maxUsage = Math.max(...Array.from(stats.values()).map((entry) => entry.usage), 0);

  return ANGLE_IDS.map((angleId) => {
    const angleStats = stats.get(angleId) ?? { usage: 0, qualityTotal: 0, qualityCount: 0 };
    const baseWeight = computeBaseWeight(angleStats, maxUsage, "balanced");
    const domainModifier = computeDomainModifier(angleStats);
    const recencyBoost = computeRecencyBoost(angleStats.lastUsedAt);

    return AngleWeightSchema.parse({
      angleId,
      baseWeight,
      domainModifier,
      recencyBoost,
      effectiveWeight: clamp(baseWeight + domainModifier + recencyBoost, 0, 1),
    });
  });
}
