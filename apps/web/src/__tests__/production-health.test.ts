import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetHealthReport = vi.fn();
const mockGetCopilotProviderHealth = vi.fn();
vi.mock("@innovator/core", () => ({
  getHealthReport: (...args: unknown[]) => mockGetHealthReport(...args),
}));
vi.mock("@/lib/provider-health", () => ({
  getCopilotProviderHealth: (...args: unknown[]) => mockGetCopilotProviderHealth(...args),
}));

import { GET as getDetailedHealth } from "../app/api/health/route";
import { GET as getLiveness } from "../app/healthz/route";
import { GET as getReadiness } from "../app/readyz/route";

let temporaryHome: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (temporaryHome) {
    rmSync(temporaryHome, { recursive: true, force: true });
    temporaryHome = undefined;
  }
});

describe("production health probes", () => {
  afterEach(() => {
    mockGetHealthReport.mockReset();
    mockGetCopilotProviderHealth.mockReset();
  });

  it("returns a public liveness response with the package version", async () => {
    const response = await getLiveness();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      version: "0.3.0",
    });
  });

  it("returns 503 when production configuration is incomplete", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNOVATOR_DEPLOYMENT_PROFILE", "single-tenant");
    vi.stubEnv("INNOVATOR_API_KEYS", "");
    vi.stubEnv("GH_TOKEN", "");

    const response = await getReadiness();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "not-ready" });
  });

  it("returns ready when configuration and state storage are writable", async () => {
    temporaryHome = mkdtempSync(join(tmpdir(), "innovator-ready-"));
    vi.stubEnv("HOME", temporaryHome);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNOVATOR_DEPLOYMENT_PROFILE", "single-tenant");
    vi.stubEnv("INNOVATOR_API_KEYS", "k".repeat(32));
    vi.stubEnv("GH_TOKEN", "github-token");
    mockGetCopilotProviderHealth.mockResolvedValue({
      name: "llm-provider-copilot",
      status: "healthy",
    });

    const response = await getReadiness();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ready" });
  });

  it("returns 503 when the Copilot provider is unavailable", async () => {
    temporaryHome = mkdtempSync(join(tmpdir(), "innovator-ready-"));
    vi.stubEnv("HOME", temporaryHome);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNOVATOR_DEPLOYMENT_PROFILE", "single-tenant");
    vi.stubEnv("INNOVATOR_API_KEYS", "k".repeat(32));
    vi.stubEnv("GH_TOKEN", "github-token");
    mockGetCopilotProviderHealth.mockResolvedValue({
      name: "llm-provider-copilot",
      status: "unhealthy",
    });

    const response = await getReadiness();

    expect(response.status).toBe(503);
  });

  it("marks detailed health unhealthy when Copilot is unavailable", async () => {
    mockGetHealthReport.mockResolvedValue({
      status: "healthy",
      components: [{ name: "core", status: "healthy" }],
    });
    mockGetCopilotProviderHealth.mockResolvedValue({
      name: "llm-provider-copilot",
      status: "unhealthy",
      latencyMs: 1,
      lastCheck: new Date().toISOString(),
    });

    const response = await getDetailedHealth();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      components: expect.arrayContaining([
        expect.objectContaining({ name: "llm-provider-copilot", status: "unhealthy" }),
      ]),
    });
  });
});
