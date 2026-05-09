import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CircuitBreaker,
  executeWithFailover,
  CostGuardrailManager,
  forecastPipelineCost,
  clearCircuitBreakers,
  getCircuitBreaker,
  createFailoverChain,
  getProviderHealthDashboard,
} from "../index.js";

describe("resilience", () => {
  // ---- CircuitBreaker ----

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

    it("transitions to open after N failures", () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe("closed");
      breaker.recordFailure();
      expect(breaker.getState()).toBe("open");
      expect(breaker.isAllowed()).toBe(false);
    });

    it("transitions from open to half-open after timeout", async () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      expect(breaker.getState()).toBe("open");

      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");
      expect(breaker.isAllowed()).toBe(true);
    });

    it("transitions from half-open to closed on enough successes", async () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");

      breaker.recordSuccess();
      breaker.recordSuccess();
      expect(breaker.getState()).toBe("closed");
    });

    it("transitions from half-open back to open on failure", async () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");

      breaker.recordFailure();
      expect(breaker.getState()).toBe("open");
    });

    it("reset clears state", () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      expect(breaker.getState()).toBe("open");
      breaker.reset();
      expect(breaker.getState()).toBe("closed");
      expect(breaker.isAllowed()).toBe(true);
    });

    it("getStatus returns correct info", () => {
      breaker.recordFailure();
      const status = breaker.getStatus();
      expect(status.providerId).toBe("test-provider");
      expect(status.state).toBe("closed");
      expect(status.failureCount).toBe(1);
      expect(status.lastFailure).toBeDefined();
    });
  });

  // ---- executeWithFailover ----

  describe("executeWithFailover", () => {
    it("returns result from primary on success", async () => {
      const chain = createFailoverChain({
        providers: ["primary"],
        maxRetries: 0,
        retryDelayMs: 10,
      });
      const breakers = new Map<string, CircuitBreaker>();
      const result = await executeWithFailover(chain, breakers, async (id) => `ok-${id}`);
      expect(result.result).toBe("ok-primary");
      expect(result.providerId).toBe("primary");
      expect(result.attempts).toBe(1);
    });

    it("falls back to secondary when primary fails", async () => {
      const chain = createFailoverChain({
        providers: ["primary", "secondary"],
        maxRetries: 0,
        retryDelayMs: 10,
      });
      const breakers = new Map<string, CircuitBreaker>();
      const result = await executeWithFailover(chain, breakers, async (id) => {
        if (id === "primary") throw new Error("fail");
        return `ok-${id}`;
      });
      expect(result.result).toBe("ok-secondary");
      expect(result.providerId).toBe("secondary");
    });

    it("throws when all providers fail", async () => {
      const chain = createFailoverChain({
        providers: ["a", "b"],
        maxRetries: 0,
        retryDelayMs: 10,
      });
      const breakers = new Map<string, CircuitBreaker>();
      await expect(
        executeWithFailover(chain, breakers, async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");
    });

    it("uses exponential backoff on retries", async () => {
      const chain = createFailoverChain({
        providers: ["a"],
        maxRetries: 2,
        retryDelayMs: 10,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      });
      let attempts = 0;
      const breakers = new Map<string, CircuitBreaker>();
      const start = Date.now();
      await expect(
        executeWithFailover(chain, breakers, async () => {
          attempts++;
          throw new Error("fail");
        })
      ).rejects.toThrow();
      expect(attempts).toBe(3); // initial + 2 retries
      expect(Date.now() - start).toBeGreaterThanOrEqual(20); // 10 + 20ms minimum
    });

    it("skips providers with open circuit breakers", async () => {
      const chain = createFailoverChain({
        providers: ["broken", "working"],
        maxRetries: 0,
        retryDelayMs: 10,
      });
      const broken = new CircuitBreaker("broken", { failureThreshold: 1 });
      broken.recordFailure();
      const breakers = new Map([["broken", broken]]);
      const result = await executeWithFailover(chain, breakers, async (id) => `ok-${id}`);
      expect(result.providerId).toBe("working");
    });
  });

  // ---- CostGuardrailManager ----

  describe("CostGuardrailManager", () => {
    it("allows requests within session budget", () => {
      const mgr = new CostGuardrailManager({ sessionBudgetUsd: 1.0, warningThresholdPct: 80 });
      const result = mgr.checkBudget(0.5);
      expect(result.allowed).toBe(true);
    });

    it("rejects requests exceeding session budget", () => {
      const mgr = new CostGuardrailManager({ sessionBudgetUsd: 1.0, warningThresholdPct: 80 });
      mgr.recordSpend(0.9);
      const result = mgr.checkBudget(0.2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Session budget exceeded");
    });

    it("rejects requests exceeding per-request max", () => {
      const mgr = new CostGuardrailManager({
        perRequestMaxUsd: 0.1,
        warningThresholdPct: 80,
      });
      const result = mgr.checkBudget(0.5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("per-request limit");
    });

    it("rejects requests exceeding monthly budget", () => {
      const mgr = new CostGuardrailManager({
        monthlyBudgetUsd: 10.0,
        warningThresholdPct: 80,
      });
      mgr.recordSpend(9.5);
      const result = mgr.checkBudget(1.0);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Monthly budget exceeded");
    });

    it("returns warning when approaching session budget", () => {
      const mgr = new CostGuardrailManager({
        sessionBudgetUsd: 1.0,
        warningThresholdPct: 80,
      });
      mgr.recordSpend(0.79);
      const result = mgr.checkBudget(0.05);
      expect(result.allowed).toBe(true);
      expect(result.warningPct).toBeGreaterThanOrEqual(80);
    });

    it("tracks spend summary correctly", () => {
      const mgr = new CostGuardrailManager({
        sessionBudgetUsd: 10.0,
        monthlyBudgetUsd: 100.0,
        warningThresholdPct: 80,
      });
      mgr.recordSpend(2.5);
      mgr.recordSpend(1.5);
      const summary = mgr.getSpendSummary();
      expect(summary.sessionSpend).toBe(4.0);
      expect(summary.monthlySpend).toBe(4.0);
      expect(summary.sessionPct).toBeCloseTo(40);
      expect(summary.monthlyPct).toBeCloseTo(4);
    });

    it("resets session spend", () => {
      const mgr = new CostGuardrailManager({
        sessionBudgetUsd: 10.0,
        warningThresholdPct: 80,
      });
      mgr.recordSpend(5.0);
      mgr.resetSession();
      expect(mgr.getSpendSummary().sessionSpend).toBe(0);
    });
  });

  // ---- forecastPipelineCost ----

  describe("forecastPipelineCost", () => {
    it("calculates cost for multi-stage pipeline", () => {
      const result = forecastPipelineCost({
        angleCount: 3,
        avgInputTokens: 1000,
        avgOutputTokens: 500,
        inputCostPer1k: 0.01,
        outputCostPer1k: 0.03,
      });
      expect(result.estimatedCostUsd).toBeGreaterThan(0);
      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown.map((b) => b.stage)).toEqual([
        "investigate",
        "generate",
        "synthesize",
      ]);
    });

    it("handles zero angles", () => {
      const result = forecastPipelineCost({
        angleCount: 0,
        avgInputTokens: 1000,
        avgOutputTokens: 500,
        inputCostPer1k: 0.01,
        outputCostPer1k: 0.03,
      });
      expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- Provider Health Dashboard ----

  describe("provider health", () => {
    beforeEach(() => {
      clearCircuitBreakers();
    });

    it("getCircuitBreaker creates and caches breakers", () => {
      const b1 = getCircuitBreaker("p1");
      const b2 = getCircuitBreaker("p1");
      expect(b1).toBe(b2);
    });

    it("dashboard returns all breakers", () => {
      getCircuitBreaker("p1");
      getCircuitBreaker("p2");
      const dashboard = getProviderHealthDashboard();
      expect(dashboard).toHaveLength(2);
    });
  });
});
