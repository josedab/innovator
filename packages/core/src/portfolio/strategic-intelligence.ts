/**
 * @module portfolio/strategic-intelligence
 *
 * Portfolio strategic intelligence — balanced scorecard across innovation
 * horizons (H1/H2/H3), strategic alignment scoring, Monte Carlo risk
 * analysis, and automated rebalancing recommendations.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { PortfolioItem, PortfolioMetrics } from "./types.js";

// ---- Schemas ----

export const InnovationHorizonSchema = z.enum(["h1-core", "h2-adjacent", "h3-transformational"]);
export type InnovationHorizon = z.infer<typeof InnovationHorizonSchema>;

export const StrategicGoalSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(1000),
  weight: z.number().min(0).max(1),
  horizon: InnovationHorizonSchema,
});
export type StrategicGoal = z.infer<typeof StrategicGoalSchema>;

export const BalancedScorecardSchema = z.object({
  horizons: z.object({
    "h1-core": z.object({
      count: z.number(),
      percentage: z.number(),
      targetPercentage: z.number(),
      gap: z.number(),
      avgImpact: z.number(),
      items: z.array(z.string()),
    }),
    "h2-adjacent": z.object({
      count: z.number(),
      percentage: z.number(),
      targetPercentage: z.number(),
      gap: z.number(),
      avgImpact: z.number(),
      items: z.array(z.string()),
    }),
    "h3-transformational": z.object({
      count: z.number(),
      percentage: z.number(),
      targetPercentage: z.number(),
      gap: z.number(),
      avgImpact: z.number(),
      items: z.array(z.string()),
    }),
  }),
  overallBalance: z.number().min(0).max(1),
  generatedAt: z.string(),
});
export type BalancedScorecard = z.infer<typeof BalancedScorecardSchema>;

export const StrategicAlignmentSchema = z.object({
  itemId: z.string(),
  itemTitle: z.string(),
  horizon: InnovationHorizonSchema,
  alignmentScore: z.number().min(0).max(1),
  goalAlignments: z.array(
    z.object({
      goalId: z.string(),
      goalName: z.string(),
      score: z.number().min(0).max(1),
    })
  ),
});
export type StrategicAlignment = z.infer<typeof StrategicAlignmentSchema>;

export const RebalanceRecommendationSchema = z.object({
  id: z.string(),
  type: z.enum(["add", "remove", "reprioritize", "accelerate", "deprioritize"]),
  itemId: z.string().optional(),
  title: z.string().max(300),
  description: z.string().max(1000),
  impact: z.enum(["high", "medium", "low"]),
  horizon: InnovationHorizonSchema,
});
export type RebalanceRecommendation = z.infer<typeof RebalanceRecommendationSchema>;

export const PortfolioRiskResultSchema = z.object({
  simulations: z.number(),
  expectedValue: z.number(),
  valueAtRisk95: z.number(),
  standardDeviation: z.number(),
  bestCase: z.number(),
  worstCase: z.number(),
  successProbability: z.number().min(0).max(1),
});
export type PortfolioRiskResult = z.infer<typeof PortfolioRiskResultSchema>;

// ---- Target allocations (70-20-10 rule) ----

const DEFAULT_TARGETS: Record<InnovationHorizon, number> = {
  "h1-core": 0.7,
  "h2-adjacent": 0.2,
  "h3-transformational": 0.1,
};

// ---- Strategic Goals Store ----

const goals = new Map<string, StrategicGoal>();

/** Register a strategic goal. */
export function addStrategicGoal(params: {
  name: string;
  description: string;
  weight: number;
  horizon: InnovationHorizon;
}): StrategicGoal {
  const goal: StrategicGoal = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    weight: Math.min(1, Math.max(0, params.weight)),
    horizon: params.horizon,
  };
  const validated = StrategicGoalSchema.parse(goal);
  goals.set(validated.id, validated);
  return validated;
}

/** List all strategic goals. */
export function listStrategicGoals(): StrategicGoal[] {
  return Array.from(goals.values());
}

/** Remove a strategic goal. */
export function removeStrategicGoal(id: string): boolean {
  return goals.delete(id);
}

// ---- Horizon Classification ----

/** Classify a portfolio item into an innovation horizon based on tags and metadata. */
export function classifyHorizon(item: PortfolioItem): InnovationHorizon {
  const tags = item.tags.map((t) => t.toLowerCase());
  const title = item.title.toLowerCase();
  const desc = item.description.toLowerCase();
  const text = `${title} ${desc} ${tags.join(" ")}`;

  const h3Keywords = [
    "transformational",
    "disruptive",
    "moonshot",
    "breakthrough",
    "revolutionary",
    "paradigm",
    "emerging",
    "speculative",
    "h3",
  ];
  const h2Keywords = [
    "adjacent",
    "expansion",
    "new-market",
    "extension",
    "diversif",
    "evolution",
    "h2",
  ];

  if (h3Keywords.some((k) => text.includes(k))) return "h3-transformational";
  if (h2Keywords.some((k) => text.includes(k))) return "h2-adjacent";
  return "h1-core";
}

// ---- Balanced Scorecard ----

/** Build a balanced scorecard across innovation horizons. */
export function buildBalancedScorecard(
  items: PortfolioItem[],
  targets?: Partial<Record<InnovationHorizon, number>>
): BalancedScorecard {
  const t = { ...DEFAULT_TARGETS, ...targets };
  const horizonItems: Record<InnovationHorizon, PortfolioItem[]> = {
    "h1-core": [],
    "h2-adjacent": [],
    "h3-transformational": [],
  };

  for (const item of items) {
    const horizon = classifyHorizon(item);
    horizonItems[horizon].push(item);
  }

  const total = items.length || 1;

  const buildHorizon = (horizon: InnovationHorizon) => {
    const hItems = horizonItems[horizon];
    const percentage = hItems.length / total;
    const impacts = hItems.filter((i) => i.impactScore != null).map((i) => i.impactScore!);
    const avgImpact = impacts.length > 0 ? impacts.reduce((a, b) => a + b, 0) / impacts.length : 0;

    return {
      count: hItems.length,
      percentage: +percentage.toFixed(3),
      targetPercentage: t[horizon],
      gap: +(percentage - t[horizon]).toFixed(3),
      avgImpact: +avgImpact.toFixed(2),
      items: hItems.map((i) => i.id),
    };
  };

  const h1 = buildHorizon("h1-core");
  const h2 = buildHorizon("h2-adjacent");
  const h3 = buildHorizon("h3-transformational");

  // Overall balance: 1 minus average gap magnitude
  const avgGap = (Math.abs(h1.gap) + Math.abs(h2.gap) + Math.abs(h3.gap)) / 3;
  const overallBalance = Math.max(0, +(1 - avgGap * 2).toFixed(3));

  return {
    horizons: { "h1-core": h1, "h2-adjacent": h2, "h3-transformational": h3 },
    overallBalance,
    generatedAt: new Date().toISOString(),
  };
}

// ---- Strategic Alignment ----

/** Score how well a portfolio item aligns with strategic goals. */
export function scoreStrategicAlignment(item: PortfolioItem): StrategicAlignment {
  const allGoals = Array.from(goals.values());
  const horizon = classifyHorizon(item);
  const text = `${item.title} ${item.description} ${item.tags.join(" ")}`.toLowerCase();

  const goalAlignments = allGoals.map((goal) => {
    const goalWords = goal.name.toLowerCase().split(/\s+/);
    const matchCount = goalWords.filter((w) => w.length > 3 && text.includes(w)).length;
    const wordScore = goalWords.length > 0 ? matchCount / goalWords.length : 0;
    const horizonBonus = goal.horizon === horizon ? 0.2 : 0;
    const score = Math.min(1, wordScore * 0.8 + horizonBonus);

    return {
      goalId: goal.id,
      goalName: goal.name,
      score: +score.toFixed(3),
    };
  });

  const weightedSum = goalAlignments.reduce((sum, ga) => {
    const goal = goals.get(ga.goalId);
    return sum + ga.score * (goal?.weight ?? 0.5);
  }, 0);
  const totalWeight = allGoals.reduce((sum, g) => sum + g.weight, 0) || 1;
  const alignmentScore = +(weightedSum / totalWeight).toFixed(3);

  return {
    itemId: item.id,
    itemTitle: item.title,
    horizon,
    alignmentScore,
    goalAlignments,
  };
}

// ---- Monte Carlo Risk Simulation ----

/** Run Monte Carlo simulation on portfolio items for risk analysis. */
export function simulatePortfolioRisk(
  items: PortfolioItem[],
  opts?: { simulations?: number; successBaseRate?: number }
): PortfolioRiskResult {
  const numSims = opts?.simulations ?? 1000;
  const baseRate = opts?.successBaseRate ?? 0.3;
  const results: number[] = [];

  for (let i = 0; i < numSims; i++) {
    let portfolioValue = 0;
    for (const item of items) {
      const impact = item.impactScore ?? 5;
      // Probability of success based on stage
      let stageFactor = baseRate;
      if (item.stage === "evaluation") stageFactor = baseRate * 1.2;
      if (item.stage === "prototyping") stageFactor = baseRate * 1.8;
      if (item.stage === "shipped") stageFactor = 0.95;

      const random = Math.random();
      if (random < stageFactor) {
        // Successful — add value with some variance
        const variance = 0.5 + Math.random();
        portfolioValue += impact * variance * 10;
      }
    }
    results.push(portfolioValue);
  }

  results.sort((a, b) => a - b);

  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const variance = results.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / results.length;
  const idx5 = Math.floor(results.length * 0.05);
  const idx95 = Math.floor(results.length * 0.95);
  const successCount = results.filter((v) => v > 0).length;

  return {
    simulations: numSims,
    expectedValue: +mean.toFixed(2),
    valueAtRisk95: +results[idx5].toFixed(2),
    standardDeviation: +Math.sqrt(variance).toFixed(2),
    bestCase: +results[results.length - 1].toFixed(2),
    worstCase: +results[0].toFixed(2),
    successProbability: +(successCount / numSims).toFixed(3),
  };
}

// ---- Rebalancing Recommendations ----

/** Generate automated rebalancing recommendations. */
export function generateRebalancingRecommendations(
  items: PortfolioItem[],
  scorecard?: BalancedScorecard
): RebalanceRecommendation[] {
  const sc = scorecard ?? buildBalancedScorecard(items);
  const recommendations: RebalanceRecommendation[] = [];

  // Check horizon imbalances
  for (const horizon of ["h1-core", "h2-adjacent", "h3-transformational"] as InnovationHorizon[]) {
    const h = sc.horizons[horizon];
    if (h.gap < -0.1) {
      recommendations.push({
        id: randomUUID(),
        type: "add",
        title: `Increase ${horizon} allocation`,
        description: `${horizon} is ${Math.abs(Math.round(h.gap * 100))}% below target. Consider adding more ${horizon === "h1-core" ? "core improvement" : horizon === "h2-adjacent" ? "adjacent market" : "transformational"} ideas.`,
        impact: Math.abs(h.gap) > 0.2 ? "high" : "medium",
        horizon,
      });
    }
    if (h.gap > 0.15) {
      recommendations.push({
        id: randomUUID(),
        type: "deprioritize",
        title: `Reduce ${horizon} over-allocation`,
        description: `${horizon} is ${Math.round(h.gap * 100)}% above target. Consider moving some items to different horizons or deprioritizing.`,
        impact: h.gap > 0.3 ? "high" : "medium",
        horizon,
      });
    }
  }

  // Check for stalled items
  const stalled = items.filter((item) => {
    if (item.stage === "shipped" || item.stage === "abandoned") return false;
    const daysSinceUpdate =
      (Date.now() - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 30;
  });

  for (const item of stalled.slice(0, 3)) {
    recommendations.push({
      id: randomUUID(),
      type: "accelerate",
      itemId: item.id,
      title: `Accelerate or abandon "${item.title}"`,
      description: `This item has been in "${item.stage}" stage for over 30 days. Consider accelerating or making an abandon decision.`,
      impact: "medium",
      horizon: classifyHorizon(item),
    });
  }

  // Low-impact items in late stages
  const lowImpactLateStage = items.filter(
    (item) =>
      (item.stage === "prototyping" || item.stage === "evaluation") &&
      item.impactScore != null &&
      item.impactScore < 3
  );

  for (const item of lowImpactLateStage.slice(0, 2)) {
    recommendations.push({
      id: randomUUID(),
      type: "remove",
      itemId: item.id,
      title: `Consider abandoning low-impact "${item.title}"`,
      description: `Impact score of ${item.impactScore}/10 is below threshold for current stage. Resources may be better allocated elsewhere.`,
      impact: "low",
      horizon: classifyHorizon(item),
    });
  }

  return recommendations.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.impact] - order[b.impact];
  });
}

// ---- Visual Portfolio Map (Bubble Chart Data) ----

export interface BubbleChartItem {
  id: string;
  title: string;
  x: number; // impact (0-10)
  y: number; // feasibility/stage progress (0-1)
  size: number; // relative importance
  color: string; // horizon color
  horizon: InnovationHorizon;
  stage: string;
  label: string;
}

/** Generate bubble chart data for portfolio visualization. */
export function buildPortfolioBubbleChart(items: PortfolioItem[]): BubbleChartItem[] {
  const horizonColors: Record<InnovationHorizon, string> = {
    "h1-core": "#3B82F6",
    "h2-adjacent": "#F59E0B",
    "h3-transformational": "#EF4444",
  };

  const stageProgress: Record<string, number> = {
    ideation: 0.1,
    evaluation: 0.3,
    prototyping: 0.6,
    shipped: 0.9,
    abandoned: 0.05,
  };

  return items.map((item) => {
    const horizon = classifyHorizon(item);
    const impact = item.impactScore ?? 5;
    const progress = stageProgress[item.stage] ?? 0.5;
    const daysSinceCreation = Math.max(
      1,
      (Date.now() - new Date(item.createdAt).getTime()) / 86400000
    );
    const size = Math.max(10, Math.min(80, impact * 8));

    return {
      id: item.id,
      title: item.title,
      x: impact,
      y: progress,
      size,
      color: horizonColors[horizon],
      horizon,
      stage: item.stage,
      label: `${item.title.slice(0, 30)}${item.title.length > 30 ? "…" : ""}`,
    };
  });
}

// ---- Board-Ready Report Generation ----

/** Generate a board-ready markdown report from portfolio intelligence data. */
export function generateBoardReport(
  items: PortfolioItem[],
  opts?: { title?: string; period?: string }
): string {
  const scorecard = buildBalancedScorecard(items);
  const risk = simulatePortfolioRisk(items, { simulations: 500 });
  const recs = generateRebalancingRecommendations(items, scorecard);

  const lines: string[] = [
    `# ${opts?.title ?? "Innovation Portfolio — Board Report"}`,
    "",
    opts?.period ? `_Reporting Period: ${opts.period}_` : "",
    `_Generated: ${new Date().toISOString().slice(0, 10)}_`,
    "",
    "## Portfolio Overview",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total Innovation Tracks | ${items.length} |`,
    `| Balance Score | ${Math.round(scorecard.overallBalance * 100)}% |`,
    `| Success Probability | ${Math.round(risk.successProbability * 100)}% |`,
    `| Expected Portfolio Value | ${risk.expectedValue.toFixed(0)} |`,
    `| Value at Risk (95%) | ${risk.valueAtRisk95.toFixed(0)} |`,
    "",
    "## Horizon Distribution (70-20-10 Target)",
    "",
    "| Horizon | Count | Actual | Target | Gap |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const h of ["h1-core", "h2-adjacent", "h3-transformational"] as InnovationHorizon[]) {
    const d = scorecard.horizons[h];
    const gapStr = d.gap > 0 ? `+${Math.round(d.gap * 100)}%` : `${Math.round(d.gap * 100)}%`;
    lines.push(
      `| ${h} | ${d.count} | ${Math.round(d.percentage * 100)}% | ${Math.round(d.targetPercentage * 100)}% | ${gapStr} |`
    );
  }

  lines.push("");

  if (recs.length > 0) {
    lines.push("## Recommendations", "");
    for (const rec of recs.slice(0, 5)) {
      lines.push(`- **[${rec.impact.toUpperCase()}]** ${rec.title}: ${rec.description}`);
    }
    lines.push("");
  }

  // Top items by stage
  const active = items.filter((i) => i.stage !== "shipped" && i.stage !== "abandoned");
  if (active.length > 0) {
    lines.push("## Active Innovation Tracks", "");
    lines.push("| Title | Stage | Impact | Horizon |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of active
      .sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0))
      .slice(0, 10)) {
      lines.push(
        `| ${item.title.slice(0, 50)} | ${item.stage} | ${item.impactScore ?? "-"}/10 | ${classifyHorizon(item)} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Clear strategic goals (for testing). */
export function clearStrategicGoals(): void {
  goals.clear();
}
