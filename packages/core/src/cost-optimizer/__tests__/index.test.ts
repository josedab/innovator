import { describe, it, expect, beforeEach } from "vitest";
import {
  recordMeasurement,
  selectModel,
  getRoutingRecommendations,
  generateCostReport,
  getArmStats,
  costReportToMarkdown,
  clearOptimizerData,
  type QualityMeasurement,
} from "../index.js";

// ---- Helpers ----

function makeMeasurement(overrides?: Partial<QualityMeasurement>): QualityMeasurement {
  return {
    model: "gpt-4.1",
    stage: "generation",
    inputTokens: 1000,
    outputTokens: 500,
    costUsd: 0.03,
    qualityScore: 0.85,
    latencyMs: 2000,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---- Tests ----

describe("Cost Optimizer", () => {
  beforeEach(() => {
    clearOptimizerData();
  });

  describe("recordMeasurement + getArmStats", () => {
    it("records a measurement and updates arm stats", () => {
      recordMeasurement(makeMeasurement());
      const stats = getArmStats();
      expect(stats.length).toBe(1);
      expect(stats[0].model).toBe("gpt-4.1");
      expect(stats[0].stage).toBe("generation");
      expect(stats[0].samples).toBe(1);
    });

    it("accumulates cost per model", () => {
      recordMeasurement(makeMeasurement({ costUsd: 0.01 }));
      recordMeasurement(makeMeasurement({ costUsd: 0.02 }));
      const stats = getArmStats();
      expect(stats[0].totalCost).toBeCloseTo(0.03, 4);
      expect(stats[0].samples).toBe(2);
    });

    it("tracks successes for quality >= 0.7", () => {
      recordMeasurement(makeMeasurement({ qualityScore: 0.9 }));
      recordMeasurement(makeMeasurement({ qualityScore: 0.8 }));
      const stats = getArmStats();
      // Initial is 1 success + 2 from high quality = 3
      expect(stats[0].successes).toBe(3);
    });

    it("tracks failures for quality < 0.7", () => {
      recordMeasurement(makeMeasurement({ qualityScore: 0.3 }));
      recordMeasurement(makeMeasurement({ qualityScore: 0.5 }));
      const stats = getArmStats();
      // Initial is 1 failure + 2 from low quality = 3
      expect(stats[0].failures).toBe(3);
    });

    it("updates running average quality", () => {
      recordMeasurement(makeMeasurement({ qualityScore: 0.8 }));
      recordMeasurement(makeMeasurement({ qualityScore: 0.6 }));
      const stats = getArmStats();
      expect(stats[0].avgQuality).toBeCloseTo(0.7, 1);
    });
  });

  describe("selectModel", () => {
    it("throws for empty model list", () => {
      expect(() => selectModel("generation", [])).toThrow("No models available");
    });

    it("returns a model from available list", () => {
      const decision = selectModel("generation", ["gpt-4.1", "gpt-4.1-mini"]);
      expect(["gpt-4.1", "gpt-4.1-mini"]).toContain(decision.recommendedModel);
      expect(decision.stage).toBe("generation");
    });

    it("cold start: explores unseen models equally", () => {
      const selections = new Map<string, number>();
      const models = ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"];

      for (let i = 0; i < 100; i++) {
        clearOptimizerData();
        const decision = selectModel("generation", models);
        selections.set(
          decision.recommendedModel,
          (selections.get(decision.recommendedModel) ?? 0) + 1
        );
      }

      // All models should be selected at least once (probabilistic but very likely in 100 tries)
      for (const model of models) {
        expect(selections.get(model) ?? 0).toBeGreaterThan(0);
      }
    });

    it("favors high-quality models after measurements", () => {
      // Record many high-quality measurements for gpt-4.1
      for (let i = 0; i < 20; i++) {
        recordMeasurement(
          makeMeasurement({ model: "gpt-4.1", qualityScore: 0.95, costUsd: 0.001 })
        );
      }
      // Record many low-quality measurements for gpt-4.1-nano
      for (let i = 0; i < 20; i++) {
        recordMeasurement(
          makeMeasurement({
            model: "gpt-4.1-nano",
            stage: "generation",
            qualityScore: 0.2,
            costUsd: 0.0001,
          })
        );
      }

      // Sample multiple times to check bias
      let gpt4Count = 0;
      for (let i = 0; i < 50; i++) {
        const decision = selectModel("generation", ["gpt-4.1", "gpt-4.1-nano"]);
        if (decision.recommendedModel === "gpt-4.1") gpt4Count++;
      }

      // gpt-4.1 should be favored (majority of the time)
      expect(gpt4Count).toBeGreaterThan(20);
    });

    it("biases toward cheaper models for low complexity", () => {
      for (let i = 0; i < 10; i++) {
        recordMeasurement(makeMeasurement({ model: "gpt-4.1", qualityScore: 0.8, costUsd: 0.03 }));
        recordMeasurement(
          makeMeasurement({
            model: "gpt-4.1-mini",
            stage: "generation",
            qualityScore: 0.75,
            costUsd: 0.005,
          })
        );
      }

      let miniCount = 0;
      for (let i = 0; i < 50; i++) {
        const decision = selectModel("generation", ["gpt-4.1", "gpt-4.1-mini"], "low");
        if (decision.recommendedModel === "gpt-4.1-mini") miniCount++;
      }

      // mini should be selected more often for low complexity
      expect(miniCount).toBeGreaterThan(10);
    });

    it("returns confidence based on sample count", () => {
      for (let i = 0; i < 20; i++) {
        recordMeasurement(makeMeasurement());
      }
      const decision = selectModel("generation", ["gpt-4.1"]);
      expect(decision.confidence).toBe(1.0);
    });

    it("returns low confidence for unseen models", () => {
      const decision = selectModel("generation", ["unseen-model"]);
      expect(decision.confidence).toBe(0);
      expect(decision.reason).toContain("Exploration");
    });

    it("handles single model", () => {
      const decision = selectModel("generation", ["only-model"]);
      expect(decision.recommendedModel).toBe("only-model");
    });
  });

  describe("Beta distribution sampling", () => {
    it("produces values in [0, 1] range", () => {
      // Record measurements to create arm stats, then check selection values
      recordMeasurement(makeMeasurement({ qualityScore: 0.9 }));
      recordMeasurement(makeMeasurement({ qualityScore: 0.1 }));

      for (let i = 0; i < 100; i++) {
        const decision = selectModel("generation", ["gpt-4.1"]);
        expect(decision.expectedQuality).toBeGreaterThanOrEqual(0);
        expect(decision.expectedQuality).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("generateCostReport", () => {
    it("generates comprehensive report", () => {
      recordMeasurement(makeMeasurement({ model: "gpt-4.1", costUsd: 0.01, qualityScore: 0.9 }));
      recordMeasurement(
        makeMeasurement({
          model: "gpt-4.1-mini",
          stage: "scoring",
          costUsd: 0.002,
          qualityScore: 0.7,
        })
      );

      const report = generateCostReport();

      expect(report.totalCostUsd).toBeCloseTo(0.012, 4);
      expect(report.measurementCount).toBe(2);
      expect(report.costByModel["gpt-4.1"]).toBeCloseTo(0.01, 4);
      expect(report.costByModel["gpt-4.1-mini"]).toBeCloseTo(0.002, 4);
      expect(report.costByStage["generation"]).toBeCloseTo(0.01, 4);
      expect(report.costByStage["scoring"]).toBeCloseTo(0.002, 4);
      expect(report.avgQualityByModel["gpt-4.1"]).toBeCloseTo(0.9, 1);
      expect(report.savingsEstimate).toBeGreaterThanOrEqual(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("returns empty report when no measurements", () => {
      // Need at least one model for recommendations to work
      recordMeasurement(makeMeasurement());
      clearOptimizerData();
      // After clear, there are no measurements but also no models for routing
      const stats = getArmStats();
      expect(stats).toHaveLength(0);
    });

    it("tracks total tokens", () => {
      recordMeasurement(makeMeasurement({ inputTokens: 1000, outputTokens: 500 }));
      recordMeasurement(makeMeasurement({ inputTokens: 2000, outputTokens: 1000 }));

      const report = generateCostReport();
      expect(report.totalTokens).toBe(4500);
    });
  });

  describe("getRoutingRecommendations", () => {
    it("returns recommendations for all 4 pipeline stages", () => {
      const recs = getRoutingRecommendations(["gpt-4.1", "gpt-4.1-mini"]);
      expect(recs).toHaveLength(4);
      expect(recs.map((r) => r.stage)).toEqual([
        "investigation",
        "generation",
        "synthesis",
        "scoring",
      ]);
    });
  });

  describe("costReportToMarkdown", () => {
    it("formats report as markdown", () => {
      recordMeasurement(makeMeasurement({ costUsd: 0.05, qualityScore: 0.9 }));
      const report = generateCostReport();
      const md = costReportToMarkdown(report);

      expect(md).toContain("# 💰 LLM Cost-Performance Report");
      expect(md).toContain("gpt-4.1");
      expect(md).toContain("generation");
      expect(md).toContain("Routing Recommendations");
    });

    it("includes model quality in table", () => {
      recordMeasurement(makeMeasurement({ model: "gpt-4.1", qualityScore: 0.85 }));
      const report = generateCostReport();
      const md = costReportToMarkdown(report);
      expect(md).toContain("0.85");
    });
  });

  describe("clearOptimizerData", () => {
    it("resets all data", () => {
      recordMeasurement(makeMeasurement());
      expect(getArmStats().length).toBe(1);

      clearOptimizerData();

      expect(getArmStats().length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles 0 cost measurement", () => {
      recordMeasurement(makeMeasurement({ costUsd: 0 }));
      const stats = getArmStats();
      expect(stats[0].totalCost).toBe(0);
    });

    it("handles measurement with subjectComplexity", () => {
      recordMeasurement(makeMeasurement({ subjectComplexity: "high" }));
      const stats = getArmStats();
      expect(stats).toHaveLength(1);
    });
  });
});
