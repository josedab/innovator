/**
 * @module debt-tracker
 *
 * Innovation Debt Tracker — tracks deferred innovation decisions,
 * detects competitive matches, calculates debt scores, and generates
 * debt reports with cost-of-delay estimates.
 */

import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type {
  DebtItem,
  DebtScore,
  CompetitiveMatch,
  DebtReport,
  DebtTrackerConfig,
} from "./types.js";
import {
  DebtItemSchema,
  DebtScoreSchema,
  CompetitiveMatchSchema,
  DebtReportSchema,
} from "./types.js";
import { ValidationError } from "../errors.js";

export * from "./types.js";

// ---- In-Memory Store ----

const debtItems = new Map<string, DebtItem>();
const competitiveMatches = new Map<string, CompetitiveMatch[]>();

// ---- Debt Item CRUD ----

/**
 * Create a new innovation debt item.
 */
export function createDebtItem(params: {
  title: string;
  description: string;
  category: DebtItem["category"];
  severity: DebtItem["severity"];
  deferralReason: string;
  originalIdeaId?: string;
  monthlyCostOfDelay?: number;
  tags?: string[];
}): DebtItem {
  const now = new Date().toISOString();
  const item: DebtItem = DebtItemSchema.parse({
    id: randomUUID(),
    title: params.title,
    description: params.description,
    category: params.category,
    severity: params.severity,
    originalIdeaId: params.originalIdeaId,
    proposedAt: now,
    deferredAt: now,
    deferralReason: params.deferralReason,
    monthlyCostOfDelay: params.monthlyCostOfDelay,
    accumulatedCost: 0,
    competitiveMatches: [],
    status: "active",
    tags: params.tags ?? [],
    updatedAt: now,
  });

  debtItems.set(item.id, item);
  competitiveMatches.set(item.id, []);
  return item;
}

/**
 * Update an existing debt item.
 */
export function updateDebtItem(
  id: string,
  updates: Partial<Pick<DebtItem, "severity" | "status" | "monthlyCostOfDelay" | "tags">>
): DebtItem {
  const item = debtItems.get(id);
  if (!item) throw new ValidationError(`Debt item ${id} not found`);

  const updated = DebtItemSchema.parse({
    ...item,
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  debtItems.set(id, updated);
  return updated;
}

// ---- Debt Score Calculation ----

const SEVERITY_WEIGHTS: Record<DebtItem["severity"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Calculate the debt score for an item based on age, severity,
 * competitive risk, and cost of delay.
 */
export function calculateDebtScore(itemId: string): DebtScore {
  const item = debtItems.get(itemId);
  if (!item) throw new ValidationError(`Debt item ${itemId} not found`);

  const now = Date.now();
  const deferredAt = new Date(item.deferredAt).getTime();
  const ageMonths = Math.max(0, (now - deferredAt) / (30 * 24 * 60 * 60 * 1000));

  // Age-weighted severity (0–40)
  const ageWeightedSeverity = Math.min(
    40,
    SEVERITY_WEIGHTS[item.severity] * Math.sqrt(ageMonths) * 3
  );

  // Competitive risk (0–30)
  const matches = competitiveMatches.get(itemId) ?? [];
  const competitiveRisk = Math.min(30, matches.length * 10);

  // Cost of delay (0–30)
  const monthlyDelay = item.monthlyCostOfDelay ?? 0;
  const costOfDelay = Math.min(30, (monthlyDelay * ageMonths) / 10000);

  // Update accumulated cost
  item.accumulatedCost = monthlyDelay * ageMonths;
  debtItems.set(itemId, item);

  const score = Math.min(100, ageWeightedSeverity + competitiveRisk + costOfDelay);
  const urgency: DebtScore["urgency"] =
    score >= 80 ? "critical" : score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return DebtScoreSchema.parse({
    itemId,
    score,
    components: {
      ageWeightedSeverity: Math.round(ageWeightedSeverity * 100) / 100,
      competitiveRisk: Math.round(competitiveRisk * 100) / 100,
      costOfDelay: Math.round(costOfDelay * 100) / 100,
    },
    urgency,
    computedAt: new Date().toISOString(),
  });
}

// ---- Competitive Match Detection ----

/**
 * Use LLM to detect if a competitive move matches a shelved idea.
 */
export async function detectCompetitiveMatch(
  itemId: string,
  competitorInfo: {
    competitorName: string;
    moveDescription: string;
    source: string;
  },
  config: DebtTrackerConfig = {}
): Promise<CompetitiveMatch | null> {
  const item = debtItems.get(itemId);
  if (!item) throw new ValidationError(`Debt item ${itemId} not found`);

  const prompt = `You are an innovation strategy analyst. Compare a shelved innovation idea against a competitor's recent move.

SHELVED IDEA:
Title: ${item.title}
Description: ${item.description}
Category: ${item.category}
Deferred reason: ${item.deferralReason}

${wrapUserInput("COMPETITOR MOVE", `${competitorInfo.competitorName}: ${competitorInfo.moveDescription}`)}

Evaluate:
1. How similar is this competitor move to the shelved idea? (0–1 scale)
2. What is the market impact? (minimal, moderate, significant, transformative)

Respond in JSON:
{"similarity": <number>, "marketImpact": "<string>", "analysis": "<brief explanation>"}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    },
    { signal: config.signal }
  );

  const similarity = Math.max(0, Math.min(1, Number(result.similarity) || 0));
  if (similarity < 0.3) return null; // Not a match

  const match: CompetitiveMatch = CompetitiveMatchSchema.parse({
    id: randomUUID(),
    debtItemId: itemId,
    competitorName: competitorInfo.competitorName,
    moveDescription: competitorInfo.moveDescription,
    similarity,
    marketImpact: result.marketImpact ?? "moderate",
    detectedAt: new Date().toISOString(),
    source: competitorInfo.source,
  });

  const matches = competitiveMatches.get(itemId) ?? [];
  matches.push(match);
  competitiveMatches.set(itemId, matches);

  item.competitiveMatches.push(match.id);
  debtItems.set(itemId, item);

  return match;
}

// ---- Debt Report Generation ----

/**
 * Generate a debt report for the specified period.
 */
export function generateDebtReport(periodStart?: string, periodEnd?: string): DebtReport {
  const now = new Date().toISOString();
  const start = periodStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = periodEnd ?? now;

  const activeItems = Array.from(debtItems.values()).filter((i) => i.status === "active");

  // Calculate scores for all items
  const scoredItems = activeItems.map((item) => ({
    item,
    score: calculateDebtScore(item.id),
  }));

  // Count new competitive matches in period
  let newMatches = 0;
  for (const matches of competitiveMatches.values()) {
    newMatches += matches.filter((m) => m.detectedAt >= start && m.detectedAt <= end).length;
  }

  // Group by category
  const byCategory: DebtReport["byCategory"] = {};
  for (const { item } of scoredItems) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = { count: 0, totalCost: 0, averageAge: 0 };
    }
    const cat = byCategory[item.category];
    cat.count++;
    cat.totalCost += item.accumulatedCost;
    const ageMs = Date.now() - new Date(item.deferredAt).getTime();
    cat.averageAge += ageMs / (30 * 24 * 60 * 60 * 1000);
  }
  for (const cat of Object.values(byCategory)) {
    if (cat.count > 0) cat.averageAge = cat.averageAge / cat.count;
  }

  // Generate recommendations
  const recommendations: string[] = [];
  const criticalItems = scoredItems.filter((s) => s.score.urgency === "critical");
  if (criticalItems.length > 0) {
    recommendations.push(
      `${criticalItems.length} critical debt items require immediate attention.`
    );
  }

  const totalCost = activeItems.reduce((sum, i) => sum + i.accumulatedCost, 0);
  if (totalCost > 100000) {
    recommendations.push(
      `Total accumulated innovation debt cost exceeds $${Math.round(totalCost / 1000)}K. Consider prioritizing top items.`
    );
  }

  if (newMatches > 0) {
    recommendations.push(
      `${newMatches} new competitive matches detected. Review shelved ideas for potential revival.`
    );
  }

  return DebtReportSchema.parse({
    id: randomUUID(),
    periodStart: start,
    periodEnd: end,
    totalItems: activeItems.length,
    totalAccumulatedCost: totalCost,
    newCompetitiveMatches: newMatches,
    topItems: scoredItems
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 20)
      .map((s) => ({
        itemId: s.item.id,
        title: s.item.title,
        score: s.score.score,
        accumulatedCost: s.item.accumulatedCost,
        competitiveMatches: s.item.competitiveMatches.length,
      })),
    byCategory,
    recommendations,
    generatedAt: now,
  });
}
