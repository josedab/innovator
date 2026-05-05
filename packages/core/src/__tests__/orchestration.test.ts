import { describe, it, expect, beforeEach } from "vitest";
import {
  parseOrchestrationConfig,
  validateOrchestrationConfig,
  planOrchestration,
  applyOrchestration,
  detectDrift,
  getAppliedConfig,
  getPlanHistory,
  createSampleOrchestrationConfig,
  clearOrchestrationData,
  OrchestrationConfigSchema,
} from "../orchestration/index.js";

function makeCircularConfig() {
  return {
    version: "1",
    name: "circular-test",
    pipeline: [
      { id: "a", type: "investigate" as const, dependsOn: ["b"] },
      { id: "b", type: "generate" as const, dependsOn: ["a"] },
    ],
  };
}

describe("orchestration", () => {
  beforeEach(() => {
    clearOrchestrationData();
  });

  it("createSampleOrchestrationConfig returns valid config", () => {
    const config = createSampleOrchestrationConfig();
    expect(config).toBeDefined();
    expect(config.name).toBeDefined();
    expect(config.version).toBeDefined();
    expect(Array.isArray(config.pipeline)).toBe(true);
    const parsed = OrchestrationConfigSchema.parse(config);
    expect(parsed.name).toBe(config.name);
  });

  it("validateOrchestrationConfig returns valid for sample config", () => {
    const config = createSampleOrchestrationConfig();
    const result = validateOrchestrationConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validateOrchestrationConfig detects unknown stage dependencies", () => {
    const config = {
      version: "1",
      name: "bad-deps",
      pipeline: [{ id: "a", type: "investigate" as const, dependsOn: ["nonexistent"] }],
    };
    const result = validateOrchestrationConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateOrchestrationConfig detects circular dependencies", () => {
    const config = makeCircularConfig();
    const result = validateOrchestrationConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.toLowerCase().includes("circular"))).toBe(true);
  });

  it("planOrchestration shows additions for new config", () => {
    const config = createSampleOrchestrationConfig();
    const plan = planOrchestration(config);
    expect(plan).toBeDefined();
    expect(plan.changes.length).toBeGreaterThan(0);
  });

  it("applyOrchestration succeeds for valid config", () => {
    const config = createSampleOrchestrationConfig();
    const result = applyOrchestration(config);
    expect(result.status).toBe("success");
  });

  it("applyOrchestration fails for invalid config", () => {
    const config = makeCircularConfig();
    const result = applyOrchestration(config);
    expect(result.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("detectDrift reports no drift after fresh apply", () => {
    const config = createSampleOrchestrationConfig();
    applyOrchestration(config);
    const drift = detectDrift(config);
    expect(drift.hasDrift).toBe(false);
  });

  it("detectDrift reports drift for unapplied config", () => {
    const config = createSampleOrchestrationConfig();
    applyOrchestration(config);
    const modified = { ...config, name: "modified-name" };
    const drift = detectDrift(modified);
    expect(drift.hasDrift).toBe(true);
  });

  it("getAppliedConfig returns config after apply", () => {
    const config = createSampleOrchestrationConfig();
    applyOrchestration(config);
    const applied = getAppliedConfig(config.name);
    expect(applied).toBeDefined();
    expect(applied!.name).toBe(config.name);
  });

  it("getAppliedConfig returns undefined for unknown config", () => {
    expect(getAppliedConfig("unknown")).toBeUndefined();
  });

  it("getPlanHistory tracks plan operations", () => {
    const config = createSampleOrchestrationConfig();
    planOrchestration(config);
    planOrchestration(config);
    const history = getPlanHistory(config.name);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it("parseOrchestrationConfig parses JSON string", () => {
    const config = createSampleOrchestrationConfig();
    const json = JSON.stringify(config);
    const parsed = parseOrchestrationConfig(json);
    expect(parsed.name).toBe(config.name);
    expect(parsed.version).toBe(config.version);
  });

  it("clearOrchestrationData empties everything", () => {
    const config = createSampleOrchestrationConfig();
    applyOrchestration(config);
    clearOrchestrationData();
    expect(getAppliedConfig(config.name)).toBeUndefined();
    expect(getPlanHistory(config.name)).toHaveLength(0);
  });
});
