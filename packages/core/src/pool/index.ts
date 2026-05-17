/**
 * @module pool
 *
 * Generic object pool for recycling frequently allocated objects.
 * Reduces garbage-collection pressure by reusing objects instead of
 * creating new ones. Supports configurable pool size, factory/reset
 * functions, and usage statistics.
 *
 * @example
 * ```ts
 * const bufferPool = new ObjectPool({
 *   maxSize: 50,
 *   factory: () => ({ parts: [] as string[] }),
 *   reset: (obj) => { obj.parts.length = 0; },
 * });
 *
 * const buf = bufferPool.acquire();
 * buf.parts.push("hello");
 * bufferPool.release(buf);
 * ```
 */

/** Configuration for {@link ObjectPool}. */
export interface ObjectPoolOptions<T> {
  /** Factory function to create a new object when the pool is empty. */
  factory: () => T;
  /** Optional reset function called on an object before it is returned to the pool. */
  reset?: (obj: T) => void;
  /** Maximum number of idle objects to keep in the pool. Default: 32 */
  maxSize?: number;
}

/** Usage statistics snapshot from {@link ObjectPool.stats}. */
export interface PoolStats {
  /** Number of objects currently in the pool (idle). */
  idle: number;
  /** Total number of acquire() calls. */
  acquires: number;
  /** Total number of release() calls. */
  releases: number;
  /** Number of times acquire() found the pool empty and created a new object. */
  creates: number;
  /** Maximum pool capacity. */
  maxSize: number;
}

/**
 * A bounded object pool that recycles instances to reduce allocation overhead.
 *
 * Objects are acquired from the pool (or created via `factory` if empty)
 * and returned via `release()`. On release, the optional `reset` function
 * is called to clear the object's state before it re-enters the pool.
 *
 * @typeParam T - The type of pooled objects
 */
export class ObjectPool<T> {
  private readonly items: T[] = [];
  private readonly factory: () => T;
  private readonly resetFn?: (obj: T) => void;
  private readonly maxSize: number;
  private acquireCount = 0;
  private releaseCount = 0;
  private createCount = 0;

  constructor(options: ObjectPoolOptions<T>) {
    this.factory = options.factory;
    this.resetFn = options.reset;
    this.maxSize = options.maxSize ?? 32;

    if (this.maxSize < 1 || !Number.isFinite(this.maxSize)) {
      throw new Error("ObjectPool: maxSize must be a finite number >= 1");
    }
  }

  /**
   * Acquire an object from the pool.
   * If the pool is empty, a new object is created via the factory.
   */
  acquire(): T {
    this.acquireCount++;
    const item = this.items.pop();
    if (item !== undefined) {
      return item;
    }
    this.createCount++;
    return this.factory();
  }

  /**
   * Return an object to the pool for reuse.
   * The reset function (if configured) is called before the object re-enters the pool.
   * If the pool is at capacity, the object is discarded (left for GC).
   */
  release(obj: T): void {
    this.releaseCount++;
    if (this.items.length >= this.maxSize) {
      return; // Pool is full — discard
    }
    this.resetFn?.(obj);
    this.items.push(obj);
  }

  /** Pre-populate the pool with `count` objects (up to maxSize). */
  prewarm(count: number): void {
    const toCreate = Math.min(count, this.maxSize - this.items.length);
    for (let i = 0; i < toCreate; i++) {
      this.items.push(this.factory());
      this.createCount++;
    }
  }

  /** Remove all objects from the pool. */
  drain(): void {
    this.items.length = 0;
  }

  /** Current number of idle objects in the pool. */
  get size(): number {
    return this.items.length;
  }

  /** Return a snapshot of pool usage statistics. */
  stats(): PoolStats {
    return {
      idle: this.items.length,
      acquires: this.acquireCount,
      releases: this.releaseCount,
      creates: this.createCount,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Convenience wrapper: run a function with an object from the pool,
 * automatically releasing it when done (even if the function throws).
 *
 * @param pool - The pool to acquire/release from
 * @param fn - Function to execute with the pooled object
 * @returns The return value of `fn`
 */
export function withPooled<T, R>(pool: ObjectPool<T>, fn: (obj: T) => R): R {
  const obj = pool.acquire();
  try {
    return fn(obj);
  } finally {
    pool.release(obj);
  }
}

/**
 * Async version of {@link withPooled}.
 */
export async function withPooledAsync<T, R>(
  pool: ObjectPool<T>,
  fn: (obj: T) => Promise<R>
): Promise<R> {
  const obj = pool.acquire();
  try {
    return await fn(obj);
  } finally {
    pool.release(obj);
  }
}
