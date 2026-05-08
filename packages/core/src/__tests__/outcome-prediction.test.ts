import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue("This idea shows strong potential."),
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
  extractFeatureVector,
  addTrainingData,
  trainModel,
  predictOutcome,
  getTrainingDataCount,
  getPredictionCard,
  isModelReady,
  clearOutcomePredictionData,
} from "../outcome-prediction/index.js";
import type { IdeaFeatures, TrainingDataPoint } from "../outcome-prediction/index.js";

function makeFeatures(overrides: Partial<IdeaFeatures> = {}): IdeaFeatures {
  return {
    feasibilityScore: 7,
    impactScore: 8,
    noveltyScore: 6,
    domainComplexity: 0.5,
    ...overrides,
  };
}

function makeTrainingPoint(overrides: Partial<TrainingDataPoint> = {}): TrainingDataPoint {
  return {
    ideaId: `idea-${Math.random().toString(36).slice(2, 8)}`,
    features: makeFeatures(),
    outcome: "implemented",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("outcome-prediction", () => {
  beforeEach(() => {
    clearOutcomePredictionData();
  });

  describe("feature engineering", () => {
    it("extracts feature vector from idea features", () => {
      const features = makeFeatures();
      const vector = extractFeatureVector(features);
      expect(vector).toHaveLength(10);
      expect(vector[0]).toBeCloseTo(0.7); // feasibility / 10
      expect(vector[1]).toBeCloseTo(0.8); // impact / 10
    });

    it("handles optional features with defaults", () => {
      const features = makeFeatures({ teamSize: undefined, priorSuccessRate: undefined });
      const vector = extractFeatureVector(features);
      expect(vector).toHaveLength(10);
      expect(vector[5]).toBeCloseTo(0.05); // default team size 5 / 100
      expect(vector[6]).toBeCloseTo(0.5); // default priorSuccessRate
    });
  });

  describe("training data", () => {
    it("adds training data points", () => {
      addTrainingData(makeTrainingPoint());
      addTrainingData(makeTrainingPoint());
      expect(getTrainingDataCount()).toBe(2);
    });
  });

  describe("model training", () => {
    it("requires minimum training data", () => {
      addTrainingData(makeTrainingPoint());
      expect(() => trainModel()).toThrow("Insufficient training data");
    });

    it("trains model with sufficient data", () => {
      // Add varied training data
      for (let i = 0; i < 10; i++) {
        addTrainingData(
          makeTrainingPoint({
            features: makeFeatures({
              feasibilityScore: 5 + Math.random() * 5,
              impactScore: 3 + Math.random() * 7,
            }),
            outcome: i < 7 ? "implemented" : "abandoned",
          })
        );
      }

      const metrics = trainModel();
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
      expect(metrics.trainingSize).toBe(10);
      expect(isModelReady()).toBe(true);
    });

    it("returns model metrics", () => {
      for (let i = 0; i < 10; i++) {
        addTrainingData(
          makeTrainingPoint({
            features: makeFeatures({
              feasibilityScore: i < 5 ? 3 : 8,
              impactScore: i < 5 ? 2 : 9,
            }),
            outcome: i < 5 ? "abandoned" : "implemented",
          })
        );
      }

      const metrics = trainModel();
      expect(metrics.precision).toBeDefined();
      expect(metrics.recall).toBeDefined();
      expect(metrics.f1Score).toBeDefined();
    });
  });

  describe("prediction", () => {
    it("makes predictions without trained model (heuristic)", async () => {
      const card = await predictOutcome(
        "idea-1",
        "AI Widget",
        makeFeatures({ feasibilityScore: 8, impactScore: 9 }),
        { useLlm: false }
      );

      expect(card.ideaId).toBe("idea-1");
      expect(card.implementationProbability).toBeGreaterThan(0);
      expect(card.implementationProbability).toBeLessThanOrEqual(1);
      expect(card.timeToMarket).toBeDefined();
      expect(card.impactMagnitude).toBeDefined();
      expect(card.resourceRequirements.engineers).toBeGreaterThan(0);
    });

    it("makes predictions with trained model", async () => {
      for (let i = 0; i < 10; i++) {
        addTrainingData(
          makeTrainingPoint({
            outcome: i < 7 ? "implemented" : "abandoned",
          })
        );
      }
      trainModel();

      const card = await predictOutcome("idea-2", "ML Pipeline", makeFeatures(), { useLlm: false });

      expect(card.implementationProbability).toBeGreaterThan(0);
      expect(card.implementationCI.confidence).toBe(0.95);
    });

    it("includes risk factors for high-risk ideas", async () => {
      const card = await predictOutcome(
        "idea-3",
        "Risky Project",
        makeFeatures({
          domainComplexity: 0.9,
          competitiveIntensity: 0.8,
          technicalDebt: 0.7,
          feasibilityScore: 3,
        }),
        { useLlm: false }
      );

      expect(card.riskFactors.length).toBeGreaterThan(0);
      expect(card.riskFactors.some((r) => r.includes("complexity"))).toBe(true);
    });

    it("includes LLM qualitative assessment", async () => {
      const card = await predictOutcome("idea-4", "Smart Widget", makeFeatures(), { useLlm: true });

      expect(card.qualitativeAssessment).toBeTruthy();
    });

    it("stores and retrieves prediction cards", async () => {
      await predictOutcome("idea-5", "Test", makeFeatures(), { useLlm: false });
      const card = getPredictionCard("idea-5");
      expect(card).toBeDefined();
      expect(card!.ideaTitle).toBe("Test");
    });

    it("finds similar outcomes", async () => {
      for (let i = 0; i < 5; i++) {
        addTrainingData(makeTrainingPoint());
      }

      const card = await predictOutcome("idea-6", "Similar Idea", makeFeatures(), {
        useLlm: false,
      });

      expect(card.similarOutcomes.length).toBeGreaterThan(0);
      expect(card.similarOutcomes[0].similarity).toBeGreaterThan(0);
    });
  });

  describe("time-to-market estimation", () => {
    it("estimates shorter TTM for simple ideas", async () => {
      const card = await predictOutcome(
        "simple",
        "Simple Fix",
        makeFeatures({ domainComplexity: 0.1, feasibilityScore: 9, teamSize: 10 }),
        { useLlm: false }
      );
      expect(["days", "weeks"]).toContain(card.timeToMarket);
    });

    it("estimates longer TTM for complex ideas", async () => {
      const card = await predictOutcome(
        "complex",
        "Complex Platform",
        makeFeatures({ domainComplexity: 0.9, feasibilityScore: 3, teamSize: 2 }),
        { useLlm: false }
      );
      expect(["quarters", "years"]).toContain(card.timeToMarket);
    });
  });
});
