/**
 * @module retrospective
 *
 * Innovation Retrospective Engine: auto-generates retrospectives after ideas
 * are shipped. Tracks outcomes, analyzes success patterns and failure modes,
 * detects team velocity trends and diminishing returns.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import { LlmParseError, ValidationError } from "../errors.js";

// ---- Schemas ----

/** Schema for a tracked idea outcome. */
export const IdeaOutcomeSchema = z.object({
  ideaTitle: z.string().max(500),
  status: z.enum(["shipped", "abandoned", "pivoted", "in-progress", "on-hold"]),
  shippedAt: z.string().optional(),
  actualImpact: z.string().max(2000).optional(),
  metricsAchieved: z.record(z.number()).optional(),
  lessonsLearned: z.array(z.string().max(1000)).max(10).optional(),
  teamFeedback: z.array(z.string().max(1000)).max(10).optional(),
  timeToShip: z.number().min(0).optional().describe("Days from idea to ship"),
  originalScore: z.number().min(0).max(10).optional(),
});

/** Schema for a success pattern. */
export const SuccessPatternSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  frequency: z.number().min(1),
  exampleIdeas: z.array(z.string().max(500)).max(10),
  applicability: z.enum(["universal", "domain-specific", "context-dependent"]),
});

/** Schema for a failure mode. */
export const FailureModeSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  frequency: z.number().min(1),
  rootCause: z.string().max(1000),
  prevention: z.string().max(1000),
  exampleIdeas: z.array(z.string().max(500)).max(10),
});

/** Schema for velocity trend data. */
export const VelocityTrendSchema = z.object({
  period: z.string().max(100),
  ideasGenerated: z.number().min(0),
  ideasShipped: z.number().min(0),
  averageTimeToShip: z.number().min(0).optional(),
  successRate: z.number().min(0).max(1),
  innovationScore: z.number().min(0).max(10),
});

/** Schema for a diminishing returns detection. */
export const DiminishingReturnsSchema = z.object({
  detected: z.boolean(),
  area: z.string().max(500),
  description: z.string().max(2000),
  recommendation: z.string().max(2000),
  confidenceLevel: z.number().min(0).max(1),
});

/** Schema for the full retrospective report. */
export const RetrospectiveReportSchema = z.object({
  id: z.string().max(100),
  period: z.string().max(200),
  generatedAt: z.string(),
  summary: z.string().max(5000),
  totalIdeasTracked: z.number().min(0),
  successPatterns: z.array(SuccessPatternSchema).max(20),
  failureModes: z.array(FailureModeSchema).max(20),
  velocityTrends: z.array(VelocityTrendSchema).max(12),
  diminishingReturns: z.array(DiminishingReturnsSchema).max(10),
  topPerformingAngles: z.array(z.string().max(100)).max(10),
  recommendations: z.array(z.string().max(1000)).max(10),
  overallHealthScore: z.number().min(0).max(10),
});

// ---- Types ----

export type IdeaOutcome = z.infer<typeof IdeaOutcomeSchema>;
export type SuccessPattern = z.infer<typeof SuccessPatternSchema>;
export type FailureMode = z.infer<typeof FailureModeSchema>;
export type VelocityTrend = z.infer<typeof VelocityTrendSchema>;
export type DiminishingReturns = z.infer<typeof DiminishingReturnsSchema>;
export type RetrospectiveReport = z.infer<typeof RetrospectiveReportSchema>;

// ---- In-memory stores ----

const outcomes: Map<string, IdeaOutcome> = new Map();
const reports: Map<string, RetrospectiveReport> = new Map();
let reportCounter = 0;

// ---- Outcome tracking ----

/**
 * Track an idea outcome.
 */
export function trackOutcome(outcome: IdeaOutcome): IdeaOutcome {
  const validated = IdeaOutcomeSchema.parse(outcome);
  outcomes.set(validated.ideaTitle, validated);
  return validated;
}

/**
 * Get a tracked outcome by idea title.
 */
export function getOutcome(ideaTitle: string): IdeaOutcome | undefined {
  return outcomes.get(ideaTitle);
}

/**
 * List all tracked outcomes.
 */
export function listOutcomes(): IdeaOutcome[] {
  return Array.from(outcomes.values());
}

/**
 * Update an existing outcome.
 */
export function updateOutcome(
  ideaTitle: string,
  updates: Partial<IdeaOutcome>
): IdeaOutcome | undefined {
  const existing = outcomes.get(ideaTitle);
  if (!existing) return undefined;
  const updated = { ...existing, ...updates, ideaTitle: existing.ideaTitle };
  const validated = IdeaOutcomeSchema.parse(updated);
  outcomes.set(ideaTitle, validated);
  return validated;
}

// ---- Pattern analysis ----

/**
 * Analyze outcomes to detect success patterns.
 */
export function analyzeSuccessPatterns(outcomeList?: IdeaOutcome[]): SuccessPattern[] {
  const data = outcomeList ?? listOutcomes();
  const shipped = data.filter((o) => o.status === "shipped");
  if (shipped.length < 2) return [];

  const patterns: SuccessPattern[] = [];

  // Detect fast-ship pattern
  const fastShips = shipped.filter((o) => o.timeToShip !== undefined && o.timeToShip < 30);
  if (fastShips.length >= 2) {
    patterns.push({
      title: "Fast Ship Cycle",
      description: "Ideas shipped in under 30 days tend to achieve their goals",
      frequency: fastShips.length,
      exampleIdeas: fastShips.map((o) => o.ideaTitle).slice(0, 5),
      applicability: "universal",
    });
  }

  // Detect high-score success pattern
  const highScoreSuccess = shipped.filter(
    (o) => o.originalScore !== undefined && o.originalScore >= 7
  );
  if (highScoreSuccess.length >= 2) {
    patterns.push({
      title: "High-Score Validation",
      description: "Ideas scored 7+ during evaluation tend to ship successfully",
      frequency: highScoreSuccess.length,
      exampleIdeas: highScoreSuccess.map((o) => o.ideaTitle).slice(0, 5),
      applicability: "universal",
    });
  }

  return patterns;
}

/**
 * Analyze outcomes to detect failure modes.
 */
export function analyzeFailureModes(outcomeList?: IdeaOutcome[]): FailureMode[] {
  const data = outcomeList ?? listOutcomes();
  const failed = data.filter((o) => o.status === "abandoned");
  if (failed.length < 2) return [];

  const modes: FailureMode[] = [];

  // Detect overscoped failures
  const overscoped = failed.filter(
    (o) => o.lessonsLearned?.some((l) => l.toLowerCase().includes("scope")) ?? false
  );
  if (overscoped.length >= 2) {
    modes.push({
      title: "Scope Creep",
      description: "Ideas abandoned due to scope becoming too large",
      frequency: overscoped.length,
      rootCause: "Insufficient scope definition upfront",
      prevention: "Define clear MVP criteria and strict scope boundaries before starting",
      exampleIdeas: overscoped.map((o) => o.ideaTitle).slice(0, 5),
    });
  }

  return modes;
}

/**
 * Calculate velocity trends from outcomes.
 */
export function calculateVelocityTrends(outcomeList?: IdeaOutcome[]): VelocityTrend[] {
  const data = outcomeList ?? listOutcomes();
  if (data.length === 0) return [];

  // Group by month of shipped date
  const monthGroups: Map<string, IdeaOutcome[]> = new Map();
  for (const outcome of data) {
    const date = outcome.shippedAt ?? new Date().toISOString();
    const month = date.slice(0, 7); // YYYY-MM
    const group = monthGroups.get(month) ?? [];
    group.push(outcome);
    monthGroups.set(month, group);
  }

  const trends: VelocityTrend[] = [];
  for (const [period, group] of monthGroups) {
    const shipped = group.filter((o) => o.status === "shipped");
    const shipTimes = shipped.map((o) => o.timeToShip).filter((t): t is number => t !== undefined);

    trends.push({
      period,
      ideasGenerated: group.length,
      ideasShipped: shipped.length,
      averageTimeToShip:
        shipTimes.length > 0 ? shipTimes.reduce((a, b) => a + b, 0) / shipTimes.length : undefined,
      successRate: group.length > 0 ? shipped.length / group.length : 0,
      innovationScore:
        shipped.length > 0
          ? shipped.reduce((sum, o) => sum + (o.originalScore ?? 5), 0) / shipped.length
          : 0,
    });
  }

  return trends.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Detect diminishing returns in innovation output.
 */
export function detectDiminishingReturns(trends: VelocityTrend[]): DiminishingReturns[] {
  if (trends.length < 3) return [];

  const results: DiminishingReturns[] = [];

  // Check for declining success rate
  const recentTrends = trends.slice(-3);
  const successRates = recentTrends.map((t) => t.successRate);
  if (
    successRates.length >= 3 &&
    successRates[0] > successRates[1] &&
    successRates[1] > successRates[2]
  ) {
    results.push({
      detected: true,
      area: "Success Rate",
      description: "Ship success rate has been declining for 3 consecutive periods",
      recommendation:
        "Review idea selection criteria, consider new innovation angles, or invest in execution capability",
      confidenceLevel: 0.7,
    });
  }

  // Check for declining innovation score
  const innovScores = recentTrends.map((t) => t.innovationScore);
  if (
    innovScores.length >= 3 &&
    innovScores[0] > innovScores[1] &&
    innovScores[1] > innovScores[2]
  ) {
    results.push({
      detected: true,
      area: "Innovation Quality",
      description: "Average innovation quality has been declining for 3 consecutive periods",
      recommendation:
        "Explore new domains, bring in external perspectives, or try different innovation angles",
      confidenceLevel: 0.6,
    });
  }

  return results;
}

// ---- AI-powered retrospective generation ----

function buildRetrospectivePrompt(outcomeData: IdeaOutcome[], period: string): string {
  return `You are an innovation retrospective analyst. Analyze the following idea outcomes and generate a comprehensive retrospective report.

PERIOD: ${period}

OUTCOMES:
"""
${sanitizeLlmOutput(JSON.stringify(outcomeData, null, 2))}
"""

Generate a retrospective with:
1. **summary**: Overall narrative of the innovation period
2. **successPatterns**: Recurring patterns in successful ideas
3. **failureModes**: Common reasons for idea failure
4. **recommendations**: Actionable recommendations for the next period
5. **overallHealthScore**: Overall innovation health score (0-10)
6. **topPerformingAngles**: Which innovation angles produced the best results

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "summary": "Overall narrative...",
  "successPatterns": [{"title": "Pattern", "description": "desc", "frequency": 3, "exampleIdeas": ["idea1"], "applicability": "universal"}],
  "failureModes": [{"title": "Mode", "description": "desc", "frequency": 2, "rootCause": "cause", "prevention": "how", "exampleIdeas": ["idea1"]}],
  "recommendations": ["rec 1"],
  "overallHealthScore": 7.5,
  "topPerformingAngles": ["scamper"]
}`;
}

/**
 * Generate an AI-powered retrospective report.
 */
export async function generateRetrospectiveReport(
  period: string,
  outcomeList?: IdeaOutcome[],
  model?: string,
  signal?: AbortSignal
): Promise<RetrospectiveReport> {
  const data = outcomeList ?? listOutcomes();
  const velocityTrends = calculateVelocityTrends(data);
  const diminishingReturns = detectDiminishingReturns(velocityTrends);

  const prompt = buildRetrospectivePrompt(data, period);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse retrospective response as JSON: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const aiResult = z
    .object({
      summary: z.string().max(5000),
      successPatterns: z.array(SuccessPatternSchema).max(20),
      failureModes: z.array(FailureModeSchema).max(20),
      recommendations: z.array(z.string().max(1000)).max(10),
      overallHealthScore: z.number().min(0).max(10),
      topPerformingAngles: z.array(z.string().max(100)).max(10),
    })
    .parse(parsed);

  const reportId = `retro-${++reportCounter}-${Date.now()}`;

  const report: RetrospectiveReport = {
    id: reportId,
    period,
    generatedAt: new Date().toISOString(),
    totalIdeasTracked: data.length,
    velocityTrends,
    diminishingReturns,
    ...aiResult,
  };

  reports.set(reportId, report);
  return report;
}

/**
 * Get a retrospective report by ID.
 */
export function getRetrospectiveReport(id: string): RetrospectiveReport | undefined {
  return reports.get(id);
}

/**
 * List all retrospective reports.
 */
export function listRetrospectiveReports(): RetrospectiveReport[] {
  return Array.from(reports.values());
}

/**
 * Clear all outcomes and reports.
 */
export function clearRetrospectiveData(): void {
  outcomes.clear();
  reports.clear();
  reportCounter = 0;
}

// ---- Angle Performance Tracking ----

/** Schema for angle performance analysis. */
export const AnglePerformanceSchema = z.object({
  angleId: z.string().max(200),
  timesUsed: z.number().min(0),
  shippedCount: z.number().min(0),
  averageScore: z.number().min(0).max(10),
  bestIdeas: z.array(z.string().max(500)).max(10),
  trend: z.enum(["improving", "stable", "declining"]),
});

export type AnglePerformance = z.infer<typeof AnglePerformanceSchema>;

/**
 * Analyze which angles produced the best shipped ideas.
 * Reads angle info from outcome metadata (metricsAchieved.angleId or lessonsLearned tags).
 */
export function analyzeAnglePerformance(outcomeList?: IdeaOutcome[]): AnglePerformance[] {
  const data = outcomeList ?? listOutcomes();
  if (data.length === 0) return [];

  // Group outcomes by angle — angle stored in metricsAchieved as "angle" or "angleId"
  const angleMap = new Map<string, IdeaOutcome[]>();
  for (const o of data) {
    let angleId = "unknown";
    if (o.metricsAchieved?.["angle"] != null) {
      angleId = String(o.metricsAchieved["angle"]);
    } else if (o.metricsAchieved?.["angleId"] != null) {
      angleId = String(o.metricsAchieved["angleId"]);
    } else if (o.lessonsLearned?.length) {
      // Try to extract angle from lessons learned tags like "[scamper]" or "angle:first-principles"
      for (const lesson of o.lessonsLearned) {
        const match = lesson.match(/\[(\w[\w-]*)\]/) ?? lesson.match(/angle:\s*(\w[\w-]*)/);
        if (match) {
          angleId = match[1];
          break;
        }
      }
    }
    const group = angleMap.get(angleId) ?? [];
    group.push(o);
    angleMap.set(angleId, group);
  }

  const results: AnglePerformance[] = [];
  for (const [angleId, group] of angleMap) {
    const shipped = group.filter((o) => o.status === "shipped");
    const scores = group.map((o) => o.originalScore).filter((s): s is number => s !== undefined);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Determine trend from chronological score changes
    let trend: "improving" | "stable" | "declining" = "stable";
    if (scores.length >= 3) {
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (avgSecond - avgFirst > 0.5) trend = "improving";
      else if (avgFirst - avgSecond > 0.5) trend = "declining";
    }

    const bestIdeas = shipped
      .sort((a, b) => (b.originalScore ?? 0) - (a.originalScore ?? 0))
      .slice(0, 10)
      .map((o) => o.ideaTitle);

    results.push(
      AnglePerformanceSchema.parse({
        angleId,
        timesUsed: group.length,
        shippedCount: shipped.length,
        averageScore: Math.round(avgScore * 100) / 100,
        bestIdeas,
        trend,
      })
    );
  }

  return results.sort((a, b) => b.shippedCount - a.shippedCount);
}

// ---- Statistical Significance Testing ----

/**
 * Test whether a success pattern's observed success rate is statistically
 * significant compared to the base rate using a chi-squared test.
 * Returns the chi-squared statistic, p-value estimate, and whether
 * the result is significant at α = 0.05.
 */
export function testPatternSignificance(
  pattern: SuccessPattern,
  allOutcomes: IdeaOutcome[]
): { chiSquared: number; pValue: number; significant: boolean } {
  const totalOutcomes = allOutcomes.length;
  if (totalOutcomes === 0 || pattern.frequency === 0) {
    return { chiSquared: 0, pValue: 1, significant: false };
  }

  const totalShipped = allOutcomes.filter((o) => o.status === "shipped").length;
  const baseRate = totalShipped / totalOutcomes;

  // Pattern group: frequency total, all assumed shipped (success pattern)
  const patternTotal = pattern.frequency;
  const patternSuccess = pattern.frequency;
  const patternFailure = 0;

  // Expected counts under null hypothesis (base rate)
  const expectedSuccess = patternTotal * baseRate;
  const expectedFailure = patternTotal * (1 - baseRate);

  if (expectedSuccess === 0 || expectedFailure === 0) {
    return { chiSquared: 0, pValue: 1, significant: false };
  }

  // Chi-squared = Σ (observed - expected)² / expected
  const chiSquared =
    Math.pow(patternSuccess - expectedSuccess, 2) / expectedSuccess +
    Math.pow(patternFailure - expectedFailure, 2) / expectedFailure;

  // Approximate p-value for 1 degree of freedom using survival function approximation
  const pValue = Math.exp(-chiSquared / 2);

  return {
    chiSquared: Math.round(chiSquared * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    significant: pValue < 0.05,
  };
}

// ---- Auto-Configuration Recommendations ----

/** Schema for auto-configuration recommendations. */
export const AutoConfigSchema = z.object({
  angleWeights: z.record(z.number().min(0).max(10)),
  modelPreferences: z.array(z.string().max(200)).max(10),
  scoringAdjustments: z.record(z.number().min(-5).max(5)),
  generatedAt: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.array(z.string().max(1000)).max(20),
});

export type AutoConfig = z.infer<typeof AutoConfigSchema>;

/**
 * Analyze retrospective data and produce recommended configuration changes.
 * - Angle selection weights (boost high-performing, reduce low-performing)
 * - Model routing suggestions based on which models produced best ideas
 * - Scoring weight adjustments based on which scores predicted outcomes
 */
export async function generateAutoConfig(
  outcomeList?: IdeaOutcome[],
  _model?: string,
  _signal?: AbortSignal
): Promise<AutoConfig> {
  const data = outcomeList ?? listOutcomes();
  const reasoning: string[] = [];

  // Angle weights from performance data
  const anglePerf = analyzeAnglePerformance(data);
  const angleWeights: Record<string, number> = {};
  for (const ap of anglePerf) {
    const successRate = ap.timesUsed > 0 ? ap.shippedCount / ap.timesUsed : 0;
    // Weight = base 5 + bonus for success rate + bonus for high avg score
    const weight = Math.min(
      10,
      Math.max(0, 5 + (successRate - 0.5) * 4 + (ap.averageScore - 5) * 0.5)
    );
    angleWeights[ap.angleId] = Math.round(weight * 100) / 100;
    if (successRate > 0.6) {
      reasoning.push(
        `Boosting angle "${ap.angleId}" (${Math.round(successRate * 100)}% success rate)`
      );
    } else if (successRate < 0.3 && ap.timesUsed >= 3) {
      reasoning.push(
        `Reducing angle "${ap.angleId}" (${Math.round(successRate * 100)}% success rate, ${ap.timesUsed} uses)`
      );
    }
  }

  // Model preferences from metricsAchieved.model
  const modelStats = new Map<string, { total: number; shipped: number }>();
  for (const o of data) {
    const m = o.metricsAchieved?.["model"] != null ? String(o.metricsAchieved["model"]) : null;
    if (m) {
      const stats = modelStats.get(m) ?? { total: 0, shipped: 0 };
      stats.total++;
      if (o.status === "shipped") stats.shipped++;
      modelStats.set(m, stats);
    }
  }
  const modelPreferences = Array.from(modelStats.entries())
    .filter(([, s]) => s.total >= 2)
    .sort((a, b) => b[1].shipped / b[1].total - a[1].shipped / a[1].total)
    .map(([m]) => m)
    .slice(0, 10);
  if (modelPreferences.length > 0) {
    reasoning.push(`Top model preference: "${modelPreferences[0]}" based on ship rate`);
  }

  // Scoring adjustments — check correlation between originalScore and shipping
  const shipped = data.filter((o) => o.status === "shipped" && o.originalScore !== undefined);
  const notShipped = data.filter((o) => o.status !== "shipped" && o.originalScore !== undefined);
  const avgShippedScore =
    shipped.length > 0
      ? shipped.reduce((s, o) => s + (o.originalScore ?? 0), 0) / shipped.length
      : 5;
  const avgNotShippedScore =
    notShipped.length > 0
      ? notShipped.reduce((s, o) => s + (o.originalScore ?? 0), 0) / notShipped.length
      : 5;
  const scoringAdjustments: Record<string, number> = {};
  const scoreDiff = avgShippedScore - avgNotShippedScore;
  if (Math.abs(scoreDiff) > 0.5) {
    scoringAdjustments["originalScore"] = Math.round(scoreDiff * 100) / 100;
    reasoning.push(
      `Shipped ideas avg score ${avgShippedScore.toFixed(1)} vs non-shipped ${avgNotShippedScore.toFixed(1)}`
    );
  }

  const totalOutcomes = data.length;
  const confidence = Math.min(1, totalOutcomes / 50); // grows with data size

  return AutoConfigSchema.parse({
    angleWeights,
    modelPreferences,
    scoringAdjustments,
    generatedAt: new Date().toISOString(),
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
  });
}

// ---- Outcome-to-Implementation Linking ----

/** Schema for implementation details linked to an outcome. */
export const ImplementationLinkSchema = z.object({
  ideaTitle: z.string().max(500),
  repo: z.string().max(500).optional(),
  pr: z.string().max(500).optional(),
  commitHash: z.string().max(200).optional(),
  deployedUrl: z.string().max(2000).optional(),
  metrics: z.record(z.union([z.number(), z.string()])).optional(),
  linkedAt: z.string(),
});

export type ImplementationLink = z.infer<typeof ImplementationLinkSchema>;

const implementationLinks: Map<string, ImplementationLink[]> = new Map();

/**
 * Link an idea outcome to its implementation details.
 */
export function linkOutcomeToImplementation(
  ideaTitle: string,
  implementation: {
    repo?: string;
    pr?: string;
    commitHash?: string;
    deployedUrl?: string;
    metrics?: Record<string, number | string>;
  }
): ImplementationLink {
  const link = ImplementationLinkSchema.parse({
    ideaTitle,
    ...implementation,
    linkedAt: new Date().toISOString(),
  });
  const existing = implementationLinks.get(ideaTitle) ?? [];
  existing.push(link);
  implementationLinks.set(ideaTitle, existing);
  return link;
}

/**
 * Get all implementation links for an idea.
 */
export function getImplementationLinks(ideaTitle: string): ImplementationLink[] {
  return implementationLinks.get(ideaTitle) ?? [];
}

// ---- Predictive Analytics ----

/** Schema for idea success prediction. */
export const IdeaPredictionSchema = z.object({
  ideaTitle: z.string().max(500),
  predictedShipProbability: z.number().min(0).max(1),
  estimatedTimeToShipDays: z.number().min(0).optional(),
  expectedImpact: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  basedOnSampleSize: z.number().min(0),
});

export type IdeaPrediction = z.infer<typeof IdeaPredictionSchema>;

/**
 * Predict likelihood of shipping success using historical outcomes.
 * Uses angle performance and score distributions as predictive features.
 */
export function predictIdeaSuccess(
  ideaTitle: string,
  score: number,
  angleId: string
): IdeaPrediction {
  const allData = listOutcomes();
  const angleOutcomes = allData.filter(
    (o) => o.metricsAchieved?.["angle"] != null && String(o.metricsAchieved["angle"]) === angleId
  );

  // Base rate from all outcomes
  const baseShipRate =
    allData.length > 0
      ? allData.filter((o) => o.status === "shipped").length / allData.length
      : 0.5;

  // Angle-specific rate
  const angleShipRate =
    angleOutcomes.length > 0
      ? angleOutcomes.filter((o) => o.status === "shipped").length / angleOutcomes.length
      : baseShipRate;

  // Score-based adjustment: ideas with scores near this one — how often did they ship?
  const similarScored = allData.filter(
    (o) => o.originalScore !== undefined && Math.abs(o.originalScore - score) <= 1
  );
  const scoreShipRate =
    similarScored.length > 0
      ? similarScored.filter((o) => o.status === "shipped").length / similarScored.length
      : baseShipRate;

  // Blended probability: weighted avg of base, angle, and score signals
  const sampleSize = allData.length;
  const angleWeight = Math.min(1, angleOutcomes.length / 10);
  const scoreWeight = Math.min(1, similarScored.length / 10);
  const totalWeight = 1 + angleWeight + scoreWeight;
  const predictedShipProbability =
    Math.round(
      ((baseShipRate + angleShipRate * angleWeight + scoreShipRate * scoreWeight) / totalWeight) *
        1000
    ) / 1000;

  // Estimated time to ship from similar outcomes
  const shippedSimilar = [...angleOutcomes, ...similarScored].filter(
    (o) => o.status === "shipped" && o.timeToShip !== undefined
  );
  const estimatedTimeToShipDays =
    shippedSimilar.length > 0
      ? Math.round(
          shippedSimilar.reduce((s, o) => s + (o.timeToShip ?? 0), 0) / shippedSimilar.length
        )
      : undefined;

  // Expected impact based on score
  const expectedImpact: "low" | "medium" | "high" =
    score >= 8 ? "high" : score >= 5 ? "medium" : "low";

  const confidence = Math.min(1, sampleSize / 30);

  return IdeaPredictionSchema.parse({
    ideaTitle,
    predictedShipProbability,
    estimatedTimeToShipDays,
    expectedImpact,
    confidence: Math.round(confidence * 100) / 100,
    basedOnSampleSize: sampleSize,
  });
}

// ---- Retrospective Comparison ----

/** Schema for retrospective comparison result. */
export const RetrospectiveComparisonSchema = z.object({
  reportIdA: z.string().max(100),
  reportIdB: z.string().max(100),
  periodA: z.string().max(200),
  periodB: z.string().max(200),
  healthScoreChange: z.number(),
  successRateChange: z.number(),
  velocityChange: z.number(),
  newPatterns: z.array(z.string().max(500)).max(20),
  resolvedFailures: z.array(z.string().max(500)).max(20),
  newFailures: z.array(z.string().max(500)).max(20),
  summary: z.string().max(2000),
});

export type RetrospectiveComparison = z.infer<typeof RetrospectiveComparisonSchema>;

/**
 * Compare two retrospective reports to show what changed between periods.
 */
export function compareRetrospectives(
  reportIdA: string,
  reportIdB: string
): RetrospectiveComparison {
  const a = reports.get(reportIdA);
  const b = reports.get(reportIdB);
  if (!a) throw new ValidationError(`Report not found: ${reportIdA}`);
  if (!b) throw new ValidationError(`Report not found: ${reportIdB}`);

  const healthScoreChange = Math.round((b.overallHealthScore - a.overallHealthScore) * 100) / 100;

  // Success rate from velocity trends
  const avgSuccessRate = (trends: VelocityTrend[]) =>
    trends.length > 0 ? trends.reduce((s, t) => s + t.successRate, 0) / trends.length : 0;
  const successRateChange =
    Math.round((avgSuccessRate(b.velocityTrends) - avgSuccessRate(a.velocityTrends)) * 1000) / 1000;

  // Velocity: ideas shipped per period
  const avgVelocity = (trends: VelocityTrend[]) =>
    trends.length > 0 ? trends.reduce((s, t) => s + t.ideasShipped, 0) / trends.length : 0;
  const velocityChange =
    Math.round((avgVelocity(b.velocityTrends) - avgVelocity(a.velocityTrends)) * 100) / 100;

  // Pattern diffs
  const aTitles = new Set(a.successPatterns.map((p) => p.title));
  const _bTitles = new Set(b.successPatterns.map((p) => p.title));
  const newPatterns = b.successPatterns.filter((p) => !aTitles.has(p.title)).map((p) => p.title);

  const aFailures = new Set(a.failureModes.map((f) => f.title));
  const bFailures = new Set(b.failureModes.map((f) => f.title));
  const resolvedFailures = a.failureModes
    .filter((f) => !bFailures.has(f.title))
    .map((f) => f.title);
  const newFailures = b.failureModes.filter((f) => !aFailures.has(f.title)).map((f) => f.title);

  // Summary
  const parts: string[] = [];
  if (healthScoreChange > 0) parts.push(`Health score improved by ${healthScoreChange}`);
  else if (healthScoreChange < 0)
    parts.push(`Health score declined by ${Math.abs(healthScoreChange)}`);
  else parts.push("Health score unchanged");
  if (newPatterns.length > 0) parts.push(`${newPatterns.length} new success pattern(s) emerged`);
  if (resolvedFailures.length > 0)
    parts.push(`${resolvedFailures.length} failure mode(s) resolved`);
  if (newFailures.length > 0) parts.push(`${newFailures.length} new failure mode(s) detected`);

  return RetrospectiveComparisonSchema.parse({
    reportIdA,
    reportIdB,
    periodA: a.period,
    periodB: b.period,
    healthScoreChange,
    successRateChange,
    velocityChange,
    newPatterns,
    resolvedFailures,
    newFailures,
    summary: parts.join(". ") + ".",
  });
}

// ---- Markdown Export ----

/**
 * Export a retrospective report as formatted Markdown.
 */
export function retrospectiveToMarkdown(report: RetrospectiveReport): string {
  const lines: string[] = [];

  lines.push(`# Retrospective Report: ${report.period}`);
  lines.push("");
  lines.push(`**ID:** ${report.id}  `);
  lines.push(`**Generated:** ${report.generatedAt}  `);
  lines.push(`**Ideas Tracked:** ${report.totalIdeasTracked}  `);
  lines.push(`**Health Score:** ${report.overallHealthScore}/10`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  if (report.topPerformingAngles.length > 0) {
    lines.push("## Top Performing Angles");
    lines.push("");
    for (const angle of report.topPerformingAngles) {
      lines.push(`- ${angle}`);
    }
    lines.push("");
  }

  if (report.successPatterns.length > 0) {
    lines.push("## Success Patterns");
    lines.push("");
    for (const p of report.successPatterns) {
      lines.push(`### ${p.title}`);
      lines.push("");
      lines.push(p.description);
      lines.push("");
      lines.push(`- **Frequency:** ${p.frequency}`);
      lines.push(`- **Applicability:** ${p.applicability}`);
      if (p.exampleIdeas.length > 0) {
        lines.push(`- **Examples:** ${p.exampleIdeas.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (report.failureModes.length > 0) {
    lines.push("## Failure Modes");
    lines.push("");
    for (const f of report.failureModes) {
      lines.push(`### ${f.title}`);
      lines.push("");
      lines.push(f.description);
      lines.push("");
      lines.push(`- **Frequency:** ${f.frequency}`);
      lines.push(`- **Root Cause:** ${f.rootCause}`);
      lines.push(`- **Prevention:** ${f.prevention}`);
      if (f.exampleIdeas.length > 0) {
        lines.push(`- **Examples:** ${f.exampleIdeas.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (report.velocityTrends.length > 0) {
    lines.push("## Velocity Trends");
    lines.push("");
    lines.push(
      "| Period | Generated | Shipped | Success Rate | Avg Time to Ship | Innovation Score |"
    );
    lines.push(
      "|--------|-----------|---------|--------------|------------------|------------------|"
    );
    for (const t of report.velocityTrends) {
      const avgTime =
        t.averageTimeToShip !== undefined ? `${t.averageTimeToShip.toFixed(1)}d` : "N/A";
      lines.push(
        `| ${t.period} | ${t.ideasGenerated} | ${t.ideasShipped} | ${(t.successRate * 100).toFixed(1)}% | ${avgTime} | ${t.innovationScore.toFixed(1)} |`
      );
    }
    lines.push("");
  }

  if (report.diminishingReturns.length > 0) {
    lines.push("## Diminishing Returns Alerts");
    lines.push("");
    for (const d of report.diminishingReturns) {
      lines.push(`### ⚠️ ${d.area}`);
      lines.push("");
      lines.push(d.description);
      lines.push("");
      lines.push(`- **Confidence:** ${(d.confidenceLevel * 100).toFixed(0)}%`);
      lines.push(`- **Recommendation:** ${d.recommendation}`);
      lines.push("");
    }
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (let i = 0; i < report.recommendations.length; i++) {
      lines.push(`${i + 1}. ${report.recommendations[i]}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
