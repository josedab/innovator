// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the env module
vi.mock("@/lib/env", () => ({
  validateEnv: vi.fn(),
}));

// Mock @innovator/core dynamic import
vi.mock("@innovator/core", () => ({
  stopCopilotClient: vi.fn().mockResolvedValue(undefined),
}));

describe("instrumentation — register()", () => {
  let originalRuntime: string | undefined;
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  const originalGlobal = globalThis as typeof globalThis & {
    __innovatorProcessHandlersRegistered?: boolean;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    originalRuntime = process.env.NEXT_RUNTIME;
    delete originalGlobal.__innovatorProcessHandlersRegistered;
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
  });

  afterEach(() => {
    process.env.NEXT_RUNTIME = originalRuntime;
    processOnSpy.mockRestore();
  });

  it("calls validateEnv on register", async () => {
    process.env.NEXT_RUNTIME = "edge"; // Skip Node.js-specific handlers
    const { register } = await import("../instrumentation.js");
    const { validateEnv } = await import("../lib/env.js");
    await register();
    expect(validateEnv).toHaveBeenCalled();
  });

  it("registers process handlers in nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const eventNames = processOnSpy.mock.calls.map(([event]) => event);
    expect(eventNames).toContain("beforeExit");
    expect(eventNames).toContain("SIGINT");
    expect(eventNames).toContain("SIGTERM");
    expect(eventNames).toContain("uncaughtException");
    expect(eventNames).toContain("unhandledRejection");
  });

  it("does not register handlers in non-nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("../instrumentation.js");
    await register();

    const eventNames = processOnSpy.mock.calls.map(([event]) => event);
    expect(eventNames).not.toContain("beforeExit");
  });

  it("prevents duplicate handler registration (idempotency)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();
    const firstCallCount = processOnSpy.mock.calls.length;

    await register();
    // No new handlers should be registered
    expect(processOnSpy.mock.calls.length).toBe(firstCallCount);
  });

  it("ECONNRESET errors are suppressed by uncaughtException handler", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const uncaughtHandler = processOnSpy.mock.calls.find(
      ([event]) => event === "uncaughtException"
    )?.[1] as (err: Error) => void;
    expect(uncaughtHandler).toBeDefined();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const econnreset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    uncaughtHandler(econnreset);
    expect(warnSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("EPIPE errors are suppressed", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const uncaughtHandler = processOnSpy.mock.calls.find(
      ([event]) => event === "uncaughtException"
    )?.[1] as (err: Error) => void;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    uncaughtHandler(epipe);
    expect(warnSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("ECONNABORTED errors are suppressed", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const uncaughtHandler = processOnSpy.mock.calls.find(
      ([event]) => event === "uncaughtException"
    )?.[1] as (err: Error) => void;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const econnaborted = Object.assign(new Error("ECONNABORTED"), { code: "ECONNABORTED" });
    uncaughtHandler(econnaborted);
    expect(exitSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("unexpected errors cause process.exit(1)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const uncaughtHandler = processOnSpy.mock.calls.find(
      ([event]) => event === "uncaughtException"
    )?.[1] as (err: Error) => void;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    uncaughtHandler(new Error("Unexpected real error"));
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("unhandledRejection suppresses connection errors", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const rejectionHandler = processOnSpy.mock.calls.find(
      ([event]) => event === "unhandledRejection"
    )?.[1] as (reason: unknown) => void;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const socketHangUp = new Error("socket hang up");
    rejectionHandler(socketHangUp);
    expect(warnSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("unhandledRejection exits on non-connection errors", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.js");
    await register();

    const rejectionHandler = processOnSpy.mock.calls.find(
      ([event]) => event === "unhandledRejection"
    )?.[1] as (reason: unknown) => void;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    rejectionHandler(new Error("Database connection failed"));
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
