import { z } from "zod";

/** Circuit breaker states. */
export const CircuitStateSchema = z.enum(["closed", "open", "half-open"]);
export type CircuitState = z.infer<typeof CircuitStateSchema>;

/** A recorded pipeline failure for analysis. */
export const PipelineFailureSchema = z.object({
  id: z.string().max(100),
  stage: z.enum(["investigation", "generation", "synthesis"]),
  provider: z.string().max(100),
  model: z.string().max(100),
  errorType: z.enum([
    "timeout",
    "rate-limit",
    "parse-error",
    "auth-error",
    "network-error",
    "unknown",
  ]),
  errorMessage: z.string().max(1000),
  timestamp: z.string(),
  recovered: z.boolean(),
  recoveryAction: z.string().max(500).optional(),
});
export type PipelineFailure = z.infer<typeof PipelineFailureSchema>;

/** Circuit breaker state for a provider. */
export const CircuitBreakerSchema = z.object({
  provider: z.string().max(100),
  state: CircuitStateSchema,
  failureCount: z.number().min(0),
  lastFailure: z.string().optional(),
  lastSuccess: z.string().optional(),
  openedAt: z.string().optional(),
  halfOpenAttempts: z.number().min(0),
});
export type CircuitBreaker = z.infer<typeof CircuitBreakerSchema>;

/** Recovery strategy applied after a failure. */
export const RecoveryStrategySchema = z.object({
  type: z.enum([
    "provider-switch",
    "model-downgrade",
    "prompt-simplify",
    "retry-backoff",
    "skip-stage",
  ]),
  fromProvider: z.string().max(100).optional(),
  toProvider: z.string().max(100).optional(),
  fromModel: z.string().max(100).optional(),
  toModel: z.string().max(100).optional(),
  reasoning: z.string().max(500),
});
export type RecoveryStrategy = z.infer<typeof RecoveryStrategySchema>;

/** Pipeline health metrics. */
export const PipelineHealthSchema = z.object({
  successRate: z.number().min(0).max(1),
  totalRuns: z.number().min(0),
  totalFailures: z.number().min(0),
  totalRecoveries: z.number().min(0),
  activeCircuitBreakers: z.number().min(0),
  averageRecoveryTimeMs: z.number().min(0),
  providerHealth: z.array(
    z.object({
      provider: z.string().max(100),
      state: CircuitStateSchema,
      successRate: z.number().min(0).max(1),
      recentFailures: z.number().min(0),
    })
  ),
  lastUpdated: z.string(),
});
export type PipelineHealth = z.infer<typeof PipelineHealthSchema>;

/** Configuration for self-healing pipeline. */
export interface SelfHealingConfig {
  failureThreshold?: number;
  recoveryTimeout?: number;
  halfOpenMaxAttempts?: number;
  fallbackProviders?: string[];
  fallbackModels?: string[];
  enablePromptSimplification?: boolean;
}
