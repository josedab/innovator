/**
 * @module impact-simulator
 *
 * Idea Impact Simulator: generates 12-month rollout simulations for top-scored
 * ideas including adoption curve, resource requirements, milestones, and
 * go/no-go decision points. Supports optimistic, baseline, and pessimistic scenarios.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { LlmParseError } from "../errors.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for a monthly data point in the simulation. */
export const MonthlyDataPointSchema = z.object({
  month: z.number().min(1).max(12),
  adoptionPercent: z.number().min(0).max(100),
  revenue: z.number().min(0).optional(),
  users: z.number().min(0).optional(),
  cost: z.number().min(0),
  cumulativeInvestment: z.number().min(0),
  keyActivity: z.string().max(500),
});

/** Schema for a milestone. */
export const MilestoneSchema = z.object({
  month: z.number().min(1).max(12),
  title: z.string().max(500),
  description: z.string().max(2000),
  type: z.enum(["launch", "growth", "pivot-point", "scale", "maturity"]),
  successMetric: z.string().max(500),
  isGoNoGo: z.boolean(),
});

/** Schema for resource requirements. */
export const ResourceRequirementSchema = z.object({
  category: z.enum(["engineering", "design", "marketing", "operations", "leadership", "external"]),
  description: z.string().max(1000),
  headcount: z.number().min(0).optional(),
  monthlyCost: z.number().min(0),
  startMonth: z.number().min(1).max(12),
  endMonth: z.number().min(1).max(12),
});

/** Schema for a go/no-go decision point. */
export const DecisionPointSchema = z.object({
  month: z.number().min(1).max(12),
  title: z.string().max(500),
  criteria: z.array(z.string().max(500)).max(10),
  goThreshold: z.string().max(500),
  noGoThreshold: z.string().max(500),
  fallbackPlan: z.string().max(1000),
});

/** Schema for a single scenario simulation. */
export const ScenarioSimulationSchema = z.object({
  type: z.enum(["optimistic", "baseline", "pessimistic"]),
  probability: z.number().min(0).max(1),
  assumptions: z.array(z.string().max(500)).max(10),
  monthlyData: z.array(MonthlyDataPointSchema).max(12),
  totalInvestment: z.number().min(0),
  projectedROI: z.number(),
  breakEvenMonth: z.number().min(0).max(12).optional(),
  riskFactors: z.array(z.string().max(500)).max(10),
});

/** Schema for the full impact simulation. */
export const ImpactSimulationSchema = z.object({
  ideaTitle: z.string().max(500),
  simulatedAt: z.string(),
  scenarios: z.array(ScenarioSimulationSchema).max(3),
  milestones: z.array(MilestoneSchema).max(20),
  resources: z.array(ResourceRequirementSchema).max(20),
  decisionPoints: z.array(DecisionPointSchema).max(10),
  overallRecommendation: z.string().max(2000),
  confidenceLevel: z.number().min(0).max(1),
});

// ---- Types ----

export type MonthlyDataPoint = z.infer<typeof MonthlyDataPointSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type ResourceRequirement = z.infer<typeof ResourceRequirementSchema>;
export type DecisionPoint = z.infer<typeof DecisionPointSchema>;
export type ScenarioSimulation = z.infer<typeof ScenarioSimulationSchema>;
export type ImpactSimulation = z.infer<typeof ImpactSimulationSchema>;

// ---- In-memory store ----

const simulations: Map<string, ImpactSimulation> = new Map();

// ---- Prompt builder ----

function buildSimulationPrompt(
  idea: InnovationIdea,
  context?: { investigation?: Investigation; marketSize?: string; teamSize?: number }
): string {
  const contextInfo = context?.investigation
    ? `\nCONTEXT:\nSummary: ${context.investigation.summary}\nOpportunities: ${context.investigation.opportunities.join("; ")}`
    : "";

  const constraints = [
    context?.marketSize ? `Market size: ${context.marketSize}` : null,
    context?.teamSize ? `Team size: ${context.teamSize}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a strategic planning expert specializing in innovation rollout simulations. Generate a detailed 12-month rollout simulation.

${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL_IMPACT", idea.potentialImpact)}
${wrapUserInput("IMPLEMENTATION_HINT", idea.implementationHint)}
${contextInfo}
${constraints ? `\nCONSTRAINTS:\n${constraints}` : ""}

Generate a 12-month simulation with:
1. **scenarios**: Three scenarios (optimistic, baseline, pessimistic) each with monthly data points (adoption, costs, key activities), total investment, projected ROI, and risk factors
2. **milestones**: Key milestones across the 12 months with success metrics
3. **resources**: Required resources by category with timing and costs
4. **decisionPoints**: Go/no-go decision points with criteria and thresholds

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "ideaTitle": "exact title",
  "scenarios": [
    {
      "type": "baseline",
      "probability": 0.5,
      "assumptions": ["assumption 1"],
      "monthlyData": [
        { "month": 1, "adoptionPercent": 0, "cost": 50000, "cumulativeInvestment": 50000, "keyActivity": "Development" }
      ],
      "totalInvestment": 600000,
      "projectedROI": 2.5,
      "breakEvenMonth": 8,
      "riskFactors": ["risk 1"]
    }
  ],
  "milestones": [
    { "month": 3, "title": "MVP Launch", "description": "desc", "type": "launch", "successMetric": "100 beta users", "isGoNoGo": true }
  ],
  "resources": [
    { "category": "engineering", "description": "Full-stack developers", "headcount": 3, "monthlyCost": 45000, "startMonth": 1, "endMonth": 12 }
  ],
  "decisionPoints": [
    { "month": 3, "title": "MVP Go/No-Go", "criteria": ["50+ beta signups"], "goThreshold": "50+ signups", "noGoThreshold": "<20 signups", "fallbackPlan": "Pivot to B2B" }
  ],
  "overallRecommendation": "recommendation",
  "confidenceLevel": 0.7
}`;
}

// ---- Core functions ----

/**
 * Generate a 12-month impact simulation for an idea.
 */
export async function simulateImpact(
  idea: InnovationIdea,
  context?: {
    investigation?: Investigation;
    marketSize?: string;
    teamSize?: number;
  },
  model?: string,
  signal?: AbortSignal
): Promise<ImpactSimulation> {
  const prompt = buildSimulationPrompt(idea, context);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse simulation response as JSON: ${jsonStr.slice(0, 200)}`,
          jsonStr
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

  const simulation: ImpactSimulation = {
    ...ImpactSimulationSchema.omit({ simulatedAt: true }).parse(parsed),
    simulatedAt: new Date().toISOString(),
  };

  simulations.set(idea.title, simulation);
  return simulation;
}

/**
 * Get a stored simulation by idea title.
 */
export function getSimulation(ideaTitle: string): ImpactSimulation | undefined {
  return simulations.get(ideaTitle);
}

/**
 * List all stored simulations.
 */
export function listSimulations(): ImpactSimulation[] {
  return Array.from(simulations.values());
}

/**
 * Clear all stored simulations.
 */
export function clearSimulations(): void {
  simulations.clear();
}

/**
 * Calculate the total resource cost across all categories.
 */
export function calculateTotalResourceCost(resources: ResourceRequirement[]): number {
  return resources.reduce((total, r) => {
    const months = r.endMonth - r.startMonth + 1;
    return total + r.monthlyCost * months;
  }, 0);
}

/**
 * Get milestones that are go/no-go decision points.
 */
export function getGoNoGoMilestones(simulation: ImpactSimulation): Milestone[] {
  return simulation.milestones.filter((m) => m.isGoNoGo);
}

/**
 * Compare scenarios to find the expected value of an investment.
 */
export function calculateExpectedROI(scenarios: ScenarioSimulation[]): number {
  if (scenarios.length === 0) return 0;

  const totalWeight = scenarios.reduce((sum, s) => sum + s.probability, 0);
  if (totalWeight === 0) return 0;

  return scenarios.reduce((sum, s) => sum + s.projectedROI * (s.probability / totalWeight), 0);
}

/**
 * Generate a summary timeline of key events.
 */
export function generateTimeline(
  simulation: ImpactSimulation
): Array<{ month: number; event: string; type: string }> {
  const events: Array<{ month: number; event: string; type: string }> = [];

  for (const milestone of simulation.milestones) {
    events.push({
      month: milestone.month,
      event: milestone.title,
      type: milestone.isGoNoGo ? "decision" : "milestone",
    });
  }

  for (const dp of simulation.decisionPoints) {
    events.push({
      month: dp.month,
      event: dp.title,
      type: "go-no-go",
    });
  }

  return events.sort((a, b) => a.month - b.month);
}

// ---- Monte Carlo Simulation ----

export const MonteCarloInputSchema = z.object({
  marketSizeMin: z.number().min(0),
  marketSizeMax: z.number().min(0),
  implementationCostMin: z.number().min(0),
  implementationCostMax: z.number().min(0),
  adoptionRateMin: z.number().min(0).max(1),
  adoptionRateMax: z.number().min(0).max(1),
  revenuePerUserMin: z.number().min(0).optional(),
  revenuePerUserMax: z.number().min(0).optional(),
  timeToMarketMonthsMin: z.number().min(1).max(36).optional(),
  timeToMarketMonthsMax: z.number().min(1).max(36).optional(),
});

export const MonteCarloResultSchema = z.object({
  ideaTitle: z.string().max(500),
  iterations: z.number(),
  roiDistribution: z.object({
    mean: z.number(),
    median: z.number(),
    stdDev: z.number(),
    p5: z.number(),
    p25: z.number(),
    p75: z.number(),
    p95: z.number(),
    min: z.number(),
    max: z.number(),
  }),
  breakEvenProbability: z.number().min(0).max(1),
  positiveProbability: z.number().min(0).max(1),
  sensitivityAnalysis: z
    .array(
      z.object({
        variable: z.string().max(200),
        lowValue: z.number(),
        highValue: z.number(),
        lowROI: z.number(),
        highROI: z.number(),
        sensitivity: z.number(),
      })
    )
    .max(10),
  histogram: z
    .array(
      z.object({
        bucketMin: z.number(),
        bucketMax: z.number(),
        count: z.number(),
        percentage: z.number(),
      })
    )
    .max(50),
  scenarioComparison: z.object({
    optimistic: z.object({ roi: z.number(), probability: z.number() }),
    base: z.object({ roi: z.number(), probability: z.number() }),
    pessimistic: z.object({ roi: z.number(), probability: z.number() }),
  }),
});

export type MonteCarloInput = z.infer<typeof MonteCarloInputSchema>;
export type MonteCarloResult = z.infer<typeof MonteCarloResultSchema>;

function randomUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomTriangular(min: number, mode: number, max: number): number {
  const u = Math.random();
  const fc = (mode - min) / (max - min);
  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * Run Monte Carlo simulation for an idea's impact.
 * Models uncertainty in market size, implementation cost, and adoption rate.
 */
export function runMonteCarloSimulation(
  ideaTitle: string,
  input: MonteCarloInput,
  iterations: number = 10000
): MonteCarloResult {
  const rois: number[] = [];
  const capped = Math.min(Math.max(iterations, 100), 100000);

  for (let i = 0; i < capped; i++) {
    const marketSize = randomTriangular(
      input.marketSizeMin,
      (input.marketSizeMin + input.marketSizeMax) / 2,
      input.marketSizeMax
    );
    const cost = randomTriangular(
      input.implementationCostMin,
      (input.implementationCostMin + input.implementationCostMax) / 2,
      input.implementationCostMax
    );
    const adoptionRate = randomUniform(input.adoptionRateMin, input.adoptionRateMax);
    const revenuePerUser =
      input.revenuePerUserMin !== undefined && input.revenuePerUserMax !== undefined
        ? randomUniform(input.revenuePerUserMin, input.revenuePerUserMax)
        : 1;

    const revenue = marketSize * adoptionRate * revenuePerUser;
    const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
    rois.push(roi);
  }

  rois.sort((a, b) => a - b);
  const n = rois.length;
  const mean = rois.reduce((s, r) => s + r, 0) / n;
  const variance = rois.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => rois[Math.floor((p / 100) * (n - 1))];
  const median = percentile(50);

  // Build histogram
  const bucketCount = 20;
  const minROI = rois[0];
  const maxROI = rois[n - 1];
  const bucketSize = (maxROI - minROI) / bucketCount || 1;
  const histogram: MonteCarloResult["histogram"] = [];
  for (let i = 0; i < bucketCount; i++) {
    const bucketMin = minROI + i * bucketSize;
    const bucketMax = bucketMin + bucketSize;
    const count = rois.filter(
      (r) => r >= bucketMin && (i === bucketCount - 1 ? r <= bucketMax : r < bucketMax)
    ).length;
    histogram.push({
      bucketMin: Math.round(bucketMin * 100) / 100,
      bucketMax: Math.round(bucketMax * 100) / 100,
      count,
      percentage: Math.round((count / n) * 10000) / 100,
    });
  }

  // Sensitivity analysis (tornado diagram data)
  const baseMarket = (input.marketSizeMin + input.marketSizeMax) / 2;
  const baseCost = (input.implementationCostMin + input.implementationCostMax) / 2;
  const baseAdoption = (input.adoptionRateMin + input.adoptionRateMax) / 2;
  const baseRevPerUser = (input.revenuePerUserMin ?? 1 + (input.revenuePerUserMax ?? 1)) / 2;
  const _baseROI =
    baseCost > 0 ? ((baseMarket * baseAdoption * baseRevPerUser - baseCost) / baseCost) * 100 : 0;

  const calcROI = (market: number, cost: number, adoption: number, rev: number) =>
    cost > 0 ? ((market * adoption * rev - cost) / cost) * 100 : 0;

  const sensitivityAnalysis = [
    {
      variable: "Market Size",
      lowValue: input.marketSizeMin,
      highValue: input.marketSizeMax,
      lowROI:
        Math.round(calcROI(input.marketSizeMin, baseCost, baseAdoption, baseRevPerUser) * 100) /
        100,
      highROI:
        Math.round(calcROI(input.marketSizeMax, baseCost, baseAdoption, baseRevPerUser) * 100) /
        100,
      sensitivity: 0,
    },
    {
      variable: "Implementation Cost",
      lowValue: input.implementationCostMin,
      highValue: input.implementationCostMax,
      lowROI:
        Math.round(
          calcROI(baseMarket, input.implementationCostMin, baseAdoption, baseRevPerUser) * 100
        ) / 100,
      highROI:
        Math.round(
          calcROI(baseMarket, input.implementationCostMax, baseAdoption, baseRevPerUser) * 100
        ) / 100,
      sensitivity: 0,
    },
    {
      variable: "Adoption Rate",
      lowValue: input.adoptionRateMin,
      highValue: input.adoptionRateMax,
      lowROI:
        Math.round(calcROI(baseMarket, baseCost, input.adoptionRateMin, baseRevPerUser) * 100) /
        100,
      highROI:
        Math.round(calcROI(baseMarket, baseCost, input.adoptionRateMax, baseRevPerUser) * 100) /
        100,
      sensitivity: 0,
    },
  ];
  // Calculate sensitivity as absolute ROI range
  for (const s of sensitivityAnalysis) {
    s.sensitivity = Math.round(Math.abs(s.highROI - s.lowROI) * 100) / 100;
  }
  sensitivityAnalysis.sort((a, b) => b.sensitivity - a.sensitivity);

  // Scenario comparison
  const breakEvenProbability = rois.filter((r) => r >= 0).length / n;

  return MonteCarloResultSchema.parse({
    ideaTitle,
    iterations: capped,
    roiDistribution: {
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      p5: Math.round(percentile(5) * 100) / 100,
      p25: Math.round(percentile(25) * 100) / 100,
      p75: Math.round(percentile(75) * 100) / 100,
      p95: Math.round(percentile(95) * 100) / 100,
      min: Math.round(minROI * 100) / 100,
      max: Math.round(maxROI * 100) / 100,
    },
    breakEvenProbability: Math.round(breakEvenProbability * 10000) / 10000,
    positiveProbability: Math.round((rois.filter((r) => r > 0).length / n) * 10000) / 10000,
    sensitivityAnalysis,
    histogram,
    scenarioComparison: {
      pessimistic: { roi: Math.round(percentile(10) * 100) / 100, probability: 0.2 },
      base: { roi: Math.round(median * 100) / 100, probability: 0.6 },
      optimistic: { roi: Math.round(percentile(90) * 100) / 100, probability: 0.2 },
    },
  });
}
