/**
 * @module memory
 *
 * Innovation Memory & Learning: tracks user signals (ratings, exports, time-on-idea,
 * selections) to build a UserPreferenceProfile with weighted feature vectors.
 * Provides preference context injection for angle prompt builders and supports
 * A/B testing of adapted vs default prompts.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for a single user signal event. */
export const UserSignalSchema = z.object({
  id: z.string().max(100),
  userId: z.string().max(100),
  type: z.enum(["rating", "export", "selection", "time-on-idea", "bookmark", "dismiss", "share"]),
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100).optional(),
  value: z
    .number()
    .describe("Signal value: rating 1-10, time in seconds, or 1/0 for boolean signals"),
  metadata: z.record(z.string().max(500)).optional(),
  timestamp: z.string(),
});

/** Schema for preference weights across innovation dimensions. */
export const PreferenceWeightsSchema = z.object({
  feasibilityBias: z
    .number()
    .min(-1)
    .max(1)
    .describe("Negative = prefers moonshots, positive = prefers practical"),
  noveltyBias: z
    .number()
    .min(-1)
    .max(1)
    .describe("Negative = prefers incremental, positive = prefers novel"),
  impactBias: z
    .number()
    .min(-1)
    .max(1)
    .describe("Negative = prefers niche, positive = prefers broad impact"),
  domainPreferences: z.record(z.number().min(0).max(1)).describe("Domain affinity scores"),
  anglePreferences: z.record(z.number().min(0).max(1)).describe("Angle affinity scores"),
});

/** Schema for the user preference profile. */
export const UserPreferenceProfileSchema = z.object({
  userId: z.string().max(100),
  weights: PreferenceWeightsSchema,
  signalCount: z.number(),
  lastUpdated: z.string(),
  topDomains: z.array(z.string().max(200)).max(10),
  topAngles: z.array(z.string().max(100)).max(10),
  averageRating: z.number().min(0).max(10).optional(),
  engagementScore: z.number().min(0).max(1),
});

/** Schema for A/B test assignment. */
export const ABTestAssignmentSchema = z.object({
  testId: z.string().max(100),
  userId: z.string().max(100),
  variant: z.enum(["adapted", "default"]),
  assignedAt: z.string(),
});

/** Schema for A/B test result. */
export const ABTestResultSchema = z.object({
  testId: z.string().max(100),
  adaptedMetrics: z.object({
    averageRating: z.number(),
    selectionRate: z.number(),
    engagementTime: z.number(),
    sampleSize: z.number(),
  }),
  defaultMetrics: z.object({
    averageRating: z.number(),
    selectionRate: z.number(),
    engagementTime: z.number(),
    sampleSize: z.number(),
  }),
  significanceLevel: z.number().min(0).max(1),
  winner: z.enum(["adapted", "default", "inconclusive"]),
});

// ---- Types ----

export type UserSignal = z.infer<typeof UserSignalSchema>;
export type PreferenceWeights = z.infer<typeof PreferenceWeightsSchema>;
export type UserPreferenceProfile = z.infer<typeof UserPreferenceProfileSchema>;
export type ABTestAssignment = z.infer<typeof ABTestAssignmentSchema>;
export type ABTestResult = z.infer<typeof ABTestResultSchema>;

// ---- In-memory stores ----

const MAX_SIGNALS_PER_USER = 2_000;
const MAX_OUTCOME_RECORDS = 5_000;
const MAX_MODEL_RECORDS = 1_000;
const signals: Map<string, UserSignal[]> = new Map();
const profiles: Map<string, UserPreferenceProfile> = new Map();
const abTests: Map<string, ABTestAssignment[]> = new Map();
let signalCounter = 0;

// ---- Signal recording ----

/**
 * Record a user signal (rating, export, selection, etc.).
 */
export function recordSignal(signal: Omit<UserSignal, "id" | "timestamp">): UserSignal {
  const fullSignal: UserSignal = {
    ...signal,
    id: `signal-${++signalCounter}-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };

  const validated = UserSignalSchema.parse(fullSignal);
  const userSignals = signals.get(validated.userId) ?? [];
  userSignals.push(validated);
  // Evict oldest signals per user to prevent unbounded growth
  if (userSignals.length > MAX_SIGNALS_PER_USER) {
    userSignals.splice(0, userSignals.length - MAX_SIGNALS_PER_USER);
  }
  signals.set(validated.userId, userSignals);

  return validated;
}

/**
 * Get all signals for a user. Returns a defensive copy.
 */
export function getUserSignals(userId: string): UserSignal[] {
  return [...(signals.get(userId) ?? [])];
}

// ---- Profile building ----

/**
 * Build or update a user preference profile from accumulated signals.
 */
export function buildPreferenceProfile(userId: string): UserPreferenceProfile {
  const userSignals = signals.get(userId) ?? [];

  const angleScores: Record<string, { total: number; count: number }> = {};
  const domainScores: Record<string, { total: number; count: number }> = {};
  let totalRating = 0;
  let ratingCount = 0;
  let totalEngagement = 0;

  for (const signal of userSignals) {
    // Track angle preferences
    if (signal.angleId) {
      if (!angleScores[signal.angleId]) angleScores[signal.angleId] = { total: 0, count: 0 };
      const weight = signalTypeWeight(signal.type);
      angleScores[signal.angleId].total += signal.value * weight;
      angleScores[signal.angleId].count += weight;
    }

    // Track domain preferences
    const domain = signal.metadata?.domain;
    if (domain) {
      if (!domainScores[domain]) domainScores[domain] = { total: 0, count: 0 };
      domainScores[domain].total += signal.value;
      domainScores[domain].count++;
    }

    // Track ratings
    if (signal.type === "rating") {
      totalRating += signal.value;
      ratingCount++;
    }

    // Track engagement
    if (signal.type === "time-on-idea") {
      totalEngagement += Math.min(signal.value / 300, 1); // Normalize to 0-1 (5 min = max)
    }
  }

  // Compute angle preference scores (0-1)
  const anglePreferences: Record<string, number> = {};
  for (const [angleId, score] of Object.entries(angleScores)) {
    anglePreferences[angleId] = score.count > 0 ? Math.min(score.total / score.count / 10, 1) : 0;
  }

  // Compute domain preference scores (0-1)
  const domainPreferences: Record<string, number> = {};
  for (const [domain, score] of Object.entries(domainScores)) {
    domainPreferences[domain] = score.count > 0 ? Math.min(score.total / score.count / 10, 1) : 0;
  }

  // Compute bias vectors from signal patterns
  const highRatedSignals = userSignals.filter((s) => s.type === "rating" && s.value >= 7);
  const lowRatedSignals = userSignals.filter((s) => s.type === "rating" && s.value <= 3);

  const feasibilityBias = computeBias(highRatedSignals, lowRatedSignals, "feasibility");
  const noveltyBias = computeBias(highRatedSignals, lowRatedSignals, "novelty");
  const impactBias = computeBias(highRatedSignals, lowRatedSignals, "impact");

  const topAngles = Object.entries(anglePreferences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);

  const topDomains = Object.entries(domainPreferences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);

  const profile: UserPreferenceProfile = {
    userId,
    weights: {
      feasibilityBias,
      noveltyBias,
      impactBias,
      domainPreferences,
      anglePreferences,
    },
    signalCount: userSignals.length,
    lastUpdated: new Date().toISOString(),
    topDomains,
    topAngles,
    averageRating: ratingCount > 0 ? totalRating / ratingCount : undefined,
    engagementScore: userSignals.length > 0 ? Math.min(totalEngagement / userSignals.length, 1) : 0,
  };

  profiles.set(userId, profile);
  return profile;
}

function signalTypeWeight(type: UserSignal["type"]): number {
  const weights: Record<UserSignal["type"], number> = {
    rating: 1.0,
    export: 0.8,
    selection: 0.7,
    bookmark: 0.6,
    share: 0.9,
    "time-on-idea": 0.5,
    dismiss: -0.3,
  };
  return weights[type];
}

function computeBias(highRated: UserSignal[], lowRated: UserSignal[], dimension: string): number {
  const highCount = highRated.filter((s) => s.metadata?.[dimension] === "high").length;
  const lowCount = lowRated.filter((s) => s.metadata?.[dimension] === "high").length;
  const total = highCount + lowCount;
  if (total === 0) return 0;
  return (highCount - lowCount) / total;
}

// ---- Preference context for prompts ----

/**
 * Generate a preference context string for injection into angle prompt builders.
 */
export function buildPreferenceContext(userId: string): string | undefined {
  const profile = profiles.get(userId);
  if (!profile || profile.signalCount < 3) return undefined;

  const clauses: string[] = [];

  if (profile.weights.noveltyBias > 0.3) {
    clauses.push(
      "The user strongly prefers novel, non-obvious ideas over incremental improvements."
    );
  } else if (profile.weights.noveltyBias < -0.3) {
    clauses.push(
      "The user prefers practical, incremental improvements over highly novel concepts."
    );
  }

  if (profile.weights.feasibilityBias > 0.3) {
    clauses.push("The user favors highly feasible ideas that can be implemented quickly.");
  } else if (profile.weights.feasibilityBias < -0.3) {
    clauses.push(
      "The user is open to ambitious moonshot ideas even if implementation is uncertain."
    );
  }

  if (profile.weights.impactBias > 0.3) {
    clauses.push("The user values broad, transformative impact.");
  } else if (profile.weights.impactBias < -0.3) {
    clauses.push("The user values targeted, niche solutions.");
  }

  if (profile.topDomains.length > 0) {
    clauses.push(
      `The user has shown interest in these domains: ${profile.topDomains.slice(0, 5).join(", ")}.`
    );
  }

  if (profile.topAngles.length > 0) {
    clauses.push(
      `The user's preferred innovation angles: ${profile.topAngles.slice(0, 5).join(", ")}.`
    );
  }

  if (clauses.length === 0) return undefined;

  return `USER PREFERENCES (adapt your output accordingly):\n${clauses.join("\n")}`;
}

/**
 * Get a stored preference profile.
 */
export function getPreferenceProfile(userId: string): UserPreferenceProfile | undefined {
  return profiles.get(userId);
}

// ---- A/B Testing ----

/**
 * Assign a user to an A/B test variant.
 */
export function assignABTest(testId: string, userId: string): ABTestAssignment {
  // Deterministic assignment based on hash of userId + testId
  const hash = simpleHash(`${userId}:${testId}`);
  const variant = hash % 2 === 0 ? "adapted" : "default";

  const assignment: ABTestAssignment = {
    testId,
    userId,
    variant: variant as "adapted" | "default",
    assignedAt: new Date().toISOString(),
  };

  const testAssignments = abTests.get(testId) ?? [];
  const existing = testAssignments.find((a) => a.userId === userId);
  if (existing) return existing;

  testAssignments.push(assignment);
  abTests.set(testId, testAssignments);
  return assignment;
}

/**
 * Get the A/B test variant for a user.
 */
export function getABTestVariant(
  testId: string,
  userId: string
): "adapted" | "default" | undefined {
  const assignments = abTests.get(testId);
  return assignments?.find((a) => a.userId === userId)?.variant;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Clear all memory data.
 */
export function clearMemory(): void {
  signals.clear();
  profiles.clear();
  abTests.clear();
  signalCounter = 0;
  outcomeRecords.length = 0;
  modelPerformance.clear();
}

// ---- Cross-Session Outcome Tracking ----

/** Schema for a pipeline outcome record tied to a session. */
export const OutcomeRecordSchema = z.object({
  sessionId: z.string().max(100),
  subject: z.string().max(500),
  domain: z.string().max(200).optional(),
  model: z.string().max(100).optional(),
  anglesUsed: z.array(z.string().max(100)).max(20),
  ideaCount: z.number().min(0),
  averageScore: z.number().min(0).max(100).optional(),
  exportCount: z.number().min(0),
  userRating: z.number().min(0).max(10).optional(),
  dwellTimeMs: z.number().min(0).optional(),
  pipelineDurationMs: z.number().min(0).optional(),
  timestamp: z.string(),
});

/** Schema for per-model performance statistics. */
export const ModelPerformanceSchema = z.object({
  model: z.string().max(100),
  totalRuns: z.number().min(0),
  averageScore: z.number().min(0).max(100),
  averageRating: z.number().min(0).max(10),
  averageDurationMs: z.number().min(0),
  successRate: z.number().min(0).max(1),
  topDomains: z.array(z.string().max(200)).max(10),
});

/** Schema for auto-tuned pipeline parameters. */
export const TunedParametersSchema = z.object({
  recommendedModel: z.string().max(100).optional(),
  angleWeights: z.record(z.number().min(0).max(1)),
  preferredAngles: z.array(z.string().max(100)).max(20),
  avoidAngles: z.array(z.string().max(100)).max(20),
  confidenceScore: z.number().min(0).max(1),
  basedOnSessions: z.number().min(0),
  lastTunedAt: z.string(),
});

export type OutcomeRecord = z.infer<typeof OutcomeRecordSchema>;
export type ModelPerformance = z.infer<typeof ModelPerformanceSchema>;
export type TunedParameters = z.infer<typeof TunedParametersSchema>;

// ---- In-memory stores for outcomes ----

const outcomeRecords: OutcomeRecord[] = [];
const modelPerformance = new Map<string, OutcomeRecord[]>();

/**
 * Record a pipeline outcome for cross-session learning.
 */
export function recordOutcome(outcome: Omit<OutcomeRecord, "timestamp">): OutcomeRecord {
  const record: OutcomeRecord = {
    ...outcome,
    timestamp: new Date().toISOString(),
  };
  const validated = OutcomeRecordSchema.parse(record);
  outcomeRecords.push(validated);
  // Cap outcome records to prevent unbounded growth
  if (outcomeRecords.length > MAX_OUTCOME_RECORDS) {
    outcomeRecords.splice(0, outcomeRecords.length - MAX_OUTCOME_RECORDS);
  }

  if (validated.model) {
    const modelRecords = modelPerformance.get(validated.model) ?? [];
    modelRecords.push(validated);
    if (modelRecords.length > MAX_MODEL_RECORDS) {
      modelRecords.splice(0, modelRecords.length - MAX_MODEL_RECORDS);
    }
    modelPerformance.set(validated.model, modelRecords);
  }

  return validated;
}

/**
 * Get all outcome records, optionally filtered by domain.
 */
export function getOutcomes(domain?: string): OutcomeRecord[] {
  if (!domain) return [...outcomeRecords];
  return outcomeRecords.filter((r) => r.domain === domain);
}

/**
 * Compute performance stats for a specific model across all recorded outcomes.
 */
export function getModelPerformanceStats(model: string): ModelPerformance {
  const records = modelPerformance.get(model) ?? [];
  if (records.length === 0) {
    return {
      model,
      totalRuns: 0,
      averageScore: 0,
      averageRating: 0,
      averageDurationMs: 0,
      successRate: 0,
      topDomains: [],
    };
  }

  const scored = records.filter((r) => r.averageScore !== undefined);
  const rated = records.filter((r) => r.userRating !== undefined);
  const timed = records.filter((r) => r.pipelineDurationMs !== undefined);
  const successful = records.filter((r) => r.ideaCount > 0);

  const domainCounts = new Map<string, number>();
  for (const r of records) {
    if (r.domain) domainCounts.set(r.domain, (domainCounts.get(r.domain) ?? 0) + 1);
  }

  return {
    model,
    totalRuns: records.length,
    averageScore:
      scored.length > 0
        ? Math.round(scored.reduce((s, r) => s + (r.averageScore ?? 0), 0) / scored.length)
        : 0,
    averageRating:
      rated.length > 0
        ? Math.round((rated.reduce((s, r) => s + (r.userRating ?? 0), 0) / rated.length) * 100) /
          100
        : 0,
    averageDurationMs:
      timed.length > 0
        ? Math.round(timed.reduce((s, r) => s + (r.pipelineDurationMs ?? 0), 0) / timed.length)
        : 0,
    successRate:
      records.length > 0 ? Math.round((successful.length / records.length) * 100) / 100 : 0,
    topDomains: Array.from(domainCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([d]) => d),
  };
}

/**
 * Get performance comparison across all tracked models.
 */
export function compareModelPerformance(): ModelPerformance[] {
  const models = Array.from(modelPerformance.keys());
  return models
    .map((m) => getModelPerformanceStats(m))
    .sort((a, b) => b.averageScore - a.averageScore);
}

/**
 * Auto-tune pipeline parameters based on accumulated outcome data.
 * Returns recommended model, angle weights, and preferred/avoided angles
 * derived from historical performance.
 */
export function autoTuneParameters(domain?: string): TunedParameters {
  const records = domain ? outcomeRecords.filter((r) => r.domain === domain) : outcomeRecords;

  if (records.length < 3) {
    return {
      angleWeights: {},
      preferredAngles: [],
      avoidAngles: [],
      confidenceScore: 0,
      basedOnSessions: records.length,
      lastTunedAt: new Date().toISOString(),
    };
  }

  // Find best model
  const modelScores = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    if (!r.model || r.averageScore === undefined) continue;
    const entry = modelScores.get(r.model) ?? { total: 0, count: 0 };
    entry.total += r.averageScore;
    entry.count++;
    modelScores.set(r.model, entry);
  }

  let recommendedModel: string | undefined;
  let bestModelScore = 0;
  for (const [model, { total, count }] of modelScores) {
    const avg = total / count;
    if (avg > bestModelScore && count >= 2) {
      bestModelScore = avg;
      recommendedModel = model;
    }
  }

  // Compute angle weights from outcomes
  const angleScores = new Map<string, { totalScore: number; count: number }>();
  for (const r of records) {
    const score = r.averageScore ?? (r.userRating ? r.userRating * 10 : 50);
    for (const angle of r.anglesUsed) {
      const entry = angleScores.get(angle) ?? { totalScore: 0, count: 0 };
      entry.totalScore += score;
      entry.count++;
      angleScores.set(angle, entry);
    }
  }

  const angleWeights: Record<string, number> = {};
  const ranked: Array<{ angle: string; avg: number }> = [];

  for (const [angle, { totalScore, count }] of angleScores) {
    const avg = totalScore / count;
    ranked.push({ angle, avg });
  }

  const maxAvg = Math.max(...ranked.map((r) => r.avg), 1);
  for (const { angle, avg } of ranked) {
    angleWeights[angle] = Math.round((avg / maxAvg) * 100) / 100;
  }

  ranked.sort((a, b) => b.avg - a.avg);
  const preferredAngles = ranked.filter((r) => r.avg >= maxAvg * 0.7).map((r) => r.angle);
  const avoidAngles = ranked.filter((r) => r.avg < maxAvg * 0.3).map((r) => r.angle);

  const confidence = Math.min(records.length / 20, 1);

  return {
    recommendedModel,
    angleWeights,
    preferredAngles,
    avoidAngles,
    confidenceScore: Math.round(confidence * 100) / 100,
    basedOnSessions: records.length,
    lastTunedAt: new Date().toISOString(),
  };
}
