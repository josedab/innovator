/**
 * @module diffusion-simulator
 *
 * Idea Diffusion & Adoption Simulator: models how a generated idea would spread
 * through an organization or market using Bass diffusion models and network
 * propagation. Supports Monte Carlo simulation for uncertainty modeling and
 * LLM-assisted parameter estimation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for Bass diffusion model parameters. */
export const DiffusionParametersSchema = z.object({
  p: z.number().min(0).max(1).describe("Innovation coefficient (external influence)"),
  q: z.number().min(0).max(1).describe("Imitation coefficient (internal influence)"),
  m: z.number().min(1).describe("Total addressable market size"),
  timeHorizon: z.number().min(1).max(120).describe("Months to simulate"),
});

/** Schema for a single time-step in the diffusion curve. */
export const DiffusionDataPointSchema = z.object({
  month: z.number().min(0),
  adopters: z.number().min(0),
  cumulativeAdopters: z.number().min(0),
  adoptionRate: z.number().min(0).max(1),
  marketPenetration: z.number().min(0).max(1),
});

/** Schema for network propagation node. */
export const NetworkNodeSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  type: z.enum(["innovator", "early-adopter", "early-majority", "late-majority", "laggard"]),
  influence: z.number().min(0).max(1),
  adoptionMonth: z.number().min(0).optional(),
  adopted: z.boolean(),
});

/** Schema for a strategy recommendation. */
export const DiffusionStrategySchema = z.object({
  phase: z.enum(["launch", "early-growth", "mainstream", "saturation"]),
  recommendation: z.string().max(500),
  targetSegment: z.string().max(200),
  keyAction: z.string().max(300),
  expectedImpact: z.string().max(300),
});

/** Schema for Monte Carlo simulation result. */
export const MonteCarloResultSchema = z.object({
  iterations: z.number().min(1),
  percentiles: z.object({
    p10: z.array(DiffusionDataPointSchema),
    p50: z.array(DiffusionDataPointSchema),
    p90: z.array(DiffusionDataPointSchema),
  }),
  meanTimeToMainstream: z.number().min(0),
  adoptionProbability: z.number().min(0).max(1),
  confidenceInterval: z.object({
    lower: z.number(),
    upper: z.number(),
    confidence: z.number(),
  }),
});

/** Schema for the full diffusion simulation. */
export const DiffusionSimulationSchema = z.object({
  ideaTitle: z.string().max(500),
  parameters: DiffusionParametersSchema,
  baseCurve: z.array(DiffusionDataPointSchema),
  monteCarlo: MonteCarloResultSchema.optional(),
  network: z.array(NetworkNodeSchema).max(200),
  strategies: z.array(DiffusionStrategySchema).max(10),
  peakAdoptionMonth: z.number().min(0),
  timeToMajority: z.number().min(0),
  summary: z.string().max(2000),
  simulatedAt: z.string(),
});

// ---- Types ----

export type DiffusionParameters = z.infer<typeof DiffusionParametersSchema>;
export type DiffusionDataPoint = z.infer<typeof DiffusionDataPointSchema>;
export type NetworkNode = z.infer<typeof NetworkNodeSchema>;
export type DiffusionStrategy = z.infer<typeof DiffusionStrategySchema>;
export type MonteCarloResult = z.infer<typeof MonteCarloResultSchema>;
export type DiffusionSimulation = z.infer<typeof DiffusionSimulationSchema>;

// ---- In-memory store ----

const diffusionSimulations: Map<string, DiffusionSimulation> = new Map();

// ---- Bass Diffusion Math ----

/**
 * Compute Bass diffusion curve.
 * F(t) = [1 - e^(-(p+q)t)] / [1 + (q/p)e^(-(p+q)t)]
 */
export function computeBassCurve(params: DiffusionParameters): DiffusionDataPoint[] {
  const { p, q, m, timeHorizon } = params;
  const points: DiffusionDataPoint[] = [];
  let cumulative = 0;

  for (let t = 0; t <= timeHorizon; t++) {
    const exp = Math.exp(-(p + q) * t);
    const Ft = q > 0 ? (1 - exp) / (1 + (q / p) * exp) : 1 - exp;
    const newCumulative = Math.round(m * Math.max(0, Math.min(1, Ft)));
    const adopters = Math.max(0, newCumulative - cumulative);
    cumulative = newCumulative;

    points.push({
      month: t,
      adopters,
      cumulativeAdopters: cumulative,
      adoptionRate: timeHorizon > 0 ? adopters / m : 0,
      marketPenetration: m > 0 ? cumulative / m : 0,
    });
  }

  return points;
}

/**
 * Run Monte Carlo simulation with parameter uncertainty.
 */
export function runMonteCarloDiffusion(
  baseParams: DiffusionParameters,
  iterations: number = 500
): MonteCarloResult {
  const clampedIterations = Math.min(Math.max(iterations, 10), 5000);
  const allCurves: DiffusionDataPoint[][] = [];

  for (let i = 0; i < clampedIterations; i++) {
    const perturbedParams: DiffusionParameters = {
      p: Math.max(0.001, baseParams.p * (0.5 + Math.random())),
      q: Math.max(0.001, baseParams.q * (0.5 + Math.random())),
      m: Math.round(baseParams.m * (0.7 + Math.random() * 0.6)),
      timeHorizon: baseParams.timeHorizon,
    };
    allCurves.push(computeBassCurve(perturbedParams));
  }

  const getPercentile = (pct: number): DiffusionDataPoint[] => {
    const result: DiffusionDataPoint[] = [];
    for (let t = 0; t <= baseParams.timeHorizon; t++) {
      const values = allCurves
        .map((c) => c[t]?.cumulativeAdopters ?? 0)
        .sort((a, b) => a - b);
      const idx = Math.min(Math.floor(pct * values.length), values.length - 1);
      const adopters = t > 0 ? Math.max(0, values[idx] - (result[t - 1]?.cumulativeAdopters ?? 0)) : values[idx];
      result.push({
        month: t,
        adopters,
        cumulativeAdopters: values[idx],
        adoptionRate: baseParams.m > 0 ? adopters / baseParams.m : 0,
        marketPenetration: baseParams.m > 0 ? values[idx] / baseParams.m : 0,
      });
    }
    return result;
  };

  const mainstreamTimes = allCurves.map((curve) => {
    const idx = curve.findIndex((pt) => pt.marketPenetration >= 0.5);
    return idx >= 0 ? idx : baseParams.timeHorizon;
  });
  const meanTimeToMainstream = mainstreamTimes.reduce((a, b) => a + b, 0) / clampedIterations;
  const adoptionCount = mainstreamTimes.filter((t) => t < baseParams.timeHorizon).length;

  const sortedTimes = [...mainstreamTimes].sort((a, b) => a - b);
  const lowerIdx = Math.floor(0.05 * sortedTimes.length);
  const upperIdx = Math.min(Math.floor(0.95 * sortedTimes.length), sortedTimes.length - 1);

  return {
    iterations: clampedIterations,
    percentiles: {
      p10: getPercentile(0.1),
      p50: getPercentile(0.5),
      p90: getPercentile(0.9),
    },
    meanTimeToMainstream: Math.round(meanTimeToMainstream),
    adoptionProbability: adoptionCount / clampedIterations,
    confidenceInterval: {
      lower: sortedTimes[lowerIdx],
      upper: sortedTimes[upperIdx],
      confidence: 0.9,
    },
  };
}

// ---- LLM-assisted parameter estimation ----

function buildParameterEstimationPrompt(
  idea: InnovationIdea,
  context?: { investigation?: Investigation; marketSize?: string }
): string {
  return `You are a diffusion modeling expert. Estimate Bass diffusion parameters for this innovation idea.

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
${context?.investigation ? `Market Context: ${sanitizeUserInput(context.investigation.summary)}` : ""}
${context?.marketSize ? `Market Size Hint: ${context.marketSize}` : ""}

Respond with JSON:
{
  "parameters": {
    "p": <innovation coefficient 0.001-0.1, higher for more viral/obvious innovations>,
    "q": <imitation coefficient 0.1-0.8, higher for network-effect products>,
    "m": <total addressable market in users/organizations>,
    "timeHorizon": <months to simulate, typically 24-60>
  },
  "network": [
    {
      "id": "node-1",
      "label": "segment name",
      "type": "innovator|early-adopter|early-majority|late-majority|laggard",
      "influence": <0-1>,
      "adopted": false
    }
  ],
  "strategies": [
    {
      "phase": "launch|early-growth|mainstream|saturation",
      "recommendation": "strategy description",
      "targetSegment": "which segment to target",
      "keyAction": "specific action",
      "expectedImpact": "expected result"
    }
  ],
  "summary": "narrative summary of expected diffusion pattern"
}

Be realistic with parameters. Typical values: p=0.01-0.03 for B2B, p=0.03-0.08 for consumer; q=0.3-0.5 for moderate network effects. Include 10-20 network nodes across all adopter types.`;
}

/** Options for diffusion simulation. */
export interface DiffusionSimulationOptions {
  model?: string;
  signal?: AbortSignal;
  runMonteCarlo?: boolean;
  monteCarloIterations?: number;
  marketSize?: string;
}

/**
 * Simulate idea diffusion through a market or organization.
 */
export async function simulateDiffusion(
  idea: InnovationIdea,
  options: DiffusionSimulationOptions = {},
  context?: { investigation?: Investigation }
): Promise<DiffusionSimulation> {
  if (!idea.title || idea.title.trim().length === 0) {
    throw new Error("Idea title is required");
  }

  const prompt = buildParameterEstimationPrompt(idea, {
    investigation: context?.investigation,
    marketSize: options.marketSize,
  });

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new Error(`Failed to parse diffusion response as JSON: ${jsonStr.slice(0, 200)}`);
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

  const params = DiffusionParametersSchema.parse(parsed.parameters);
  const network = z.array(NetworkNodeSchema).max(200).parse(parsed.network ?? []);
  const strategies = z.array(DiffusionStrategySchema).max(10).parse(parsed.strategies ?? []);
  const summary = z.string().max(2000).parse(parsed.summary ?? "");

  const baseCurve = computeBassCurve(params);
  const peakMonth = baseCurve.reduce((max, pt, idx) =>
    pt.adopters > (baseCurve[max]?.adopters ?? 0) ? idx : max, 0);
  const majorityMonth = baseCurve.findIndex((pt) => pt.marketPenetration >= 0.5);

  const monteCarlo = options.runMonteCarlo !== false
    ? runMonteCarloDiffusion(params, options.monteCarloIterations)
    : undefined;

  // Simulate network adoption timing
  const adoptionNetwork = network.map((node, idx) => {
    const typeMultiplier = { innovator: 0.1, "early-adopter": 0.25, "early-majority": 0.5, "late-majority": 0.75, laggard: 0.9 };
    const adoptionMonth = Math.round(params.timeHorizon * (typeMultiplier[node.type] ?? 0.5) * (0.8 + Math.random() * 0.4));
    return { ...node, adoptionMonth, adopted: adoptionMonth <= params.timeHorizon };
  });

  const simulation: DiffusionSimulation = {
    ideaTitle: idea.title,
    parameters: params,
    baseCurve,
    monteCarlo,
    network: adoptionNetwork,
    strategies,
    peakAdoptionMonth: peakMonth,
    timeToMajority: majorityMonth >= 0 ? majorityMonth : params.timeHorizon,
    summary,
    simulatedAt: new Date().toISOString(),
  };

  const id = `diffusion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  diffusionSimulations.set(id, simulation);

  return simulation;
}

/**
 * Get a stored diffusion simulation by ID.
 */
export function getDiffusionSimulation(id: string): DiffusionSimulation | undefined {
  return diffusionSimulations.get(id);
}

/**
 * List all stored diffusion simulations.
 */
export function listDiffusionSimulations(): Array<{ id: string; ideaTitle: string; simulatedAt: string }> {
  return Array.from(diffusionSimulations.entries()).map(([id, s]) => ({
    id,
    ideaTitle: s.ideaTitle,
    simulatedAt: s.simulatedAt,
  }));
}

/**
 * Clear all stored diffusion simulations.
 */
export function clearDiffusionSimulations(): void {
  diffusionSimulations.clear();
}

/**
 * Convert a diffusion simulation to Markdown.
 */
export function diffusionToMarkdown(simulation: DiffusionSimulation): string {
  const lines: string[] = [];
  const { parameters: p, baseCurve, monteCarlo, strategies, network } = simulation;

  lines.push(`# Diffusion Simulation: ${simulation.ideaTitle}\n`);
  lines.push(`*Simulated: ${simulation.simulatedAt}*\n`);

  lines.push(`## Bass Model Parameters\n`);
  lines.push(`| Parameter | Value | Description |`);
  lines.push(`|-----------|-------|-------------|`);
  lines.push(`| p (innovation) | ${p.p.toFixed(4)} | External influence rate |`);
  lines.push(`| q (imitation) | ${p.q.toFixed(4)} | Internal influence rate |`);
  lines.push(`| m (market) | ${p.m.toLocaleString()} | Total addressable market |`);
  lines.push(`| Horizon | ${p.timeHorizon} months | Simulation period |\n`);

  lines.push(`## Key Metrics\n`);
  lines.push(`- **Peak adoption month:** ${simulation.peakAdoptionMonth}`);
  lines.push(`- **Time to 50% market:** ${simulation.timeToMajority} months`);

  if (monteCarlo) {
    lines.push(`\n## Monte Carlo Analysis (${monteCarlo.iterations} iterations)\n`);
    lines.push(`- **Adoption probability:** ${(monteCarlo.adoptionProbability * 100).toFixed(1)}%`);
    lines.push(`- **Mean time to mainstream:** ${monteCarlo.meanTimeToMainstream} months`);
    lines.push(`- **90% CI:** ${monteCarlo.confidenceInterval.lower}-${monteCarlo.confidenceInterval.upper} months`);
  }

  lines.push(`\n## Adoption Curve (Key Points)\n`);
  lines.push(`| Month | New Adopters | Cumulative | Penetration |`);
  lines.push(`|-------|-------------|------------|-------------|`);
  const keyMonths = [0, 3, 6, 12, 18, 24, 36, 48, 60].filter((m) => m <= p.timeHorizon);
  for (const m of keyMonths) {
    const pt = baseCurve[m];
    if (pt) {
      lines.push(`| ${m} | ${pt.adopters.toLocaleString()} | ${pt.cumulativeAdopters.toLocaleString()} | ${(pt.marketPenetration * 100).toFixed(1)}% |`);
    }
  }

  if (strategies.length > 0) {
    lines.push(`\n## Diffusion Strategies\n`);
    for (const s of strategies) {
      lines.push(`### ${s.phase}: ${s.targetSegment}\n`);
      lines.push(`${s.recommendation}`);
      lines.push(`- **Action:** ${s.keyAction}`);
      lines.push(`- **Expected Impact:** ${s.expectedImpact}\n`);
    }
  }

  lines.push(`## Summary\n`);
  lines.push(simulation.summary);

  return lines.join("\n");
}
