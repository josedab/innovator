/**
 * @module observability/health
 *
 * Health check system for monitoring component status.
 * Supports registering health check functions for LLM providers,
 * storage backends, and other dependencies.
 */

import type { HealthReport, HealthStatus, ComponentHealth } from "./types.js";

type HealthCheckFn = () => Promise<ComponentHealth>;

const healthChecks = new Map<string, HealthCheckFn>();
const startTime = Date.now();

/** Register a named health check function. */
export function registerHealthCheck(name: string, check: HealthCheckFn): void {
  healthChecks.set(name, check);
}

/** Unregister a health check. */
export function unregisterHealthCheck(name: string): void {
  healthChecks.delete(name);
}

/** Run all health checks and produce a report. */
export async function getHealthReport(version = "0.2.0"): Promise<HealthReport> {
  const components: ComponentHealth[] = [];

  for (const [name, check] of healthChecks) {
    try {
      const result = await check();
      components.push(result);
    } catch (error) {
      components.push({
        name,
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Health check failed",
        lastCheck: new Date().toISOString(),
      });
    }
  }

  // If no checks registered, add a basic "core" check
  if (components.length === 0) {
    components.push({
      name: "core",
      status: "healthy",
      message: "Core engine running",
      lastCheck: new Date().toISOString(),
    });
  }

  const overallStatus: HealthStatus = components.some((c) => c.status === "unhealthy")
    ? "unhealthy"
    : components.some((c) => c.status === "degraded")
      ? "degraded"
      : "healthy";

  return {
    status: overallStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version,
    components,
    timestamp: new Date().toISOString(),
  };
}

/** Clear all registered health checks (for testing). */
export function clearHealthChecks(): void {
  healthChecks.clear();
}

// ---- Built-in Health Checks ----

/** Create a health check for an LLM provider. */
export function createProviderHealthCheck(
  providerId: string,
  checkFn: () => Promise<boolean>
): HealthCheckFn {
  return async () => {
    const start = Date.now();
    try {
      const healthy = await checkFn();
      return {
        name: `llm-provider-${providerId}`,
        status: healthy ? "healthy" : "unhealthy",
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: `llm-provider-${providerId}`,
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Check failed",
        lastCheck: new Date().toISOString(),
      };
    }
  };
}

/** Create a health check for storage backends. */
export function createStorageHealthCheck(
  backendName: string,
  checkFn: () => Promise<boolean>
): HealthCheckFn {
  return async () => {
    const start = Date.now();
    try {
      const healthy = await checkFn();
      return {
        name: `storage-${backendName}`,
        status: healthy ? "healthy" : "unhealthy",
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: `storage-${backendName}`,
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Check failed",
        lastCheck: new Date().toISOString(),
      };
    }
  };
}
