import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger";

describe("logger", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logger.error calls console.error", () => {
    logger.error("test error");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("test error");
  });

  it("logger.warn calls console.warn", () => {
    logger.warn("test warn");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("test warn");
  });

  it("logger.info calls console.info", () => {
    logger.info("test info");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toContain("test info");
  });

  it("includes context in output", () => {
    logger.info("with context", { key: "value" });
    expect(infoSpy.mock.calls[0][0]).toContain("key");
  });

  it("formats as dev format when NODE_ENV is not production", () => {
    logger.error("dev message");
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain("[ERROR]");
  });
});
