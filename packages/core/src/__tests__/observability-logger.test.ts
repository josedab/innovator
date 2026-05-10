import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogBuffer,
  getLogBuffer,
  getLogLevel,
  log,
  logger,
  setLogLevel,
} from "../observability/logger.js";

describe("observability/logger", () => {
  beforeEach(() => {
    clearLogBuffer();
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearLogBuffer();
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("creates structured log entries with attributes and trace context", () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const entry = log(
      "info",
      "workflow started",
      { feature: "automation", retries: 2, enabled: true },
      "trace-1",
      "span-1"
    );

    expect(entry).toEqual(
      expect.objectContaining({
        level: "info",
        message: "workflow started",
        service: "innovator",
        traceId: "trace-1",
        spanId: "span-1",
        attributes: { feature: "automation", retries: 2, enabled: true },
      })
    );
    expect(getLogBuffer()).toEqual([expect.objectContaining({ message: "workflow started" })]);
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('"message":"workflow started"')
    );
  });

  it("filters out messages below the configured log level", () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    setLogLevel("info");

    expect(getLogLevel()).toBe("info");
    expect(log("debug", "hidden debug message")).toBeUndefined();
    expect(getLogBuffer()).toEqual([]);
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("routes error and fatal logs to stderr and other levels to stdout", () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    setLogLevel("debug");

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");
    logger.fatal("fatal message");

    expect(getLogBuffer().map((entry) => entry.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ]);
    expect(stdoutWrite).toHaveBeenCalledTimes(3);
    expect(stderrWrite).toHaveBeenCalledTimes(2);
    expect(stderrWrite.mock.calls[0]?.[0]).toContain('"level":"error"');
    expect(stderrWrite.mock.calls[1]?.[0]).toContain('"level":"fatal"');
  });

  it("caps the in-memory buffer at 1000 entries", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    setLogLevel("debug");

    for (let index = 0; index < 1005; index++) {
      logger.info(`msg-${index}`);
    }

    const buffer = getLogBuffer();
    expect(buffer).toHaveLength(1000);
    expect(buffer[0]?.message).toBe("msg-5");
    expect(buffer.at(-1)?.message).toBe("msg-1004");
  });

  it("clears the buffered logs", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    logger.info("one");
    logger.warn("two");
    expect(getLogBuffer()).toHaveLength(2);

    clearLogBuffer();
    expect(getLogBuffer()).toEqual([]);
  });
});
