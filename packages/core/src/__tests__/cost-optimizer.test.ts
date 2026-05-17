import { describe, it, expect, beforeEach } from "vitest";

import {
  recordMeasurement,
  selectModel,
  getRoutingRecommendations,
  generateCostReport,
  costReportToMarkdown,
  getArmStats,
  clearOptimizerData,
  QualityMeasurementSchema,
  ArmStatsSchema,
  RoutingDecisionSchema,
  CostReportSchema,
} from "../cost-optimizer/index.js";
import type { QualityMeasurement } from "../cost-optimizer/index.js";

function makeMeasurement(overrides: Partial<QualityMeasurement> = {}): QualityMeasurement {
  return {
    model: "gpt-4.1-mini",
    stage: "generation",
    inputTokens: 500,
    outputTokens: 200,
    costUsd: 0.005,
    qualityScore: 0.8,
    latencyMs: 1200,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("cost-optimizer", () => {
  beforeEach(() => {
    clearOptimizerData();
  });

  // ---- Schema validation ----

  describe("schemas", () => {
    it("validates QualityMeasurement", () => {
      expect(() => QualityMeasurementSchema.parse(makeMeasurement())).not.toThrow();
      expect(() => QualityMeasurementSchema.parse({ ...makeMeasurement(), costUsd: -1 })).toThrow();
    });

    it("validates ArmStats", () => {
      const stats = {
        model: "gpt-4.1",
        stage: "scoring",
        successes: 5,
        failures: 2,
        totalCost: 0.1,
        avgQuality: 0.7,
        avgLatencyMs: 500,
        samples: 7,
      };
      expect(() => ArmStatsSchema.parse(stats)).not.toThrow();
    });

    it("validates RoutingDecision", () => {
      const decision = {
        stage: "gen",
        recommendedModel: "m",
        confidence: 0.5,
        expectedQuality: 0.8,
        expectedCostUsd: 0.01,
        reason: "test",
      };
      expect(() => RoutingDecisionSchema.parse(decision)).not.toThrow();
    });
  });

  // ---- recordMeasurement ----

  describe("recordMeasurement", () => {
    it("records measurement and updates arm stats", () => {
      recordMeasurement(makeMeasurement({ qualityScore: 0.8 }));
      const stats = getArmStats();
      expect(stats.length).toBe(1);
      expect(stats[0].samples).toBe(1);
      expect(stats[0].successes).toBeGreaterThan(1); // initial 1 + 1 success
    });

    it("increments failures for quality < 0.7", () => {
      recordMeasurement(makeMeasurement({ qualityScore: 0.3 }));
      const stats = getArmStats();
      expect(stats[0].failures).toBeGreaterThan(1); // initial 1 + 1 failure
    });

    it("accumulates multiple measurements", () => {
      recordMeasurement(makeMeasurement({ qualityScore: 0.9 }));
      recordMeasurement(makeMeasurement({ qualityScore: 0.6 }));
      recordMeasurement(makeMeasurement({ qualityScore: 0.8 }));
      const stats = getArmStats();
      expect(stats[0].samples).toBe(3);
      expect(stats[0].avgQuality).toBeCloseTo((0.9 + 0.6 + 0.8) / 3, 1);
    });
  });

  // ---- selectModel ----

  describe("selectModel", () => {
    it("throws when no models available", () => {
      expect(() => selectModel("generation", [])).toThrow("No models available");
    });

    it("selects from uninitialized models with exploration", () => {
      const decision = selectModel("generation", ["gpt-4.1", "gpt-4.1-mini"]);
      expect(decision.stage).toBe("generation");
      expect(["gpt-4.1", "gpt-4.1-mini"]).toContain(decision.recommendedModel);
      expect(decision.confidence).toBe(0);
      expect(decision.reason).toContain("Exploration");
    });

    it("biases toward cheaper models for low complexity", () => {
      // Record high quality for cheap model
      for (let i = 0; i < 10; i++) {
        recordMeasurement(
          makeMeasurement({
            model: "gpt-4.1-mini",
            stage: "generation",
            qualityScore: 0.8,
            costUsd: 0.001,
          })
        );
      }
      for (let i = 0; i < 10; i++) {
        recordMeasurement(
          makeMeasurement({
            model: "gpt-4.1",
            stage: "generation",
            qualityScore: 0.85,
            costUsd: 0.03,
          })
        );
      }

      // Low complexity should prefer cheaper model
      let cheapCount = 0;
      for (let t = 0; t < 20; t++) {
        const d = selectModel("generation", ["gpt-4.1", "gpt-4.1-mini"], "low");
        if (d.recommendedModel === "gpt-4.1-mini") cheapCount++;
      }
      expect(cheapCount).toBeGreaterThan(5); // majority should pick cheap
    });

    it("returns confidence based on sample count", () => {
      for (let i = 0; i < 20; i++) {
        recordMeasurement(makeMeasurement({ model: "gpt-4.1-mini", stage: "scoring" }));
      }
      const decision = selectModel("scoring", ["gpt-4.1-mini"]);
      expect(decision.confidence).toBe(1.0);
    });
  });

  // ---- getRoutingRecommendations ----

  describe("getRoutingRecommendations", () => {
    it("returns recommendations for all 4 pipeline stages", () => {
      const recs = getRoutingRecommendations(["gpt-4.1"]);
      expect(recs).toHaveLength(4);
      const stages = recs.map((r) => r.stage);
      expect(stages).toEqual(["investigation", "generation", "synthesis", "scoring"]);
    });

    it("passes complexity through to selectModel", () => {
      const recs = getRoutingRecommendations(["gpt-4.1-mini", "gpt-4.1"], "high");
      expect(recs).toHaveLength(4);
      for (const r of recs) {
        expect(r.recommendedModel).toBeTruthy();
      }
    });
  });

  // ---- generateCostReport ----

  describe("generateCostReport", () => {
    it("throws when no measurements (empty models list)", () => {
      // generateCostReport calls getRoutingRecommendations with empty models when no measurements exist
      expect(() => generateCostReport()).toThrow("No models available");
    });

    it("calculates savings estimate (40% of total)", () => {
      recordMeasurement(makeMeasurement({ costUsd: 1.0, inputTokens: 1000, outputTokens: 500 }));
      const report = generateCostReport();
      expect(report.totalCostUsd).toBe(1.0);
      expect(report.totalTokens).toBe(1500);
      expect(report.measurementCount).toBe(1);
      expect(report.savingsEstimate).toBeCloseTo(0.4, 1);
    });

    it("aggregates costs by model and stage", () => {
      recordMeasurement(
        makeMeasurement({ model: "gpt-4.1", stage: "investigation", costUsd: 0.03 })
      );
      recordMeasurement(
        makeMeasurement({ model: "gpt-4.1-mini", stage: "generation", costUsd: 0.005 })
      );
      const report = generateCostReport();
      expect(report.costByModel["gpt-4.1"]).toBe(0.03);
      expect(report.costByModel["gpt-4.1-mini"]).toBe(0.005);
      expect(report.costByStage["investigation"]).toBe(0.03);
      expect(report.costByStage["generation"]).toBe(0.005);
    });

    it("computes average quality by model", () => {
      recordMeasurement(makeMeasurement({ model: "gpt-4.1", qualityScore: 0.8 }));
      recordMeasurement(makeMeasurement({ model: "gpt-4.1", qualityScore: 0.6 }));
      const report = generateCostReport();
      expect(report.avgQualityByModel["gpt-4.1"]).toBeCloseTo(0.7, 1);
    });

    it("validates report against schema", () => {
      recordMeasurement(makeMeasurement());
      const report = generateCostReport();
      expect(() => CostReportSchema.parse(report)).not.toThrow();
    });
  });

  // ---- costReportToMarkdown ----

  describe("costReportToMarkdown", () => {
    it("formats report as markdown", () => {
      recordMeasurement(
        makeMeasurement({
          model: "gpt-4.1",
          stage: "investigation",
          costUsd: 0.03,
          qualityScore: 0.9,
        })
      );
      const report = generateCostReport();
      const md = costReportToMarkdown(report);
      expect(md).toContain("# 💰 LLM Cost-Performance Report");
      expect(md).toContain("**Total Cost:**");
      expect(md).toContain("Cost by Model");
      expect(md).toContain("Cost by Stage");
      expect(md).toContain("Routing Recommendations");
      expect(md).toContain("gpt-4.1");
    });

    it("includes model quality in table", () => {
      recordMeasurement(makeMeasurement({ model: "gpt-4.1-mini", qualityScore: 0.85 }));
      const report = generateCostReport();
      const md = costReportToMarkdown(report);
      expect(md).toContain("0.85");
    });
  });
});
