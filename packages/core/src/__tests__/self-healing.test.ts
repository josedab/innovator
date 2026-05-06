import { describe, it, expect, beforeEach, vi } from "vitest";
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
} from "../self-healing/index.js";
import type { PipelineFailure, RecoveryStrategy } from "../self-healing/index.js";

describe("self-healing", () => {
  beforeEach(() => {
    resetSelfHealing();
  });

  describe("circuit breaker state transitions", () => {
    it("starts in closed state", () => {
      const cb = getCircuitBreaker("provider-a");
      expect(cb.state).toBe("closed");
      expect(cb.failureCount).toBe(0);
    });

    it("transitions CLOSED → OPEN after reaching failure threshold", () => {
      recordFailure("provider-a", "generation", "timeout", "timed out", "gpt-4");
      recordFailure("provider-a", "generation", "timeout", "timed out", "gpt-4");
      recordFailure("provider-a", "generation", "timeout", "timed out", "gpt-4");
      const cb = getCircuitBreaker("provider-a");
      expect(cb.state).toBe("open");
      expect(cb.failureCount).toBe(3);
    });

    it("transitions OPEN → HALF-OPEN after recovery timeout", () => {
      vi.useFakeTimers();
      recordFailure("provider-a", "generation", "timeout", "timed out");
      recordFailure("provider-a", "generation", "timeout", "timed out");
      recordFailure("provider-a", "generation", "timeout", "timed out");
      expect(getCircuitBreaker("provider-a").state).toBe("open");

      // Advance past recovery timeout (60s default)
      vi.advanceTimersByTime(61_000);
      const open = isCircuitOpen("provider-a");
      expect(open).toBe(false);
      expect(getCircuitBreaker("provider-a").state).toBe("half-open");
      vi.useRealTimers();
    });

    it("transitions HALF-OPEN → CLOSED on success", () => {
      vi.useFakeTimers();
      recordFailure("provider-a", "generation", "timeout", "timed out");
      recordFailure("provider-a", "generation", "timeout", "timed out");
      recordFailure("provider-a", "generation", "timeout", "timed out");

      vi.advanceTimersByTime(61_000);
      isCircuitOpen("provider-a"); // triggers half-open
      recordSuccess("provider-a");

      const cb = getCircuitBreaker("provider-a");
      expect(cb.state).toBe("closed");
      expect(cb.failureCount).toBe(0);
      vi.useRealTimers();
    });

    it("transitions HALF-OPEN → OPEN on failure", () => {
      vi.useFakeTimers();
      recordFailure("provider-a", "generation", "timeout", "timed out");
      recordFailure("provider-a", "generation", "timeout", "timed out");
      recordFailure("provider-a", "generation", "timeout", "timed out");

      vi.advanceTimersByTime(61_000);
      isCircuitOpen("provider-a"); // triggers half-open
      expect(getCircuitBreaker("provider-a").state).toBe("half-open");

      recordFailure("provider-a", "generation", "timeout", "timed out");
      expect(getCircuitBreaker("provider-a").state).toBe("open");
      vi.useRealTimers();
    });

    it("half-open blocks after maxAttempts exceeded", () => {
      vi.useFakeTimers();
      recordFailure("p", "generation", "timeout", "err");
      recordFailure("p", "generation", "timeout", "err");
      recordFailure("p", "generation", "timeout", "err");

      vi.advanceTimersByTime(61_000);
      isCircuitOpen("p"); // half-open, attempts = 0
      const cb = getCircuitBreaker("p");
      cb.halfOpenAttempts = 2;
      expect(isCircuitOpen("p")).toBe(true); // maxAttempts=2 reached
      vi.useRealTimers();
    });
  });

  describe("classifyError", () => {
    it("classifies timeout errors", () => {
      expect(classifyError(new Error("Request timed out"))).toBe("timeout");
      expect(classifyError(new Error("timeout exceeded"))).toBe("timeout");
    });

    it("classifies rate-limit errors", () => {
      expect(classifyError(new Error("Rate limit exceeded"))).toBe("rate-limit");
      expect(classifyError(new Error("429 Too Many Requests"))).toBe("rate-limit");
      expect(classifyError(new Error("too many requests"))).toBe("rate-limit");
    });

    it("classifies parse-error errors", () => {
      expect(classifyError(new Error("Failed to parse response"))).toBe("parse-error");
      expect(classifyError(new Error("Invalid JSON response"))).toBe("parse-error");
      expect(classifyError(new Error("No JSON found"))).toBe("parse-error");
    });

    it("classifies auth-error errors", () => {
      expect(classifyError(new Error("401 Unauthorized"))).toBe("auth-error");
      expect(classifyError(new Error("403 Forbidden"))).toBe("auth-error");
      expect(classifyError(new Error("Invalid API key"))).toBe("auth-error");
      expect(classifyError(new Error("Auth failed"))).toBe("auth-error");
    });

    it("classifies network-error errors", () => {
      expect(classifyError(new Error("Network error"))).toBe("network-error");
      expect(classifyError(new Error("fetch failed"))).toBe("network-error");
      expect(classifyError(new Error("ECONNREFUSED"))).toBe("network-error");
    });

    it("classifies unknown errors", () => {
      expect(classifyError(new Error("Something unexpected"))).toBe("unknown");
      expect(classifyError("string error")).toBe("unknown");
    });
  });

  describe("selectRecoveryStrategy", () => {
    function makeFailure(
      errorType: PipelineFailure["errorType"],
      provider = "copilot",
      model = "gpt-4"
    ): PipelineFailure {
      return {
        id: "f1",
        stage: "generation",
        provider,
        model,
        errorType,
        errorMessage: "test",
        timestamp: new Date().toISOString(),
        recovered: false,
      };
    }

    it("switches provider for rate-limit errors", () => {
      const strategy = selectRecoveryStrategy(makeFailure("rate-limit"));
      expect(strategy.type).toBe("provider-switch");
      expect(strategy.toProvider).toBeDefined();
      expect(strategy.toProvider).not.toBe("copilot");
    });

    it("switches provider for auth-error", () => {
      const strategy = selectRecoveryStrategy(makeFailure("auth-error"));
      expect(strategy.type).toBe("provider-switch");
    });

    it("switches provider for network-error", () => {
      const strategy = selectRecoveryStrategy(makeFailure("network-error"));
      expect(strategy.type).toBe("provider-switch");
    });

    it("falls back to retry-backoff when no healthy providers", () => {
      // Open circuits for all fallback providers
      const config = { fallbackProviders: ["copilot"], failureThreshold: 1 };
      recordFailure("copilot", "generation", "timeout", "err", "gpt-4", config);
      const strategy = selectRecoveryStrategy(makeFailure("rate-limit", "copilot"), config);
      expect(strategy.type).toBe("retry-backoff");
    });

    it("downgrades model for timeout errors", () => {
      const strategy = selectRecoveryStrategy(makeFailure("timeout", "copilot", "gpt-4"));
      expect(strategy.type).toBe("model-downgrade");
      expect(strategy.toModel).toContain("mini");
    });

    it("falls back to retry-backoff for timeout when no faster model", () => {
      const config = { fallbackModels: ["gpt-4"] };
      const failure = makeFailure("timeout", "copilot", "gpt-4");
      const strategy = selectRecoveryStrategy(failure, config);
      expect(strategy.type).toBe("retry-backoff");
    });

    it("simplifies prompt for parse-error", () => {
      const strategy = selectRecoveryStrategy(makeFailure("parse-error"));
      expect(strategy.type).toBe("prompt-simplify");
    });

    it("retries with backoff for parse-error when simplification disabled", () => {
      const strategy = selectRecoveryStrategy(makeFailure("parse-error"), {
        enablePromptSimplification: false,
      });
      expect(strategy.type).toBe("retry-backoff");
    });

    it("retries with backoff for unknown errors", () => {
      const strategy = selectRecoveryStrategy(makeFailure("unknown"));
      expect(strategy.type).toBe("retry-backoff");
    });
  });

  describe("withSelfHealing", () => {
    it("returns result on success", async () => {
      const { result, recoveries } = await withSelfHealing(async () => "success", {
        provider: "copilot",
        model: "gpt-4",
        stage: "generation",
      });
      expect(result).toBe("success");
      expect(recoveries).toHaveLength(0);
    });

    it("retries and recovers on transient failure", async () => {
      let attempt = 0;
      const { result, recoveries } = await withSelfHealing(
        async () => {
          attempt++;
          if (attempt < 2) throw new Error("timeout occurred");
          return "recovered";
        },
        { provider: "copilot", model: "gpt-4", stage: "generation", maxAttempts: 3 }
      );
      expect(result).toBe("recovered");
      expect(recoveries.length).toBeGreaterThan(0);
    });

    it("throws after exhausting all attempts", async () => {
      await expect(
        withSelfHealing(
          async () => {
            throw new Error("persistent failure");
          },
          { provider: "copilot", model: "gpt-4", stage: "generation", maxAttempts: 2 }
        )
      ).rejects.toThrow("persistent failure");
    });

    it("switches provider when circuit is open", async () => {
      // Open the circuit for the primary provider
      recordFailure("copilot", "generation", "timeout", "err");
      recordFailure("copilot", "generation", "timeout", "err");
      recordFailure("copilot", "generation", "timeout", "err");

      const { result, recoveries } = await withSelfHealing(async (provider) => `from-${provider}`, {
        provider: "copilot",
        model: "gpt-4",
        stage: "generation",
      });
      expect(result).toContain("from-");
      expect(recoveries.some((r) => r.type === "provider-switch")).toBe(true);
    });

    it("applies exponential backoff on retry-backoff strategy", async () => {
      vi.useFakeTimers();
      let attempt = 0;
      const promise = withSelfHealing(
        async () => {
          attempt++;
          if (attempt < 3) throw new Error("something unexpected");
          return "ok";
        },
        { provider: "copilot", model: "gpt-4", stage: "generation", maxAttempts: 3 }
      );

      // Advance timers for backoff delays
      await vi.advanceTimersByTimeAsync(1000); // 1st backoff
      await vi.advanceTimersByTimeAsync(2000); // 2nd backoff
      const { result } = await promise;
      expect(result).toBe("ok");
      vi.useRealTimers();
    });
  });

  describe("getPipelineHealth", () => {
    it("returns healthy state when no failures", () => {
      const health = getPipelineHealth();
      expect(health.successRate).toBe(1);
      expect(health.totalFailures).toBe(0);
      expect(health.activeCircuitBreakers).toBe(0);
    });

    it("reflects failures in health metrics", () => {
      recordFailure("copilot", "generation", "timeout", "err");
      recordFailure("copilot", "generation", "timeout", "err");
      const health = getPipelineHealth();
      expect(health.totalFailures).toBe(2);
      expect(health.providerHealth.length).toBeGreaterThan(0);
    });
  });

  describe("failureLog cap", () => {
    it("caps failure log at 1000 entries", () => {
      for (let i = 0; i < 1010; i++) {
        recordFailure("p", "generation", "timeout", `err-${i}`, "m", { failureThreshold: 99999 });
      }
      const failures = getRecentFailures(1100);
      expect(failures.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("resetSelfHealing", () => {
    it("clears all circuit breakers and logs", () => {
      recordFailure("copilot", "generation", "timeout", "err");
      resetSelfHealing();
      const cb = getCircuitBreaker("copilot");
      expect(cb.state).toBe("closed");
      expect(cb.failureCount).toBe(0);
      expect(getRecentFailures()).toHaveLength(0);
    });
  });
});
