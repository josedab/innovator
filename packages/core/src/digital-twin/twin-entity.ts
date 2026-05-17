import { randomUUID } from "node:crypto";
import { z } from "zod";

const TwinAttributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const RelationshipTypeSchema = z.enum([
  "depends-on",
  "competes-with",
  "enables",
  "constrains",
  "influences",
]);
const ScenarioAssumptionSchema = z.object({
  entityId: z.string(),
  attribute: z.string(),
  value: TwinAttributeValueSchema,
  probability: z.number().min(0).max(1).optional(),
});
const ScenarioDeltaSchema = z.object({
  attribute: z.string(),
  scenarios: z.record(z.string(), TwinAttributeValueSchema),
});

export const TwinEntityTypeSchema = z.enum([
  "product",
  "team",
  "market",
  "regulation",
  "competitor",
  "assumption",
]);
export type TwinEntityType = z.infer<typeof TwinEntityTypeSchema>;

export const TwinEntitySchema = z.object({
  id: z.string(),
  name: z.string().max(500),
  type: TwinEntityTypeSchema,
  attributes: z.record(z.string(), TwinAttributeValueSchema),
  relationships: z
    .array(
      z.object({
        targetId: z.string(),
        type: RelationshipTypeSchema,
        strength: z.number().min(0).max(1),
      })
    )
    .max(50),
  createdAt: z.string(),
});
export type TwinEntity = z.infer<typeof TwinEntitySchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string().max(500),
  description: z.string().max(2000),
  assumptions: z.array(ScenarioAssumptionSchema).max(50),
  outcomes: z.record(z.string(), z.number()).optional(),
  simulationRuns: z.number().optional(),
  createdAt: z.string(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenarioComparisonSchema = z.object({
  scenarioIds: z.array(z.string()),
  deltas: z.array(ScenarioDeltaSchema),
  recommendation: z.string().max(2000),
  generatedAt: z.string(),
});
export type ScenarioComparison = z.infer<typeof ScenarioComparisonSchema>;

const entities = new Map<string, TwinEntity>();
const scenarios = new Map<string, Scenario>();

function now(): string {
  return new Date().toISOString();
}

function cloneEntity(entity: TwinEntity): TwinEntity {
  return TwinEntitySchema.parse(entity);
}

function cloneScenario(scenario: Scenario): Scenario {
  return ScenarioSchema.parse(scenario);
}

function formatAssumptionKey(assumption: Scenario["assumptions"][number]): string {
  const entityName = entities.get(assumption.entityId)?.name ?? assumption.entityId;
  return `${entityName}.${assumption.attribute}=${String(assumption.value)}`;
}

export function createTwinEntity(
  name: string,
  type: TwinEntityType,
  attributes: Record<string, string | number | boolean> = {}
): TwinEntity {
  const entity = TwinEntitySchema.parse({
    id: randomUUID(),
    name: name.trim(),
    type,
    attributes,
    relationships: [],
    createdAt: now(),
  });
  entities.set(entity.id, entity);
  return cloneEntity(entity);
}

export function getTwinEntity(id: string): TwinEntity | undefined {
  const entity = entities.get(id);
  return entity ? cloneEntity(entity) : undefined;
}

export function listTwinEntities(type?: TwinEntityType): TwinEntity[] {
  return Array.from(entities.values())
    .filter((entity) => !type || entity.type === type)
    .map((entity) => cloneEntity(entity));
}

export function addRelationship(
  entityId: string,
  targetId: string,
  type: string,
  strength: number = 0.5
): TwinEntity | undefined {
  const entity = entities.get(entityId);
  const target = entities.get(targetId);
  if (!entity || !target) return undefined;

  const relationshipType = RelationshipTypeSchema.safeParse(type);
  if (!relationshipType.success) return undefined;

  const nextRelationships = entity.relationships.filter(
    (relationship) =>
      !(relationship.targetId === targetId && relationship.type === relationshipType.data)
  );
  nextRelationships.push({
    targetId,
    type: relationshipType.data,
    strength: Math.max(0, Math.min(1, strength)),
  });

  const updated = TwinEntitySchema.parse({
    ...entity,
    relationships: nextRelationships,
  });
  entities.set(entityId, updated);
  return cloneEntity(updated);
}

export function createScenario(
  name: string,
  description: string,
  assumptions: Array<{
    entityId: string;
    attribute: string;
    value: string | number | boolean;
    probability?: number;
  }> = []
): Scenario {
  const scenario = ScenarioSchema.parse({
    id: randomUUID(),
    name: name.trim(),
    description: description.trim(),
    assumptions,
    createdAt: now(),
  });
  scenarios.set(scenario.id, scenario);
  return cloneScenario(scenario);
}

export function getScenario(id: string): Scenario | undefined {
  const scenario = scenarios.get(id);
  return scenario ? cloneScenario(scenario) : undefined;
}

export function runMonteCarloSimulation(scenarioId: string, runs: number = 100): Scenario | undefined {
  const scenario = scenarios.get(scenarioId);
  if (!scenario) return undefined;

  const iterations = Math.max(1, Math.round(runs));
  const outcomeCounts: Record<string, number> = {};

  for (let i = 0; i < iterations; i += 1) {
    const triggered = scenario.assumptions.filter(
      (assumption) => assumption.probability === undefined || Math.random() <= assumption.probability
    );
    const outcomeKey = triggered.length > 0
      ? triggered.map((assumption) => formatAssumptionKey(assumption)).sort().join(" | ")
      : "baseline";
    outcomeCounts[outcomeKey] = (outcomeCounts[outcomeKey] ?? 0) + 1;
  }

  const normalizedOutcomes = Object.fromEntries(
    Object.entries(outcomeCounts).map(([outcome, count]) => [
      outcome,
      Number((count / iterations).toFixed(4)),
    ])
  );

  const updated = ScenarioSchema.parse({
    ...scenario,
    outcomes: normalizedOutcomes,
    simulationRuns: iterations,
  });
  scenarios.set(scenarioId, updated);
  return cloneScenario(updated);
}

export function compareScenarios(scenarioIds: string[]): ScenarioComparison | undefined {
  if (scenarioIds.length === 0) return undefined;
  const selected = scenarioIds.map((scenarioId) => scenarios.get(scenarioId));
  if (selected.some((scenario) => !scenario)) return undefined;

  const scenariosById = selected as Scenario[];
  const assumptionKeys = new Set(
    scenariosById.flatMap((scenario) =>
      scenario.assumptions.map((assumption) => `${assumption.entityId}.${assumption.attribute}`)
    )
  );

  const deltas = Array.from(assumptionKeys)
    .map((key) => {
      const values = Object.fromEntries(
        scenariosById.flatMap((scenario) => {
          const match = scenario.assumptions.find(
            (assumption) => `${assumption.entityId}.${assumption.attribute}` === key
          );
          return match ? [[scenario.id, match.value]] : [];
        })
      );
      return ScenarioDeltaSchema.parse({
        attribute: key,
        scenarios: values,
      });
    })
    .filter((delta) => new Set(Object.values(delta.scenarios).map(String)).size > 1);

  const bestScenario = scenariosById
    .map((scenario) => ({
      scenario,
      bestOutcome: Math.max(...Object.values(scenario.outcomes ?? { baseline: 0 })),
      assumptionCount: scenario.assumptions.length,
    }))
    .sort((left, right) =>
      right.bestOutcome - left.bestOutcome || right.assumptionCount - left.assumptionCount
    )[0]?.scenario;

  return ScenarioComparisonSchema.parse({
    scenarioIds,
    deltas,
    recommendation: bestScenario
      ? `Prioritize ${bestScenario.name} because it combines the strongest simulated signal with clear assumption coverage.`
      : "Run simulations on each scenario to produce a stronger recommendation.",
    generatedAt: now(),
  });
}

export function generateExecutivePacket(scenarioId: string): string {
  const scenario = scenarios.get(scenarioId);
  if (!scenario) return `# Executive Packet\n\nScenario ${scenarioId} was not found.`;

  const assumptionLines = scenario.assumptions.length > 0
    ? scenario.assumptions.map((assumption) =>
        `- ${formatAssumptionKey(assumption)}${assumption.probability !== undefined ? ` (p=${assumption.probability})` : ""}`
      )
    : ["- No explicit assumptions recorded."];
  const outcomeLines = Object.entries(scenario.outcomes ?? {}).length > 0
    ? Object.entries(scenario.outcomes ?? {})
        .sort((left, right) => right[1] - left[1])
        .map(([outcome, probability]) => `- ${outcome}: ${(probability * 100).toFixed(1)}%`)
    : ["- No simulation outcomes available yet."];

  return [
    `# Executive Packet: ${scenario.name}`,
    "",
    scenario.description,
    "",
    "## Assumptions",
    "",
    ...assumptionLines,
    "",
    "## Outcomes",
    "",
    ...outcomeLines,
    "",
    scenario.simulationRuns ? `Simulation runs: ${scenario.simulationRuns}` : "Simulation runs: not executed",
  ].join("\n");
}

export function deleteTwinEntity(id: string): boolean {
  if (!entities.has(id)) return false;

  entities.delete(id);
  for (const [entityId, entity] of entities.entries()) {
    const updated = TwinEntitySchema.parse({
      ...entity,
      relationships: entity.relationships.filter((relationship) => relationship.targetId !== id),
    });
    entities.set(entityId, updated);
  }

  for (const [scenarioId, scenario] of scenarios.entries()) {
    const updated = ScenarioSchema.parse({
      ...scenario,
      assumptions: scenario.assumptions.filter((assumption) => assumption.entityId !== id),
    });
    scenarios.set(scenarioId, updated);
  }

  return true;
}

export function deleteScenario(id: string): boolean {
  return scenarios.delete(id);
}

export function clearTwinData(): void {
  entities.clear();
  scenarios.clear();
}
