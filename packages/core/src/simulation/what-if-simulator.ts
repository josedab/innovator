/**
 * @module simulation/what-if-simulator
 *
 * What-If Scenario Simulator — interactive parameter tuning with
 * real-time sensitivity analysis. Generates slider configurations,
 * runs simulations across parameter ranges, and computes outcome
 * distributions for risk/reward modeling.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const SliderParamSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500).optional(),
  min: z.number(),
  max: z.number(),
  step: z.number().min(0.001),
  defaultValue: z.number(),
  currentValue: z.number(),
  unit: z.string().max(50).optional(),
  category: z.enum(["market", "technical", "financial", "team", "timing"]),
});

export type SliderParam = z.infer<typeof SliderParamSchema>;

export const SimulationOutcomeSchema = z.object({
  /** Estimated revenue/value outcome. */
  value: z.number(),
  /** Probability of achieving this outcome (0-1). */
  probability: z.number().min(0).max(1),
  /** Time to achieve in months. */
  timeToValueMonths: z.number().min(0),
  /** Risk level for this outcome. */
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  /** Confidence interval. */
  confidence: z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number().min(0).max(1),
  }),
});

export type SimulationOutcome = z.infer<typeof SimulationOutcomeSchema>;

export const ScenarioRunSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  ideaTitle: z.string().max(500),
  parameters: z.array(SliderParamSchema),
  outcomes: z.object({
    bestCase: SimulationOutcomeSchema,
    expectedCase: SimulationOutcomeSchema,
    worstCase: SimulationOutcomeSchema,
  }),
  /** Sensitivity analysis: which parameters most affect the outcome. */
  sensitivity: z
    .array(
      z.object({
        paramId: z.string().max(100),
        paramName: z.string().max(200),
        /** Percentage change in outcome per 1% change in parameter. */
        elasticity: z.number(),
        /** Direction of influence. */
        direction: z.enum(["positive", "negative"]),
        /** Rank by importance (1 = most important). */
        rank: z.number().int().min(1),
      })
    )
    .max(20),
  /** Monte Carlo distribution data for visualization. */
  distribution: z.object({
    buckets: z.array(
      z.object({
        rangeMin: z.number(),
        rangeMax: z.number(),
        count: z.number().int().min(0),
        probability: z.number().min(0).max(1),
      })
    ),
    mean: z.number(),
    median: z.number(),
    stdDev: z.number(),
    percentile5: z.number(),
    percentile95: z.number(),
  }),
  createdAt: z.string(),
});

export type ScenarioRun = z.infer<typeof ScenarioRunSchema>;

// ---- Default Slider Templates ----

const DEFAULT_SLIDERS: Omit<SliderParam, "id" | "currentValue">[] = [
  {
    name: "Market Size ($M)",
    min: 1,
    max: 1000,
    step: 1,
    defaultValue: 100,
    unit: "$M",
    category: "market",
  },
  {
    name: "Market Share (%)",
    min: 0.1,
    max: 30,
    step: 0.1,
    defaultValue: 5,
    unit: "%",
    category: "market",
  },
  {
    name: "Adoption Rate (%/year)",
    min: 1,
    max: 50,
    step: 1,
    defaultValue: 15,
    unit: "%/yr",
    category: "market",
  },
  {
    name: "Development Cost ($K)",
    min: 10,
    max: 5000,
    step: 10,
    defaultValue: 200,
    unit: "$K",
    category: "financial",
  },
  {
    name: "Time to Market (months)",
    min: 1,
    max: 36,
    step: 1,
    defaultValue: 6,
    unit: "mo",
    category: "timing",
  },
  {
    name: "Team Size",
    min: 1,
    max: 50,
    step: 1,
    defaultValue: 5,
    unit: "people",
    category: "team",
  },
  {
    name: "Technical Risk (%)",
    min: 0,
    max: 100,
    step: 5,
    defaultValue: 30,
    unit: "%",
    category: "technical",
  },
  {
    name: "Revenue per User ($/yr)",
    min: 1,
    max: 10000,
    step: 10,
    defaultValue: 100,
    unit: "$/yr",
    category: "financial",
  },
];

/** Get the default slider parameters for a simulation. */
export function getDefaultSliders(): SliderParam[] {
  return DEFAULT_SLIDERS.map((s) => ({
    ...s,
    id: `slider-${s.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 30)}`,
    currentValue: s.defaultValue,
  }));
}

// ---- Monte Carlo Engine ----

/**
 * Run a simplified Monte Carlo simulation with the given parameters.
 * Uses triangular distributions for each parameter to model uncertainty.
 */
export function runWhatIfSimulation(
  ideaTitle: string,
  parameters: SliderParam[],
  iterations: number = 1000,
  name?: string
): ScenarioRun {
  const marketSize = parameters.find((p) => p.category === "market" && p.name.includes("Size"));
  const marketShare = parameters.find((p) => p.name.includes("Share"));
  const adoptionRate = parameters.find((p) => p.name.includes("Adoption"));
  const devCost = parameters.find((p) => p.name.includes("Cost"));
  const timeToMarket = parameters.find((p) => p.name.includes("Time"));
  const techRisk = parameters.find((p) => p.name.includes("Risk"));
  const revenuePerUser = parameters.find((p) => p.name.includes("Revenue"));

  // Run Monte Carlo iterations
  const outcomes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Sample each parameter with ±20% triangular noise
    const sample = (param: SliderParam | undefined) => {
      if (!param) return 1;
      const noise = (Math.random() + Math.random() + Math.random()) / 3; // Triangular
      const variance = (param.max - param.min) * 0.15;
      return param.currentValue + (noise - 0.5) * 2 * variance;
    };

    const mktSize = Math.max(0, sample(marketSize));
    const share = Math.max(0, Math.min(100, sample(marketShare))) / 100;
    const adoption = Math.max(0, sample(adoptionRate)) / 100;
    const cost = Math.max(0, sample(devCost));
    const risk = Math.max(0, Math.min(100, sample(techRisk))) / 100;
    const revenue = Math.max(0, sample(revenuePerUser));

    // Simple revenue model: addressable market * share * adoption * revenue - cost
    const addressable = mktSize * 1_000_000; // Convert $M to $
    const users = addressable * share * adoption;
    const totalRevenue = users * revenue;
    const successProb = 1 - risk;
    const netValue = totalRevenue * successProb - cost * 1000;

    outcomes.push(netValue);
  }

  outcomes.sort((a, b) => a - b);

  // Build distribution buckets
  const min = outcomes[0];
  const max = outcomes[outcomes.length - 1];
  const bucketCount = Math.min(20, Math.max(5, Math.floor(iterations / 50)));
  const bucketSize = (max - min) / bucketCount || 1;

  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const rangeMin = min + i * bucketSize;
    const rangeMax = rangeMin + bucketSize;
    const count = outcomes.filter((v) => v >= rangeMin && v < rangeMax).length;
    return { rangeMin, rangeMax, count, probability: count / iterations };
  });

  const mean = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
  const median = outcomes[Math.floor(outcomes.length / 2)];
  const variance = outcomes.reduce((s, v) => s + (v - mean) ** 2, 0) / outcomes.length;
  const stdDev = Math.sqrt(variance);

  // Sensitivity analysis: vary each parameter ±10% and measure outcome change
  const sensitivity = parameters.map((param, _idx) => {
    const baseOutcome = mean;

    // Run with +10% of this parameter
    const upParams = parameters.map((p) =>
      p.id === param.id ? { ...p, currentValue: p.currentValue * 1.1 } : p
    );
    const upResult = quickSimulation(upParams, 200);

    const elasticity = baseOutcome !== 0 ? (upResult - baseOutcome) / baseOutcome / 0.1 : 0;

    return {
      paramId: param.id,
      paramName: param.name,
      elasticity: Math.round(elasticity * 100) / 100,
      direction: elasticity >= 0 ? ("positive" as const) : ("negative" as const),
      rank: 0, // Will be set below
    };
  });

  // Rank by absolute elasticity
  sensitivity.sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));
  sensitivity.forEach((s, i) => {
    s.rank = i + 1;
  });

  // Build outcome cases
  const p5 = outcomes[Math.floor(0.05 * outcomes.length)];
  const p50 = median;
  const p95 = outcomes[Math.floor(0.95 * outcomes.length)];

  const makeOutcome = (
    value: number,
    level: "low" | "medium" | "high" | "critical"
  ): SimulationOutcome => ({
    value: Math.round(value),
    probability: level === "low" ? 0.9 : level === "medium" ? 0.5 : 0.1,
    timeToValueMonths: timeToMarket?.currentValue ?? 6,
    riskLevel: level,
    confidence: {
      lower: Math.round(p5),
      upper: Math.round(p95),
      level: 0.9,
    },
  });

  return ScenarioRunSchema.parse({
    id: `whatif-${randomUUID().slice(0, 8)}`,
    name: name ?? `What-If: ${ideaTitle}`,
    ideaTitle,
    parameters,
    outcomes: {
      bestCase: makeOutcome(p95, "low"),
      expectedCase: makeOutcome(p50, "medium"),
      worstCase: makeOutcome(p5, "high"),
    },
    sensitivity,
    distribution: {
      buckets,
      mean: Math.round(mean),
      median: Math.round(median),
      stdDev: Math.round(stdDev),
      percentile5: Math.round(p5),
      percentile95: Math.round(p95),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Quick simulation helper for sensitivity analysis. */
function quickSimulation(parameters: SliderParam[], iterations: number): number {
  const marketSize = parameters.find((p) => p.name.includes("Size"));
  const marketShare = parameters.find((p) => p.name.includes("Share"));
  const adoptionRate = parameters.find((p) => p.name.includes("Adoption"));
  const devCost = parameters.find((p) => p.name.includes("Cost"));
  const techRisk = parameters.find((p) => p.name.includes("Risk"));
  const revenuePerUser = parameters.find((p) => p.name.includes("Revenue"));

  let total = 0;
  for (let i = 0; i < iterations; i++) {
    const noise = () => 0.9 + Math.random() * 0.2;
    const mkt = (marketSize?.currentValue ?? 100) * noise();
    const share = ((marketShare?.currentValue ?? 5) / 100) * noise();
    const adoption = ((adoptionRate?.currentValue ?? 15) / 100) * noise();
    const cost = (devCost?.currentValue ?? 200) * noise();
    const risk = ((techRisk?.currentValue ?? 30) / 100) * noise();
    const rev = (revenuePerUser?.currentValue ?? 100) * noise();

    const value = mkt * 1_000_000 * share * adoption * rev * (1 - risk) - cost * 1000;
    total += value;
  }
  return total / iterations;
}

/** Compare two scenario runs side by side. */
export function compareScenarioRuns(
  a: ScenarioRun,
  b: ScenarioRun
): {
  betterScenario: string;
  expectedDiff: number;
  riskComparison: string;
  summary: string;
} {
  const expectedA = a.outcomes.expectedCase.value;
  const expectedB = b.outcomes.expectedCase.value;
  const betterScenario = expectedA >= expectedB ? a.name : b.name;
  const riskA = a.distribution.stdDev / Math.abs(a.distribution.mean || 1);
  const riskB = b.distribution.stdDev / Math.abs(b.distribution.mean || 1);

  return {
    betterScenario,
    expectedDiff: Math.round(expectedA - expectedB),
    riskComparison:
      riskA < riskB
        ? `${a.name} has lower risk (CV: ${riskA.toFixed(2)} vs ${riskB.toFixed(2)})`
        : `${b.name} has lower risk (CV: ${riskB.toFixed(2)} vs ${riskA.toFixed(2)})`,
    summary: `${betterScenario} has higher expected value ($${Math.max(expectedA, expectedB).toLocaleString()} vs $${Math.min(expectedA, expectedB).toLocaleString()})`,
  };
}

/** Format a scenario run as markdown. */
export function scenarioRunToMarkdown(run: ScenarioRun): string {
  const fmt = (v: number) =>
    v >= 0 ? `$${v.toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;

  return [
    `# 🎲 ${run.name}`,
    "",
    `**Idea:** ${run.ideaTitle}`,
    "",
    "## Outcome Projections",
    "",
    `| Scenario | Value | Probability | Risk |`,
    `|----------|-------|------------|------|`,
    `| Best Case | ${fmt(run.outcomes.bestCase.value)} | ${(run.outcomes.bestCase.probability * 100).toFixed(0)}% | ${run.outcomes.bestCase.riskLevel} |`,
    `| Expected | ${fmt(run.outcomes.expectedCase.value)} | ${(run.outcomes.expectedCase.probability * 100).toFixed(0)}% | ${run.outcomes.expectedCase.riskLevel} |`,
    `| Worst Case | ${fmt(run.outcomes.worstCase.value)} | ${(run.outcomes.worstCase.probability * 100).toFixed(0)}% | ${run.outcomes.worstCase.riskLevel} |`,
    "",
    `**90% Confidence Interval:** ${fmt(run.distribution.percentile5)} to ${fmt(run.distribution.percentile95)}`,
    "",
    "## Sensitivity Analysis",
    "",
    `| Rank | Parameter | Elasticity | Direction |`,
    `|------|-----------|-----------|-----------|`,
    ...run.sensitivity
      .slice(0, 8)
      .map(
        (s) =>
          `| ${s.rank} | ${s.paramName} | ${s.elasticity.toFixed(2)} | ${s.direction === "positive" ? "📈" : "📉"} |`
      ),
    "",
    "## Distribution",
    "",
    `**Mean:** ${fmt(run.distribution.mean)} | **Median:** ${fmt(run.distribution.median)} | **Std Dev:** ${fmt(run.distribution.stdDev)}`,
  ].join("\n");
}
