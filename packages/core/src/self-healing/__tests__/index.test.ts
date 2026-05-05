import { describe, it, expect, beforeEach } from "vitest";
import {
  getCircuitBreaker,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  classifyError,
  selectRecoveryStrategy,
  withSelfHealing,
  getPipelineHealth,
  getRecentFailures,
  resetSelfHealing,
} from "../index.js";

describe("self-healing", () => {
  beforeEach(() => {
    resetSelfHealing();
  });

  describe("circuit breaker state machine", () => {
    it("getCircuitBreaker creates new breaker in closed state", () => {
      const cb = getCircuitBreaker("openai");
      expect(cb.state).toBe("closed");
      expect(cb.failureCount).toBe(0);
    });

    it("getCircuitBreaker returns same breaker on second call", () => {
      const cb1 = getCircuitBreaker("openai");
      const cb2 = getCircuitBreaker("openai");
      expect(cb1).toBe(cb2);
    });

    it("isCircuitOpen returns false for closed circuit", () => {
      getCircuitBreaker("openai");
      expect(isCircuitOpen("openai")).toBe(false);
    });

    it("recordFailure trips circuit after threshold (default 3)", () => {
      recordFailure("openai", "generation", "timeout", "timed out");
      recordFailure("openai", "generation", "timeout", "timed out");
      expect(isCircuitOpen("openai")).toBe(false); // 2 failures, not yet tripped
      recordFailure("openai", "generation", "timeout", "timed out");
      expect(isCircuitOpen("openai")).toBe(true); // 3 failures, tripped
    });

    it("recordFailure trips with custom threshold", () => {
      recordFailure("openai", "generation", "timeout", "timed out", "model", {
        failureThreshold: 1,
      });
      expect(isCircuitOpen("openai")).toBe(true);
    });

    it("open circuit transitions to half-open after recovery timeout", () => {
      recordFailure("openai", "generation", "timeout", "err", "model", { failureThreshold: 1 });
      expect(isCircuitOpen("openai")).toBe(true);
      // Override openedAt to past
      const cb = getCircuitBreaker("openai");
      cb.openedAt = new Date(Date.now() - 120_000).toISOString();
      expect(isCircuitOpen("openai", { recoveryTimeout: 60_000 })).toBe(false);
      expect(cb.state).toBe("half-open");
    });

    it("half-open circuit allows limited attempts", () => {
      const cb = getCircuitBreaker("openai");
      cb.state = "half-open";
      cb.halfOpenAttempts = 0;
      expect(isCircuitOpen("openai", { halfOpenMaxAttempts: 2 })).toBe(false);
      cb.halfOpenAttempts = 2;
      expect(isCircuitOpen("openai", { halfOpenMaxAttempts: 2 })).toBe(true);
    });

    it("recordSuccess closes half-open circuit", () => {
      const cb = getCircuitBreaker("openai");
      cb.state = "half-open";
      cb.failureCount = 5;
      recordSuccess("openai");
      expect(cb.state).toBe("closed");
      expect(cb.failureCount).toBe(0);
    });

    it("recordSuccess on closed circuit just updates lastSuccess", () => {
      getCircuitBreaker("openai");
      recordSuccess("openai");
      const cb = getCircuitBreaker("openai");
      expect(cb.state).toBe("closed");
      expect(cb.lastSuccess).toBeTruthy();
    });

    it("recordFailure in half-open immediately opens circuit", () => {
      const cb = getCircuitBreaker("openai");
      cb.state = "half-open";
      recordFailure("openai", "generation", "timeout", "err");
      expect(cb.state).toBe("open");
    });
  });

  describe("classifyError", () => {
    it("classifies timeout errors", () => {
      expect(classifyError(new Error("Request timed out"))).toBe("timeout");
      expect(classifyError(new Error("timeout exceeded"))).toBe("timeout");
    });

    it("classifies rate limit errors", () => {
      expect(classifyError(new Error("429 Too Many Requests"))).toBe("rate-limit");
      expect(classifyError(new Error("rate limit exceeded"))).toBe("rate-limit");
      expect(classifyError(new Error("too many requests"))).toBe("rate-limit");
    });

    it("classifies parse errors", () => {
      expect(classifyError(new Error("JSON parse error"))).toBe("parse-error");
      expect(classifyError(new Error("No JSON object found"))).toBe("parse-error");
    });

    it("classifies auth errors", () => {
      expect(classifyError(new Error("401 Unauthorized"))).toBe("auth-error");
      expect(classifyError(new Error("403 Forbidden"))).toBe("auth-error");
      expect(classifyError(new Error("Invalid auth token"))).toBe("auth-error");
    });

    it("classifies network errors", () => {
      expect(classifyError(new Error("ECONNREFUSED"))).toBe("network-error");
      expect(classifyError(new Error("fetch failed"))).toBe("network-error");
      expect(classifyError(new Error("network error"))).toBe("network-error");
    });

    it("classifies unknown errors", () => {
      expect(classifyError(new Error("something weird happened"))).toBe("unknown");
    });

    it("handles non-Error objects", () => {
      expect(classifyError("timeout string")).toBe("timeout");
      expect(classifyError(42)).toBe("unknown");
    });
  });

  describe("selectRecoveryStrategy", () => {
    it("rate-limit → provider-switch when fallback available", () => {
      const failure = {
        id: "f1",
        stage: "generation" as const,
        provider: "openai",
        model: "gpt-4",
        errorType: "rate-limit" as const,
        errorMessage: "429",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
      const strategy = selectRecoveryStrategy(failure);
      expect(strategy.type).toBe("provider-switch");
      expect(strategy.toProvider).toBeTruthy();
    });

    it("timeout → model-downgrade to mini model", () => {
      const failure = {
        id: "f1",
        stage: "generation" as const,
        provider: "openai",
        model: "gpt-4",
        errorType: "timeout" as const,
        errorMessage: "timed out",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
      const strategy = selectRecoveryStrategy(failure);
      expect(strategy.type).toBe("model-downgrade");
      expect(strategy.toModel).toContain("mini");
    });

    it("parse-error → prompt-simplify when enabled", () => {
      const failure = {
        id: "f1",
        stage: "generation" as const,
        provider: "openai",
        model: "gpt-4",
        errorType: "parse-error" as const,
        errorMessage: "JSON parse",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
      const strategy = selectRecoveryStrategy(failure, { enablePromptSimplification: true });
      expect(strategy.type).toBe("prompt-simplify");
    });

    it("parse-error → retry-backoff when simplification disabled", () => {
      const failure = {
        id: "f1",
        stage: "generation" as const,
        provider: "openai",
        model: "gpt-4",
        errorType: "parse-error" as const,
        errorMessage: "JSON parse",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
      const strategy = selectRecoveryStrategy(failure, { enablePromptSimplification: false });
      expect(strategy.type).toBe("retry-backoff");
    });

    it("unknown error → retry-backoff", () => {
      const failure = {
        id: "f1",
        stage: "generation" as const,
        provider: "openai",
        model: "gpt-4",
        errorType: "unknown" as const,
        errorMessage: "weird",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
      const strategy = selectRecoveryStrategy(failure);
      expect(strategy.type).toBe("retry-backoff");
    });

    it("network-error → provider-switch", () => {
      const failure = {
        id: "f1",
        stage: "generation" as const,
        provider: "openai",
        model: "gpt-4",
        errorType: "network-error" as const,
        errorMessage: "ECONNREFUSED",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
      const strategy = selectRecoveryStrategy(failure);
      expect(strategy.type).toBe("provider-switch");
    });
  });

  describe("withSelfHealing", () => {
    it("returns result on immediate success", async () => {
      const { result, recoveries } = await withSelfHealing(async () => "success", {
        provider: "openai",
        model: "gpt-4",
        stage: "generation",
      });
      expect(result).toBe("success");
      expect(recoveries).toHaveLength(0);
    });

    it("retries and succeeds on second attempt", async () => {
      let attempt = 0;
      const { result, recoveries } = await withSelfHealing(
        async () => {
          attempt++;
          if (attempt === 1) throw new Error("timeout");
          return "recovered";
        },
        { provider: "openai", model: "gpt-4", stage: "generation", maxAttempts: 3 }
      );
      expect(result).toBe("recovered");
      expect(recoveries.length).toBeGreaterThan(0);
    });

    it("throws after exhausting all attempts", async () => {
      await expect(
        withSelfHealing(
          async () => {
            throw new Error("always fails");
          },
          { provider: "openai", model: "gpt-4", stage: "generation", maxAttempts: 2 }
        )
      ).rejects.toThrow("always fails");
    });

    it("switches provider when circuit is open", async () => {
      // Trip the circuit for openai
      recordFailure("openai", "generation", "timeout", "err", "gpt-4", { failureThreshold: 1 });

      let usedProvider = "";
      const { result } = await withSelfHealing(
        async (provider) => {
          usedProvider = provider;
          return "ok";
        },
        { provider: "openai", model: "gpt-4", stage: "generation" }
      );
      expect(result).toBe("ok");
      expect(usedProvider).not.toBe("openai");
    });
  });

  describe("getPipelineHealth", () => {
    it("returns healthy status with no failures", () => {
      const health = getPipelineHealth();
      expect(health.successRate).toBe(1);
      expect(health.totalFailures).toBe(0);
      expect(health.activeCircuitBreakers).toBe(0);
    });

    it("includes provider health after failures", () => {
      recordFailure("openai", "generation", "timeout", "err");
      const health = getPipelineHealth();
      expect(health.totalFailures).toBe(1);
      expect(health.providerHealth.length).toBeGreaterThan(0);
    });
  });

  describe("getRecentFailures", () => {
    it("returns recent failures in reverse order", () => {
      recordFailure("p1", "generation", "timeout", "err1");
      recordFailure("p2", "generation", "timeout", "err2");
      const failures = getRecentFailures(10);
      expect(failures.length).toBe(2);
      expect(failures[0].provider).toBe("p2");
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) {
        recordFailure("p1", "generation", "timeout", `err${i}`);
      }
      expect(getRecentFailures(3).length).toBe(3);
    });
  });

  describe("resetSelfHealing", () => {
    it("clears all state", () => {
      recordFailure("openai", "generation", "timeout", "err");
      resetSelfHealing();
      expect(getRecentFailures()).toHaveLength(0);
      expect(getPipelineHealth().activeCircuitBreakers).toBe(0);
    });
  });
});
