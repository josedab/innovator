import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@innovator/core", () => ({
  getHealthReport: vi.fn(),
}));

vi.mock("@/lib/provider-health", () => ({
  getCopilotProviderHealth: vi.fn(),
}));

import { getHealthReport } from "@innovator/core";
import { getCopilotProviderHealth } from "@/lib/provider-health";
import { GET } from "../health/route";

const mockGetHealthReport = vi.mocked(getHealthReport);
const mockGetCopilotProviderHealth = vi.mocked(getCopilotProviderHealth);

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHealthReport.mockResolvedValue({
      status: "healthy",
      version: "0.3.0",
      timestamp: "2026-07-27T00:00:00.000Z",
      uptime: 1,
      components: [{ name: "storage", status: "healthy" }],
    });
    mockGetCopilotProviderHealth.mockResolvedValue({
      name: "copilot",
      status: "healthy",
      message: "Available",
    });
  });

  it("returns 200 status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns the current aggregate health status", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.status).toBe("healthy");
  });

  it("includes a version field", async () => {
    const res = await GET();
    const data = await res.json();
    expect(typeof data.version).toBe("string");
    expect(data.version.length).toBeGreaterThan(0);
  });

  it("returns JSON content-type", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
