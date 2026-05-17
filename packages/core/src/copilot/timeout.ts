import { LlmTimeoutError, ConfigurationError } from "../errors.js";

/**
 * Race a promise against a timeout, throwing {@link LlmTimeoutError} if the timeout fires first.
 *
 * Consolidates the `Promise.race` + `setTimeout` pattern used throughout the LLM client
 * into a single reusable utility.
 *
 * @typeParam T - The resolved type of the promise
 * @param promise - The promise to race against the timeout
 * @param timeoutMs - Maximum time in milliseconds to wait
 * @param options - Optional model identifier for the error context
 * @returns The resolved value of the promise
 * @throws {@link LlmTimeoutError} if the timeout fires before the promise resolves
 *
 * @example
 * ```ts
 * const result = await withTimeout(
 *   session.sendAndWait({ prompt }),
 *   90_000,
 *   { model: "gpt-4.1" }
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options?: { model?: string }
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ConfigurationError(
      "withTimeout: timeoutMs must be a positive finite number",
      "timeoutMs"
    );
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new LlmTimeoutError(timeoutMs, { model: options?.model })),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
