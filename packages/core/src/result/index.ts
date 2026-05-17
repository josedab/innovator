/**
 * @module result
 *
 * Discriminated union `Result<T, E>` type for functional error handling.
 * Provides a type-safe alternative to try/catch where errors are expected
 * values rather than exceptional conditions — ideal for pipeline stages,
 * validation, and LLM parsing.
 *
 * @example
 * ```ts
 * const result = await tryAsync(() => parseJson(raw));
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */

/** A successful result containing a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed result containing an error. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union representing either a successful value or an error. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Create a successful Result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed Result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Wrap a synchronous function call in a Result.
 * Catches any thrown error and returns it as `Err<Error>`.
 */
export function tryFn<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Wrap an async function call in a Result.
 * Catches any thrown/rejected error and returns it as `Err<Error>`.
 */
export async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Transform the value inside a successful Result, leaving errors unchanged.
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}

/**
 * Transform the error inside a failed Result, leaving successes unchanged.
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) return err(fn(result.error));
  return result;
}

/**
 * Chain a function that returns a Result, flattening the nested Result.
 * (monadic bind / flatMap)
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) return fn(result.value);
  return result;
}

/**
 * Extract the value from a Result, throwing the error if it's a failure.
 * Non-Error values are wrapped in an Error to ensure consistent throw behavior.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  if (result.error instanceof Error) throw result.error;
  throw new Error(String(result.error));
}

/**
 * Extract the value from a Result, returning a default if it's a failure.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) return result.value;
  return defaultValue;
}

/**
 * Extract the value from a Result, computing a default from the error if it's a failure.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (result.ok) return result.value;
  return fn(result.error);
}

/**
 * Chain an async function that returns a Result, flattening the nested Result.
 * Async equivalent of flatMap for pipeline stages that perform I/O.
 */
export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  if (result.ok) return fn(result.value);
  return result;
}

/**
 * Transform the value inside a successful Result with an async function.
 * Async equivalent of mapResult for pipeline stages that perform I/O.
 */
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<U>
): Promise<Result<U, E>> {
  if (result.ok) return ok(await fn(result.value));
  return result;
}

/**
 * Collect an array of Results into a single Result containing all values,
 * or the first error encountered.
 */
export function collectResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Partition an array of Results into separate arrays of values and errors.
 */
export function partitionResults<T, E>(results: Result<T, E>[]): { values: T[]; errors: E[] } {
  const values: T[] = [];
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }
  return { values, errors };
}
