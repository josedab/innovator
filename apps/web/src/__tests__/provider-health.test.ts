import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListModels = vi.fn();
const mockGetAuthStatus = vi.fn();
const mockPing = vi.fn();
const mockGetCopilotClient = vi.fn();
const mockResetCopilotClientIfIdle = vi.fn();

vi.mock("@innovator/core", () => ({
  getCopilotClient: (...args: unknown[]) => mockGetCopilotClient(...args),
  resetCopilotClientIfIdle: (...args: unknown[]) => mockResetCopilotClientIfIdle(...args),
}));

import { clearCopilotProviderHealthCache, getCopilotProviderHealth } from "../lib/provider-health";

describe("getCopilotProviderHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCopilotProviderHealthCache();
    mockGetCopilotClient.mockResolvedValue({
      getAuthStatus: mockGetAuthStatus,
      listModels: mockListModels,
      ping: mockPing,
    });
    mockGetAuthStatus.mockResolvedValue({ isAuthenticated: true });
    mockPing.mockResolvedValue({ message: "ok", timestamp: new Date().toISOString() });
    mockResetCopilotClientIfIdle.mockResolvedValue(true);
  });

  it("reports healthy when Copilot lists available models", async () => {
    mockListModels.mockResolvedValue([{ id: "gpt-4.1" }]);

    await expect(getCopilotProviderHealth()).resolves.toMatchObject({
      name: "llm-provider-copilot",
      status: "healthy",
    });
  });

  it("reports unhealthy and requests an idle client reset when startup fails", async () => {
    mockGetCopilotClient.mockRejectedValue(new Error("authentication failed"));

    await expect(getCopilotProviderHealth()).resolves.toMatchObject({
      status: "unhealthy",
      message: "authentication failed",
    });
    expect(mockResetCopilotClientIfIdle).toHaveBeenCalledOnce();
  });

  it("reports fresh authentication failure and resets only an idle client", async () => {
    mockGetAuthStatus.mockResolvedValue({
      isAuthenticated: false,
      statusMessage: "token expired",
    });
    mockListModels.mockResolvedValue([{ id: "gpt-4.1" }]);

    await expect(getCopilotProviderHealth()).resolves.toMatchObject({
      status: "unhealthy",
      message: "token expired",
    });
    expect(mockPing).toHaveBeenCalledOnce();
    expect(mockResetCopilotClientIfIdle).toHaveBeenCalledOnce();
  });

  it("times out hung Copilot client startup and requests an idle reset", async () => {
    vi.useFakeTimers();
    try {
      mockGetCopilotClient.mockReturnValue(new Promise(() => {}));

      const healthPromise = getCopilotProviderHealth();
      await vi.runAllTimersAsync();

      await expect(healthPromise).resolves.toMatchObject({
        status: "unhealthy",
        message: "Copilot provider health check timed out",
      });
      expect(mockResetCopilotClientIfIdle).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares and caches concurrent public readiness checks", async () => {
    mockListModels.mockResolvedValue([{ id: "gpt-4.1" }]);

    const [first, second] = await Promise.all([
      getCopilotProviderHealth(),
      getCopilotProviderHealth(),
    ]);
    const cached = await getCopilotProviderHealth();

    expect(first).toEqual(second);
    expect(cached).toEqual(first);
    expect(mockGetCopilotClient).toHaveBeenCalledOnce();
    expect(mockGetAuthStatus).toHaveBeenCalledOnce();
    expect(mockListModels).toHaveBeenCalledOnce();
    expect(mockPing).toHaveBeenCalledOnce();
  });
});
