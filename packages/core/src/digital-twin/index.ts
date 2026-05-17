/**
 * @module digital-twin
 *
 * Virtual model of an organization's innovation ecosystem.
 * Models team capacity, angle effectiveness, budget constraints,
 * and competitive dynamics. Supports forward simulation under
 * different strategies for comparison.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---- Ecosystem Data Model ----

export const TeamMemberSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  role: z.string().max(200),
  capacity: z.number().min(0).max(1).describe("0–1 availability fraction"),
  strengths: z.array(z.string().max(100)).max(20),
  activeProjects: z.number().int().min(0).max(100),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const IdeaPipelineEntrySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(500),
  stage: z.enum(["discovery", "validation", "prototyping", "scaling", "launched", "retired"]),
  score: z.number().min(0).max(100),
  assignedTeam: z.array(z.string().max(100)).max(20),
  estimatedEffortWeeks: z.number().min(0).max(520),
  budgetAllocated: z.number().min(0),
  budgetSpent: z.number().min(0),
  startDate: z.string().optional(),
  targetLaunchDate: z.string().optional(),
});

export type IdeaPipelineEntry = z.infer<typeof IdeaPipelineEntrySchema>;

export const MarketContextSchema = z.object({
  industry: z.string().max(200),
  competitors: z
    .array(
      z.object({
        name: z.string().max(200),
        threat: z.enum(["low", "medium", "high"]),
        recentMoves: z.array(z.string().max(500)).max(10),
      })
    )
    .max(20),
  trends: z.array(z.string().max(500)).max(20),
  regulatoryFactors: z.array(z.string().max(500)).max(10),
  marketGrowthRate: z.number().min(-100).max(1000).optional(),
});

export type MarketContext = z.infer<typeof MarketContextSchema>;

export const BudgetConstraintsSchema = z.object({
  totalBudget: z.number().min(0),
  allocated: z.number().min(0),
  remaining: z.number().min(0),
  currency: z.string().max(10).default("USD"),
  quarterlyLimit: z.number().min(0).optional(),
});

export type BudgetConstraints = z.infer<typeof BudgetConstraintsSchema>;

export const TwinAngleEffectivenessSchema = z.object({
  angleId: z.string().max(100),
  successRate: z.number().min(0).max(1),
  avgIdeaQuality: z.number().min(0).max(100),
  usageCount: z.number().int().min(0),
  bestForStages: z.array(z.string().max(50)).max(10),
});

export type TwinAngleEffectiveness = z.infer<typeof TwinAngleEffectivenessSchema>;

export const EcosystemSnapshotSchema = z.object({
  id: z.string().min(1).max(100),
  organizationName: z.string().max(300),
  capturedAt: z.string(),
  team: z.array(TeamMemberSchema).max(200),
  pipeline: z.array(IdeaPipelineEntrySchema).max(500),
  marketContext: MarketContextSchema,
  budget: BudgetConstraintsSchema,
  angleEffectiveness: z.array(TwinAngleEffectivenessSchema).max(50),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type EcosystemSnapshot = z.infer<typeof EcosystemSnapshotSchema>;

// ---- Simulation Engine ----

export const StrategySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(300),
  description: z.string().max(2000),
  budgetAllocation: z.record(z.string().max(100), z.number().min(0)).optional(),
  teamReallocation: z
    .array(z.object({ memberId: z.string().max(100), toProject: z.string().max(100) }))
    .max(100)
    .optional(),
  anglePriorities: z.array(z.string().max(100)).max(20).optional(),
  newInitiatives: z.array(z.string().max(500)).max(20).optional(),
  retireInitiatives: z.array(z.string().max(100)).max(20).optional(),
  timeHorizonWeeks: z.number().int().min(1).max(260).default(52),
});

export type Strategy = z.infer<typeof StrategySchema>;

export const SimulationResultSchema = z.object({
  strategyId: z.string().max(100),
  strategyName: z.string().max(300),
  projectedOutcomes: z.object({
    ideasLaunched: z.number().int().min(0),
    revenueImpact: z.string().max(500),
    teamUtilization: z.number().min(0).max(1),
    budgetUtilization: z.number().min(0).max(1),
    innovationVelocity: z.number().min(0).describe("Ideas per quarter throughput"),
    riskScore: z.number().min(0).max(100),
  }),
  milestones: z
    .array(
      z.object({
        weekNumber: z.number().int().min(0),
        event: z.string().max(500),
        impact: z.enum(["positive", "neutral", "negative"]),
      })
    )
    .max(52),
  risks: z.array(z.string().max(500)).max(20),
  opportunities: z.array(z.string().max(500)).max(20),
  recommendations: z.array(z.string().max(500)).max(10),
  confidenceScore: z.number().min(0).max(1),
});

export type SimulationResult = z.infer<typeof SimulationResultSchema>;

export const StrategyComparisonSchema = z.object({
  ecosystemId: z.string().max(100),
  simulatedAt: z.string(),
  results: z.array(SimulationResultSchema).max(10),
  winner: z.string().max(100).optional(),
  summary: z.string().max(5000),
  tradeoffs: z.array(z.string().max(500)).max(20),
});

export type StrategyComparison = z.infer<typeof StrategyComparisonSchema>;

// ---- In-Memory Store ----

const ecosystems = new Map<string, EcosystemSnapshot>();
const simulations = new Map<string, StrategyComparison>();

// ---- Functions ----

/** Register or update an ecosystem snapshot. */
export function registerEcosystem(snapshot: EcosystemSnapshot): void {
  EcosystemSnapshotSchema.parse(snapshot);
  ecosystems.set(snapshot.id, snapshot);
}

/** Retrieve a registered ecosystem by ID. */
export function getEcosystem(id: string): EcosystemSnapshot | undefined {
  return ecosystems.get(id);
}

/** List all registered ecosystems. */
export function listEcosystems(): EcosystemSnapshot[] {
  return Array.from(ecosystems.values());
}

/** Remove an ecosystem and its simulations. */
export function removeEcosystem(id: string): boolean {
  simulations.delete(id);
  return ecosystems.delete(id);
}

/** Compute basic ecosystem health metrics from a snapshot. */
export function computeEcosystemHealth(snapshot: EcosystemSnapshot): {
  teamUtilization: number;
  budgetHealth: number;
  pipelineBalance: Record<string, number>;
  avgAngleEffectiveness: number;
} {
  const totalCapacity = snapshot.team.reduce((s, m) => s + m.capacity, 0);
  const totalActive = snapshot.team.reduce((s, m) => s + m.activeProjects, 0);
  const teamUtilization = totalCapacity > 0 ? Math.min(totalActive / (totalCapacity * 5), 1) : 0;

  const budgetHealth =
    snapshot.budget.totalBudget > 0 ? snapshot.budget.remaining / snapshot.budget.totalBudget : 0;

  const pipelineBalance: Record<string, number> = {};
  for (const entry of snapshot.pipeline) {
    pipelineBalance[entry.stage] = (pipelineBalance[entry.stage] ?? 0) + 1;
  }

  const avgAngleEffectiveness =
    snapshot.angleEffectiveness.length > 0
      ? snapshot.angleEffectiveness.reduce((s, a) => s + a.successRate, 0) /
        snapshot.angleEffectiveness.length
      : 0;

  return { teamUtilization, budgetHealth, pipelineBalance, avgAngleEffectiveness };
}

/** Simulate a single strategy against an ecosystem snapshot using LLM analysis. */
export async function simulateStrategy(
  snapshot: EcosystemSnapshot,
  strategy: Strategy,
  model?: string,
  signal?: AbortSignal
): Promise<SimulationResult> {
  StrategySchema.parse(strategy);

  const health = computeEcosystemHealth(snapshot);
  const prompt = `You are an innovation strategy simulator. Given the following innovation ecosystem state and proposed strategy, project outcomes over ${strategy.timeHorizonWeeks} weeks.

## Ecosystem State
- Organization: ${snapshot.organizationName}
- Team size: ${snapshot.team.length} members (utilization: ${(health.teamUtilization * 100).toFixed(0)}%)
- Pipeline: ${snapshot.pipeline.length} ideas across stages: ${JSON.stringify(health.pipelineBalance)}
- Budget: ${snapshot.budget.remaining} ${snapshot.budget.currency} remaining of ${snapshot.budget.totalBudget}
- Market: ${snapshot.marketContext.industry}, ${snapshot.marketContext.competitors.length} competitors
- Top trends: ${snapshot.marketContext.trends.slice(0, 5).join(", ")}
- Angle effectiveness avg: ${(health.avgAngleEffectiveness * 100).toFixed(0)}%

## Proposed Strategy: "${strategy.name}"
${strategy.description}
${strategy.newInitiatives?.length ? `New initiatives: ${strategy.newInitiatives.join(", ")}` : ""}
${strategy.retireInitiatives?.length ? `Retiring: ${strategy.retireInitiatives.join(", ")}` : ""}
${strategy.anglePriorities?.length ? `Prioritized angles: ${strategy.anglePriorities.join(", ")}` : ""}

Respond in JSON matching this schema:
{
  "strategyId": "${strategy.id}",
  "strategyName": "${strategy.name}",
  "projectedOutcomes": { "ideasLaunched": number, "revenueImpact": string, "teamUtilization": 0-1, "budgetUtilization": 0-1, "innovationVelocity": number, "riskScore": 0-100 },
  "milestones": [{ "weekNumber": number, "event": string, "impact": "positive"|"neutral"|"negative" }],
  "risks": [string],
  "opportunities": [string],
  "recommendations": [string],
  "confidenceScore": 0-1
}`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  try {
    const parsed = JSON.parse(extractJson(raw));
    return SimulationResultSchema.parse(parsed);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse simulation result: ${parseErr instanceof Error ? parseErr.message : "invalid JSON"}`
    );
  }
}

/** Compare multiple strategies against the same ecosystem. */
export async function compareStrategies(
  snapshot: EcosystemSnapshot,
  strategies: Strategy[],
  model?: string,
  signal?: AbortSignal
): Promise<StrategyComparison> {
  if (strategies.length === 0) throw new Error("At least one strategy is required");
  if (strategies.length > 10) throw new Error("Maximum 10 strategies per comparison");

  const results: SimulationResult[] = [];
  for (const strategy of strategies) {
    const result = await simulateStrategy(snapshot, strategy, model, signal);
    results.push(result);
  }

  // Use LLM to synthesize comparison
  const comparisonPrompt = `You are an innovation strategy advisor. Compare these simulation results and determine the best strategy.

${results.map((r) => `## ${r.strategyName}\n- Ideas launched: ${r.projectedOutcomes.ideasLaunched}\n- Revenue impact: ${r.projectedOutcomes.revenueImpact}\n- Risk: ${r.projectedOutcomes.riskScore}/100\n- Confidence: ${(r.confidenceScore * 100).toFixed(0)}%\n- Key risks: ${r.risks.slice(0, 3).join("; ")}\n- Key opportunities: ${r.opportunities.slice(0, 3).join("; ")}`).join("\n\n")}

Respond in JSON: { "winner": "strategy_id or null", "summary": "string", "tradeoffs": ["string"] }`;

  const raw = await withRetry(() =>
    generateText({ prompt: comparisonPrompt, model, serverMode: true, signal })
  );

  let parsed: { winner?: string; summary?: string; tradeoffs?: string[] };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    parsed = {
      summary: "Strategy comparison generated but response parsing failed.",
      tradeoffs: [],
    };
  }

  const comparison: StrategyComparison = {
    ecosystemId: snapshot.id,
    simulatedAt: new Date().toISOString(),
    results,
    winner: parsed.winner ?? undefined,
    summary: parsed.summary ?? "Comparison complete",
    tradeoffs: parsed.tradeoffs ?? [],
  };

  const validated = StrategyComparisonSchema.parse(comparison);
  simulations.set(snapshot.id, validated);
  return validated;
}

/** Retrieve the last simulation comparison for an ecosystem. */
export function getSimulationResult(ecosystemId: string): StrategyComparison | undefined {
  return simulations.get(ecosystemId);
}

/** Clear all stored ecosystems and simulations. */
export function clearDigitalTwinData(): void {
  ecosystems.clear();
  simulations.clear();
}

/** Monte Carlo simulation engine — statistical, non-LLM simulation. */
export {
  runMonteCarloSimulation,
  runMonteCarloComparison,
  monteCarloToMarkdown,
  MonteCarloConfigSchema,
} from "./monte-carlo.js";
export type {
  MonteCarloConfig,
  MonteCarloResult,
  MonteCarloComparison,
  DistributionStats,
} from "./monte-carlo.js";

/** Digital twin entities — scenario modeling, relationships, and lightweight simulations. */
export {
  TwinEntityTypeSchema,
  TwinEntitySchema,
  ScenarioSchema,
  ScenarioComparisonSchema,
  createTwinEntity,
  getTwinEntity,
  listTwinEntities,
  addRelationship as addTwinRelationship,
  createScenario,
  getScenario,
  runMonteCarloSimulation as runTwinScenarioMonteCarloSimulation,
  compareScenarios,
  generateExecutivePacket,
  deleteTwinEntity,
  deleteScenario,
  clearTwinData,
} from "./twin-entity.js";
export type { TwinEntityType, TwinEntity, Scenario, ScenarioComparison } from "./twin-entity.js";
