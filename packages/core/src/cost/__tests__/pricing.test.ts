import { describe, it, expect, beforeEach } from "vitest";
import { getModelPricing, setModelPricing, estimateCost, listModelPricing } from "../pricing.js";

describe("pricing", () => {
  describe("getModelPricing", () => {
    it("returns pricing for a known model", () => {
      const pricing = getModelPricing("gpt-4.1");
      expect(pricing).toBeDefined();
      expect(pricing!.modelId).toBe("gpt-4.1");
      expect(pricing!.inputPer1k).toBe(0.002);
      expect(pricing!.outputPer1k).toBe(0.008);
    });

    it("returns undefined for an unknown model", () => {
      expect(getModelPricing("nonexistent-model")).toBeUndefined();
    });
  });

  describe("setModelPricing", () => {
    it("registers a new model pricing entry", () => {
      setModelPricing({ modelId: "test-model", inputPer1k: 0.01, outputPer1k: 0.02 });
      const pricing = getModelPricing("test-model");
      expect(pricing).toBeDefined();
      expect(pricing!.inputPer1k).toBe(0.01);
      expect(pricing!.outputPer1k).toBe(0.02);
    });

    it("overrides existing model pricing", () => {
      setModelPricing({ modelId: "gpt-4.1", inputPer1k: 0.005, outputPer1k: 0.01 });
      const pricing = getModelPricing("gpt-4.1");
      expect(pricing!.inputPer1k).toBe(0.005);
      // Restore original
      setModelPricing({ modelId: "gpt-4.1", inputPer1k: 0.002, outputPer1k: 0.008 });
    });

    it("persists custom overrides", () => {
      setModelPricing({ modelId: "custom-llm", inputPer1k: 0.1, outputPer1k: 0.2 });
      expect(getModelPricing("custom-llm")!.inputPer1k).toBe(0.1);
      // Verify it's in the list
      const list = listModelPricing();
      expect(list.some((p) => p.modelId === "custom-llm")).toBe(true);
    });
  });

  describe("listModelPricing", () => {
    it("returns all default pricing entries", () => {
      const list = listModelPricing();
      expect(list.length).toBeGreaterThanOrEqual(6);
      expect(list.some((p) => p.modelId === "gpt-4.1")).toBe(true);
      expect(list.some((p) => p.modelId === "claude-sonnet-4")).toBe(true);
    });
  });

  describe("estimateCost", () => {
    it("calculates cost for a known model", () => {
      // gpt-4.1: input=0.002/1k, output=0.008/1k
      const cost = estimateCost("gpt-4.1", 1000, 500);
      // (1000/1000)*0.002 + (500/1000)*0.008 = 0.002 + 0.004 = 0.006
      expect(cost).toBeCloseTo(0.006);
    });

    it("returns 0 for an unknown model", () => {
      expect(estimateCost("nonexistent-model", 1000, 1000)).toBe(0);
    });

    it("returns 0 for zero tokens", () => {
      expect(estimateCost("gpt-4.1", 0, 0)).toBe(0);
    });

    it("handles negative tokens (no validation)", () => {
      // The function doesn't validate — negative tokens produce negative cost
      const cost = estimateCost("gpt-4.1", -1000, 0);
      expect(cost).toBeLessThan(0);
    });

    it("calculates correctly for large token counts", () => {
      const cost = estimateCost("gpt-4.1", 100_000, 50_000);
      // (100000/1000)*0.002 + (50000/1000)*0.008 = 0.2 + 0.4 = 0.6
      expect(cost).toBeCloseTo(0.6);
    });
  });
});
