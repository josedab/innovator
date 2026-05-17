import { describe, it, expect, beforeEach } from "vitest";
import { StringPool, getStringPool, resetStringPool, intern } from "../intern/index.js";

describe("StringPool", () => {
  it("returns the same reference for equal strings", () => {
    const pool = new StringPool({ maxSize: 100 });
    const a = pool.intern("hello");
    const b = pool.intern("hello");
    expect(a).toBe(b); // Same reference (===), not just equal
    expect(a === b).toBe(true);
  });

  it("returns different references for different strings", () => {
    const pool = new StringPool({ maxSize: 100 });
    const a = pool.intern("hello");
    const b = pool.intern("world");
    expect(a).not.toBe(b);
  });

  it("tracks pool size", () => {
    const pool = new StringPool({ maxSize: 100 });
    pool.intern("a");
    pool.intern("b");
    pool.intern("a"); // duplicate
    expect(pool.size).toBe(2);
  });

  it("has() checks pool membership", () => {
    const pool = new StringPool({ maxSize: 100 });
    pool.intern("exists");
    expect(pool.has("exists")).toBe(true);
    expect(pool.has("missing")).toBe(false);
  });

  it("evicts oldest entries when at capacity", () => {
    const pool = new StringPool({ maxSize: 3 });
    pool.intern("a");
    pool.intern("b");
    pool.intern("c");
    pool.intern("d"); // evicts "a"

    expect(pool.has("a")).toBe(false);
    expect(pool.has("b")).toBe(true);
    expect(pool.has("c")).toBe(true);
    expect(pool.has("d")).toBe(true);
    expect(pool.size).toBe(3);
  });

  it("tracks hit/miss statistics", () => {
    const pool = new StringPool({ maxSize: 100 });
    pool.intern("x"); // miss
    pool.intern("y"); // miss
    pool.intern("x"); // hit
    pool.intern("x"); // hit
    pool.intern("z"); // miss

    const stats = pool.stats();
    expect(stats.lookups).toBe(5);
    expect(stats.hits).toBe(2);
    expect(stats.hitRate).toBeCloseTo(2 / 5);
    expect(stats.size).toBe(3);
    expect(stats.estimatedBytesSaved).toBeGreaterThan(0);
  });

  it("clear resets pool and stats", () => {
    const pool = new StringPool({ maxSize: 100 });
    pool.intern("a");
    pool.intern("b");
    pool.intern("a");

    pool.clear();

    expect(pool.size).toBe(0);
    expect(pool.stats().lookups).toBe(0);
    expect(pool.stats().hits).toBe(0);
    expect(pool.stats().estimatedBytesSaved).toBe(0);
  });

  it("throws on invalid maxSize", () => {
    expect(() => new StringPool({ maxSize: 0 })).toThrow("maxSize must be a finite number >= 1");
    expect(() => new StringPool({ maxSize: NaN })).toThrow("maxSize must be a finite number >= 1");
  });

  it("uses default maxSize when not specified", () => {
    const pool = new StringPool();
    expect(pool.stats().maxSize).toBe(4096);
  });
});

describe("global string pool", () => {
  beforeEach(() => {
    resetStringPool();
  });

  it("getStringPool returns a pre-populated pool", () => {
    const pool = getStringPool();
    // Should have common angle IDs pre-interned
    expect(pool.has("scamper")).toBe(true);
    expect(pool.has("first-principles")).toBe(true);
    expect(pool.has("gpt-4.1")).toBe(true);
    expect(pool.has("pipeline.started")).toBe(true);
  });

  it("getStringPool returns the same instance", () => {
    const a = getStringPool();
    const b = getStringPool();
    expect(a).toBe(b);
  });

  it("intern() convenience function works", () => {
    const a = intern("test-string");
    const b = intern("test-string");
    expect(a).toBe(b);
    expect(a === b).toBe(true);
  });

  it("resetStringPool clears and recreates", () => {
    const pool1 = getStringPool();
    pool1.intern("custom-value");

    resetStringPool();

    const pool2 = getStringPool();
    expect(pool2).not.toBe(pool1);
    expect(pool2.has("custom-value")).toBe(false);
    // But common strings should be re-populated
    expect(pool2.has("scamper")).toBe(true);
  });
});
