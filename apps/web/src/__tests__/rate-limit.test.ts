import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// The rate-limit module uses a module-level store, so we re-import fresh
// by dynamically importing. For simplicity, test the exported functions directly.
// The store is shared, so we use unique keys per test to avoid collisions.

let checkRateLimit: typeof import("../../lib/rate-limit").checkRateLimit;
let addRateLimitHeaders: typeof import("../../lib/rate-limit").addRateLimitHeaders;
let scopedRateLimitKey: typeof import("../../lib/rate-limit").scopedRateLimitKey;

beforeEach(async () => {
  // Re-import to get the functions (store persists but we use unique keys)
  const mod = await import("../lib/rate-limit");
  checkRateLimit = mod.checkRateLimit;
  addRateLimitHeaders = mod.addRateLimitHeaders;
  scopedRateLimitKey = mod.scopedRateLimitKey;
});

describe("checkRateLimit", () => {
  it("allows the first request", () => {
    const result = checkRateLimit("test-first-request");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59); // 60 - 1
    expect(result.limit).toBe(60);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("allows requests within the limit", () => {
    const key = "test-within-limit";
    for (let i = 0; i < 60; i++) {
      const result = checkRateLimit(key);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests after exceeding the limit", () => {
    const key = "test-exceed-limit";
    // Exhaust all 60 tokens
    for (let i = 0; i < 60; i++) {
      checkRateLimit(key);
    }
    const blocked = checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("uses custom config limit", () => {
    const key = "test-custom-limit";
    const config = { limit: 3, windowMs: 60_000 };

    checkRateLimit(key, config);
    checkRateLimit(key, config);
    checkRateLimit(key, config);
    const result = checkRateLimit(key, config);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(3);
  });

  it("isolates different keys", () => {
    const config = { limit: 2, windowMs: 60_000 };

    checkRateLimit("key-a", config);
    checkRateLimit("key-a", config);
    const blockedA = checkRateLimit("key-a", config);

    const allowedB = checkRateLimit("key-b", config);

    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("isolates the same caller across route scopes", () => {
    const config = { limit: 1, windowMs: 60_000 };
    const caller = "key-0";

    expect(checkRateLimit(scopedRateLimitKey("investigate", caller), config).allowed).toBe(true);
    expect(checkRateLimit(scopedRateLimitKey("auto", caller), config).allowed).toBe(true);
  });

  it("resets after window expires", () => {
    const key = "test-window-reset";
    const config = { limit: 1, windowMs: 100 };

    checkRateLimit(key, config);
    const blocked = checkRateLimit(key, config);
    expect(blocked.allowed).toBe(false);

    // Advance time past the window
    vi.useFakeTimers();
    vi.advanceTimersByTime(200);

    const afterReset = checkRateLimit(key, config);
    expect(afterReset.allowed).toBe(true);

    vi.useRealTimers();
  });

  it("returns correct remaining count", () => {
    const key = "test-remaining";
    const config = { limit: 5, windowMs: 60_000 };

    expect(checkRateLimit(key, config).remaining).toBe(4);
    expect(checkRateLimit(key, config).remaining).toBe(3);
    expect(checkRateLimit(key, config).remaining).toBe(2);
    expect(checkRateLimit(key, config).remaining).toBe(1);
    expect(checkRateLimit(key, config).remaining).toBe(0);
    expect(checkRateLimit(key, config).remaining).toBe(0);
  });
});

describe("addRateLimitHeaders", () => {
  it("adds rate limit headers to existing headers", () => {
    const resetAt = new Date("2025-01-01T00:00:00.000Z");
    const result = {
      allowed: true,
      limit: 60,
      remaining: 42,
      resetAt,
    };

    const headers = addRateLimitHeaders({ "Content-Type": "application/json" }, result);

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-RateLimit-Limit"]).toBe("60");
    expect(headers["X-RateLimit-Remaining"]).toBe("42");
    expect(headers["X-RateLimit-Reset"]).toBe("2025-01-01T00:00:00.000Z");
  });

  it("returns all required header fields", () => {
    const result = {
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: new Date(),
    };

    const headers = addRateLimitHeaders({}, result);

    expect(headers).toHaveProperty("X-RateLimit-Limit");
    expect(headers).toHaveProperty("X-RateLimit-Remaining");
    expect(headers).toHaveProperty("X-RateLimit-Reset");
  });
});
