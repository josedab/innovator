export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in ms before first retry. Default: 1000 */
  initialDelayMs?: number;
  /** Multiplier applied to delay after each retry. Default: 2 */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Predicate to decide if an error is retryable. Default: retries network/timeout errors */
  isRetryable?: (error: unknown) => boolean;
  /** AbortSignal to cancel retries early */
  signal?: AbortSignal;
}

import { AbortError, ConfigurationError } from "../errors.js";
import { RateLimitError, LlmParseError, InnovatorError } from "../errors.js";
import { getEventBus } from "../events/emitter.js";

/** Error thrown when all retry attempts are exhausted. Preserves the original error as `cause`. */
export class RetryExhaustedError extends InnovatorError {
  /** The underlying error from the last attempt. */
  override readonly cause: Error;
  /** Total number of attempts made (including the first). */
  readonly attempts: number;

  constructor(cause: Error, attempts: number) {
    super(
      `All ${attempts} retry attempts exhausted: ${cause.message}`,
      "ERR_RETRY_EXHAUSTED",
      cause
    );
    this.name = "RetryExhaustedError";
    this.cause = cause;
    this.attempts = attempts;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      attempts: this.attempts,
    };
  }
}

/** Error message substrings that identify transient network/timeout failures eligible for retry. */
const DEFAULT_RETRYABLE_PATTERNS = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "fetch failed",
  "network",
  "timed out",
  "socket hang up",
  "EPIPE",
];

function defaultIsRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof RateLimitError) return true;
  // LLM output is non-deterministic, so parse failures are worth retrying
  if (error instanceof LlmParseError) return true;
  const msg = error.message.toLowerCase();
  return DEFAULT_RETRYABLE_PATTERNS.some((pattern) => msg.includes(pattern.toLowerCase()));
}

/**
 * Retry a function with exponential backoff on transient failures.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function on success
 * @throws The last error if all attempts are exhausted
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 30_000,
    isRetryable = defaultIsRetryable,
    signal,
  } = options;

  if (maxAttempts < 1 || !Number.isFinite(maxAttempts)) {
    throw new ConfigurationError(
      "withRetry: maxAttempts must be a finite number >= 1",
      "maxAttempts"
    );
  }
  if (initialDelayMs < 0 || !Number.isFinite(initialDelayMs)) {
    throw new ConfigurationError(
      "withRetry: initialDelayMs must be a finite non-negative number",
      "initialDelayMs"
    );
  }
  if (backoffMultiplier < 1 || !Number.isFinite(backoffMultiplier)) {
    throw new ConfigurationError(
      "withRetry: backoffMultiplier must be a finite number >= 1",
      "backoffMultiplier"
    );
  }
  if (maxDelayMs < 0 || !Number.isFinite(maxDelayMs)) {
    throw new ConfigurationError(
      "withRetry: maxDelayMs must be a finite non-negative number",
      "maxDelayMs"
    );
  }

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new AbortError("Retry aborted");
      }
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        const cause = error instanceof Error ? error : new Error(String(error));
        getEventBus()
          .emit("retry.exhausted", {
            attempts: maxAttempts,
            error: cause.message,
          })
          .catch(() => {});
        throw new RetryExhaustedError(cause, maxAttempts);
      }

      if (!isRetryable(error) || signal?.aborted) {
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      getEventBus()
        .emit("retry.attempt", {
          attempt,
          maxAttempts,
          error: errorMsg,
          nextDelayMs: delay,
        })
        .catch(() => {});

      // Full jitter: randomize between 50%-100% of computed delay to spread retries
      const jitter = delay * (0.5 + Math.random() * 0.5);
      const waitTime = Math.min(jitter, maxDelayMs);

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (signal) signal.removeEventListener("abort", onAbort);
          resolve();
        }, waitTime);

        function onAbort() {
          clearTimeout(timeoutId);
          reject(new AbortError("Retry aborted"));
        }

        if (signal) {
          if (signal.aborted) {
            clearTimeout(timeoutId);
            reject(new AbortError("Retry aborted"));
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });

      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  const cause = lastError instanceof Error ? lastError : new Error(String(lastError));
  throw new RetryExhaustedError(cause, maxAttempts);
}
