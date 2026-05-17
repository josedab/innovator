import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LRUCache, memoize, memoizeAsync } from "../cache/index.js";

describe("LRUCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
  });

  it("returns undefined for missing keys", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts least recently used entries when at capacity", () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  it("promotes accessed entries to most-recently-used", () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Access "a" to promote it
    cache.get("a");

    // Insert "d" — should evict "b" (now the LRU), not "a"
    cache.set("d", 4);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("supports TTL-based expiration", () => {
    vi.useFakeTimers();
    try {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 1000 });
      cache.set("a", 1);

      expect(cache.get("a")).toBe(1);

      vi.advanceTimersByTime(1001);

      expect(cache.get("a")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("has() returns false for expired entries", () => {
    vi.useFakeTimers();
    try {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 500 });
      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);

      vi.advanceTimersByTime(501);
      expect(cache.has("a")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delete() removes entries", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.delete("nonexistent")).toBe(false);
  });

  it("clear() removes all entries and resets stats", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.get("missing");

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(0);
  });

  it("tracks hit/miss statistics", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("a"); // hit
    cache.get("b"); // miss

    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(10);
  });

  it("stats() returns 0 hitRate when no lookups", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    expect(cache.stats().hitRate).toBe(0);
  });

  it("prune() removes expired entries", () => {
    vi.useFakeTimers();
    try {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 1000 });
      cache.set("a", 1);
      cache.set("b", 2);

      vi.advanceTimersByTime(500);
      cache.set("c", 3);

      vi.advanceTimersByTime(600);
      // "a" and "b" are expired (created 1100ms ago), "c" is not (created 600ms ago)

      const pruned = cache.prune();
      expect(pruned).toBe(2);
      expect(cache.size).toBe(1);
      expect(cache.get("c")).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("prune() does nothing without TTL", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set("a", 1);
    expect(cache.prune()).toBe(0);
  });

  it("throws on invalid maxSize", () => {
    expect(() => new LRUCache({ maxSize: 0 })).toThrow("maxSize must be a finite number >= 1");
    expect(() => new LRUCache({ maxSize: -1 })).toThrow("maxSize must be a finite number >= 1");
    expect(() => new LRUCache({ maxSize: NaN })).toThrow("maxSize must be a finite number >= 1");
  });

  it("overwrites existing entries without growing size", () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10); // overwrite
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBe(10);
  });
});

describe("memoize", () => {
  it("caches function results", () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn, { maxSize: 10 });

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses custom key function", () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const memoized = memoize(fn, { maxSize: 10 }, (a, b) => `${a}+${b}`);

    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exposes cache for inspection", () => {
    const fn = (x: number) => x * 2;
    const memoized = memoize(fn, { maxSize: 5 });

    memoized(1);
    memoized(2);

    expect(memoized.cache.size).toBe(2);
    expect(memoized.cache.stats().hits).toBe(0);
  });

  it("evicts old entries based on maxSize", () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn, { maxSize: 2 });

    memoized(1);
    memoized(2);
    memoized(3); // evicts result for 1

    fn.mockClear();
    memoized(1); // should re-compute since evicted
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("memoizeAsync", () => {
  it("caches resolved values from async functions", async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    const memoized = memoizeAsync(fn, { maxSize: 10 });

    expect(await memoized(5)).toBe(10);
    expect(await memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache rejected promises", async () => {
    let callCount = 0;
    const fn = vi.fn(async (x: number) => {
      callCount++;
      if (callCount === 1) throw new Error("fail");
      return x * 2;
    });
    const memoized = memoizeAsync(fn, { maxSize: 10 });

    await expect(memoized(3)).rejects.toThrow("fail");
    // Second call should retry (not serve cached rejection)
    expect(await memoized(3)).toBe(6);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent calls for the same key", async () => {
    let resolvePromise: (v: number) => void;
    const fn = vi.fn(
      (_x: number) =>
        new Promise<number>((resolve) => {
          resolvePromise = resolve;
        })
    );
    const memoized = memoizeAsync(fn, { maxSize: 10 });

    // Start two concurrent calls
    const p1 = memoized(1);
    const p2 = memoized(1);

    // Should only call fn once
    expect(fn).toHaveBeenCalledTimes(1);

    resolvePromise!(42);
    expect(await p1).toBe(42);
    expect(await p2).toBe(42);
  });

  it("uses custom key function", async () => {
    const fn = vi.fn(async (a: number, b: number) => a + b);
    const memoized = memoizeAsync(fn, { maxSize: 10 }, (a, b) => `${a}+${b}`);

    expect(await memoized(1, 2)).toBe(3);
    expect(await memoized(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exposes cache for inspection", async () => {
    const fn = async (x: number) => x * 2;
    const memoized = memoizeAsync(fn, { maxSize: 5 });

    await memoized(1);
    await memoized(2);

    expect(memoized.cache.size).toBe(2);
  });

  it("respects cache maxSize eviction", async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    const memoized = memoizeAsync(fn, { maxSize: 2 });

    await memoized(1);
    await memoized(2);
    await memoized(3); // evicts result for 1

    fn.mockClear();
    await memoized(1); // should re-compute
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on subsequent calls after resolution", async () => {
    const fn = vi.fn(async () => "result");
    const memoized = memoizeAsync(fn, { maxSize: 10 });

    await memoized();
    await memoized();
    await memoized();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("LRUCache.getOrSet", () => {
  it("returns cached value without calling factory", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set("a", 42);
    const factory = vi.fn(() => 99);
    expect(cache.getOrSet("a", factory)).toBe(42);
    expect(factory).not.toHaveBeenCalled();
  });

  it("calls factory on miss and caches result", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    const factory = vi.fn(() => 99);
    expect(cache.getOrSet("a", factory)).toBe(99);
    expect(factory).toHaveBeenCalledTimes(1);
    // Second call should use cached value
    const factory2 = vi.fn(() => 100);
    expect(cache.getOrSet("a", factory2)).toBe(99);
    expect(factory2).not.toHaveBeenCalled();
  });

  it("tracks hit/miss stats correctly", () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.getOrSet("a", () => 1); // miss
    cache.getOrSet("a", () => 2); // hit
    cache.getOrSet("b", () => 3); // miss
    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
  });
});
