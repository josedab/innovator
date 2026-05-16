import { describe, it, expect } from "vitest";

import {
  extractPatterns,
  sharePatterns,
  receivePatterns,
  getMeshInsights,
  MeshPatternSchema,
} from "../index.js";

describe("innovation-mesh", () => {
  const config = { nodeId: "org-test", sector: "technology" };

  describe("extractPatterns", () => {
    it("extracts patterns with DP noise", () => {
      const patterns = extractPatterns(
        [
          { topic: "AI", angleId: "first-principles", successRate: 0.8, sampleSize: 50 },
          { topic: "IoT", successRate: 0.6, sampleSize: 30 },
        ],
        config
      );
      expect(patterns.length).toBe(2);
      for (const p of patterns) {
        expect(() => MeshPatternSchema.parse(p)).not.toThrow();
        expect(p.epsilonSpent).toBeGreaterThan(0);
      }
    });

    it("stops when privacy budget is exhausted", () => {
      const lowBudgetConfig = { ...config, nodeId: "org-low", maxBudget: 0.5, epsilon: 1.0 };
      const data = Array.from({ length: 5 }, (_, i) => ({
        topic: `topic-${i}`,
        successRate: 0.5,
        sampleSize: 10,
      }));
      const patterns = extractPatterns(data, lowBudgetConfig);
      expect(patterns.length).toBeLessThan(5);
    });
  });

  describe("sharePatterns / receivePatterns", () => {
    it("shares and receives patterns", () => {
      const patterns = extractPatterns(
        [{ topic: "blockchain", successRate: 0.7, sampleSize: 20 }],
        { ...config, nodeId: "org-share" }
      );
      sharePatterns(patterns);

      const received = receivePatterns(
        { nodeId: "org-receive", sector: "fintech" },
        { topic: "blockchain" }
      );
      expect(received.length).toBeGreaterThan(0);
    });
  });

  describe("getMeshInsights", () => {
    it("returns aggregated insights", () => {
      const insights = getMeshInsights();
      expect(insights.totalNodes).toBeGreaterThan(0);
      expect(insights.generatedAt).toBeDefined();
    });
  });
});
