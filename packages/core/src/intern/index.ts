/**
 * @module intern
 *
 * String interning pool for memory-efficient storage of frequently repeated
 * strings. When many objects share the same angle ID, model name, or event
 * type, interning ensures they reference the same string instance in memory
 * rather than independent copies.
 *
 * Uses a bounded pool with configurable capacity and LRU-style eviction
 * to prevent unbounded growth.
 *
 * @example
 * ```ts
 * const pool = new StringPool({ maxSize: 1000 });
 * const a = pool.intern("gpt-4.1");
 * const b = pool.intern("gpt-4.1");
 * a === b; // true — same reference, not just equal value
 * ```
 */

/** Configuration for {@link StringPool}. */
export interface StringPoolOptions {
  /** Maximum number of unique strings to intern. Default: 4096. */
  maxSize?: number;
}

/** Usage statistics from {@link StringPool.stats}. */
export interface StringPoolStats {
  /** Number of unique interned strings. */
  size: number;
  /** Maximum pool capacity. */
  maxSize: number;
  /** Total number of intern() calls. */
  lookups: number;
  /** Number of times a cached reference was returned. */
  hits: number;
  /** Hit rate (0-1). */
  hitRate: number;
  /** Estimated memory saved in bytes (approximate, based on average string lengths). */
  estimatedBytesSaved: number;
}

/**
 * Bounded string interning pool.
 *
 * Ensures that equal strings share the same object reference, reducing
 * memory overhead when many objects store the same string values (e.g.,
 * angle IDs, model names, event types).
 *
 * When the pool reaches capacity, the oldest entry is evicted (FIFO).
 */
export class StringPool {
  private readonly pool = new Map<string, string>();
  private readonly maxSize: number;
  private lookupCount = 0;
  private hitCount = 0;
  private bytesSaved = 0;

  constructor(options: StringPoolOptions = {}) {
    this.maxSize = options.maxSize ?? 4096;
    if (this.maxSize < 1 || !Number.isFinite(this.maxSize)) {
      throw new Error("StringPool: maxSize must be a finite number >= 1");
    }
  }

  /**
   * Intern a string — return the canonical reference for equal strings.
   * If the string is already in the pool, the pooled reference is returned.
   * Otherwise, the string is added to the pool and returned.
   */
  intern(str: string): string {
    this.lookupCount++;
    const existing = this.pool.get(str);
    if (existing !== undefined) {
      this.hitCount++;
      // Each hit saves ~(2 * string_length) bytes of the V8 string header + char storage
      this.bytesSaved += str.length * 2;
      return existing;
    }

    // Evict oldest if at capacity (Map maintains insertion order)
    if (this.pool.size >= this.maxSize) {
      const oldest = this.pool.keys().next().value;
      if (oldest !== undefined) {
        this.pool.delete(oldest);
      }
    }

    this.pool.set(str, str);
    return str;
  }

  /** Check if a string is already interned. */
  has(str: string): boolean {
    return this.pool.has(str);
  }

  /** Current number of unique strings in the pool. */
  get size(): number {
    return this.pool.size;
  }

  /** Return a snapshot of pool usage statistics. */
  stats(): StringPoolStats {
    return {
      size: this.pool.size,
      maxSize: this.maxSize,
      lookups: this.lookupCount,
      hits: this.hitCount,
      hitRate: this.lookupCount > 0 ? this.hitCount / this.lookupCount : 0,
      estimatedBytesSaved: this.bytesSaved,
    };
  }

  /** Remove all interned strings and reset statistics. */
  clear(): void {
    this.pool.clear();
    this.lookupCount = 0;
    this.hitCount = 0;
    this.bytesSaved = 0;
  }
}

/**
 * Global shared string pool for cross-module interning.
 * Pre-populated with common angle IDs, model names, and event types.
 */
let globalPool: StringPool | null = null;

/** Get or create the global string pool. */
export function getStringPool(): StringPool {
  if (!globalPool) {
    globalPool = new StringPool({ maxSize: 8192 });

    // Pre-intern commonly repeated strings
    const commonStrings = [
      // Angle IDs
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
      "inversion",
      "perspectives",
      "what-if",
      "trend-collision",
      // Models
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-5",
      "gpt-5-mini",
      "claude-sonnet-4.5",
      "claude-sonnet-4",
      // Pipeline stages
      "investigating",
      "generating",
      "synthesizing",
      "complete",
      "error",
      // Event types
      "investigation.started",
      "investigation.completed",
      "investigation.failed",
      "angle.started",
      "angle.completed",
      "angle.failed",
      "synthesis.started",
      "synthesis.completed",
      "synthesis.failed",
      "pipeline.started",
      "pipeline.completed",
      "pipeline.failed",
      // Feasibility levels
      "low",
      "medium",
      "high",
      // Time estimates
      "days",
      "weeks",
      "months",
      "quarters",
      "years",
    ];

    for (const s of commonStrings) {
      globalPool.intern(s);
    }
  }
  return globalPool;
}

/** Reset the global string pool. */
export function resetStringPool(): void {
  globalPool?.clear();
  globalPool = null;
}

/**
 * Intern a string using the global pool.
 * Convenience function — equivalent to `getStringPool().intern(str)`.
 */
export function intern(str: string): string {
  return getStringPool().intern(str);
}
