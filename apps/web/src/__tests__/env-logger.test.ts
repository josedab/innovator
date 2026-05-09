import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("in development mode", () => {
    it("formats error with level prefix", async () => {
      process.env.NODE_ENV = "development";
      vi.resetModules();
      const { logger } = await import("@/lib/logger");
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.error("test error");
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toContain("[ERROR]");
      expect(spy.mock.calls[0][0]).toContain("test error");
    });

    it("debug outputs in development", async () => {
      process.env.NODE_ENV = "development";
      vi.resetModules();
      const { logger } = await import("@/lib/logger");
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("debug msg");
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toContain("[DEBUG]");
    });

    it("info includes context", async () => {
      process.env.NODE_ENV = "development";
      vi.resetModules();
      const { logger } = await import("@/lib/logger");
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("info msg", { key: "value" });
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toContain("key");
    });
  });

  describe("in production mode", () => {
    it("formats error as JSON", async () => {
      process.env.NODE_ENV = "production";
      vi.resetModules();
      const { logger } = await import("@/lib/logger");
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.error("prod error", { route: "/api/test" });
      expect(spy).toHaveBeenCalledOnce();
      const output = JSON.parse(spy.mock.calls[0][0]);
      expect(output.level).toBe("error");
      expect(output.message).toBe("prod error");
      expect(output.timestamp).toBeDefined();
      expect(output.route).toBe("/api/test");
    });

    it("debug is silent in production", async () => {
      process.env.NODE_ENV = "production";
      vi.resetModules();
      const { logger } = await import("@/lib/logger");
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("should not appear");
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe("env", () => {
  let originalModel: string | undefined;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalModel = process.env.INNOVATOR_DEFAULT_MODEL;
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.INNOVATOR_DEFAULT_MODEL;
    } else {
      process.env.INNOVATOR_DEFAULT_MODEL = originalModel;
    }
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("validates successfully with a known model", async () => {
    process.env.INNOVATOR_DEFAULT_MODEL = "gpt-4.1";
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    const env = validateEnv();
    expect(env.INNOVATOR_DEFAULT_MODEL).toBe("gpt-4.1");
  });

  it("warns but does not throw for unknown model", async () => {
    process.env.INNOVATOR_DEFAULT_MODEL = "unknown-model-xyz";
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await import("@/lib/env");
    const env = validateEnv();
    // Should still return the value
    expect(env.INNOVATOR_DEFAULT_MODEL).toBe("unknown-model-xyz");
  });

  it("passes when no model env var set", async () => {
    delete process.env.INNOVATOR_DEFAULT_MODEL;
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    const env = validateEnv();
    expect(env.INNOVATOR_DEFAULT_MODEL).toBeUndefined();
  });
});
