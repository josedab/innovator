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

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new Error("Retry aborted");
      }
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetryable(error) || signal?.aborted) {
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
            reject(new Error("Retry aborted"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });

      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}
