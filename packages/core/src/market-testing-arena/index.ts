/**
 * @module market-testing-arena
 *
 * Synthetic Market Testing Arena: agent-based simulation where thousands of
 * AI-generated consumer personas interact with idea products in a virtual market.
 * Provides segment adoption heatmaps and pricing sensitivity analysis.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for a consumer persona. */
export const ConsumerPersonaSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  age: z.number().min(13).max(100),
  income: z.enum(["low", "lower-middle", "middle", "upper-middle", "high"]),
  techSavviness: z.number().min(0).max(1),
  riskTolerance: z.number().min(0).max(1),
  priceElasticity: z.number().min(0).max(2),
  segment: z.string().max(200),
  needs: z.array(z.string().max(200)).max(5),
  painPoints: z.array(z.string().max(200)).max(5),
  adoptionType: z.enum(["innovator", "early-adopter", "early-majority", "late-majority", "laggard"]),
});

/** Schema for a persona interaction outcome. */
export const InteractionOutcomeSchema = z.object({
  personaId: z.string().max(100),
  purchased: z.boolean(),
  willingnessToPayUsd: z.number().min(0),
  satisfaction: z.number().min(0).max(1),
  referralLikelihood: z.number().min(0).max(1),
  concerns: z.array(z.string().max(200)).max(5),
  alternativeConsidered: z.string().max(200).optional(),
});

/** Schema for segment analysis. */
export const SegmentAnalysisSchema = z.object({
  segment: z.string().max(200),
  personaCount: z.number().min(0),
  adoptionRate: z.number().min(0).max(1),
  avgWillingnessToPayUsd: z.number().min(0),
  avgSatisfaction: z.number().min(0).max(1),
  topConcerns: z.array(z.string().max(200)).max(5),
  recommendation: z.string().max(500),
});

/** Schema for pricing sensitivity data point. */
export const PricingSensitivityPointSchema = z.object({
  priceUsd: z.number().min(0),
  demandPercent: z.number().min(0).max(100),
  revenueIndex: z.number().min(0),
});

/** Schema for the full market test result. */
export const MarketTestResultSchema = z.object({
  ideaTitle: z.string().max(500),
  totalPersonas: z.number().min(0),
  overallAdoptionRate: z.number().min(0).max(1),
  segmentAnalysis: z.array(SegmentAnalysisSchema).max(20),
  pricingSensitivity: z.array(PricingSensitivityPointSchema).max(20),
  optimalPriceUsd: z.number().min(0),
  projectedRevenue: z.number().min(0),
  topInsights: z.array(z.string().max(500)).max(10),
  marketViability: z.enum(["high", "moderate", "low", "not-viable"]),
  confidenceLevel: z.number().min(0).max(1),
  simulatedAt: z.string(),
});

// ---- Types ----

export type ConsumerPersona = z.infer<typeof ConsumerPersonaSchema>;
export type InteractionOutcome = z.infer<typeof InteractionOutcomeSchema>;
export type SegmentAnalysis = z.infer<typeof SegmentAnalysisSchema>;
export type PricingSensitivityPoint = z.infer<typeof PricingSensitivityPointSchema>;
export type MarketTestResult = z.infer<typeof MarketTestResultSchema>;

// ---- In-memory store ----

const marketTests: Map<string, MarketTestResult> = new Map();

// ---- Persona generation (heuristic for scale) ----

const SEGMENTS = [
  "tech-enthusiasts", "small-business-owners", "enterprise-buyers",
  "students", "freelancers", "healthcare-professionals",
  "educators", "creative-professionals", "government",
  "retail-consumers",
];

const ADOPTION_TYPES: ConsumerPersona["adoptionType"][] = [
  "innovator", "early-adopter", "early-majority", "late-majority", "laggard",
];

/**
 * Generate a batch of consumer personas heuristically (no LLM call).
 */
export function generatePersonas(count: number = 1000, segments?: string[]): ConsumerPersona[] {
  const targetSegments = segments ?? SEGMENTS;
  const personas: ConsumerPersona[] = [];
  const clampedCount = Math.min(Math.max(count, 10), 10000);

  for (let i = 0; i < clampedCount; i++) {
    const segment = targetSegments[i % targetSegments.length];
    const adoptionIdx = Math.floor(Math.random() * 100);
    const adoptionType: ConsumerPersona["adoptionType"] =
      adoptionIdx < 3 ? "innovator" :
      adoptionIdx < 16 ? "early-adopter" :
      adoptionIdx < 50 ? "early-majority" :
      adoptionIdx < 84 ? "late-majority" : "laggard";

    const incomes: ConsumerPersona["income"][] = ["low", "lower-middle", "middle", "upper-middle", "high"];

    personas.push({
      id: `persona-${i}`,
      name: `Persona ${i + 1}`,
      age: 18 + Math.floor(Math.random() * 55),
      income: incomes[Math.floor(Math.random() * incomes.length)],
      techSavviness: Math.random(),
      riskTolerance: Math.random(),
      priceElasticity: 0.2 + Math.random() * 1.6,
      segment,
      needs: [],
      painPoints: [],
      adoptionType,
    });
  }

  return personas;
}

/**
 * Simulate persona interactions with a product idea.
 */
function simulateInteractions(
  personas: ConsumerPersona[],
  ideaAppeal: number,
  basePrice: number
): InteractionOutcome[] {
  return personas.map((p) => {
    const techFit = p.techSavviness * 0.3;
    const riskFit = p.riskTolerance * 0.2;
    const adoptionBoost =
      p.adoptionType === "innovator" ? 0.3 :
      p.adoptionType === "early-adopter" ? 0.2 :
      p.adoptionType === "early-majority" ? 0.05 :
      p.adoptionType === "late-majority" ? -0.1 : -0.25;
    const noise = (Math.random() - 0.5) * 0.2;

    const purchaseProbability = Math.max(0, Math.min(1,
      ideaAppeal * 0.5 + techFit + riskFit + adoptionBoost + noise
    ));
    const purchased = Math.random() < purchaseProbability;
    const wtp = basePrice * (0.5 + purchaseProbability) * (1 / Math.max(0.3, p.priceElasticity));

    return {
      personaId: p.id,
      purchased,
      willingnessToPayUsd: Math.round(wtp * 100) / 100,
      satisfaction: purchased ? Math.min(1, purchaseProbability + Math.random() * 0.2) : 0,
      referralLikelihood: purchased ? Math.min(1, purchaseProbability * 0.8 + Math.random() * 0.2) : 0,
      concerns: [],
    };
  });
}

/** Options for market testing. */
export interface MarketTestOptions {
  model?: string;
  signal?: AbortSignal;
  personaCount?: number;
  segments?: string[];
  basePrice?: number;
}

/**
 * Run a synthetic market test for an idea.
 */
export async function runMarketTest(
  idea: InnovationIdea,
  options: MarketTestOptions = {},
  context?: { investigation?: Investigation }
): Promise<MarketTestResult> {
  if (!idea.title || idea.title.trim().length === 0) {
    throw new Error("Idea title is required");
  }

  // Get LLM assessment for idea appeal and insights
  const prompt = `Assess this product idea for market testing simulation.

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
${context?.investigation ? `Context: ${sanitizeUserInput(context.investigation.summary)}` : ""}

Respond with JSON:
{
  "appealScore": <0-1, how broadly appealing this idea is>,
  "suggestedPriceUsd": <reasonable price point>,
  "topInsights": ["insight 1", "insight 2", ...up to 10],
  "segmentFit": {
    "tech-enthusiasts": <0-1>,
    "small-business-owners": <0-1>,
    "enterprise-buyers": <0-1>,
    "students": <0-1>,
    "freelancers": <0-1>,
    "healthcare-professionals": <0-1>,
    "educators": <0-1>,
    "creative-professionals": <0-1>,
    "government": <0-1>,
    "retail-consumers": <0-1>
  }
}`;

  const assessment = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new Error(`Failed to parse market assessment: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal: options.signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );
  const appealScore = Math.max(0, Math.min(1, (assessment.appealScore as number) ?? 0.5));
  const basePrice = options.basePrice ?? (assessment.suggestedPriceUsd as number) ?? 29;

  const personas = generatePersonas(options.personaCount ?? 1000, options.segments);
  const outcomes = simulateInteractions(personas, appealScore, basePrice);

  // Aggregate segment analysis
  const segmentMap = new Map<string, { outcomes: InteractionOutcome[]; personas: ConsumerPersona[] }>();
  for (let i = 0; i < personas.length; i++) {
    const seg = personas[i].segment;
    if (!segmentMap.has(seg)) segmentMap.set(seg, { outcomes: [], personas: [] });
    segmentMap.get(seg)!.outcomes.push(outcomes[i]);
    segmentMap.get(seg)!.personas.push(personas[i]);
  }

  const segmentAnalysis: SegmentAnalysis[] = Array.from(segmentMap.entries()).map(([segment, data]) => {
    const adoptionRate = data.outcomes.filter((o) => o.purchased).length / data.outcomes.length;
    const avgWtp = data.outcomes.reduce((sum, o) => sum + o.willingnessToPayUsd, 0) / data.outcomes.length;
    const avgSat = data.outcomes.filter((o) => o.purchased).reduce((sum, o) => sum + o.satisfaction, 0) /
      Math.max(1, data.outcomes.filter((o) => o.purchased).length);

    return {
      segment,
      personaCount: data.personas.length,
      adoptionRate,
      avgWillingnessToPayUsd: Math.round(avgWtp * 100) / 100,
      avgSatisfaction: Math.round(avgSat * 100) / 100,
      topConcerns: [],
      recommendation: adoptionRate > 0.5 ? "Strong target segment" :
        adoptionRate > 0.3 ? "Moderate potential — needs positioning" :
        "Low fit — consider deprioritizing",
    };
  });

  // Pricing sensitivity curve
  const pricePoints = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0].map((mult) => basePrice * mult);
  const pricingSensitivity: PricingSensitivityPoint[] = pricePoints.map((price) => {
    const demandPercent = outcomes.filter((o) => o.willingnessToPayUsd >= price).length / outcomes.length * 100;
    return {
      priceUsd: Math.round(price * 100) / 100,
      demandPercent: Math.round(demandPercent * 10) / 10,
      revenueIndex: Math.round(price * demandPercent) / 100,
    };
  });

  const optimalPrice = pricingSensitivity.reduce((best, pt) =>
    pt.revenueIndex > best.revenueIndex ? pt : best, pricingSensitivity[0]);

  const overallAdoption = outcomes.filter((o) => o.purchased).length / outcomes.length;
  const viability: MarketTestResult["marketViability"] =
    overallAdoption > 0.5 ? "high" :
    overallAdoption > 0.3 ? "moderate" :
    overallAdoption > 0.1 ? "low" : "not-viable";

  const result: MarketTestResult = {
    ideaTitle: idea.title,
    totalPersonas: personas.length,
    overallAdoptionRate: Math.round(overallAdoption * 1000) / 1000,
    segmentAnalysis,
    pricingSensitivity,
    optimalPriceUsd: optimalPrice.priceUsd,
    projectedRevenue: Math.round(optimalPrice.revenueIndex * personas.length),
    topInsights: (assessment.topInsights as string[]) ?? [],
    marketViability: viability,
    confidenceLevel: Math.min(0.95, 0.5 + personas.length / 5000),
    simulatedAt: new Date().toISOString(),
  };

  const id = `market-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  marketTests.set(id, result);

  return result;
}

/**
 * Get a stored market test by ID.
 */
export function getMarketTest(id: string): MarketTestResult | undefined {
  return marketTests.get(id);
}

/**
 * List all stored market tests.
 */
export function listMarketTests(): Array<{ id: string; ideaTitle: string; simulatedAt: string }> {
  return Array.from(marketTests.entries()).map(([id, t]) => ({
    id,
    ideaTitle: t.ideaTitle,
    simulatedAt: t.simulatedAt,
  }));
}

/**
 * Clear all stored market tests.
 */
export function clearMarketTests(): void {
  marketTests.clear();
}

/**
 * Convert market test results to Markdown.
 */
export function marketTestToMarkdown(result: MarketTestResult): string {
  const lines: string[] = [];

  lines.push(`# Market Test: ${result.ideaTitle}\n`);
  lines.push(`*Simulated: ${result.simulatedAt}*\n`);

  lines.push(`## Overview\n`);
  lines.push(`- **Total Personas:** ${result.totalPersonas.toLocaleString()}`);
  lines.push(`- **Overall Adoption:** ${(result.overallAdoptionRate * 100).toFixed(1)}%`);
  lines.push(`- **Market Viability:** ${result.marketViability}`);
  lines.push(`- **Optimal Price:** $${result.optimalPriceUsd}`);
  lines.push(`- **Projected Revenue Index:** ${result.projectedRevenue.toLocaleString()}`);
  lines.push(`- **Confidence:** ${(result.confidenceLevel * 100).toFixed(0)}%\n`);

  lines.push(`## Segment Analysis\n`);
  lines.push(`| Segment | Personas | Adoption | Avg WTP | Satisfaction |`);
  lines.push(`|---------|----------|----------|---------|-------------|`);
  for (const s of result.segmentAnalysis.sort((a, b) => b.adoptionRate - a.adoptionRate)) {
    lines.push(`| ${s.segment} | ${s.personaCount} | ${(s.adoptionRate * 100).toFixed(1)}% | $${s.avgWillingnessToPayUsd} | ${(s.avgSatisfaction * 100).toFixed(0)}% |`);
  }

  lines.push(`\n## Pricing Sensitivity\n`);
  lines.push(`| Price | Demand % | Revenue Index |`);
  lines.push(`|-------|----------|---------------|`);
  for (const p of result.pricingSensitivity) {
    const marker = p.priceUsd === result.optimalPriceUsd ? " ← optimal" : "";
    lines.push(`| $${p.priceUsd} | ${p.demandPercent.toFixed(1)}% | ${p.revenueIndex.toFixed(1)}${marker} |`);
  }

  if (result.topInsights.length > 0) {
    lines.push(`\n## Key Insights\n`);
    for (const insight of result.topInsights) lines.push(`- ${insight}`);
  }

  return lines.join("\n");
}
