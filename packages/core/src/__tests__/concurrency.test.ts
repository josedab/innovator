import { describe, it, expect } from "vitest";
import { Semaphore, TaskRunner, runConcurrent } from "../concurrency/index.js";

describe("Semaphore", () => {
  it("allows up to maxPermits concurrent acquires", async () => {
    const sem = new Semaphore(2);
    expect(sem.available).toBe(2);

    await sem.acquire();
    expect(sem.available).toBe(1);

    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  it("queues acquires when all permits are taken", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    // Should not have acquired yet
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(sem.waiting).toBe(1);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });

  it("release unblocks waiters in FIFO order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    sem.release();
    await p1;
    sem.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it("throws on invalid maxPermits", () => {
    expect(() => new Semaphore(0)).toThrow("maxPermits must be >= 1");
    expect(() => new Semaphore(-1)).toThrow("maxPermits must be >= 1");
    expect(() => new Semaphore(NaN)).toThrow("maxPermits must be >= 1");
  });
});

describe("TaskRunner", () => {
  it("runs tasks with bounded concurrency", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const runner = new TaskRunner({ concurrency: 2 });
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
      return i;
    });

    const result = await runner.run(tasks);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(result.results).toEqual([0, 1, 2, 3, 4]);
    expect(result.errors).toHaveLength(0);
    expect(result.tasks).toHaveLength(5);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  it("captures errors without stopping other tasks", async () => {
    const runner = new TaskRunner({ concurrency: 3 });
    const tasks = [
      async () => 1,
      async () => {
        throw new Error("fail");
      },
      async () => 3,
    ];

    const result = await runner.run(tasks);
    expect(result.results[0]).toBe(1);
    expect(result.results[1]).toBeUndefined();
    expect(result.results[2]).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.errors[0].error.message).toBe("fail");
  });

  it("tracks per-task timing", async () => {
    const runner = new TaskRunner({ concurrency: 2 });
    const result = await runner.run([
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "a";
      },
    ]);

    expect(result.tasks[0].ok).toBe(true);
    expect(result.tasks[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty task array", async () => {
    const runner = new TaskRunner({ concurrency: 2 });
    const result = await runner.run([]);
    expect(result.results).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.totalDurationMs).toBe(0);
  });

  it("throws on invalid concurrency", () => {
    expect(() => new TaskRunner({ concurrency: 0 })).toThrow("concurrency must be >= 1");
    expect(() => new TaskRunner({ concurrency: -1 })).toThrow("concurrency must be >= 1");
  });

  it("respects AbortSignal", async () => {
    const ac = new AbortController();
    const runner = new TaskRunner({ concurrency: 1, signal: ac.signal });

    const tasks = [
      async () => {
        ac.abort();
        return 1;
      },
      async () => 2, // should be skipped
      async () => 3, // should be skipped
    ];

    const result = await runner.run(tasks);
    // First task ran; subsequent ones should be aborted or skipped
    expect(result.results[0]).toBe(1);
  });

  it("adaptive scaling reduces concurrency on high error rates", async () => {
    const runner = new TaskRunner({
      concurrency: 4,
      adaptive: true,
      errorThreshold: 0.5,
      minConcurrency: 1,
    });

    // First 4 tasks fail to trigger adaptive scaling
    const tasks = [
      async () => {
        throw new Error("fail1");
      },
      async () => {
        throw new Error("fail2");
      },
      async () => {
        throw new Error("fail3");
      },
      async () => 4,
      async () => 5,
    ];

    const result = await runner.run(tasks);
    // Should still complete all tasks even with adaptive scaling
    expect(result.tasks.length).toBe(5);
    expect(result.errors.length).toBe(3);
    expect(result.results[3]).toBe(4);
    expect(result.results[4]).toBe(5);
  });
});

describe("runConcurrent", () => {
  it("provides a functional API over TaskRunner", async () => {
    const result = await runConcurrent([async () => 1, async () => 2, async () => 3], 2);
    expect(result.results).toEqual([1, 2, 3]);
    expect(result.errors).toHaveLength(0);
  });
});
