/**
 * @module concurrency
 *
 * Reusable concurrency primitives: async semaphore, bounded task runner with
 * adaptive scaling, and task result collection. Extracted from the pipeline
 * module to enable use across any batch operation in the codebase.
 *
 * @example
 * ```ts
 * const runner = new TaskRunner({ concurrency: 4, adaptive: true });
 * const { results, errors } = await runner.run([
 *   () => fetchData("a"),
 *   () => fetchData("b"),
 *   () => fetchData("c"),
 * ]);
 * ```
 */

import { ConfigurationError, AbortError } from "../errors.js";

/**
 * Async semaphore — limits concurrent access to a shared resource.
 * Callers `acquire()` a permit (waiting if none available) and `release()` when done.
 */
export class Semaphore {
  private permits: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(maxPermits: number) {
    if (!Number.isFinite(maxPermits) || maxPermits < 1) {
      throw new ConfigurationError("Semaphore: maxPermits must be >= 1", "maxPermits");
    }
    this.permits = maxPermits;
  }

  /** Acquire a permit, waiting if all are in use. */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /** Release a permit, unblocking the next waiter if any. */
  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  /** Current number of available permits. */
  get available(): number {
    return this.permits;
  }

  /** Number of callers waiting for a permit. */
  get waiting(): number {
    return this.waitQueue.length;
  }
}

/** Result of a single task in a batch. */
export interface TaskResult<T> {
  /** The index of the task in the original array. */
  index: number;
  /** The result value (undefined if the task failed). */
  value?: T;
  /** The error (undefined if the task succeeded). */
  error?: Error;
  /** Whether the task succeeded. */
  ok: boolean;
  /** Wall-clock duration of this task in milliseconds. */
  durationMs: number;
}

/** Result of running a batch of tasks. */
export interface BatchResult<T> {
  /** Ordered results array matching the input task indices; `undefined` for failed tasks. */
  results: (T | undefined)[];
  /** Errors captured per task, indexed to match the original task array. */
  errors: { index: number; error: Error }[];
  /** Detailed per-task results with timing. */
  tasks: TaskResult<T>[];
  /** Total wall-clock duration in milliseconds. */
  totalDurationMs: number;
}

/** Configuration for {@link TaskRunner}. */
export interface TaskRunnerOptions {
  /** Maximum concurrent tasks. Default: 2 */
  concurrency?: number;
  /** Enable adaptive scaling based on error rates. Default: false */
  adaptive?: boolean;
  /** Error rate threshold (0-1) above which concurrency is reduced. Default: 0.5 */
  errorThreshold?: number;
  /** Minimum concurrency when adaptive scaling reduces it. Default: 1 */
  minConcurrency?: number;
  /** AbortSignal to cancel all pending tasks. */
  signal?: AbortSignal;
}

/**
 * Bounded concurrent task runner with optional adaptive scaling.
 *
 * When `adaptive` is enabled, the runner monitors the error rate of completed
 * tasks and halves the effective concurrency if errors exceed `errorThreshold`.
 * This protects downstream services during partial outages.
 */
export class TaskRunner {
  private readonly concurrency: number;
  private readonly adaptive: boolean;
  private readonly errorThreshold: number;
  private readonly minConcurrency: number;
  private readonly signal?: AbortSignal;

  constructor(options: TaskRunnerOptions = {}) {
    this.concurrency = options.concurrency ?? 2;
    this.adaptive = options.adaptive ?? false;
    this.errorThreshold = options.errorThreshold ?? 0.5;
    this.minConcurrency = options.minConcurrency ?? 1;
    this.signal = options.signal;

    if (!Number.isFinite(this.concurrency) || this.concurrency < 1) {
      throw new ConfigurationError(
        `TaskRunner: concurrency must be >= 1, got ${this.concurrency}`,
        "concurrency"
      );
    }
  }

  /**
   * Execute an array of async task factories with bounded concurrency.
   *
   * @param tasks - Array of zero-argument async functions to execute.
   * @returns A {@link BatchResult} with ordered results, errors, and timing.
   */
  async run<T>(tasks: Array<() => Promise<T>>): Promise<BatchResult<T>> {
    if (tasks.length === 0) {
      return { results: [], errors: [], tasks: [], totalDurationMs: 0 };
    }

    const batchStart = Date.now();
    const results: (T | undefined)[] = new Array(tasks.length);
    const errors: { index: number; error: Error }[] = [];
    const taskResults: TaskResult<T>[] = [];

    let effectiveConcurrency = this.concurrency;
    let completedCount = 0;
    let errorCount = 0;

    const semaphore = new Semaphore(effectiveConcurrency);
    const executing: Set<Promise<void>> = new Set();

    for (let i = 0; i < tasks.length; i++) {
      if (this.signal?.aborted) break;

      // Adaptive scaling: reduce concurrency on high error rates
      if (this.adaptive && completedCount >= 2) {
        const errorRate = errorCount / completedCount;
        if (errorRate > this.errorThreshold) {
          const newConcurrency = Math.max(
            this.minConcurrency,
            Math.floor(effectiveConcurrency / 2)
          );
          if (newConcurrency < effectiveConcurrency) {
            effectiveConcurrency = newConcurrency;
          }
        }
      }

      await semaphore.acquire();

      const index = i;
      const p = (async () => {
        const taskStart = Date.now();
        try {
          if (this.signal?.aborted) {
            throw new AbortError("Task aborted");
          }
          const value = await tasks[index]();
          results[index] = value;
          taskResults.push({
            index,
            value,
            ok: true,
            durationMs: Date.now() - taskStart,
          });
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          errors.push({ index, error });
          taskResults.push({
            index,
            error,
            ok: false,
            durationMs: Date.now() - taskStart,
          });
          errorCount++;
        } finally {
          completedCount++;
          semaphore.release();
        }
      })();

      const wrapped = p.then(() => {
        executing.delete(wrapped);
      });
      executing.add(wrapped);
    }

    // Wait for all remaining in-flight tasks
    await Promise.all(executing);

    // Sort task results by index for deterministic ordering
    taskResults.sort((a, b) => a.index - b.index);

    return {
      results,
      errors,
      tasks: taskResults,
      totalDurationMs: Date.now() - batchStart,
    };
  }
}

/**
 * Simple bounded concurrency runner (functional API).
 * Convenience wrapper around {@link TaskRunner} for one-off use.
 */
export async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  signal?: AbortSignal
): Promise<BatchResult<T>> {
  const runner = new TaskRunner({ concurrency, signal });
  return runner.run(tasks);
}
