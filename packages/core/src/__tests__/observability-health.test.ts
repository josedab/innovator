import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHealthChecks,
  createProviderHealthCheck,
  createStorageHealthCheck,
  getHealthReport,
  registerHealthCheck,
  unregisterHealthCheck,
} from "../observability/health.js";

describe("observability/health", () => {
  beforeEach(() => {
    clearHealthChecks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to a healthy core report when no checks are registered", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 2_000));

    const report = await getHealthReport("1.2.3");

    expect(report.status).toBe("healthy");
    expect(report.version).toBe("1.2.3");
    expect(report.uptime).toBeGreaterThan(0);
    expect(report.components).toEqual([
      expect.objectContaining({ name: "core", status: "healthy", message: "Core engine running" }),
    ]);
  });

  it("reports healthy, degraded, and unhealthy overall states", async () => {
    registerHealthCheck("database", async () => ({
      name: "database",
      status: "healthy",
      message: "reachable",
      lastCheck: new Date().toISOString(),
    }));
    registerHealthCheck("cache", async () => ({
      name: "cache",
      status: "degraded",
      message: "warm-up in progress",
      lastCheck: new Date().toISOString(),
    }));

    const degraded = await getHealthReport();
    expect(degraded.status).toBe("degraded");

    registerHealthCheck("queue", async () => ({
      name: "queue",
      status: "healthy",
      message: "draining",
      lastCheck: new Date().toISOString(),
    }));
    unregisterHealthCheck("cache");
    const healthy = await getHealthReport();
    expect(healthy.status).toBe("healthy");

    registerHealthCheck("search", async () => ({
      name: "search",
      status: "unhealthy",
      message: "down",
      lastCheck: new Date().toISOString(),
    }));
    const unhealthy = await getHealthReport();
    expect(unhealthy.status).toBe("unhealthy");
  });

  it("catches failing checks and includes their error messages", async () => {
    registerHealthCheck("failing-service", async () => {
      throw new Error("timeout");
    });

    const report = await getHealthReport();

    expect(report.status).toBe("unhealthy");
    expect(report.components).toEqual([
      expect.objectContaining({
        name: "failing-service",
        status: "unhealthy",
        message: "timeout",
      }),
    ]);
  });

  it("supports unregistering and clearing checks", async () => {
    registerHealthCheck("database", async () => ({
      name: "database",
      status: "healthy",
      lastCheck: new Date().toISOString(),
    }));
    unregisterHealthCheck("database");

    expect((await getHealthReport()).components[0]?.name).toBe("core");

    registerHealthCheck("cache", async () => ({
      name: "cache",
      status: "healthy",
      lastCheck: new Date().toISOString(),
    }));
    clearHealthChecks();

    expect((await getHealthReport()).components[0]?.name).toBe("core");
  });

  describe("factory health checks", () => {
    it("creates provider checks with the expected name and latency", async () => {
      const check = createProviderHealthCheck("openai", async () => true);

      const result = await check();

      expect(result).toEqual(
        expect.objectContaining({
          name: "llm-provider-openai",
          status: "healthy",
          latencyMs: expect.any(Number),
          lastCheck: expect.any(String),
        })
      );
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("marks provider and storage checks unhealthy when they fail", async () => {
      const providerCheck = createProviderHealthCheck("anthropic", async () => {
        throw new Error("provider offline");
      });
      const storageCheck = createStorageHealthCheck("s3", async () => false);

      await expect(providerCheck()).resolves.toEqual(
        expect.objectContaining({
          name: "llm-provider-anthropic",
          status: "unhealthy",
          message: "provider offline",
        })
      );
      await expect(storageCheck()).resolves.toEqual(
        expect.objectContaining({
          name: "storage-s3",
          status: "unhealthy",
          latencyMs: expect.any(Number),
        })
      );
    });
  });
});
