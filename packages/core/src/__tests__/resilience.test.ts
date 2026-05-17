import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  CircuitBreaker,
  executeWithFailover,
  CostGuardrailManager,
  forecastPipelineCost,
  getCircuitBreaker,
  getProviderHealthDashboard,
  clearCircuitBreakers,
  createFailoverChain,
} from "../resilience/index.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test-provider", {
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenMaxAttempts: 2,
      monitorWindowMs: 5000,
    });
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toBe("closed");
    expect(breaker.isAllowed()).toBe(true);
  });

  it("opens after reaching failure threshold", () => {
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");

    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    expect(breaker.isAllowed()).toBe(false);
  });

  it("transitions to half-open after reset timeout", async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 150));
    expect(breaker.getState()).toBe("half-open");
    expect(breaker.isAllowed()).toBe(true);
  });

  it("closes from half-open after sufficient successes", async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    await new Promise((r) => setTimeout(r, 150));
    expect(breaker.getState()).toBe("half-open");

    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
  });

  it("re-opens from half-open on failure", async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    await new Promise((r) => setTimeout(r, 150));
    expect(breaker.getState()).toBe("half-open");

    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
  });

  it("resets to initial state", () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");

    breaker.reset();
    expect(breaker.getState()).toBe("closed");
    expect(breaker.isAllowed()).toBe(true);
  });

  it("returns status for monitoring", () => {
    breaker.recordFailure();
    const status = breaker.getStatus();
    expect(status).toEqual({
      providerId: "test-provider",
      state: "closed",
      failureCount: 1,
      lastFailure: expect.any(String),
    });
  });

  it("returns null lastFailure when no failures", () => {
    const status = breaker.getStatus();
    expect(status.lastFailure).toBeNull();
  });
});

describe("executeWithFailover", () => {
  let breakers: Map<string, CircuitBreaker>;

  beforeEach(() => {
    breakers = new Map();
    breakers.set(
      "primary",
      new CircuitBreaker("primary", { failureThreshold: 2, resetTimeoutMs: 100 })
    );
    breakers.set(
      "secondary",
      new CircuitBreaker("secondary", { failureThreshold: 2, resetTimeoutMs: 100 })
    );
  });

  it("returns result from first working provider", async () => {
    const chain = createFailoverChain({
      providers: ["primary", "secondary"],
      maxRetries: 0,
      retryDelayMs: 10,
    });

    const result = await executeWithFailover(chain, breakers, async (providerId) => {
      return `result-from-${providerId}`;
    });

    expect(result.result).toBe("result-from-primary");
    expect(result.providerId).toBe("primary");
    expect(result.attempts).toBe(1);
  });

  it("fails over to secondary when primary fails", async () => {
    const chain = createFailoverChain({
      providers: ["primary", "secondary"],
      maxRetries: 0,
      retryDelayMs: 10,
    });

    const result = await executeWithFailover(chain, breakers, async (providerId) => {
      if (providerId === "primary") throw new Error("primary down");
      return `result-from-${providerId}`;
    });

    expect(result.result).toBe("result-from-secondary");
    expect(result.providerId).toBe("secondary");
  });

  it("retries within a provider before failing over", async () => {
    const chain = createFailoverChain({
      providers: ["primary"],
      maxRetries: 2,
      retryDelayMs: 10,
    });

    let attempts = 0;
    const result = await executeWithFailover(chain, breakers, async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "success";
    });

    expect(result.result).toBe("success");
    expect(result.attempts).toBe(3);
  });

  it("throws when all providers exhausted", async () => {
    const chain = createFailoverChain({
      providers: ["primary", "secondary"],
      maxRetries: 0,
      retryDelayMs: 10,
    });

    await expect(
      executeWithFailover(chain, breakers, async () => {
        throw new Error("all down");
      })
    ).rejects.toThrow("all down");
  });

  it("skips providers with open circuit breakers", async () => {
    const chain = createFailoverChain({
      providers: ["primary", "secondary"],
      maxRetries: 0,
      retryDelayMs: 10,
    });

    // Open the primary breaker
    const primaryBreaker = breakers.get("primary")!;
    primaryBreaker.recordFailure();
    primaryBreaker.recordFailure();
    expect(primaryBreaker.getState()).toBe("open");

    const result = await executeWithFailover(chain, breakers, async (providerId) => {
      return `result-from-${providerId}`;
    });

    expect(result.providerId).toBe("secondary");
  });
});

describe("CostGuardrailManager", () => {
  it("allows requests within budget", () => {
    const manager = new CostGuardrailManager({
      sessionBudgetUsd: 10,
      warningThresholdPct: 80,
    });

    const result = manager.checkBudget(1);
    expect(result.allowed).toBe(true);
  });

  it("denies requests exceeding per-request limit", () => {
    const manager = new CostGuardrailManager({
      perRequestMaxUsd: 0.5,
      warningThresholdPct: 80,
    });

    const result = manager.checkBudget(1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per-request limit");
  });

  it("denies requests exceeding session budget", () => {
    const manager = new CostGuardrailManager({
      sessionBudgetUsd: 1,
      warningThresholdPct: 80,
    });

    manager.recordSpend(0.9);
    const result = manager.checkBudget(0.2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Session budget exceeded");
  });

  it("returns warning when approaching session budget threshold", () => {
    const manager = new CostGuardrailManager({
      sessionBudgetUsd: 10,
      warningThresholdPct: 80,
    });

    manager.recordSpend(8);
    const result = manager.checkBudget(0.5);
    expect(result.allowed).toBe(true);
    expect(result.warningPct).toBeGreaterThanOrEqual(80);
  });

  it("denies requests exceeding monthly budget", () => {
    const manager = new CostGuardrailManager({
      monthlyBudgetUsd: 100,
      warningThresholdPct: 80,
    });

    manager.recordSpend(99);
    const result = manager.checkBudget(2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly budget exceeded");
  });

  it("accumulates warnings on budget violations", () => {
    const manager = new CostGuardrailManager({
      perRequestMaxUsd: 0.5,
      warningThresholdPct: 80,
    });

    manager.checkBudget(1);
    manager.checkBudget(2);
    const warnings = manager.getWarnings();
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("per-request limit");
  });

  it("accumulates warnings when approaching thresholds", () => {
    const manager = new CostGuardrailManager({
      sessionBudgetUsd: 10,
      warningThresholdPct: 80,
    });

    manager.recordSpend(8.5);
    manager.checkBudget(0.1);
    const warnings = manager.getWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Session budget warning");
  });

  it("clears warnings", () => {
    const manager = new CostGuardrailManager({
      perRequestMaxUsd: 0.5,
      warningThresholdPct: 80,
    });

    manager.checkBudget(1);
    expect(manager.getWarnings()).toHaveLength(1);

    manager.clearWarnings();
    expect(manager.getWarnings()).toHaveLength(0);
  });

  it("resets session spend and warnings", () => {
    const manager = new CostGuardrailManager({
      sessionBudgetUsd: 10,
      perRequestMaxUsd: 0.5,
      warningThresholdPct: 80,
    });

    manager.recordSpend(5);
    manager.checkBudget(1); // generates warning
    manager.resetSession();

    const summary = manager.getSpendSummary();
    expect(summary.sessionSpend).toBe(0);
    expect(manager.getWarnings()).toHaveLength(0);
  });

  it("provides accurate spend summary", () => {
    const manager = new CostGuardrailManager({
      sessionBudgetUsd: 10,
      monthlyBudgetUsd: 100,
      warningThresholdPct: 80,
    });

    manager.recordSpend(3);
    const summary = manager.getSpendSummary();
    expect(summary.sessionSpend).toBe(3);
    expect(summary.monthlySpend).toBe(3);
    expect(summary.sessionBudget).toBe(10);
    expect(summary.monthlyBudget).toBe(100);
    expect(summary.sessionPct).toBe(30);
    expect(summary.monthlyPct).toBe(3);
  });
});

describe("forecastPipelineCost", () => {
  it("computes cost breakdown for pipeline", () => {
    const result = forecastPipelineCost({
      angleCount: 4,
      avgInputTokens: 500,
      avgOutputTokens: 200,
      inputCostPer1k: 0.01,
      outputCostPer1k: 0.03,
    });

    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.breakdown).toHaveLength(3);
    expect(result.breakdown.map((b) => b.stage)).toEqual(["investigate", "generate", "synthesize"]);

    // Each breakdown should have a positive cost
    for (const item of result.breakdown) {
      expect(item.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    }

    // Total should equal sum of parts
    const sumParts = result.breakdown.reduce((s, b) => s + b.estimatedCostUsd, 0);
    expect(result.estimatedCostUsd).toBeCloseTo(sumParts, 4);
  });
});

describe("Provider Health Dashboard", () => {
  beforeEach(() => {
    clearCircuitBreakers();
  });

  it("creates and retrieves circuit breakers", () => {
    const breaker = getCircuitBreaker("test");
    expect(breaker.providerId).toBe("test");

    // Getting same ID returns same instance
    const same = getCircuitBreaker("test");
    expect(same).toBe(breaker);
  });

  it("shows health dashboard for all providers", () => {
    getCircuitBreaker("provider-a");
    getCircuitBreaker("provider-b");

    const dashboard = getProviderHealthDashboard();
    expect(dashboard).toHaveLength(2);
    expect(dashboard.map((d) => d.providerId).sort()).toEqual(["provider-a", "provider-b"]);
    expect(dashboard[0].state).toBe("closed");
  });

  it("clears all circuit breakers", () => {
    getCircuitBreaker("a");
    getCircuitBreaker("b");
    expect(getProviderHealthDashboard()).toHaveLength(2);

    clearCircuitBreakers();
    expect(getProviderHealthDashboard()).toHaveLength(0);
  });
});

describe("createFailoverChain", () => {
  it("returns default chain when no overrides", () => {
    const chain = createFailoverChain();
    expect(chain.providers).toEqual(["copilot", "openai", "ollama"]);
    expect(chain.maxRetries).toBe(3);
  });

  it("merges overrides with defaults", () => {
    const chain = createFailoverChain({ providers: ["a", "b"], maxRetries: 1 });
    expect(chain.providers).toEqual(["a", "b"]);
    expect(chain.maxRetries).toBe(1);
    expect(chain.retryDelayMs).toBe(1000); // default preserved
  });
});
