/**
 * @module simulation/scenario
 *
 * Micro-Simulation & Scenario Modeling — generates optimistic, baseline,
 * and pessimistic scenarios per idea with adoption curves, revenue potential,
 * implementation cost, and time-to-market estimates. Includes sensitivity
 * analysis and uncertainty ranges.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";
import { LlmParseError } from "../errors.js";

// ---- Schemas ----

/** Scenario type identifier. */
export const ScenarioTypeSchema = z.enum(["optimistic", "baseline", "pessimistic"]);

/** Adoption curve data point. */
export const AdoptionDataPointSchema = z.object({
  month: z.number().min(0).max(120),
  adoptionPercent: z.number().min(0).max(100),
});

/** A single scenario projection. */
export const ScenarioProjectionSchema = z.object({
  type: ScenarioTypeSchema,
  probability: z.number().min(0).max(1),
  adoptionCurve: z.array(AdoptionDataPointSchema).max(24),
  revenueEstimate: z.object({
    year1: z.string().max(200),
    year3: z.string().max(200),
    year5: z.string().max(200),
  }),
  implementationCost: z.object({
    estimate: z.string().max(200),
    confidence: z.number().min(0).max(1),
    breakdown: z
      .array(
        z.object({
          category: z.string().max(200),
          amount: z.string().max(200),
        })
      )
      .max(10),
  }),
  timeToMarket: z.object({
    months: z.number().min(0).max(120),
    milestones: z
      .array(
        z.object({
          name: z.string().max(200),
          month: z.number().min(0).max(120),
        })
      )
      .max(10),
  }),
  keyAssumptions: z.array(z.string().max(500)).max(10),
  risks: z.array(z.string().max(500)).max(10),
  narrative: z.string().max(2000),
});

/** Sensitivity analysis for a single variable. */
export const SensitivityFactorSchema = z.object({
  variable: z.string().max(200),
  baseValue: z.string().max(200),
  lowCase: z.string().max(200),
  highCase: z.string().max(200),
  impactOnRevenue: z.enum(["low", "medium", "high"]),
  impactOnTimeline: z.enum(["low", "medium", "high"]),
});

/** Full scenario model for a single idea. */
export const ScenarioModelSchema = z.object({
  ideaTitle: z.string().max(500),
  scenarios: z.array(ScenarioProjectionSchema).max(3),
  sensitivityFactors: z.array(SensitivityFactorSchema).max(10),
  overallConfidence: z.number().min(0).max(1),
  recommendation: z.string().max(2000),
});

// ---- Types ----

export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;
export type AdoptionDataPoint = z.infer<typeof AdoptionDataPointSchema>;
export type ScenarioProjection = z.infer<typeof ScenarioProjectionSchema>;
export type SensitivityFactor = z.infer<typeof SensitivityFactorSchema>;
export type ScenarioModel = z.infer<typeof ScenarioModelSchema>;

// ---- Core Functions ----

/**
 * Generate scenario models for a single idea (optimistic/baseline/pessimistic).
 *
 * @param idea - The innovation idea to model
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Full scenario model with three projections
 */
export async function modelScenarios(
  idea: InnovationIdea,
  model?: string,
  signal?: AbortSignal
): Promise<ScenarioModel> {
  const prompt = `You are an expert business analyst and scenario planner.

${wrapUserInput("IDEA", `${idea.title}\n${idea.description}\nPotential Impact: ${idea.potentialImpact}\nImplementation Hint: ${idea.implementationHint}`)}

Generate 3 scenarios for this idea: optimistic, baseline, and pessimistic.

For each scenario provide:
- type: "optimistic" | "baseline" | "pessimistic"
- probability: likelihood this scenario occurs (all three should sum to ~1.0)
- adoptionCurve: 6 data points [{month, adoptionPercent}] over 36 months
- revenueEstimate: {year1, year3, year5} as readable strings (e.g., "$50K-100K")
- implementationCost: {estimate, confidence (0-1), breakdown: [{category, amount}]}
- timeToMarket: {months, milestones: [{name, month}]}
- keyAssumptions: what must be true for this scenario
- risks: what could go wrong
- narrative: brief story of how this plays out

Also provide:
- sensitivityFactors: key variables that most affect outcomes [{variable, baseValue, lowCase, highCase, impactOnRevenue, impactOnTimeline}]
- overallConfidence: 0-1 confidence in these projections
- recommendation: strategic advice based on the scenario analysis

Return valid JSON only:
{
  "ideaTitle": "${sanitizeLlmOutput(idea.title)}",
  "scenarios": [...],
  "sensitivityFactors": [...],
  "overallConfidence": 0.6,
  "recommendation": "..."
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse scenario model: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
    }
  );

  return ScenarioModelSchema.parse(parsed);
}

/**
 * Model scenarios for multiple ideas.
 *
 * @param ideas - Array of ideas to model
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Array of scenario models
 */
export async function modelScenariosBatch(
  ideas: InnovationIdea[],
  model?: string,
  signal?: AbortSignal
): Promise<ScenarioModel[]> {
  const results: ScenarioModel[] = [];
  for (const idea of ideas) {
    if (signal?.aborted) break;
    const result = await modelScenarios(idea, model, signal);
    results.push(result);
  }
  return results;
}

/**
 * Export scenario model as a business case template in Markdown format.
 *
 * @param scenarioModel - The scenario model to export
 * @returns Markdown string
 */
export function scenarioToMarkdown(scenarioModel: ScenarioModel): string {
  const lines: string[] = [
    `# Business Case: ${scenarioModel.ideaTitle}`,
    "",
    `**Overall Confidence:** ${Math.round(scenarioModel.overallConfidence * 100)}%`,
    "",
    "## Scenarios",
    "",
  ];

  for (const scenario of scenarioModel.scenarios) {
    lines.push(
      `### ${scenario.type.charAt(0).toUpperCase() + scenario.type.slice(1)} Scenario (${Math.round(scenario.probability * 100)}% probability)`
    );
    lines.push("");
    lines.push(scenario.narrative);
    lines.push("");
    lines.push(`**Time to Market:** ${scenario.timeToMarket.months} months`);
    lines.push("");
    lines.push("**Revenue Projections:**");
    lines.push(`- Year 1: ${scenario.revenueEstimate.year1}`);
    lines.push(`- Year 3: ${scenario.revenueEstimate.year3}`);
    lines.push(`- Year 5: ${scenario.revenueEstimate.year5}`);
    lines.push("");
    lines.push(
      `**Implementation Cost:** ${scenario.implementationCost.estimate} (confidence: ${Math.round(scenario.implementationCost.confidence * 100)}%)`
    );
    lines.push("");

    if (scenario.implementationCost.breakdown.length > 0) {
      lines.push("| Category | Amount |");
      lines.push("|----------|--------|");
      for (const item of scenario.implementationCost.breakdown) {
        lines.push(`| ${item.category} | ${item.amount} |`);
      }
      lines.push("");
    }

    if (scenario.timeToMarket.milestones.length > 0) {
      lines.push("**Milestones:**");
      for (const ms of scenario.timeToMarket.milestones) {
        lines.push(`- Month ${ms.month}: ${ms.name}`);
      }
      lines.push("");
    }

    if (scenario.keyAssumptions.length > 0) {
      lines.push("**Key Assumptions:**");
      for (const a of scenario.keyAssumptions) {
        lines.push(`- ${a}`);
      }
      lines.push("");
    }

    if (scenario.risks.length > 0) {
      lines.push("**Risks:**");
      for (const r of scenario.risks) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }
  }

  if (scenarioModel.sensitivityFactors.length > 0) {
    lines.push("## Sensitivity Analysis");
    lines.push("");
    lines.push("| Variable | Base | Low | High | Revenue Impact | Timeline Impact |");
    lines.push("|----------|------|-----|------|----------------|-----------------|");
    for (const factor of scenarioModel.sensitivityFactors) {
      lines.push(
        `| ${factor.variable} | ${factor.baseValue} | ${factor.lowCase} | ${factor.highCase} | ${factor.impactOnRevenue} | ${factor.impactOnTimeline} |`
      );
    }
    lines.push("");
  }

  lines.push("## Recommendation");
  lines.push("");
  lines.push(scenarioModel.recommendation);
  lines.push("");

  return lines.join("\n");
}

/**
 * Compare two scenario models side by side.
 *
 * @param modelA - First scenario model
 * @param modelB - Second scenario model
 * @returns Comparison summary
 */
export function compareScenarioModels(
  modelA: ScenarioModel,
  modelB: ScenarioModel
): {
  ideaA: string;
  ideaB: string;
  confidenceComparison: { a: number; b: number };
  baselineRevenueComparison: { a: string; b: string };
  baselineTimeComparison: { a: number; b: number };
  recommendation: string;
} {
  const baseA = modelA.scenarios.find((s) => s.type === "baseline");
  const baseB = modelB.scenarios.find((s) => s.type === "baseline");

  return {
    ideaA: modelA.ideaTitle,
    ideaB: modelB.ideaTitle,
    confidenceComparison: {
      a: modelA.overallConfidence,
      b: modelB.overallConfidence,
    },
    baselineRevenueComparison: {
      a: baseA?.revenueEstimate.year3 ?? "N/A",
      b: baseB?.revenueEstimate.year3 ?? "N/A",
    },
    baselineTimeComparison: {
      a: baseA?.timeToMarket.months ?? 0,
      b: baseB?.timeToMarket.months ?? 0,
    },
    recommendation:
      modelA.overallConfidence >= modelB.overallConfidence
        ? `${modelA.ideaTitle} has higher confidence (${Math.round(modelA.overallConfidence * 100)}% vs ${Math.round(modelB.overallConfidence * 100)}%)`
        : `${modelB.ideaTitle} has higher confidence (${Math.round(modelB.overallConfidence * 100)}% vs ${Math.round(modelA.overallConfidence * 100)}%)`,
  };
}
