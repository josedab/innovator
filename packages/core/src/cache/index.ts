/**
 * @module cache
 *
 * Generic bounded LRU cache with optional TTL (time-to-live) support.
 * Provides O(1) get/set via a Map-based doubly-linked-list strategy
 * and exposes hit/miss statistics for observability.
 *
 * @example
 * ```ts
 * const cache = new LRUCache<string, number>({ maxSize: 100, ttlMs: 60_000 });
 * cache.set("key", 42);
 * cache.get("key"); // 42
 * cache.stats(); // { hits: 1, misses: 0, size: 1, maxSize: 100, hitRate: 1 }
 * ```
 */

/** Cache entry wrapping a value with insertion metadata. */
import { ValidationError } from "../errors.js";
interface CacheEntry<V> {
  value: V;
  createdAt: number;
}

/** Configuration options for {@link LRUCache}. */
export interface LRUCacheOptions<K = unknown, V = unknown> {
  /** Maximum number of entries the cache will hold. Oldest entries are evicted when exceeded. */
  maxSize: number;
  /** Optional time-to-live in milliseconds. Entries older than this are treated as expired. */
  ttlMs?: number;
  /** Optional callback invoked when an entry is evicted (due to capacity or TTL expiration). */
  onEvict?: (key: K, value: V) => void;
}

/** Hit/miss statistics snapshot from {@link LRUCache.stats}. */
export interface CacheStats {
  /** Number of cache hits since creation or last {@link LRUCache.clear}. */
  hits: number;
  /** Number of cache misses since creation or last {@link LRUCache.clear}. */
  misses: number;
  /** Current number of entries in the cache. */
  size: number;
  /** Maximum capacity of the cache. */
  maxSize: number;
  /** Ratio of hits to total lookups (0–1). Returns 0 if no lookups have occurred. */
  hitRate: number;
}

/**
 * Bounded LRU (Least Recently Used) cache with optional TTL expiration.
 *
 * Uses JavaScript's `Map` iteration-order guarantee (insertion order) to
 * implement O(1) get/set with LRU eviction — on each access the entry is
 * deleted and re-inserted so it moves to the "most recent" end of the map.
 *
 * @typeParam K - Cache key type
 * @typeParam V - Cache value type
 */
export class LRUCache<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number | undefined;
  private readonly onEvict?: (key: K, value: V) => void;
  private hitCount = 0;
  private missCount = 0;

  constructor(options: LRUCacheOptions<K, V>) {
    if (options.maxSize < 1 || !Number.isFinite(options.maxSize)) {
      throw new ValidationError("LRUCache: maxSize must be a finite number >= 1");
    }
    this.maxSize = Math.floor(options.maxSize);
    this.ttlMs = options.ttlMs;
    this.onEvict = options.onEvict;
  }

  /**
   * Retrieve a value by key.
   * Returns `undefined` on miss or if the entry has expired (TTL).
   * Successful lookups promote the entry to most-recently-used.
   */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.onEvict?.(key, entry.value);
      this.missCount++;
      return undefined;
    }
    // Promote to most-recently-used by re-inserting
    this.map.delete(key);
    this.map.set(key, entry);
    this.hitCount++;
    return entry.value;
  }

  /**
   * Insert or update a cache entry.
   * If the cache is at capacity, the least-recently-used entry is evicted.
   */
  set(key: K, value: V): void {
    // Delete first so re-insert moves to end (most recent)
    this.map.delete(key);
    if (this.map.size >= this.maxSize) {
      // Evict the least-recently-used entry (first key in Map iteration order)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.map.get(oldest);
        this.map.delete(oldest);
        if (evicted) this.onEvict?.(oldest, evicted.value);
      }
    }
    this.map.set(key, { value, createdAt: Date.now() });
  }

  /** Check whether a key exists and is not expired. */
  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.onEvict?.(key, entry.value);
      return false;
    }
    return true;
  }

  /**
   * Get the value for a key if present, otherwise compute it via `factory`,
   * store the result, and return it. Avoids the has()+get() double-lookup.
   */
  getOrSet(key: K, factory: () => V): V {
    const entry = this.map.get(key);
    if (entry && !this.isExpired(entry)) {
      // Promote to most-recently-used
      this.map.delete(key);
      this.map.set(key, entry);
      this.hitCount++;
      return entry.value;
    }
    // Miss or expired
    if (entry) {
      this.map.delete(key);
      this.onEvict?.(key, entry.value);
    }
    this.missCount++;
    const value = factory();
    this.set(key, value);
    return value;
  }

  /** Remove a specific entry. Returns `true` if the entry existed. */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Remove all entries and reset hit/miss counters. */
  clear(): void {
    this.map.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /** Current number of (non-expired) entries. */
  get size(): number {
    return this.map.size;
  }

  /** Return a snapshot of cache hit/miss statistics. Prunes expired entries first for accuracy. */
  stats(): CacheStats {
    this.prune();
    const total = this.hitCount + this.missCount;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      size: this.map.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hitCount / total : 0,
    };
  }

  /** Evict all expired entries. Returns the number of entries removed. */
  prune(): number {
    if (!this.ttlMs) return 0;
    let pruned = 0;
    for (const [key, entry] of this.map) {
      if (this.isExpired(entry)) {
        this.map.delete(key);
        this.onEvict?.(key, entry.value);
        pruned++;
      }
    }
    return pruned;
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    if (!this.ttlMs) return false;
    return Date.now() - entry.createdAt > this.ttlMs;
  }
}

/**
 * Create a memoized version of a function using an LRU cache.
 *
 * @param fn - The function to memoize
 * @param options - Cache configuration
 * @param keyFn - Optional function to derive the cache key from the arguments.
 *                Defaults to `JSON.stringify(args)`.
 * @returns A memoized wrapper with the same signature, plus a `.cache` property
 *          exposing the underlying {@link LRUCache} for inspection/clearing.
 */
export function memoize<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  options: LRUCacheOptions<string, R>,
  keyFn?: (...args: Args) => string
): ((...args: Args) => R) & { cache: LRUCache<string, R> } {
  const cache = new LRUCache<string, R>(options);
  const resolveKey = keyFn ?? ((...args: Args) => JSON.stringify(args));

  const memoized = (...args: Args): R => {
    const key = resolveKey(...args);
    return cache.getOrSet(key, () => fn(...args));
  };

  memoized.cache = cache;
  return memoized;
}

/**
 * Create a memoized version of an async function using an LRU cache.
 *
 * Unlike {@link memoize}, this correctly handles Promises: it caches the
 * resolved value (not the Promise object), deduplicates concurrent calls
 * for the same key, and evicts the cache entry if the Promise rejects.
 *
 * @param fn - The async function to memoize
 * @param options - Cache configuration
 * @param keyFn - Optional function to derive the cache key from the arguments.
 *                Defaults to `JSON.stringify(args)`.
 * @returns A memoized async wrapper with the same signature, plus a `.cache` property
 *          exposing the underlying {@link LRUCache} for inspection/clearing.
 */
export function memoizeAsync<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  options: LRUCacheOptions<string, R>,
  keyFn?: (...args: Args) => string
): ((...args: Args) => Promise<R>) & { cache: LRUCache<string, R> } {
  const cache = new LRUCache<string, R>(options);
  // Track in-flight promises to deduplicate concurrent calls for the same key
  const inflight = new Map<string, Promise<R>>();
  const resolveKey = keyFn ?? ((...args: Args) => JSON.stringify(args));

  const memoized = (...args: Args): Promise<R> => {
    const key = resolveKey(...args);

    // Single lookup: avoids the has()+get() double-lookup and TTL race
    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    // Deduplicate concurrent calls: if a call for this key is already
    // in flight, piggyback on its result instead of starting a new one
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = fn(...args)
      .then((result) => {
        cache.set(key, result);
        inflight.delete(key);
        return result;
      })
      .catch((err: unknown) => {
        // Don't cache failures
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, promise);
    return promise;
  };

  memoized.cache = cache;
  return memoized;
}
