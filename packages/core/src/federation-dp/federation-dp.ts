/**
 * @module federation-dp
 *
 * Differential privacy mechanisms, privacy budget tracking,
 * pattern extraction, and recommendation engine for the
 * Innovation Federation Protocol.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PrivacyBudgetSchema,
  type DPConfig,
  type PrivacyBudget,
  type AnonymizedPattern,
  type PatternRecommendation,
  type FederationNetworkStats,
} from "./types.js";

// ---- Constants ----

const DEFAULT_DIR = join(homedir(), ".innovator", "federation-dp");
const BUDGET_FILE = "privacy-budget.json";
const PATTERNS_FILE = "shared-patterns.json";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- Differential Privacy Primitives ----

/** Round to N decimal places to avoid floating-point noise accumulation. */
function dpRound(value: number, decimals: number = 6): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Generate Laplace noise for ε-differential privacy.
 * Uses the inverse CDF method: noise = -b * sign(u) * ln(1 - 2|u|)
 * where b = sensitivity / epsilon.
 */
export function laplaceMechanism(
  trueValue: number,
  sensitivity: number,
  epsilon: number
): { noisedValue: number; noise: number } {
  if (epsilon <= 0) {
    throw new Error("Epsilon must be positive for Laplace mechanism");
  }
  if (sensitivity < 0) {
    throw new Error("Sensitivity must be non-negative");
  }
  const b = sensitivity / epsilon;
  // Generate uniform random in (-0.5, 0.5)
  const u = Math.random() - 0.5;
  const noise = -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return {
    noisedValue: dpRound(trueValue + noise),
    noise: dpRound(noise),
  };
}

/**
 * Compute confidence interval for a Laplace-noised value.
 * At 95% confidence: CI = value ± (sensitivity/epsilon) * ln(1/0.025)
 */
export function laplaceConfidenceInterval(
  noisedValue: number,
  sensitivity: number,
  epsilon: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  const b = sensitivity / epsilon;
  const alpha = 1 - confidence;
  const margin = b * Math.log(2 / alpha);
  return {
    lower: noisedValue - margin,
    upper: noisedValue + margin,
  };
}

// ---- Privacy Budget Management ----

export function loadPrivacyBudget(dir: string = DEFAULT_DIR): PrivacyBudget {
  ensureDir(dir);
  const path = join(dir, BUDGET_FILE);
  if (existsSync(path)) {
    return PrivacyBudgetSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  }
  return {
    totalSpent: 0,
    maxBudget: 10,
    queriesProcessed: 0,
    budgetHistory: [],
  };
}

function saveBudget(budget: PrivacyBudget, dir: string = DEFAULT_DIR): void {
  ensureDir(dir);
  atomicWrite(join(dir, BUDGET_FILE), JSON.stringify(budget, null, 2));
}

/** Spend privacy budget. Returns false if budget is exhausted. */
export function spendBudget(
  epsilon: number,
  queryType: string,
  dir: string = DEFAULT_DIR
): boolean {
  if (epsilon <= 0) {
    throw new Error("Epsilon must be positive");
  }
  const budget = loadPrivacyBudget(dir);
  if (budget.totalSpent + epsilon > budget.maxBudget) {
    return false; // Budget exhausted
  }
  budget.totalSpent += epsilon;
  budget.queriesProcessed++;
  budget.lastQueryAt = new Date().toISOString();
  budget.budgetHistory.push({
    timestamp: new Date().toISOString(),
    epsilonSpent: epsilon,
    queryType,
  });
  // Keep history bounded
  if (budget.budgetHistory.length > 5000) {
    budget.budgetHistory = budget.budgetHistory.slice(-5000);
  }
  saveBudget(budget, dir);
  return true;
}

/** Get remaining privacy budget. */
export function getRemainingBudget(dir: string = DEFAULT_DIR): number {
  const budget = loadPrivacyBudget(dir);
  return Math.max(0, budget.maxBudget - budget.totalSpent);
}

// ---- Pattern Extraction ----

interface LocalUsageRecord {
  angleId: string;
  topicCategory: string;
  sessionCount: number;
  ideaCount: number;
  successRate: number; // 0-1 fraction of ideas that led to positive outcomes
}

/**
 * Extract anonymized patterns from local usage data with differential privacy.
 */
export function extractAnonymizedPatterns(
  localData: LocalUsageRecord[],
  config: DPConfig,
  dir: string = DEFAULT_DIR
): AnonymizedPattern[] {
  const patterns: AnonymizedPattern[] = [];
  const epoch = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (const record of localData) {
    // Check budget
    if (!spendBudget(config.epsilon, "pattern-extraction", dir)) {
      break; // Budget exhausted
    }

    // Add Laplace noise to the success rate
    const { noisedValue } = laplaceMechanism(
      record.successRate,
      config.sensitivity,
      config.epsilon
    );
    const clampedValue = Math.max(0, Math.min(1, noisedValue));

    const ci = laplaceConfidenceInterval(clampedValue, config.sensitivity, config.epsilon);

    patterns.push({
      id: `dp-${randomUUID().slice(0, 12)}`,
      type: "angle-effectiveness",
      angleId: record.angleId,
      topicCategory: record.topicCategory,
      noisedValue: Math.round(clampedValue * 1000) / 1000,
      ciLower: Math.max(0, Math.round(ci.lower * 1000) / 1000),
      ciUpper: Math.min(1, Math.round(ci.upper * 1000) / 1000),
      sampleSize: record.sessionCount,
      epoch,
      createdAt: new Date().toISOString(),
    });
  }

  // Save patterns
  savePatterns(patterns, dir);

  return patterns;
}

function savePatterns(patterns: AnonymizedPattern[], dir: string = DEFAULT_DIR): void {
  ensureDir(dir);
  const path = join(dir, PATTERNS_FILE);
  let existing: AnonymizedPattern[] = [];
  if (existsSync(path)) {
    existing = JSON.parse(readFileSync(path, "utf-8"));
  }
  const combined = [...existing, ...patterns];
  atomicWrite(path, JSON.stringify(combined, null, 2));
}

export function loadSharedPatterns(dir: string = DEFAULT_DIR): AnonymizedPattern[] {
  ensureDir(dir);
  const path = join(dir, PATTERNS_FILE);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ---- Recommendation Engine ----

/**
 * Generate pattern recommendations based on aggregated federation data.
 * Compares user's current context against network-wide patterns.
 */
export function generateRecommendations(
  userTopics: string[],
  userAngles: string[],
  patterns: AnonymizedPattern[]
): PatternRecommendation[] {
  const recommendations: PatternRecommendation[] = [];

  // Group patterns by topic + angle
  const grouped = new Map<string, AnonymizedPattern[]>();
  for (const p of patterns) {
    if (p.type !== "angle-effectiveness") continue;
    const key = `${p.topicCategory}::${p.angleId}`;
    const existing = grouped.get(key) ?? [];
    existing.push(p);
    grouped.set(key, existing);
  }

  for (const [key, group] of grouped) {
    const [topicCategory, angleId] = key.split("::");
    if (!angleId) continue;

    // Skip angles the user already uses frequently
    if (userAngles.includes(angleId)) continue;

    // Only recommend for relevant topics
    const topicRelevant = userTopics.some((t) =>
      topicCategory.toLowerCase().includes(t.toLowerCase())
    );
    if (!topicRelevant && userTopics.length > 0) continue;

    // Average effectiveness across all reports
    const avgEffectiveness = group.reduce((sum, p) => sum + p.noisedValue, 0) / group.length;
    const totalSamples = group.reduce((sum, p) => sum + p.sampleSize, 0);

    if (avgEffectiveness < 0.3) continue; // Too low effectiveness

    const confidence = totalSamples >= 50 ? "high" : totalSamples >= 10 ? "medium" : "low";

    recommendations.push({
      id: `rec-${randomUUID().slice(0, 12)}`,
      recommendedAngle: angleId,
      topicCategory,
      contributingOrgs: group.length,
      effectivenessScore: Math.round(avgEffectiveness * 100) / 100,
      confidence,
      explanation:
        `${group.length} organizations report ${Math.round(avgEffectiveness * 100)}% effectiveness ` +
        `using "${angleId}" for "${topicCategory}" topics (${totalSamples} total sessions).`,
      createdAt: new Date().toISOString(),
    });
  }

  return recommendations.sort((a, b) => b.effectivenessScore - a.effectivenessScore).slice(0, 10);
}

// ---- Anti-Pattern Detection ----

/** Detect angle+topic combinations that consistently underperform. */
export function detectAntiPatterns(
  patterns: AnonymizedPattern[],
  threshold: number = 0.15
): Array<{
  angleId: string;
  topicCategory: string;
  avgEffectiveness: number;
  warningReason: string;
}> {
  const grouped = new Map<string, AnonymizedPattern[]>();

  for (const p of patterns) {
    if (p.type !== "angle-effectiveness" || !p.angleId) continue;
    const key = `${p.topicCategory}::${p.angleId}`;
    const existing = grouped.get(key) ?? [];
    existing.push(p);
    grouped.set(key, existing);
  }

  const antiPatterns: Array<{
    angleId: string;
    topicCategory: string;
    avgEffectiveness: number;
    warningReason: string;
  }> = [];

  for (const [key, group] of grouped) {
    if (group.length < 3) continue; // Need minimum evidence

    const [topicCategory, angleId] = key.split("::");
    if (!angleId) continue;

    const avg = group.reduce((sum, p) => sum + p.noisedValue, 0) / group.length;
    if (avg < threshold) {
      antiPatterns.push({
        angleId,
        topicCategory,
        avgEffectiveness: Math.round(avg * 100) / 100,
        warningReason:
          `Low effectiveness (${Math.round(avg * 100)}%) across ${group.length} organizations. ` +
          `Consider alternative angles for "${topicCategory}" topics.`,
      });
    }
  }

  return antiPatterns;
}

// ---- Network Stats ----

export function computeNetworkStats(patterns: AnonymizedPattern[]): FederationNetworkStats {
  const uniqueOrgs = new Set(patterns.map((p) => p.id.split("-")[1]));

  // Trending angles
  const angleFreq = new Map<string, { count: number; topic: string; total: number }>();
  for (const p of patterns) {
    if (!p.angleId) continue;
    const key = `${p.angleId}::${p.topicCategory}`;
    const existing = angleFreq.get(key) ?? { count: 0, topic: p.topicCategory, total: 0 };
    existing.count++;
    existing.total += p.noisedValue;
    angleFreq.set(key, existing);
  }

  const trending = [...angleFreq.entries()]
    .map(([key, data]) => ({
      angleId: key.split("::")[0],
      topicCategory: data.topic,
      effectivenessScore: Math.round((data.total / data.count) * 100) / 100,
      trend: data.count >= 5 ? ("rising" as const) : ("stable" as const),
    }))
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
    .slice(0, 20);

  const antiPatterns = detectAntiPatterns(patterns);

  return {
    totalNodes: uniqueOrgs.size,
    totalPatterns: patterns.length,
    averageEpsilon: 1.0, // Default assumption
    trendingAngles: trending,
    antiPatterns: antiPatterns.map((ap) => ({
      angleId: ap.angleId,
      topicCategory: ap.topicCategory,
      warningReason: ap.warningReason,
    })),
  };
}
