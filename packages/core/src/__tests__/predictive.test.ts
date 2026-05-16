import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  extractFeatures,
  predictSuccess,
  addTrainingData,
  clearTrainingData,
  runPredictiveBatch,
  getTrainingStats,
  FeatureVectorSchema,
  TrainingDataPointSchema,
} from "../scoring/predictive.js";
import type { FeatureVector, TrainingDataPoint } from "../scoring/predictive.js";

function makeTrainingPoint(overrides: Partial<TrainingDataPoint> = {}): TrainingDataPoint {
  return {
    id: "tp-1",
    ideaTitle: "Test Idea",
    ideaDescription: "A detailed description of the test idea with specifics",
    wordCount: 10,
    hasImplementationHint: false,
    label: "success",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("scoring/predictive", () => {
  beforeEach(() => {
    clearTrainingData();
  });

  // ---- extractFeatures ----

  describe("extractFeatures", () => {
    it("extracts features from a complete idea input", () => {
      const features = extractFeatures({
        title: "Build an API Gateway for Microservices",
        description:
          "Implement a centralized API gateway to handle routing, authentication, and rate limiting for 15 microservices. Revenue impact estimated at $500K.",
        feasibility: 8,
        impact: 9,
        novelty: 6,
        implementationHint: "Use Kong or AWS API Gateway",
      });

      expect(FeatureVectorSchema.parse(features)).toBeTruthy();
      expect(features.feasibility).toBe(0.8);
      expect(features.impact).toBe(0.9);
      expect(features.novelty).toBe(0.6);
      expect(features.hasImplementation).toBe(1);
      expect(features.titleClarity).toBe(0.8); // 6 words, in 3-10 range
      expect(features.specificity).toBeGreaterThan(0.3); // has numbers + specific terms
      expect(features.actionability).toBeGreaterThan(0.4); // has "implement" + implementation hint
      expect(features.compositeScore).toBeGreaterThan(0);
      expect(features.compositeScore).toBeLessThanOrEqual(1);
    });

    it("uses defaults for empty/missing optional fields", () => {
      const features = extractFeatures({
        title: "X",
        description: "",
      });

      expect(features.feasibility).toBe(0.5); // default 5/10
      expect(features.impact).toBe(0.5);
      expect(features.novelty).toBe(0.5);
      expect(features.hasImplementation).toBe(0);
      expect(features.descriptionLength).toBeCloseTo(1 / 200); // split("") gives [""] = 1 word
    });

    it("returns valid FeatureVector schema for minimal input", () => {
      const features = extractFeatures({ title: "Idea", description: "short" });
      expect(() => FeatureVectorSchema.parse(features)).not.toThrow();
    });

    it("computes compositeScore as weighted sum", () => {
      const features = extractFeatures({
        title: "Some Title Here",
        description: "A test description",
        feasibility: 10,
        impact: 10,
        novelty: 10,
      });

      // compositeScore = feasibility*0.3 + impact*0.3 + novelty*0.15 + actionability*0.15 + specificity*0.1
      const expected =
        features.feasibility * 0.3 +
        features.impact * 0.3 +
        features.novelty * 0.15 +
        features.actionability * 0.15 +
        features.specificity * 0.1;
      expect(features.compositeScore).toBeCloseTo(expected, 5);
    });
  });

  // ---- predictSuccess ----

  describe("predictSuccess", () => {
    it("returns higher probability for high-scoring features", () => {
      const highFeatures: FeatureVector = {
        feasibility: 0.9,
        impact: 0.9,
        novelty: 0.8,
        descriptionLength: 0.5,
        hasImplementation: 1,
        titleClarity: 0.8,
        specificity: 0.7,
        actionability: 0.8,
        compositeScore: 0.85,
      };

      const result = predictSuccess(highFeatures);
      expect(result.probability).toBeGreaterThan(0.5);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.featureImportance).toBeInstanceOf(Array);
      expect(result.featureImportance.length).toBeGreaterThan(0);
    });

    it("returns lower probability for zero features", () => {
      const zeroFeatures: FeatureVector = {
        feasibility: 0,
        impact: 0,
        novelty: 0,
        descriptionLength: 0,
        hasImplementation: 0,
        titleClarity: 0,
        specificity: 0,
        actionability: 0,
        compositeScore: 0,
      };

      const result = predictSuccess(zeroFeatures);
      expect(result.probability).toBeLessThan(0.5);
    });

    it("feature importance items have valid direction values", () => {
      const features = extractFeatures({
        title: "Test",
        description: "Test description for feature importance validation",
      });
      const result = predictSuccess(features);

      for (const fi of result.featureImportance) {
        expect(["positive", "negative", "neutral"]).toContain(fi.direction);
        expect(typeof fi.feature).toBe("string");
        expect(typeof fi.importance).toBe("number");
      }
    });

    it("feature importance is sorted by absolute importance descending", () => {
      const features = extractFeatures({
        title: "Build SDK",
        description: "Create a developer SDK with comprehensive documentation",
        feasibility: 8,
        impact: 7,
      });
      const result = predictSuccess(features);

      for (let i = 1; i < result.featureImportance.length; i++) {
        expect(Math.abs(result.featureImportance[i - 1].importance)).toBeGreaterThanOrEqual(
          Math.abs(result.featureImportance[i].importance)
        );
      }
    });
  });

  // ---- addTrainingData ----

  describe("addTrainingData", () => {
    it("accepts valid training data", () => {
      expect(() => addTrainingData(makeTrainingPoint())).not.toThrow();
      expect(getTrainingStats().total).toBe(1);
    });

    it("rejects invalid training data via Zod validation", () => {
      expect(() =>
        addTrainingData({
          ...makeTrainingPoint(),
          label: "not-a-label" as TrainingDataPoint["label"],
        })
      ).toThrow();
    });

    it("rejects negative wordCount", () => {
      expect(() => addTrainingData(makeTrainingPoint({ wordCount: -1 }))).toThrow();
    });

    it("rejects feasibilityScore out of 0-10 range", () => {
      expect(() => addTrainingData(makeTrainingPoint({ feasibilityScore: 11 }))).toThrow();
    });
  });

  // ---- runPredictiveBatch ----

  describe("runPredictiveBatch", () => {
    it("returns empty predictions for 0 items", () => {
      const report = runPredictiveBatch([]);
      expect(report.predictions).toHaveLength(0);
      expect(report.prescriptiveActions).toHaveLength(0);
      expect(report.trainingDataSize).toBe(0);
      expect(report.generatedAt).toBeTruthy();
    });

    it("processes multiple ideas and sorts by probability descending", () => {
      const ideas = [
        {
          id: "low",
          title: "x",
          description: "vague",
          feasibility: 1,
          impact: 1,
        },
        {
          id: "high",
          title: "Build an API for customer metrics",
          description:
            "Implement a RESTful API to track 12 customer engagement KPIs and revenue metrics with automated dashboards",
          feasibility: 9,
          impact: 9,
          novelty: 7,
          implementationHint: "Use Node.js + PostgreSQL",
        },
      ];

      const report = runPredictiveBatch(ideas);
      expect(report.predictions).toHaveLength(2);
      // Sorted descending by successProbability
      expect(report.predictions[0].successProbability).toBeGreaterThanOrEqual(
        report.predictions[1].successProbability
      );
      expect(report.predictions[0].ideaId).toBe("high");
    });

    it("generates risk factors for low-quality ideas", () => {
      const report = runPredictiveBatch([
        { id: "bad", title: "x", description: "y", feasibility: 1 },
      ]);
      expect(report.predictions[0].riskFactors.length).toBeGreaterThan(0);
    });

    it("includes modelAccuracy only with sufficient training data", () => {
      const report = runPredictiveBatch([{ id: "a", title: "Test", description: "test" }]);
      expect(report.modelAccuracy).toBeUndefined();

      // Add 20 training points
      for (let i = 0; i < 20; i++) {
        addTrainingData(makeTrainingPoint({ id: `tp-${i}` }));
      }
      const report2 = runPredictiveBatch([{ id: "a", title: "Test", description: "test" }]);
      expect(report2.modelAccuracy).toBeDefined();
      expect(report2.modelAccuracy!).toBeGreaterThan(0);
    });
  });

  // ---- getTrainingStats ----

  describe("getTrainingStats", () => {
    it("returns zeros for empty training data", () => {
      const stats = getTrainingStats();
      expect(stats.total).toBe(0);
      expect(Object.keys(stats.byLabel)).toHaveLength(0);
    });

    it("groups by label correctly", () => {
      addTrainingData(makeTrainingPoint({ id: "a", label: "success" }));
      addTrainingData(makeTrainingPoint({ id: "b", label: "failure" }));
      addTrainingData(makeTrainingPoint({ id: "c", label: "success" }));

      const stats = getTrainingStats();
      expect(stats.total).toBe(3);
      expect(stats.byLabel.success).toBe(2);
      expect(stats.byLabel.failure).toBe(1);
    });
  });
});
