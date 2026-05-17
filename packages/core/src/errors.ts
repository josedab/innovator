/**
 * @module errors
 *
 * Typed error classes for the Innovator core engine.
 * Provides structured error handling with error codes, enabling consumers
 * to programmatically distinguish between failure modes.
 *
 * @example
 * ```typescript
 * import { LlmTimeoutError, isInnovatorError } from "@innovator/core";
 *
 * try {
 *   await investigate("some topic");
 * } catch (err) {
 *   if (err instanceof LlmTimeoutError) {
 *     console.log(`Timed out after ${err.timeoutMs}ms`);
 *   }
 *   if (isInnovatorError(err)) {
 *     console.log(`Innovator error [${err.code}]: ${err.message}`);
 *   }
 * }
 * ```
 */

/** Union of all Innovator error codes for programmatic error handling. */
export type InnovatorErrorCode =
  | "ERR_INNOVATOR"
  | "ERR_LLM"
  | "ERR_LLM_TIMEOUT"
  | "ERR_LLM_PARSE"
  | "ERR_LLM_RATE_LIMIT"
  | "ERR_VALIDATION"
  | "ERR_PIPELINE"
  | "ERR_CONFIGURATION"
  | "ERR_ABORT"
  | "ERR_RETRY_EXHAUSTED";

/**
 * Base error class for all Innovator errors.
 * Provides a `code` property for programmatic error discrimination.
 */
export class InnovatorError extends Error {
  readonly code: InnovatorErrorCode;

  constructor(message: string, code: InnovatorErrorCode = "ERR_INNOVATOR", cause?: Error) {
    super(message, { cause });
    this.name = "InnovatorError";
    this.code = code;
  }

  /** Serialize to a structured JSON object for logging and API responses. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.cause instanceof Error ? { cause: this.cause.message } : {}),
    };
  }
}

/**
 * Error originating from LLM API calls (network failures, rate limits, etc.).
 */
export class LlmError extends InnovatorError {
  /** The LLM model that was being called when the error occurred. */
  readonly model?: string;

  constructor(
    message: string,
    options?: { model?: string; cause?: Error; code?: InnovatorErrorCode }
  ) {
    super(message, options?.code ?? "ERR_LLM", options?.cause);
    this.name = "LlmError";
    this.model = options?.model;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      ...(this.model != null ? { model: this.model } : {}),
    };
  }
}

/**
 * Error thrown when an LLM request exceeds the configured timeout.
 */
export class LlmTimeoutError extends LlmError {
  /** The timeout duration in milliseconds that was exceeded. */
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: { model?: string; cause?: Error }) {
    super(`LLM request timed out after ${timeoutMs / 1000}s`, {
      ...options,
      code: "ERR_LLM_TIMEOUT",
    });
    this.name = "LlmTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when LLM output cannot be parsed as valid JSON.
 */
export class LlmParseError extends LlmError {
  /** The raw LLM output that failed to parse (truncated to 500 chars). */
  readonly rawOutput: string;

  constructor(message: string, rawOutput: string, options?: { model?: string; cause?: Error }) {
    super(message, { ...options, code: "ERR_LLM_PARSE" });
    this.name = "LlmParseError";
    this.rawOutput = rawOutput.length > 500 ? rawOutput.slice(0, 500) + "…" : rawOutput;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      rawOutput: this.rawOutput,
    };
  }
}

/**
 * Error thrown when an LLM API request is rate-limited (HTTP 429).
 * Provides structured access to retry timing for automatic backoff.
 */
export class RateLimitError extends LlmError {
  /** Suggested wait time in milliseconds before retrying, if provided by the API. */
  readonly retryAfterMs?: number;

  constructor(
    message: string = "LLM request was rate-limited",
    options?: { model?: string; retryAfterMs?: number; cause?: Error }
  ) {
    super(message, { model: options?.model, cause: options?.cause, code: "ERR_LLM_RATE_LIMIT" });
    this.name = "RateLimitError";
    this.retryAfterMs = options?.retryAfterMs;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      ...(this.retryAfterMs != null ? { retryAfterMs: this.retryAfterMs } : {}),
    };
  }
}

/**
 * Error thrown when data fails Zod schema validation.
 */
export class ValidationError extends InnovatorError {
  /** Structured validation issues from Zod (if available). */
  readonly issues?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    options?: { issues?: Array<{ path: string; message: string }>; cause?: Error }
  ) {
    super(message, "ERR_VALIDATION", options?.cause);
    this.name = "ValidationError";
    this.issues = options?.issues;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      ...(this.issues ? { issues: this.issues } : {}),
    };
  }
}

/**
 * Error thrown when a pipeline stage fails.
 */
export class PipelineError extends InnovatorError {
  /** The pipeline stage where the error occurred. */
  readonly stage: string;

  constructor(message: string, stage: string, cause?: Error) {
    super(message, "ERR_PIPELINE", cause);
    this.name = "PipelineError";
    this.stage = stage;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      stage: this.stage,
    };
  }
}

/**
 * Error thrown for invalid configuration (missing env vars, bad options, etc.).
 */
export class ConfigurationError extends InnovatorError {
  /** The configuration key or parameter that is invalid. */
  readonly configKey?: string;

  constructor(message: string, configKey?: string) {
    super(message, "ERR_CONFIGURATION");
    this.name = "ConfigurationError";
    this.configKey = configKey;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      ...(this.configKey != null ? { configKey: this.configKey } : {}),
    };
  }
}

/**
 * Error thrown when an operation is aborted via AbortSignal.
 */
export class AbortError extends InnovatorError {
  constructor(message: string = "Operation was aborted", cause?: Error) {
    super(message, "ERR_ABORT", cause);
    this.name = "AbortError";
  }
}

/**
 * Type guard to check if an unknown value is an InnovatorError.
 */
export function isInnovatorError(err: unknown): err is InnovatorError {
  return err instanceof InnovatorError;
}
