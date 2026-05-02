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
        throw new Error(`Failed to parse simulation response as JSON: ${jsonStr.slice(0, 200)}`);
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
