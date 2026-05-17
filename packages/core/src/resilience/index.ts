/**
 * @module resilience
 *
 * LLM resilience layer with circuit breakers, automatic failover chains,
 * cost guardrails, and queue-based retry with exponential backoff.
 */

import { z } from "zod";

// ---- Circuit Breaker ----

export const CircuitStateSchema = z.enum(["closed", "open", "half-open"]);
export type CircuitState = z.infer<typeof CircuitStateSchema>;

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  monitorWindowMs: number;
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 2,
  monitorWindowMs: 60000,
};

export class CircuitBreaker {
  readonly providerId: string;
  private config: CircuitBreakerConfig;
  private state: CircuitState = "closed";
  private failures: number[] = [];
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private successCount = 0;

  constructor(providerId: string, config?: Partial<CircuitBreakerConfig>) {
    this.providerId = providerId;
    this.config = { ...DEFAULT_CB_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
      }
    }
    return this.state;
  }

  /** Check if requests are allowed through the breaker. */
  isAllowed(): boolean {
    const state = this.getState();
    if (state === "closed") return true;
    if (state === "half-open") return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    return false;
  }

  /** Record a successful request. */
  recordSuccess(): void {
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxAttempts) {
        this.state = "closed";
        this.failures = [];
        this.successCount = 0;
      }
    }
  }

  /** Record a failed request. */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // Prune old failures outside the monitoring window
    this.failures = this.failures.filter((t) => now - t < this.config.monitorWindowMs);

    if (this.state === "half-open") {
      this.state = "open";
      this.halfOpenAttempts = 0;
      this.successCount = 0;
    } else if (this.failures.length >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  /** Reset the circuit breaker. */
  reset(): void {
    this.state = "closed";
    this.failures = [];
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /** Get circuit breaker status for monitoring. */
  getStatus(): {
    providerId: string;
    state: CircuitState;
    failureCount: number;
    lastFailure: string | null;
  } {
    return {
      providerId: this.providerId,
      state: this.getState(),
      failureCount: this.failures.length,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }
}

// ---- Failover Chain ----

export interface FailoverChainConfig {
  providers: string[];
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

const DEFAULT_FAILOVER_CONFIG: FailoverChainConfig = {
  providers: ["copilot", "openai", "ollama"],
  maxRetries: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

/**
 * Execute a request with automatic failover across providers.
 * Tries each provider in the chain, respecting circuit breakers.
 */
export async function executeWithFailover<T>(
  chain: FailoverChainConfig,
  breakers: Map<string, CircuitBreaker>,
  executeFn: (providerId: string) => Promise<T>
): Promise<{ result: T; providerId: string; attempts: number }> {
  let lastError: Error | null = null;
  let attempts = 0;

  for (const providerId of chain.providers) {
    const breaker = breakers.get(providerId);
    if (breaker && !breaker.isAllowed()) continue;

    for (let retry = 0; retry <= chain.maxRetries; retry++) {
      attempts++;
      try {
        const result = await executeFn(providerId);
        breaker?.recordSuccess();
        return { result, providerId, attempts };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        breaker?.recordFailure();

        if (retry < chain.maxRetries) {
          const delay = Math.min(
            chain.retryDelayMs * Math.pow(chain.backoffMultiplier, retry),
            chain.maxDelayMs
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw lastError ?? new Error("All providers in failover chain exhausted");
}

// ---- Cost Guardrails ----

export const CostGuardrailSchema = z.object({
  sessionBudgetUsd: z.number().min(0).optional(),
  monthlyBudgetUsd: z.number().min(0).optional(),
  perRequestMaxUsd: z.number().min(0).optional(),
  warningThresholdPct: z.number().min(0).max(100).default(80),
});
export type CostGuardrail = z.infer<typeof CostGuardrailSchema>;

export class CostGuardrailManager {
  private guardrail: CostGuardrail;
  private sessionSpend = 0;
  private monthlySpend = 0;
  private currentMonth: string;
  private warnings: string[] = [];

  constructor(guardrail: CostGuardrail) {
    this.guardrail = guardrail;
    this.currentMonth = new Date().toISOString().slice(0, 7);
  }

  /** Check if a request with estimated cost is within budget. */
  checkBudget(estimatedCostUsd: number): {
    allowed: boolean;
    reason?: string;
    warningPct?: number;
  } {
    // Reset monthly spend if month changed
    const nowMonth = new Date().toISOString().slice(0, 7);
    if (nowMonth !== this.currentMonth) {
      this.monthlySpend = 0;
      this.currentMonth = nowMonth;
    }

    // Per-request check
    if (
      this.guardrail.perRequestMaxUsd !== undefined &&
      estimatedCostUsd > this.guardrail.perRequestMaxUsd
    ) {
      const reason = `Estimated cost $${estimatedCostUsd.toFixed(4)} exceeds per-request limit $${this.guardrail.perRequestMaxUsd.toFixed(4)}`;
      this.warnings.push(reason);
      return { allowed: false, reason };
    }

    // Session budget check
    if (this.guardrail.sessionBudgetUsd !== undefined) {
      const projected = this.sessionSpend + estimatedCostUsd;
      if (projected > this.guardrail.sessionBudgetUsd) {
        const reason = `Session budget exceeded: $${projected.toFixed(4)} > $${this.guardrail.sessionBudgetUsd.toFixed(4)}`;
        this.warnings.push(reason);
        return { allowed: false, reason };
      }
      const pct = (projected / this.guardrail.sessionBudgetUsd) * 100;
      if (pct >= this.guardrail.warningThresholdPct) {
        this.warnings.push(
          `Session budget warning: ${pct.toFixed(1)}% of $${this.guardrail.sessionBudgetUsd.toFixed(2)} budget used`
        );
        return { allowed: true, warningPct: pct };
      }
    }

    // Monthly budget check
    if (this.guardrail.monthlyBudgetUsd !== undefined) {
      const projected = this.monthlySpend + estimatedCostUsd;
      if (projected > this.guardrail.monthlyBudgetUsd) {
        const reason = `Monthly budget exceeded: $${projected.toFixed(4)} > $${this.guardrail.monthlyBudgetUsd.toFixed(4)}`;
        this.warnings.push(reason);
        return { allowed: false, reason };
      }
      const monthlyPct = (projected / this.guardrail.monthlyBudgetUsd) * 100;
      if (monthlyPct >= this.guardrail.warningThresholdPct) {
        this.warnings.push(
          `Monthly budget warning: ${monthlyPct.toFixed(1)}% of $${this.guardrail.monthlyBudgetUsd.toFixed(2)} budget used`
        );
      }
    }

    return { allowed: true };
  }

  /** Record actual spend. */
  recordSpend(costUsd: number): void {
    this.sessionSpend += costUsd;
    this.monthlySpend += costUsd;
  }

  /** Get current spend summary. */
  getSpendSummary(): {
    sessionSpend: number;
    monthlySpend: number;
    sessionBudget: number | undefined;
    monthlyBudget: number | undefined;
    sessionPct: number | undefined;
    monthlyPct: number | undefined;
  } {
    return {
      sessionSpend: this.sessionSpend,
      monthlySpend: this.monthlySpend,
      sessionBudget: this.guardrail.sessionBudgetUsd,
      monthlyBudget: this.guardrail.monthlyBudgetUsd,
      sessionPct: this.guardrail.sessionBudgetUsd
        ? (this.sessionSpend / this.guardrail.sessionBudgetUsd) * 100
        : undefined,
      monthlyPct: this.guardrail.monthlyBudgetUsd
        ? (this.monthlySpend / this.guardrail.monthlyBudgetUsd) * 100
        : undefined,
    };
  }

  /** Reset session spend and warnings. */
  resetSession(): void {
    this.sessionSpend = 0;
    this.warnings = [];
  }

  /** Get accumulated warnings. */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /** Clear all accumulated warnings. */
  clearWarnings(): void {
    this.warnings = [];
  }
}

// ---- Cost Forecast ----

/** Estimate cost for a pipeline run before execution. */
export function forecastPipelineCost(params: {
  angleCount: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
}): {
  estimatedCostUsd: number;
  breakdown: { stage: string; estimatedCostUsd: number }[];
} {
  const investigateCost =
    (params.avgInputTokens * params.inputCostPer1k +
      params.avgOutputTokens * params.outputCostPer1k) /
    1000;
  const generateCost = investigateCost * params.angleCount;
  const synthesizeCost = investigateCost * 0.5;
  const total = investigateCost + generateCost + synthesizeCost;

  return {
    estimatedCostUsd: Math.round(total * 10000) / 10000,
    breakdown: [
      { stage: "investigate", estimatedCostUsd: Math.round(investigateCost * 10000) / 10000 },
      { stage: "generate", estimatedCostUsd: Math.round(generateCost * 10000) / 10000 },
      { stage: "synthesize", estimatedCostUsd: Math.round(synthesizeCost * 10000) / 10000 },
    ],
  };
}

// ---- Provider Health Dashboard ----

const circuitBreakers = new Map<string, CircuitBreaker>();

/** Get or create a circuit breaker for a provider. */
export function getCircuitBreaker(
  providerId: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let breaker = circuitBreakers.get(providerId);
  if (!breaker) {
    breaker = new CircuitBreaker(providerId, config);
    circuitBreakers.set(providerId, breaker);
  }
  return breaker;
}

/** Get health status of all providers. */
export function getProviderHealthDashboard(): Array<{
  providerId: string;
  state: CircuitState;
  failureCount: number;
  lastFailure: string | null;
}> {
  return Array.from(circuitBreakers.values()).map((b) => b.getStatus());
}

/** Clear all circuit breakers (for testing). */
export function clearCircuitBreakers(): void {
  circuitBreakers.clear();
}

/** Create a default failover chain config. */
export function createFailoverChain(overrides?: Partial<FailoverChainConfig>): FailoverChainConfig {
  return { ...DEFAULT_FAILOVER_CONFIG, ...overrides };
}
