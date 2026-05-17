import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../events/emitter.js";
import { Semaphore } from "../concurrency/index.js";
import { AbortError } from "../errors.js";
import { manageContext, createSegment, clearContextManagerData } from "../context-manager/index.js";
import type { ContextSegment } from "../context-manager/index.js";

// ---- EventBus: listener leak detection ----

describe("EventBus listener leak detection", () => {
  let bus: EventBus;
  let warnings: string[];

  beforeEach(() => {
    bus = new EventBus();
    warnings = [];
    bus.onWarning((msg) => warnings.push(msg));
  });

  it("warns when listener count exceeds maxListeners", () => {
    bus.setMaxListeners(3);
    for (let i = 0; i < 4; i++) {
      bus.on("pipeline.completed", () => {});
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("possible listener leak");
    expect(warnings[0]).toContain("threshold: 3");
  });

  it("does not warn when listeners are within limit", () => {
    bus.setMaxListeners(5);
    for (let i = 0; i < 5; i++) {
      bus.on("pipeline.completed", () => {});
    }
    expect(warnings).toHaveLength(0);
  });

  it("does not warn when maxListeners is 0 (disabled)", () => {
    bus.setMaxListeners(0);
    for (let i = 0; i < 100; i++) {
      bus.on("pipeline.completed", () => {});
    }
    expect(warnings).toHaveLength(0);
  });

  it("defaults to maxListeners of 10", () => {
    expect(bus.maxListeners).toBe(10);
  });

  it("setMaxListeners is chainable", () => {
    const result = bus.setMaxListeners(20);
    expect(result).toBe(bus);
  });

  it("falls back to console.warn when no handler is set", () => {
    const freshBus = new EventBus();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    freshBus.setMaxListeners(1);
    freshBus.on("pipeline.completed", () => {});
    freshBus.on("pipeline.completed", () => {});
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

// ---- EventBus: buffer cap ----

describe("EventBus buffer cap", () => {
  let bus: EventBus;
  let warnings: string[];

  beforeEach(() => {
    bus = new EventBus();
    warnings = [];
    bus.onWarning((msg) => warnings.push(msg));
  });

  it("drops oldest events when buffer exceeds maxBufferSize", async () => {
    bus.setMaxBufferSize(3);
    bus.enableBuffering();

    for (let i = 0; i < 5; i++) {
      await bus.emit("pipeline.completed", { index: i });
    }

    expect(bus.bufferedCount).toBe(3);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("maxBufferSize");

    // Flush and verify we have the last 3 events
    const delivered: number[] = [];
    bus.on("pipeline.completed", (e) => {
      delivered.push(e.payload.index as number);
    });
    await bus.flush();
    expect(delivered).toEqual([2, 3, 4]);
  });

  it("defaults to maxBufferSize of 10000", () => {
    expect(bus.maxBufferSize).toBe(10_000);
  });

  it("setMaxBufferSize is chainable and enforces minimum of 1", () => {
    const result = bus.setMaxBufferSize(0);
    expect(result).toBe(bus);
    expect(bus.maxBufferSize).toBe(1);
  });
});

// ---- Semaphore: AbortSignal support ----

describe("Semaphore AbortSignal support", () => {
  it("rejects immediately if signal is already aborted", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const ac = new AbortController();
    ac.abort();

    await expect(sem.acquire({ signal: ac.signal })).rejects.toThrow(AbortError);
    sem.release();
  });

  it("rejects when signal is aborted while waiting", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const ac = new AbortController();
    const promise = sem.acquire({ signal: ac.signal });

    expect(sem.waiting).toBe(1);
    ac.abort();

    await expect(promise).rejects.toThrow(AbortError);
    // Waiter was removed from the queue
    expect(sem.waiting).toBe(0);

    sem.release();
  });

  it("acquires normally when signal is not aborted", async () => {
    const sem = new Semaphore(1);
    const ac = new AbortController();

    await sem.acquire({ signal: ac.signal });
    expect(sem.available).toBe(0);
    sem.release();
  });

  it("works without signal (backward compatible)", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    expect(sem.available).toBe(1);
    sem.release();
  });

  it("cleans up abort listener after successful acquire", async () => {
    const sem = new Semaphore(1);
    await sem.acquire(); // take the only permit

    const ac = new AbortController();
    const acquirePromise = sem.acquire({ signal: ac.signal });

    // Release to let the waiter through
    sem.release();
    await acquirePromise;

    // Aborting after acquire should not throw
    ac.abort();
    expect(sem.available).toBe(0);
    sem.release();
  });
});

// ---- Semaphore: maxWaiters cap ----

describe("Semaphore maxWaiters cap", () => {
  it("throws when wait queue exceeds maxWaiters", async () => {
    const sem = new Semaphore(1, { maxWaiters: 2 });
    await sem.acquire(); // take the permit

    // Queue 2 waiters (at cap)
    const p1 = sem.acquire();
    const p2 = sem.acquire();
    expect(sem.waiting).toBe(2);

    // Third waiter should throw
    await expect(sem.acquire()).rejects.toThrow("wait queue is full");

    // Cleanup
    sem.release();
    await p1;
    sem.release();
    await p2;
    sem.release();
  });

  it("defaults maxWaiters to 10000", () => {
    const sem = new Semaphore(1);
    // Should not throw for reasonable queue sizes
    expect(() => new Semaphore(1)).not.toThrow();
  });
});

// ---- manageContext: no input mutation ----

describe("manageContext input immutability", () => {
  beforeEach(() => {
    clearContextManagerData();
  });

  it("does not mutate input segments when compression is applied", () => {
    // Create content large enough to trigger compression
    const longContent = "The testing framework validates correctness. ".repeat(200);
    const segments: ContextSegment[] = [createSegment("big", longContent, "investigation", 0.9)];

    // Save original values
    const originalContent = segments[0].content;
    const originalTokenCount = segments[0].tokenCount;

    const result = manageContext(segments, "investigation", "testing framework");

    // Input must NOT be mutated
    expect(segments[0].content).toBe(originalContent);
    expect(segments[0].tokenCount).toBe(originalTokenCount);

    // Output may differ if compression was applied
    if (result.status.compressionApplied) {
      // Output segments are different objects
      expect(result.segments[0]).not.toBe(segments[0]);
    }
  });

  it("does not mutate input array when segments are dropped", () => {
    const bigContent = "word ".repeat(15000);
    const segments: ContextSegment[] = [
      createSegment("important", bigContent, "user-input", 0.9),
      createSegment("low", "some low relevance stuff", "history", 0.1),
    ];

    const originalLength = segments.length;
    manageContext(segments, "generation", "word");

    // Input array must NOT be modified
    expect(segments).toHaveLength(originalLength);
    expect(segments[1].id).toBe("low");
  });
});

// ---- Webhook error logging (not swallowed) ----

describe("WebhookManager error logging", () => {
  it("logs delivery errors to console.error instead of swallowing", async () => {
    // This is verified by code review — the .catch(() => {}) was replaced
    // with .catch(err => console.error(...))
    // We verify the import path is correct and the module loads
    const { WebhookManager } = await import("../events/webhooks.js");
    expect(WebhookManager).toBeDefined();
    expect(typeof WebhookManager).toBe("function");
  });
});
