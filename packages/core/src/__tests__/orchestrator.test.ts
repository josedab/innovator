import { beforeEach, describe, expect, it } from "vitest";
import {
  advancePlan,
  branchExploration,
  clearOrchestratorData,
  createObjective,
  decomposeObjective,
  executeStep,
  generateStrategyOutput,
  getBudgetStatus,
  getPlan,
  getStrategyOutput,
} from "../autonomous-agent/orchestrator.js";

describe("autonomous-agent/orchestrator", () => {
  beforeEach(() => {
    clearOrchestratorData();
  });

  it("creates objectives and decomposes them into execution plans", () => {
    const objective = createObjective("Launch an AI workflow copilot", {
      constraints: ["No new headcount", "Ship in Q2"],
      targetOutcomes: ["Cut support time", "Improve activation"],
    });

    const plan = decomposeObjective(objective.id, 1200);
    expect(plan).toBeDefined();
    expect(plan?.objectiveId).toBe(objective.id);
    expect(plan?.status).toBe("planning");
    expect(plan?.steps.length).toBeGreaterThanOrEqual(5);
    expect(plan?.steps.every((step) => step.planId === plan.id)).toBe(true);
  });

  it("executes steps and tracks budget usage", () => {
    const objective = createObjective("Expand into the mid-market");
    const plan = decomposeObjective(objective.id, 600)!;
    const step = executeStep(plan.id, plan.steps[0].id);
    const budget = getBudgetStatus(plan.id);

    expect(step?.status).toBe("completed");
    expect(step?.tokenCost).toBeGreaterThan(0);
    expect(step?.result).toContain("Investigation completed");
    expect(budget).toEqual({
      total: 600,
      used: step?.tokenCost ?? 0,
      remaining: 600 - (step?.tokenCost ?? 0),
    });
  });

  it("marks a step as failed when budget is insufficient", () => {
    const objective = createObjective("Test a tiny budget plan");
    const plan = decomposeObjective(objective.id, 50)!;
    const step = executeStep(plan.id, plan.steps[0].id);

    expect(step?.status).toBe("failed");
    expect(getPlan(plan.id)?.status).toBe("failed");
  });

  it("advances a plan until completion", () => {
    const objective = createObjective("Create a strategic expansion thesis");
    const initialPlan = decomposeObjective(objective.id, 2000)!;

    let plan = initialPlan;
    while (plan.status !== "completed" && plan.status !== "failed") {
      plan = advancePlan(plan.id)!;
    }

    expect(plan.status).toBe("completed");
    expect(plan.steps.every((step) => step.status === "completed")).toBe(true);
  });

  it("branches a plan around a parent step", () => {
    const objective = createObjective("Explore adjacencies for a compliance product");
    const plan = decomposeObjective(objective.id, 1000)!;
    const branched = branchExploration(
      plan.id,
      plan.steps[0].id,
      "Investigate healthcare adjacency"
    )!;

    expect(branched.branches).toHaveLength(1);
    expect(branched.branches?.[0]).toEqual(
      expect.objectContaining({
        parentStepId: plan.steps[0].id,
        reason: "Investigate healthcare adjacency",
      })
    );
    expect(branched.branches?.[0].steps).toHaveLength(2);
  });

  it("generates and stores strategy output from a completed plan", () => {
    const objective = createObjective("Prioritize ecosystem partnerships", {
      targetOutcomes: ["Increase pipeline", "Reduce delivery risk"],
    });
    const initialPlan = decomposeObjective(objective.id, 2000)!;

    let plan = initialPlan;
    while (plan.status !== "completed" && plan.status !== "failed") {
      plan = advancePlan(plan.id)!;
    }

    const output = generateStrategyOutput(plan.id);
    expect(output).toBeDefined();
    expect(output?.findings.length).toBeGreaterThan(0);
    expect(output?.recommendations.length).toBeGreaterThan(0);
    expect(output?.confidenceAssessment.overall).toBeGreaterThan(0);
    expect(getStrategyOutput(output!.id)).toEqual(output);
  });

  it("returns undefined for unknown plans or outputs", () => {
    expect(getPlan("missing")).toBeUndefined();
    expect(getBudgetStatus("missing")).toBeUndefined();
    expect(generateStrategyOutput("missing")).toBeUndefined();
    expect(getStrategyOutput("missing")).toBeUndefined();
  });
});
