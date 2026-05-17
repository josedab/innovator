import { describe, it, expect } from "vitest";
import { ObjectPool, withPooled, withPooledAsync } from "../pool/index.js";

describe("ObjectPool", () => {
  it("creates objects via factory when pool is empty", () => {
    let created = 0;
    const pool = new ObjectPool({
      factory: () => {
        created++;
        return { value: 0 };
      },
      maxSize: 5,
    });

    const obj = pool.acquire();
    expect(obj).toEqual({ value: 0 });
    expect(created).toBe(1);
  });

  it("recycles released objects", () => {
    let created = 0;
    const pool = new ObjectPool({
      factory: () => {
        created++;
        return { value: created };
      },
      reset: (obj) => {
        obj.value = 0;
      },
      maxSize: 5,
    });

    const obj1 = pool.acquire();
    obj1.value = 42;
    pool.release(obj1);

    const obj2 = pool.acquire();
    expect(obj2).toBe(obj1); // Same reference
    expect(obj2.value).toBe(0); // Reset was called
    expect(created).toBe(1); // Only one factory call
  });

  it("respects maxSize and discards excess releases", () => {
    const pool = new ObjectPool({
      factory: () => ({ v: 0 }),
      maxSize: 2,
    });

    const objs = [pool.acquire(), pool.acquire(), pool.acquire()];
    for (const obj of objs) pool.release(obj);

    expect(pool.size).toBe(2); // Only 2 kept, third discarded
  });

  it("prewarm fills the pool", () => {
    const pool = new ObjectPool({
      factory: () => ({}),
      maxSize: 10,
    });

    pool.prewarm(5);
    expect(pool.size).toBe(5);

    // Prewarm respects maxSize
    pool.prewarm(20);
    expect(pool.size).toBe(10);
  });

  it("drain empties the pool", () => {
    const pool = new ObjectPool({
      factory: () => ({}),
      maxSize: 10,
    });

    pool.prewarm(5);
    pool.drain();
    expect(pool.size).toBe(0);
  });

  it("tracks usage statistics", () => {
    const pool = new ObjectPool({
      factory: () => ({}),
      maxSize: 10,
    });

    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    pool.acquire(); // re-use from pool

    const stats = pool.stats();
    expect(stats.acquires).toBe(3);
    expect(stats.releases).toBe(2);
    expect(stats.creates).toBe(2); // Only 2 created, third was recycled
    expect(stats.idle).toBe(1);
    expect(stats.maxSize).toBe(10);
  });

  it("throws on invalid maxSize", () => {
    expect(() => new ObjectPool({ factory: () => ({}), maxSize: 0 })).toThrow(
      "maxSize must be a finite number >= 1"
    );
    expect(() => new ObjectPool({ factory: () => ({}), maxSize: NaN })).toThrow(
      "maxSize must be a finite number >= 1"
    );
  });
});

describe("withPooled", () => {
  it("acquires, runs function, and releases", () => {
    const pool = new ObjectPool({
      factory: () => ({ parts: [] as string[] }),
      reset: (obj) => {
        obj.parts.length = 0;
      },
      maxSize: 5,
    });

    const result = withPooled(pool, (obj) => {
      obj.parts.push("hello");
      return obj.parts.length;
    });

    expect(result).toBe(1);
    expect(pool.size).toBe(1); // Object returned to pool
    expect(pool.stats().acquires).toBe(1);
    expect(pool.stats().releases).toBe(1);
  });

  it("releases even on error", () => {
    const pool = new ObjectPool({
      factory: () => ({}),
      maxSize: 5,
    });

    expect(() =>
      withPooled(pool, () => {
        throw new Error("boom");
      })
    ).toThrow("boom");

    expect(pool.size).toBe(1); // Still released
  });
});

describe("withPooledAsync", () => {
  it("acquires, runs async function, and releases", async () => {
    const pool = new ObjectPool({
      factory: () => ({ data: "" }),
      reset: (obj) => {
        obj.data = "";
      },
      maxSize: 5,
    });

    const result = await withPooledAsync(pool, async (obj) => {
      obj.data = "test";
      return obj.data;
    });

    expect(result).toBe("test");
    expect(pool.size).toBe(1);
  });

  it("releases on async error", async () => {
    const pool = new ObjectPool({
      factory: () => ({}),
      maxSize: 5,
    });

    await expect(
      withPooledAsync(pool, async () => {
        throw new Error("async boom");
      })
    ).rejects.toThrow("async boom");

    expect(pool.size).toBe(1);
  });
});
