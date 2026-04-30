import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import { withRetry } from "../copilot/retry.js";

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
});
