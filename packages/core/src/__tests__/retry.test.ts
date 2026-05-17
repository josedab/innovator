import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import { withRetry, RetryExhaustedError } from "../copilot/retry.js";

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient errors and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, { initialDelayMs: 1 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toThrow("Invalid API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(withRetry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toThrow(
      "ECONNRESET"
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects maxAttempts option", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("timed out"));
    await expect(withRetry(fn, { maxAttempts: 1, initialDelayMs: 1 })).rejects.toThrow("timed out");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on various network error patterns", async () => {
    for (const errorMsg of ["ETIMEDOUT", "fetch failed", "socket hang up"]) {
      const fn = vi.fn().mockRejectedValueOnce(new Error(errorMsg)).mockResolvedValue("ok");

      const result = await withRetry(fn, { initialDelayMs: 1 });
      expect(result).toBe("ok");
    }
  });

  it("supports custom isRetryable predicate", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("custom-error")).mockResolvedValue("ok");

    const result = await withRetry(fn, {
      initialDelayMs: 1,
      isRetryable: (err) => err instanceof Error && err.message === "custom-error",
    });
    expect(result).toBe("ok");
  });

  it("throws when aborted via signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { signal: controller.signal })).rejects.toThrow("Retry aborted");
  });

  it("does not retry non-Error values", async () => {
    const fn = vi.fn().mockRejectedValue("string error");
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toBe("string error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("defaultIsRetryable matches all 10 retryable patterns", async () => {
    const patterns = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "fetch failed",
      "network",
      "timed out",
      "socket hang up",
      "EPIPE",
    ];
    for (const pattern of patterns) {
      const fn = vi.fn().mockRejectedValueOnce(new Error(pattern)).mockResolvedValue("ok");
      const result = await withRetry(fn, { initialDelayMs: 1 });
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it("defaultIsRetryable returns false for non-Error values", async () => {
    const fn = vi.fn().mockRejectedValue(42);
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backoff delay grows exponentially (1→2→4ms)", async () => {
    const callTimes: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.reject(new Error("ECONNRESET"));
    });

    await expect(
      withRetry(fn, { maxAttempts: 4, initialDelayMs: 50, backoffMultiplier: 2 })
    ).rejects.toThrow("ECONNRESET");

    expect(fn).toHaveBeenCalledTimes(4);
    // Verify delays grow: gap2 > gap1, gap3 > gap2
    const gaps = callTimes.slice(1).map((t, i) => t - callTimes[i]);
    expect(gaps[1]).toBeGreaterThanOrEqual(gaps[0]);
    expect(gaps[2]).toBeGreaterThanOrEqual(gaps[1]);
  });

  it("delay is capped at maxDelayMs", async () => {
    const callTimes: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.reject(new Error("ECONNRESET"));
    });

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 30,
        backoffMultiplier: 100,
        maxDelayMs: 60,
      })
    ).rejects.toThrow("ECONNRESET");

    expect(fn).toHaveBeenCalledTimes(3);
    // Second gap should be capped at ~60ms, not 3000ms
    const gap2 = callTimes[2] - callTimes[1];
    expect(gap2).toBeLessThan(200);
  });

  it("AbortSignal already aborted throws before first fn() call", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(fn, { signal: controller.signal })).rejects.toThrow("Retry aborted");
    expect(fn).not.toHaveBeenCalled();
  });

  it("AbortSignal fires during delay rejects with abort error", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue("ok");

    const promise = withRetry(fn, {
      initialDelayMs: 10_000,
      signal: controller.signal,
    });

    // Abort while waiting for the delay
    setTimeout(() => controller.abort(), 50);
    await expect(promise).rejects.toThrow("Retry aborted");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("custom isRetryable predicate prevents retry when returning false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      withRetry(fn, {
        initialDelayMs: 1,
        isRetryable: () => false,
      })
    ).rejects.toThrow("ECONNRESET");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("maxAttempts=0 rejects with validation error (must be >= 1)", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { maxAttempts: 0 })).rejects.toThrow(
      "withRetry: maxAttempts must be a finite number >= 1"
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn throws non-Error primitive string is not retryable by default", async () => {
    const fn = vi.fn().mockRejectedValue("string error");
    await expect(withRetry(fn, { initialDelayMs: 1, maxAttempts: 3 })).rejects.toBe("string error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fn throws non-Error primitive number is not retryable by default", async () => {
    const fn = vi.fn().mockRejectedValue(0);
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses default options when none provided", async () => {
    const fn = vi.fn().mockResolvedValue("default");
    const result = await withRetry(fn);
    expect(result).toBe("default");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("jitter adds ±10% randomization to delay", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      delays.push(Date.now());
      return Promise.reject(new Error("ECONNRESET"));
    });

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 1 })
    ).rejects.toThrow("ECONNRESET");

    expect(fn).toHaveBeenCalledTimes(3);
    // Each gap should be 100ms + jitter (0-10ms), so between ~95ms and ~120ms
    const gap = delays[1] - delays[0];
    expect(gap).toBeGreaterThanOrEqual(90);
    expect(gap).toBeLessThan(200);
  });

  it("throws RetryExhaustedError with attempt count after all retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    try {
      await withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      const retryErr = err as RetryExhaustedError;
      expect(retryErr.attempts).toBe(3);
      expect(retryErr.cause.message).toBe("ECONNRESET");
      expect(retryErr.message).toContain("3 retry attempts exhausted");
    }
  });

  it("RetryExhaustedError preserves original error as cause", async () => {
    const originalError = new Error("ETIMEDOUT");
    const fn = vi.fn().mockRejectedValue(originalError);
    try {
      await withRetry(fn, { maxAttempts: 2, initialDelayMs: 1 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      expect((err as RetryExhaustedError).cause).toBe(originalError);
    }
  });

  it("maxAttempts=1 with retryable error wraps in RetryExhaustedError", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    try {
      await withRetry(fn, { maxAttempts: 1, initialDelayMs: 1 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      const retryErr = err as RetryExhaustedError;
      expect(retryErr.attempts).toBe(1);
      expect(retryErr.cause.message).toBe("ECONNRESET");
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rejects with validation error for NaN maxAttempts", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { maxAttempts: NaN })).rejects.toThrow(
      "withRetry: maxAttempts must be a finite number >= 1"
    );
  });

  it("rejects with validation error for Infinity maxAttempts", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { maxAttempts: Infinity })).rejects.toThrow(
      "withRetry: maxAttempts must be a finite number >= 1"
    );
  });

  it("rejects with validation error for negative initialDelayMs", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { initialDelayMs: -100 })).rejects.toThrow(
      "withRetry: initialDelayMs must be a finite non-negative number"
    );
  });

  it("rejects with validation error for NaN initialDelayMs", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { initialDelayMs: NaN })).rejects.toThrow(
      "withRetry: initialDelayMs must be a finite non-negative number"
    );
  });

  it("rejects with validation error for backoffMultiplier < 1", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { backoffMultiplier: 0.5 })).rejects.toThrow(
      "withRetry: backoffMultiplier must be a finite number >= 1"
    );
  });

  it("rejects with validation error for negative maxDelayMs", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { maxDelayMs: -1 })).rejects.toThrow(
      "withRetry: maxDelayMs must be a finite non-negative number"
    );
  });

  it("RetryExhaustedError wraps non-Error primitive in Error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    try {
      await withRetry(fn, { maxAttempts: 1, initialDelayMs: 1 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      expect((err as RetryExhaustedError).cause).toBeInstanceOf(Error);
    }
  });

  it("AbortSignal fires between fn() calls stops retry loop", async () => {
    const controller = new AbortController();
    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Abort right after first call fails
        setTimeout(() => controller.abort(), 5);
      }
      return Promise.reject(new Error("ECONNRESET"));
    });

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        initialDelayMs: 100,
        signal: controller.signal,
      })
    ).rejects.toThrow("Retry aborted");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
