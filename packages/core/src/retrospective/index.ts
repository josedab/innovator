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
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

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
        throw new Error(`Failed to parse retrospective response as JSON: ${jsonStr.slice(0, 200)}`);
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
