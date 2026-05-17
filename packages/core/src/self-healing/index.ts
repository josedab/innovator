/**
 * @module self-healing
 *
 * Self-healing pipeline with circuit breakers, automatic provider switching,
 * adaptive prompt adjustment, and failure recovery targeting 99.5% reliability.
 */

import { randomUUID } from "node:crypto";
import type {
  SelfHealingConfig,
  CircuitBreaker,
  PipelineFailure,
  PipelineHealth,
  RecoveryStrategy,
} from "./types.js";

export {
  CircuitStateSchema,
  PipelineFailureSchema,
  CircuitBreakerSchema,
  RecoveryStrategySchema,
  PipelineHealthSchema,
} from "./types.js";
export type {
  CircuitState,
  PipelineFailure,
  CircuitBreaker,
  RecoveryStrategy,
  PipelineHealth,
  SelfHealingConfig,
} from "./types.js";

// ---- In-Memory State ----

const circuitBreakers = new Map<string, CircuitBreaker>();
const failureLog: PipelineFailure[] = [];
const recoveryLog: RecoveryStrategy[] = [];

const DEFAULT_CONFIG: Required<SelfHealingConfig> = {
  failureThreshold: 3,
  recoveryTimeout: 60_000,
  halfOpenMaxAttempts: 2,
  fallbackProviders: ["copilot", "openai", "anthropic", "ollama"],
  fallbackModels: ["gpt-4.1-mini", "gpt-5-mini", "claude-sonnet-4"],
  enablePromptSimplification: true,
};

// ---- Circuit Breaker ----

/** Get or create a circuit breaker for a provider. */
export function getCircuitBreaker(provider: string): CircuitBreaker {
  if (!circuitBreakers.has(provider)) {
    circuitBreakers.set(provider, {
      provider,
      state: "closed",
      failureCount: 0,
      halfOpenAttempts: 0,
    });
  }
  return circuitBreakers.get(provider)!;
}

/** Check if a provider's circuit is open (should not be used). */
export function isCircuitOpen(provider: string, config: SelfHealingConfig = {}): boolean {
  const cb = getCircuitBreaker(provider);
  if (cb.state === "closed") return false;
  if (cb.state === "open") {
    const timeout = config.recoveryTimeout ?? DEFAULT_CONFIG.recoveryTimeout;
    if (cb.openedAt && Date.now() - new Date(cb.openedAt).getTime() > timeout) {
      cb.state = "half-open";
      cb.halfOpenAttempts = 0;
      return false;
    }
    return true;
  }
  // half-open: allow limited attempts
  return cb.halfOpenAttempts >= (config.halfOpenMaxAttempts ?? DEFAULT_CONFIG.halfOpenMaxAttempts);
}

/** Record a failure for a provider, potentially tripping the circuit. */
export function recordFailure(
  provider: string,
  stage: PipelineFailure["stage"],
  errorType: PipelineFailure["errorType"],
  errorMessage: string,
  model: string = "unknown",
  config: SelfHealingConfig = {}
): PipelineFailure {
  const cb = getCircuitBreaker(provider);
  cb.failureCount++;
  cb.lastFailure = new Date().toISOString();

  const threshold = config.failureThreshold ?? DEFAULT_CONFIG.failureThreshold;
  if (cb.state === "half-open") {
    cb.state = "open";
    cb.openedAt = new Date().toISOString();
  } else if (cb.failureCount >= threshold) {
    cb.state = "open";
    cb.openedAt = new Date().toISOString();
  }

  const failure: PipelineFailure = {
    id: randomUUID(),
    stage,
    provider,
    model,
    errorType,
    errorMessage,
    timestamp: new Date().toISOString(),
    recovered: false,
  };
  failureLog.push(failure);

  // Keep only last 1000 failures
  if (failureLog.length > 1000) failureLog.splice(0, failureLog.length - 1000);

  return failure;
}

/** Record a successful call, potentially closing the circuit. */
export function recordSuccess(provider: string): void {
  const cb = getCircuitBreaker(provider);
  cb.lastSuccess = new Date().toISOString();

  if (cb.state === "half-open") {
    cb.state = "closed";
    cb.failureCount = 0;
    cb.halfOpenAttempts = 0;
  }
}

// ---- Recovery Strategies ----

/** Classify an error to determine the best recovery strategy. */
export function classifyError(error: unknown): PipelineFailure["errorType"] {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("rate") || msg.includes("429") || msg.includes("too many")) return "rate-limit";
  if (msg.includes("parse") || msg.includes("json") || msg.includes("no json"))
    return "parse-error";
  if (msg.includes("auth") || msg.includes("401") || msg.includes("403") || msg.includes("key"))
    return "auth-error";
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused"))
    return "network-error";
  return "unknown";
}

/** Determine the best recovery strategy for a failure. */
export function selectRecoveryStrategy(
  failure: PipelineFailure,
  config: SelfHealingConfig = {}
): RecoveryStrategy {
  const fallbackProviders = config.fallbackProviders ?? DEFAULT_CONFIG.fallbackProviders;
  const fallbackModels = config.fallbackModels ?? DEFAULT_CONFIG.fallbackModels;
  const enableSimplify =
    config.enablePromptSimplification ?? DEFAULT_CONFIG.enablePromptSimplification;

  switch (failure.errorType) {
    case "rate-limit":
    case "auth-error":
    case "network-error": {
      const nextProvider = fallbackProviders.find(
        (p) => p !== failure.provider && !isCircuitOpen(p, config)
      );
      if (nextProvider) {
        return {
          type: "provider-switch",
          fromProvider: failure.provider,
          toProvider: nextProvider,
          reasoning: `${failure.errorType}: switching from ${failure.provider} to ${nextProvider}`,
        };
      }
      return {
        type: "retry-backoff",
        reasoning: `No healthy fallback providers. Retrying ${failure.provider} with exponential backoff.`,
      };
    }

    case "timeout": {
      const fasterModel = fallbackModels.find((m) => m !== failure.model && m.includes("mini"));
      if (fasterModel) {
        return {
          type: "model-downgrade",
          fromModel: failure.model,
          toModel: fasterModel,
          reasoning: `Timeout: downgrading from ${failure.model} to faster ${fasterModel}`,
        };
      }
      return {
        type: "retry-backoff",
        reasoning: "Timeout with no faster model available. Retrying with backoff.",
      };
    }

    case "parse-error": {
      if (enableSimplify) {
        return {
          type: "prompt-simplify",
          reasoning: "Parse error: simplifying prompt to reduce complexity of expected output",
        };
      }
      return {
        type: "retry-backoff",
        reasoning: "Parse error: retrying with backoff (prompt simplification disabled)",
      };
    }

    default:
      return {
        type: "retry-backoff",
        reasoning: `Unknown error type: ${failure.errorType}. Retrying with backoff.`,
      };
  }
}

/**
 * Execute a function with self-healing capabilities.
 * Automatically retries, switches providers, and adapts on failures.
 */
export async function withSelfHealing<T>(
  fn: (provider: string, model: string) => Promise<T>,
  options: {
    provider: string;
    model: string;
    stage: PipelineFailure["stage"];
    maxAttempts?: number;
    config?: SelfHealingConfig;
  }
): Promise<{ result: T; recoveries: RecoveryStrategy[] }> {
  const { stage, maxAttempts = 3, config = {} } = options;
  let { provider, model } = options;
  const recoveries: RecoveryStrategy[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCircuitOpen(provider, config)) {
      const fallback = (config.fallbackProviders ?? DEFAULT_CONFIG.fallbackProviders).find(
        (p) => !isCircuitOpen(p, config)
      );
      if (fallback) {
        const strategy: RecoveryStrategy = {
          type: "provider-switch",
          fromProvider: provider,
          toProvider: fallback,
          reasoning: `Circuit open for ${provider}, pre-emptive switch to ${fallback}`,
        };
        recoveries.push(strategy);
        provider = fallback;
      }
    }

    try {
      const result = await fn(provider, model);
      recordSuccess(provider);
      return { result, recoveries };
    } catch (error) {
      const errorType = classifyError(error);
      const failure = recordFailure(
        provider,
        stage,
        errorType,
        error instanceof Error ? error.message : String(error),
        model,
        config
      );

      if (attempt < maxAttempts - 1) {
        const strategy = selectRecoveryStrategy(failure, config);
        recoveries.push(strategy);
        failure.recovered = true;
        failure.recoveryAction = strategy.reasoning;

        if (strategy.type === "provider-switch" && strategy.toProvider) {
          provider = strategy.toProvider;
        }
        if (strategy.type === "model-downgrade" && strategy.toModel) {
          model = strategy.toModel;
        }
        if (strategy.type === "retry-backoff") {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } else {
        throw error;
      }
    }
  }

  throw new Error("Self-healing exhausted all recovery attempts");
}

// ---- Health Monitoring ----

/** Get the current health status of the pipeline. */
export function getPipelineHealth(): PipelineHealth {
  const now = new Date().toISOString();
  const recentFailures = failureLog.filter(
    (f) => Date.now() - new Date(f.timestamp).getTime() < 3600_000
  );
  const recentRecoveries = recentFailures.filter((f) => f.recovered);
  const totalRuns = failureLog.length + recoveryLog.length;

  const providerHealth = Array.from(circuitBreakers.values()).map((cb) => {
    const providerFailures = recentFailures.filter((f) => f.provider === cb.provider);
    const totalProviderCalls = providerFailures.length + 1;
    return {
      provider: cb.provider,
      state: cb.state,
      successRate: Math.max(0, 1 - providerFailures.length / totalProviderCalls),
      recentFailures: providerFailures.length,
    };
  });

  return {
    successRate:
      totalRuns > 0
        ? Math.max(
            0,
            1 - (recentFailures.length - recentRecoveries.length) / Math.max(totalRuns, 1)
          )
        : 1,
    totalRuns,
    totalFailures: failureLog.length,
    totalRecoveries: recentRecoveries.length,
    activeCircuitBreakers: Array.from(circuitBreakers.values()).filter(
      (cb) => cb.state !== "closed"
    ).length,
    averageRecoveryTimeMs: 0,
    providerHealth,
    lastUpdated: now,
  };
}

/** Get recent failures for debugging. */
export function getRecentFailures(limit: number = 20): PipelineFailure[] {
  return failureLog.slice(-limit).reverse();
}

/** Reset all circuit breakers and failure logs (for testing). */
export function resetSelfHealing(): void {
  circuitBreakers.clear();
  failureLog.length = 0;
  recoveryLog.length = 0;
}
