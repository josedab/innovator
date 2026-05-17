import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getModelRegistry,
  registerModel,
  unregisterModel,
  getModelCapability,
  getSmartRouting,
  clearCustomModels,
  getAvailableModels,
} from "../models/index.js";
import type { ModelCapability } from "../types.js";

describe("models", () => {
  beforeEach(() => {
    clearCustomModels();
  });

  it("returns built-in model registry", () => {
    const models = getModelRegistry();
    expect(models.length).toBeGreaterThanOrEqual(6);
  });

  it("finds model capability by ID", () => {
    const cap = getModelCapability("gpt-5");
    expect(cap).toBeDefined();
    expect(cap?.displayName).toBe("GPT-5");
    expect(cap?.qualityTier).toBe("premium");
  });

  it("returns undefined for unknown model", () => {
    expect(getModelCapability("nonexistent")).toBeUndefined();
  });

  it("registers custom models", () => {
    const custom: ModelCapability = {
      modelId: "custom-model",
      displayName: "Custom Model",
      strengths: ["generation"],
      costTier: "low",
      speedTier: "fast",
      qualityTier: "standard",
    };
    registerModel(custom);
    expect(getModelCapability("custom-model")).toEqual(custom);
  });

  it("rejects duplicate model registrations", () => {
    expect(() =>
      registerModel({
        modelId: "gpt-5",
        displayName: "Dup",
        strengths: [],
        costTier: "low",
        speedTier: "fast",
        qualityTier: "standard",
      })
    ).toThrow("already registered");
  });

  describe("getSmartRouting", () => {
    it("returns routing for quality preference", () => {
      const routing = getSmartRouting("quality");
      expect(routing.investigation).toBeTruthy();
      expect(routing.generation).toBeTruthy();
      expect(routing.synthesis).toBeTruthy();
    });

    it("returns routing for speed preference", () => {
      const routing = getSmartRouting("speed");
      expect(routing.investigation).toBeTruthy();
    });

    it("returns routing for cost preference", () => {
      const routing = getSmartRouting("cost");
      expect(routing.investigation).toBeTruthy();
    });

    it("quality routing prefers premium models", () => {
      const routing = getSmartRouting("quality");
      // GPT-5 is the only premium model
      expect(routing.investigation).toBe("gpt-5");
    });
  });

  describe("getAvailableModels", () => {
    it("returns built-in models sorted by ID", () => {
      const models = getAvailableModels();
      expect(models.length).toBeGreaterThanOrEqual(6);
      // Verify sorted
      for (let i = 1; i < models.length; i++) {
        expect(models[i].id.localeCompare(models[i - 1].id)).toBeGreaterThanOrEqual(0);
      }
    });

    it("includes built-in models with capabilities flag", () => {
      const models = getAvailableModels();
      const gpt5 = models.find((m) => m.id === "gpt-5");
      expect(gpt5).toBeDefined();
      expect(gpt5!.displayName).toBe("GPT-5");
      expect(gpt5!.hasCapabilities).toBe(true);
      expect(gpt5!.source).toBe("built-in");
    });

    it("includes custom models", () => {
      registerModel({
        modelId: "my-custom",
        displayName: "My Custom Model",
        strengths: ["generation"],
        costTier: "low",
        speedTier: "fast",
        qualityTier: "standard",
      });
      const models = getAvailableModels();
      const custom = models.find((m) => m.id === "my-custom");
      expect(custom).toBeDefined();
      expect(custom!.source).toBe("custom");
      expect(custom!.hasCapabilities).toBe(true);
    });

    it("includes env models from INNOVATOR_EXTRA_MODELS", () => {
      vi.stubEnv("INNOVATOR_EXTRA_MODELS", "env-model-1,env-model-2");
      const models = getAvailableModels();
      const env1 = models.find((m) => m.id === "env-model-1");
      const env2 = models.find((m) => m.id === "env-model-2");
      expect(env1).toBeDefined();
      expect(env1!.source).toBe("env");
      expect(env1!.hasCapabilities).toBe(false);
      expect(env2).toBeDefined();
      vi.unstubAllEnvs();
    });

    it("deduplicates models across sources", () => {
      vi.stubEnv("INNOVATOR_EXTRA_MODELS", "gpt-5");
      const models = getAvailableModels();
      const gpt5s = models.filter((m) => m.id === "gpt-5");
      // Built-in takes priority, env duplicate is excluded
      expect(gpt5s).toHaveLength(1);
      expect(gpt5s[0].source).toBe("built-in");
      vi.unstubAllEnvs();
    });
  });

  describe("unregisterModel", () => {
    it("removes a custom model by ID", () => {
      registerModel({
        modelId: "temp-model",
        displayName: "Temporary",
        strengths: ["generation"],
        costTier: "low",
        speedTier: "fast",
        qualityTier: "standard",
      });
      expect(getModelCapability("temp-model")).toBeDefined();
      const removed = unregisterModel("temp-model");
      expect(removed).toBe(true);
      expect(getModelCapability("temp-model")).toBeUndefined();
    });

    it("returns false for non-existent model", () => {
      expect(unregisterModel("no-such-model")).toBe(false);
    });

    it("does not remove built-in models", () => {
      const removed = unregisterModel("gpt-5");
      expect(removed).toBe(false);
      expect(getModelCapability("gpt-5")).toBeDefined();
    });
  });
});
