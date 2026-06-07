import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@innovator/core", () => ({
  KNOWN_MODELS: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-5",
    "gpt-5-mini",
    "claude-sonnet-4.5",
    "claude-sonnet-4",
  ],
}));

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns env data for valid config", async () => {
    process.env.INNOVATOR_DEFAULT_MODEL = "gpt-4.1";
    const { validateEnv } = await import("../env");
    const result = validateEnv();
    expect(result.INNOVATOR_DEFAULT_MODEL).toBe("gpt-4.1");
  });

  it("returns env data when model is not set", async () => {
    delete process.env.INNOVATOR_DEFAULT_MODEL;
    const { validateEnv } = await import("../env");
    const result = validateEnv();
    expect(result.INNOVATOR_DEFAULT_MODEL).toBeUndefined();
  });

  it("logs warning for unknown model but does not throw", async () => {
    process.env.INNOVATOR_DEFAULT_MODEL = "unknown-model";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await import("../env");
    const result = validateEnv();
    expect(result.INNOVATOR_DEFAULT_MODEL).toBe("unknown-model");
    warnSpy.mockRestore();
  });
});
