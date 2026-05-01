import { describe, it, expect, beforeEach } from "vitest";
import {
  getModelRegistry,
  registerModel,
  getModelCapability,
  getSmartRouting,
  clearCustomModels,
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
});
