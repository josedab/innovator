import { beforeEach, describe, expect, it } from "vitest";
import {
  addRelationship,
  clearTwinData,
  compareScenarios,
  createScenario,
  createTwinEntity,
  deleteScenario,
  deleteTwinEntity,
  generateExecutivePacket,
  getScenario,
  getTwinEntity,
  listTwinEntities,
  runMonteCarloSimulation,
} from "../digital-twin/twin-entity.js";

describe("digital-twin/twin-entity", () => {
  beforeEach(() => {
    clearTwinData();
  });

  it("creates, retrieves, and filters twin entities", () => {
    const product = createTwinEntity("Workflow Copilot", "product", { arr: false, users: 10 });
    const team = createTwinEntity("Growth Team", "team", { capacity: 0.8 });

    expect(getTwinEntity(product.id)?.name).toBe("Workflow Copilot");
    expect(listTwinEntities()).toHaveLength(2);
    expect(listTwinEntities("team")).toEqual([expect.objectContaining({ id: team.id })]);
  });

  it("adds relationships and removes them when an entity is deleted", () => {
    const product = createTwinEntity("Workflow Copilot", "product");
    const market = createTwinEntity("Mid-market", "market");

    const updated = addRelationship(product.id, market.id, "depends-on", 0.9);
    expect(updated?.relationships).toEqual([
      expect.objectContaining({ targetId: market.id, type: "depends-on", strength: 0.9 }),
    ]);

    expect(deleteTwinEntity(market.id)).toBe(true);
    expect(getTwinEntity(product.id)?.relationships).toEqual([]);
  });

  it("creates scenarios and runs monte carlo simulations", () => {
    const market = createTwinEntity("Mid-market", "market", { demand: "steady" });
    const scenario = createScenario("Bull case", "Increase demand and pricing power", [
      { entityId: market.id, attribute: "demand", value: "surging", probability: 0.7 },
      { entityId: market.id, attribute: "pricing", value: "premium", probability: 0.4 },
    ]);

    const simulated = runMonteCarloSimulation(scenario.id, 200);
    expect(simulated?.simulationRuns).toBe(200);
    expect(simulated?.outcomes).toBeDefined();
    const totalProbability = Object.values(simulated?.outcomes ?? {}).reduce((sum, value) => sum + value, 0);
    expect(totalProbability).toBeCloseTo(1, 3);
    expect(getScenario(scenario.id)?.simulationRuns).toBe(200);
  });

  it("compares scenarios and highlights assumption deltas", () => {
    const market = createTwinEntity("Mid-market", "market");
    const optimistic = createScenario("Optimistic", "Higher willingness to pay", [
      { entityId: market.id, attribute: "price", value: "premium", probability: 0.9 },
    ]);
    const conservative = createScenario("Conservative", "Focus on adoption", [
      { entityId: market.id, attribute: "price", value: "standard", probability: 0.9 },
    ]);

    runMonteCarloSimulation(optimistic.id, 100);
    runMonteCarloSimulation(conservative.id, 100);

    const comparison = compareScenarios([optimistic.id, conservative.id]);
    expect(comparison?.scenarioIds).toEqual([optimistic.id, conservative.id]);
    expect(comparison?.deltas).toEqual([
      expect.objectContaining({
        attribute: `${market.id}.price`,
      }),
    ]);
    expect(comparison?.recommendation).toContain("Prioritize");
  });

  it("generates executive packets with assumptions and outcomes", () => {
    const product = createTwinEntity("Workflow Copilot", "product");
    const scenario = createScenario("Launch plan", "Ship the first release", [
      { entityId: product.id, attribute: "releaseWindow", value: "Q3", probability: 1 },
    ]);
    runMonteCarloSimulation(scenario.id, 10);

    const packet = generateExecutivePacket(scenario.id);
    expect(packet).toContain("# Executive Packet: Launch plan");
    expect(packet).toContain("## Assumptions");
    expect(packet).toContain("## Outcomes");
  });

  it("deletes scenarios and clears all stored data", () => {
    const product = createTwinEntity("Workflow Copilot", "product");
    const scenario = createScenario("Launch plan", "Ship the first release", [
      { entityId: product.id, attribute: "releaseWindow", value: "Q3" },
    ]);

    expect(deleteScenario(scenario.id)).toBe(true);
    expect(getScenario(scenario.id)).toBeUndefined();

    clearTwinData();
    expect(listTwinEntities()).toEqual([]);
  });
});
