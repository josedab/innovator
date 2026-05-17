/**
 * @module learning-loop
 *
 * Innovation Learning Loop — cross-session knowledge graph that tracks
 * which angles, prompts, and domains produce the best outcomes and
 * auto-tunes the innovation pipeline based on historical performance.
 *
 * Records outcome signals (ratings, exports, time-on-idea) per domain
 * and angle, computes effectiveness scores, and recommends optimal
 * angle orderings and prompt strategies for new sessions.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ValidationError } from "../errors.js";

// ---- Constants ----

const LEARNING_DIR = join(homedir(), ".innovator", "learning-loop");
const LEARNING_FILE = join(LEARNING_DIR, "learning-data.json");
const MIN_SAMPLES_FOR_RECOMMENDATION = 3;
const DECAY_FACTOR = 0.95;

// ---- Schemas ----

export const OutcomeSignalSchema = z.object({
  sessionId: z.string().max(200),
  angleId: z.string().max(100),
  domain: z.string().max(500),
  rating: z.number().min(0).max(10).optional(),
  exported: z.boolean().optional(),
  timeSpentMs: z.number().min(0).optional(),
  ideaCount: z.number().min(0).optional(),
  selectedIdeas: z.number().min(0).optional(),
  timestamp: z.string(),
});

export const AnglePerformanceSchema = z.object({
  angleId: z.string().max(100),
  domain: z.string().max(500),
  totalSessions: z.number().min(0),
  averageRating: z.number().min(0).max(10),
  exportRate: z.number().min(0).max(1),
  averageIdeaCount: z.number().min(0),
  selectionRate: z.number().min(0).max(1),
  effectivenessScore: z.number().min(0).max(1),
  lastUpdated: z.string(),
});

export const DomainProfileSchema = z.object({
  domain: z.string().max(500),
  topAngles: z.array(z.string().max(100)).max(20),
  totalSessions: z.number().min(0),
  averageQuality: z.number().min(0).max(10),
  lastSeen: z.string(),
  keywords: z.array(z.string().max(100)).max(50),
});

export const LearningRecommendationSchema = z.object({
  domain: z.string().max(500),
  recommendedAngles: z.array(
    z.object({
      angleId: z.string().max(100),
      score: z.number().min(0).max(1),
      reason: z.string().max(500),
    })
  ),
  avoidAngles: z.array(
    z.object({
      angleId: z.string().max(100),
      reason: z.string().max(500),
    })
  ),
  confidence: z.number().min(0).max(1),
  basedOnSessions: z.number().min(0),
});

export const LearningDataSchema = z.object({
  signals: z.array(OutcomeSignalSchema),
  anglePerformance: z.array(AnglePerformanceSchema),
  domainProfiles: z.array(DomainProfileSchema),
  lastUpdated: z.string(),
});

export type OutcomeSignal = z.infer<typeof OutcomeSignalSchema>;
export type AnglePerformance = z.infer<typeof AnglePerformanceSchema>;
export type DomainProfile = z.infer<typeof DomainProfileSchema>;
export type LearningRecommendation = z.infer<typeof LearningRecommendationSchema>;
export type LearningData = z.infer<typeof LearningDataSchema>;

// ---- Persistence ----

function ensureDir(): void {
  if (!existsSync(LEARNING_DIR)) mkdirSync(LEARNING_DIR, { recursive: true });
}

function loadData(): LearningData {
  ensureDir();
  if (!existsSync(LEARNING_FILE)) {
    return {
      signals: [],
      anglePerformance: [],
      domainProfiles: [],
      lastUpdated: new Date().toISOString(),
    };
  }
  try {
    return LearningDataSchema.parse(JSON.parse(readFileSync(LEARNING_FILE, "utf-8")));
  } catch {
    return {
      signals: [],
      anglePerformance: [],
      domainProfiles: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

function saveData(data: LearningData): void {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  writeFileSync(LEARNING_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ---- Domain Extraction ----

function extractDomain(subject: string): string {
  if (!subject || typeof subject !== "string") return "unknown";
  const normalized = subject.toLowerCase().trim();
  if (normalized.length === 0) return "unknown";
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "in",
    "of",
    "for",
    "and",
    "or",
    "to",
    "with",
    "on",
    "at",
    "by",
    "is",
  ]);
  const words = normalized.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 5).join(" ") || "unknown";
}

function extractKeywords(subject: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "in",
    "of",
    "for",
    "and",
    "or",
    "to",
    "with",
    "on",
    "at",
    "by",
    "is",
  ]);
  return subject
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 20);
}

// ---- Public API ----

/**
 * Record an outcome signal for a completed innovation session.
 * Signals are used to learn which angles work best for different domains.
 */
export function recordOutcome(
  sessionId: string,
  subject: string,
  angleId: string,
  outcome: {
    rating?: number;
    exported?: boolean;
    timeSpentMs?: number;
    ideaCount?: number;
    selectedIdeas?: number;
  }
): OutcomeSignal {
  if (!sessionId || !subject || !angleId) {
    throw new ValidationError("sessionId, subject, and angleId are required");
  }
  if (outcome.rating !== undefined && (outcome.rating < 0 || outcome.rating > 10)) {
    throw new ValidationError("rating must be between 0 and 10");
  }
  const data = loadData();
  const domain = extractDomain(subject);

  const signal: OutcomeSignal = {
    sessionId,
    angleId,
    domain,
    ...outcome,
    timestamp: new Date().toISOString(),
  };

  data.signals.push(signal);
  recomputePerformance(data, domain, angleId);
  updateDomainProfile(data, domain, subject);
  saveData(data);

  return signal;
}

/**
 * Record multiple outcome signals at once (e.g., after auto-mode completes).
 */
export function recordBatchOutcomes(
  sessionId: string,
  subject: string,
  outcomes: Array<{
    angleId: string;
    rating?: number;
    exported?: boolean;
    ideaCount?: number;
    selectedIdeas?: number;
  }>
): OutcomeSignal[] {
  const data = loadData();
  const domain = extractDomain(subject);
  const signals: OutcomeSignal[] = [];

  for (const outcome of outcomes) {
    const signal: OutcomeSignal = {
      sessionId,
      angleId: outcome.angleId,
      domain,
      rating: outcome.rating,
      exported: outcome.exported,
      ideaCount: outcome.ideaCount,
      selectedIdeas: outcome.selectedIdeas,
      timestamp: new Date().toISOString(),
    };
    data.signals.push(signal);
    signals.push(signal);
    recomputePerformance(data, domain, outcome.angleId);
  }

  updateDomainProfile(data, domain, subject);
  saveData(data);

  return signals;
}

/**
 * Get angle recommendations for a given subject based on historical performance.
 * Returns optimal angle ordering and angles to avoid.
 */
export function getRecommendations(subject: string): LearningRecommendation {
  const data = loadData();
  const domain = extractDomain(subject);
  const keywords = extractKeywords(subject);

  // Find matching angle performance entries (exact domain or keyword overlap)
  const domainPerf = data.anglePerformance.filter((ap) => ap.domain === domain);

  // If not enough data for exact domain, broaden to keyword-similar domains
  let matchedPerf = domainPerf;
  if (domainPerf.length < MIN_SAMPLES_FOR_RECOMMENDATION) {
    matchedPerf = data.anglePerformance.filter((ap) => {
      const perfKeywords = ap.domain.split(" ");
      const overlap = keywords.filter((k) => perfKeywords.includes(k)).length;
      return overlap > 0;
    });
  }

  if (matchedPerf.length === 0) {
    return {
      domain,
      recommendedAngles: [],
      avoidAngles: [],
      confidence: 0,
      basedOnSessions: 0,
    };
  }

  // Aggregate by angle
  const angleScores = new Map<string, { totalScore: number; count: number }>();
  for (const ap of matchedPerf) {
    const existing = angleScores.get(ap.angleId) ?? { totalScore: 0, count: 0 };
    existing.totalScore += ap.effectivenessScore;
    existing.count++;
    angleScores.set(ap.angleId, existing);
  }

  const ranked = Array.from(angleScores.entries())
    .map(([angleId, { totalScore, count }]) => ({
      angleId,
      score: Math.round((totalScore / count) * 1000) / 1000,
      count,
    }))
    .sort((a, b) => b.score - a.score);

  const totalSessions = matchedPerf.reduce((sum, ap) => sum + ap.totalSessions, 0);
  const confidence = Math.min(1, totalSessions / 20);

  const recommendedAngles = ranked
    .filter((r) => r.score >= 0.4)
    .map((r) => ({
      angleId: r.angleId,
      score: r.score,
      reason: `Scored ${(r.score * 100).toFixed(0)}% effectiveness across ${r.count} domain match(es)`,
    }));

  const avoidAngles = ranked
    .filter((r) => r.score < 0.25 && r.count >= MIN_SAMPLES_FOR_RECOMMENDATION)
    .map((r) => ({
      angleId: r.angleId,
      reason: `Low effectiveness (${(r.score * 100).toFixed(0)}%) across ${r.count} sessions`,
    }));

  return {
    domain,
    recommendedAngles,
    avoidAngles,
    confidence: Math.round(confidence * 100) / 100,
    basedOnSessions: totalSessions,
  };
}

/**
 * Get performance metrics for a specific angle across all domains.
 */
export function getAnglePerformance(angleId: string): AnglePerformance[] {
  const data = loadData();
  return data.anglePerformance.filter((ap) => ap.angleId === angleId);
}

/**
 * Get a domain profile showing historical innovation patterns.
 */
export function getDomainProfile(subject: string): DomainProfile | undefined {
  const data = loadData();
  const domain = extractDomain(subject);
  return data.domainProfiles.find((dp) => dp.domain === domain);
}

/**
 * List all tracked domains with their profiles.
 */
export function listDomainProfiles(): DomainProfile[] {
  const data = loadData();
  return data.domainProfiles.sort((a, b) => b.totalSessions - a.totalSessions);
}

/**
 * Get the full learning data (for inspection/debugging).
 */
export function getLearningData(): LearningData {
  return loadData();
}

/**
 * Export learning insights as markdown.
 */
export function learningInsightsToMarkdown(subject: string): string {
  const rec = getRecommendations(subject);
  const profile = getDomainProfile(subject);
  const lines: string[] = [];

  lines.push("# Innovation Learning Insights");
  lines.push("");
  lines.push(`**Domain:** ${rec.domain}`);
  lines.push(`**Confidence:** ${(rec.confidence * 100).toFixed(0)}%`);
  lines.push(`**Based on:** ${rec.basedOnSessions} sessions`);
  lines.push("");

  if (profile) {
    lines.push("## Domain Profile");
    lines.push("");
    lines.push(`- **Total Sessions:** ${profile.totalSessions}`);
    lines.push(`- **Average Quality:** ${profile.averageQuality.toFixed(1)}/10`);
    lines.push(`- **Top Angles:** ${profile.topAngles.join(", ")}`);
    lines.push("");
  }

  if (rec.recommendedAngles.length > 0) {
    lines.push("## Recommended Angles");
    lines.push("");
    lines.push("| Angle | Score | Reason |");
    lines.push("|-------|-------|--------|");
    for (const a of rec.recommendedAngles) {
      lines.push(`| ${a.angleId} | ${(a.score * 100).toFixed(0)}% | ${a.reason} |`);
    }
    lines.push("");
  }

  if (rec.avoidAngles.length > 0) {
    lines.push("## Angles to Avoid");
    lines.push("");
    for (const a of rec.avoidAngles) {
      lines.push(`- **${a.angleId}:** ${a.reason}`);
    }
    lines.push("");
  }

  if (rec.recommendedAngles.length === 0 && rec.avoidAngles.length === 0) {
    lines.push(
      "*Not enough historical data to make recommendations. Run more sessions to build the learning model.*"
    );
  }

  return lines.join("\n");
}

// ---- Angle Effectiveness Per Domain ----

export function getAngleEffectiveness(
  domain: string
): Array<{ angleId: string; score: number; sampleSize: number }> {
  const data = loadData();
  const normalizedDomain = extractDomain(domain);

  return data.anglePerformance
    .filter((item) => item.domain === normalizedDomain)
    .map((item) => ({
      angleId: item.angleId,
      score: item.effectivenessScore,
      sampleSize: item.totalSessions,
    }))
    .sort((a, b) => b.score - a.score);
}

export function getTopAnglesForDomain(domain: string, limit: number = 3): string[] {
  return getAngleEffectiveness(domain)
    .slice(0, Math.max(0, limit))
    .map((item) => item.angleId);
}

export function adjustAngleWeights(
  domain: string,
  outcomes: Array<{ angleId: string; success: boolean }>
): void {
  if (outcomes.length === 0) return;

  const data = loadData();
  const normalizedDomain = extractDomain(domain);
  const now = new Date().toISOString();

  for (const outcome of outcomes) {
    if (!outcome.angleId) continue;
    data.signals.push({
      sessionId: `adjust-${randomUUID()}`,
      angleId: outcome.angleId,
      domain: normalizedDomain,
      rating: outcome.success ? 9 : 3,
      exported: outcome.success,
      ideaCount: 1,
      selectedIdeas: outcome.success ? 1 : 0,
      timestamp: now,
    });
    recomputePerformance(data, normalizedDomain, outcome.angleId);
  }

  updateDomainProfile(data, normalizedDomain, normalizedDomain);
  saveData(data);
}

/**
 * Clear all learning data (for testing).
 */
export function clearLearningData(): void {
  if (existsSync(LEARNING_FILE)) {
    writeFileSync(
      LEARNING_FILE,
      JSON.stringify({
        signals: [],
        anglePerformance: [],
        domainProfiles: [],
        lastUpdated: new Date().toISOString(),
      }),
      "utf-8"
    );
  }
}

// ---- Internal Helpers ----

function recomputePerformance(data: LearningData, domain: string, angleId: string): void {
  const signals = data.signals.filter((s) => s.domain === domain && s.angleId === angleId);
  if (signals.length === 0) return;

  // Apply time decay — recent signals weigh more
  const now = Date.now();
  const weightedSignals = signals.map((s) => {
    const ageMs = now - new Date(s.timestamp).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const weight = Math.pow(DECAY_FACTOR, ageDays / 30); // decay per month
    return { signal: s, weight };
  });

  const totalWeight = weightedSignals.reduce((sum, ws) => sum + ws.weight, 0);

  // Compute weighted averages
  let weightedRatingSum = 0;
  let ratingCount = 0;
  let exportCount = 0;
  let ideaCountSum = 0;
  let selectionSum = 0;
  let selectionTotal = 0;

  for (const { signal, weight } of weightedSignals) {
    if (signal.rating !== undefined) {
      weightedRatingSum += signal.rating * weight;
      ratingCount += weight;
    }
    if (signal.exported) exportCount += weight;
    if (signal.ideaCount !== undefined) ideaCountSum += signal.ideaCount * weight;
    if (
      signal.selectedIdeas !== undefined &&
      signal.ideaCount !== undefined &&
      signal.ideaCount > 0
    ) {
      selectionSum += (signal.selectedIdeas / signal.ideaCount) * weight;
      selectionTotal += weight;
    }
  }

  const avgRating = ratingCount > 0 ? weightedRatingSum / ratingCount : 5;
  const exportRate = totalWeight > 0 ? exportCount / totalWeight : 0;
  const avgIdeaCount = totalWeight > 0 ? ideaCountSum / totalWeight : 0;
  const selectionRate = selectionTotal > 0 ? selectionSum / selectionTotal : 0;

  // Composite effectiveness score (0-1)
  const effectivenessScore = Math.min(
    1,
    (avgRating / 10) * 0.4 +
      exportRate * 0.2 +
      selectionRate * 0.2 +
      Math.min(1, avgIdeaCount / 5) * 0.2
  );

  const existing = data.anglePerformance.findIndex(
    (ap) => ap.angleId === angleId && ap.domain === domain
  );
  const perf: AnglePerformance = {
    angleId,
    domain,
    totalSessions: signals.length,
    averageRating: Math.round(avgRating * 10) / 10,
    exportRate: Math.round(exportRate * 1000) / 1000,
    averageIdeaCount: Math.round(avgIdeaCount * 10) / 10,
    selectionRate: Math.round(selectionRate * 1000) / 1000,
    effectivenessScore: Math.round(effectivenessScore * 1000) / 1000,
    lastUpdated: new Date().toISOString(),
  };

  if (existing >= 0) {
    data.anglePerformance[existing] = perf;
  } else {
    data.anglePerformance.push(perf);
  }
}

function updateDomainProfile(data: LearningData, domain: string, subject: string): void {
  const domainSignals = data.signals.filter((s) => s.domain === domain);
  const domainPerf = data.anglePerformance
    .filter((ap) => ap.domain === domain)
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore);

  const ratings = domainSignals.filter((s) => s.rating !== undefined).map((s) => s.rating!);
  const avgQuality =
    ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

  const existing = data.domainProfiles.findIndex((dp) => dp.domain === domain);
  const profile: DomainProfile = {
    domain,
    topAngles: domainPerf.slice(0, 5).map((ap) => ap.angleId),
    totalSessions: domainSignals.length,
    averageQuality: Math.round(avgQuality * 10) / 10,
    lastSeen: new Date().toISOString(),
    keywords: extractKeywords(subject),
  };

  if (existing >= 0) {
    data.domainProfiles[existing] = profile;
  } else {
    data.domainProfiles.push(profile);
  }
}
