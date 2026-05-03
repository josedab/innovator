import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectOllama,
  checkNetworkStatus,
  getOfflineStatus,
  getRecommendedModel,
  RECOMMENDED_MODELS,
} from "../index.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RECOMMENDED_MODELS", () => {
  it("contains 5 presets", () => {
    expect(RECOMMENDED_MODELS).toHaveLength(5);
  });

  it("each model has required fields", () => {
    for (const model of RECOMMENDED_MODELS) {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(model.useCase).toMatch(/^(fast|quality|balanced)$/);
      expect(model.minRamGb).toBeGreaterThan(0);
    }
  });
});

describe("getRecommendedModel", () => {
  it("returns a model for each use case", () => {
    expect(getRecommendedModel("fast")).toBeDefined();
    expect(getRecommendedModel("quality")).toBeDefined();
    expect(getRecommendedModel("balanced")).toBeDefined();
  });
});

describe("detectOllama", () => {
  it("returns available models on fetch success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "mistral:7b" }, { name: "llama3:8b" }] }),
    });

    const status = await detectOllama("http://localhost:11434");
    expect(status.available).toBe(true);
    expect(status.models).toEqual(["mistral:7b", "llama3:8b"]);
    expect(status.baseUrl).toBe("http://localhost:11434");
  });

  it("returns unavailable on fetch timeout/abort", async () => {
    mockFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const status = await detectOllama();
    expect(status.available).toBe(false);
    expect(status.models).toEqual([]);
    expect(status.error).toContain("Aborted");
  });

  it("returns unavailable on connection refused", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const status = await detectOllama();
    expect(status.available).toBe(false);
    expect(status.error).toContain("Connection refused");
  });

  it("returns unavailable on non-ok HTTP response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const status = await detectOllama();
    expect(status.available).toBe(false);
    expect(status.error).toContain("500");
  });

  it("handles empty model list", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const status = await detectOllama();
    expect(status.available).toBe(true);
    expect(status.models).toEqual([]);
  });

  it("handles malformed JSON gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const status = await detectOllama();
    expect(status.available).toBe(true);
    expect(status.models).toEqual([]);
  });
});

describe("checkNetworkStatus", () => {
  it("returns true when online", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    expect(await checkNetworkStatus()).toBe(true);
  });

  it("returns false when offline", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    expect(await checkNetworkStatus()).toBe(false);
  });
});

describe("getOfflineStatus", () => {
  it("combines network and Ollama results", async () => {
    // First call: checkNetworkStatus → online
    // Second call: detectOllama → available with models
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // network check
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "mistral:7b" }] }),
      }); // ollama check

    const status = await getOfflineStatus();
    expect(status.isOnline).toBe(true);
    expect(status.ollama.available).toBe(true);
    expect(status.canRunOffline).toBe(true);
    expect(status.recommendedModel).toBeDefined();
  });

  it("returns fully offline when both offline and no Ollama", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const status = await getOfflineStatus();
    expect(status.isOnline).toBe(false);
    expect(status.ollama.available).toBe(false);
    expect(status.canRunOffline).toBe(false);
    expect(status.recommendedModel).toBeNull();
  });

  it("canRunOffline is false when Ollama has no models", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // network
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      }); // ollama

    const status = await getOfflineStatus();
    expect(status.canRunOffline).toBe(false);
  });
});
