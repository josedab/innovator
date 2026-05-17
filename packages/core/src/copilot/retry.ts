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

import { AbortError } from "../errors.js";

/** Error thrown when all retry attempts are exhausted. Preserves the original error as `cause`. */
export class RetryExhaustedError extends Error {
  /** The underlying error from the last attempt. */
  override readonly cause: Error;
  /** Total number of attempts made (including the first). */
  readonly attempts: number;

  constructor(cause: Error, attempts: number) {
    super(`All ${attempts} retry attempts exhausted: ${cause.message}`);
    this.name = "RetryExhaustedError";
    this.cause = cause;
    this.attempts = attempts;
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
    throw new Error("withRetry: maxAttempts must be a finite number >= 1");
  }
  if (initialDelayMs < 0 || !Number.isFinite(initialDelayMs)) {
    throw new Error("withRetry: initialDelayMs must be a finite non-negative number");
  }
  if (backoffMultiplier < 1 || !Number.isFinite(backoffMultiplier)) {
    throw new Error("withRetry: backoffMultiplier must be a finite number >= 1");
  }
  if (maxDelayMs < 0 || !Number.isFinite(maxDelayMs)) {
    throw new Error("withRetry: maxDelayMs must be a finite non-negative number");
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
        throw new RetryExhaustedError(cause, maxAttempts);
      }

      if (!isRetryable(error) || signal?.aborted) {
        throw error;
      }

      const jitter = Math.random() * delay * 0.1;
      const waitTime = Math.min(delay + jitter, maxDelayMs);

      await new Promise<void>((resolve, reject) => {
        let onAbort: (() => void) | undefined;

        const timeoutId = setTimeout(() => {
          if (onAbort) signal?.removeEventListener("abort", onAbort);
          resolve();
        }, waitTime);

        if (signal) {
          onAbort = () => {
            clearTimeout(timeoutId);
            reject(new AbortError("Retry aborted"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });

      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  const cause = lastError instanceof Error ? lastError : new Error(String(lastError));
  throw new RetryExhaustedError(cause, maxAttempts);
}
