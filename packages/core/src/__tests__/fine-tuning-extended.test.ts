import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  augmentTrainingData,
  evaluateFineTunedModel,
  createFineTuningJob,
  buildFineTuningDataset,
  getDatasetStats,
  validateDatasetQuality,
  getFineTuningRecommendations,
  type TrainingExample,
} from "../fine-tuning/index.js";
import { withRetry } from "../copilot/retry.js";

const mockWithRetry = vi.mocked(withRetry);

function makeMockExample(i: number, overrides: Partial<TrainingExample> = {}): TrainingExample {
  return {
    input: `Prompt ${i}: Generate ideas about topic ${i}`,
    output: `Idea ${i}: A creative solution for problem ${i}`,
    metadata: {
      subject: `topic-${i}`,
      angle: i % 3 === 0 ? "contrarian" : i % 3 === 1 ? "first-principles" : "scamper",
      score: 5 + (i % 5),
    },
    ...overrides,
  };
}

describe("fine-tuning (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("augmentTrainingData", () => {
    it("returns augmented examples including originals", async () => {
      const examples = [makeMockExample(0), makeMockExample(1)];
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          variations: [
            { id: 0, input: "Rephrased prompt 0" },
            { id: 1, input: "Rephrased prompt 1" },
          ],
        })
      );

      const augmented = await augmentTrainingData(examples);
      expect(augmented.length).toBeGreaterThan(examples.length);
      // Originals preserved
      expect(augmented[0]).toEqual(examples[0]);
      expect(augmented[1]).toEqual(examples[1]);
    });

    it("preserves metadata in augmented variants with 0.9x score", async () => {
      const examples = [makeMockExample(0)];
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          variations: [{ id: 0, input: "Rephrased" }],
        })
      );

      const augmented = await augmentTrainingData(examples);
      const variant = augmented[augmented.length - 1];
      expect(variant.metadata.subject).toBe(examples[0].metadata.subject);
      expect(variant.metadata.angle).toBe(examples[0].metadata.angle);
      expect(variant.metadata.score).toBeCloseTo(examples[0].metadata.score * 0.9, 5);
    });

    it("returns empty array for empty input", async () => {
      const result = await augmentTrainingData([]);
      expect(result).toEqual([]);
    });

    it("returns originals on LLM failure", async () => {
      const examples = [makeMockExample(0)];
      mockWithRetry.mockRejectedValue(new Error("LLM failure"));

      const result = await augmentTrainingData(examples);
      expect(result).toEqual(examples);
    });

    it("preserves output from original in variants", async () => {
      const examples = [makeMockExample(0)];
      mockWithRetry.mockResolvedValue(
        JSON.stringify({ variations: [{ id: 0, input: "New prompt" }] })
      );

      const augmented = await augmentTrainingData(examples);
      const variant = augmented[augmented.length - 1];
      expect(variant.output).toBe(examples[0].output);
      expect(variant.input).toBe("New prompt");
    });
  });

  describe("evaluateFineTunedModel", () => {
    it("returns evaluation with scores and improvements", async () => {
      const testSet = [makeMockExample(0), makeMockExample(1)];
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          baselineScores: { coherence: 6.0, creativity: 5.0 },
          fineTunedScores: { coherence: 8.0, creativity: 7.0 },
          recommendations: ["More training data"],
        })
      );

      const result = await evaluateFineTunedModel("job-1", testSet);
      expect(result.jobId).toBe("job-1");
      expect(result.baselineScores.coherence).toBe(6.0);
      expect(result.fineTunedScores.coherence).toBe(8.0);
      expect(result.improvement.coherence).toBe(2.0);
      expect(result.improvement.creativity).toBe(2.0);
      expect(result.recommendations).toContain("More training data");
    });

    it("returns empty evaluation for empty test set", async () => {
      const result = await evaluateFineTunedModel("job-1", []);
      expect(result.jobId).toBe("job-1");
      expect(result.baselineScores).toEqual({});
      expect(result.fineTunedScores).toEqual({});
      expect(result.improvement).toEqual({});
      expect(result.recommendations).toEqual(["No test examples provided — cannot evaluate."]);
    });

    it("returns fallback on LLM failure", async () => {
      mockWithRetry.mockRejectedValue(new Error("fail"));
      const result = await evaluateFineTunedModel("job-1", [makeMockExample(0)]);
      expect(result.jobId).toBe("job-1");
      expect(result.recommendations[0]).toContain("Evaluation failed");
    });

    it("computes correct improvement deltas", async () => {
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          baselineScores: { a: 3.0, b: 7.0 },
          fineTunedScores: { a: 5.0, b: 6.0 },
          recommendations: [],
        })
      );
      const result = await evaluateFineTunedModel("job-1", [makeMockExample(0)]);
      expect(result.improvement.a).toBe(2.0);
      expect(result.improvement.b).toBe(-1.0);
    });
  });

  describe("createFineTuningJob", () => {
    it("creates job in pending status", () => {
      const examples = Array.from({ length: 10 }, (_, i) => makeMockExample(i));
      const dataset = buildFineTuningDataset(examples, { name: "test-ds" });
      const job = createFineTuningJob(dataset, { baseModel: "gpt-4" });
      expect(job.status).toBe("pending");
      expect(job.datasetId).toBe(dataset.id);
      expect(job.baseModel).toBe("gpt-4");
      expect(job.hyperparameters.epochs).toBe(3);
    });

    it("accepts custom hyperparameters", () => {
      const examples = Array.from({ length: 10 }, (_, i) => makeMockExample(i));
      const dataset = buildFineTuningDataset(examples, { name: "test-ds" });
      const job = createFineTuningJob(dataset, {
        baseModel: "gpt-4",
        hyperparameters: { epochs: 5, learningRate: 0.001 },
      });
      expect(job.hyperparameters.epochs).toBe(5);
      expect(job.hyperparameters.learningRate).toBe(0.001);
    });

    it("accepts custom job ID", () => {
      const examples = Array.from({ length: 10 }, (_, i) => makeMockExample(i));
      const dataset = buildFineTuningDataset(examples, { name: "test-ds" });
      const job = createFineTuningJob(dataset, { id: "custom-job-1", baseModel: "gpt-4" });
      expect(job.id).toBe("custom-job-1");
    });
  });

  describe("strengthened assertions (replacing toBeDefined/toBeGreaterThanOrEqual)", () => {
    it("buildFineTuningDataset returns proper structure", () => {
      const examples = Array.from({ length: 5 }, (_, i) => makeMockExample(i));
      const dataset = buildFineTuningDataset(examples, { name: "test-dataset" });
      expect(dataset).toMatchObject({
        name: "test-dataset",
        examples: expect.arrayContaining([
          expect.objectContaining({ input: expect.any(String), output: expect.any(String) }),
        ]),
        format: "jsonl",
      });
      expect(dataset.id).toMatch(/^ds-/);
      expect(dataset.stats.totalExamples).toBe(5);
    });

    it("getDatasetStats returns exact counts", () => {
      const examples = Array.from({ length: 10 }, (_, i) => makeMockExample(i));
      const stats = getDatasetStats({ examples });
      expect(stats.totalExamples).toBe(10);
      expect(stats.avgScore).toBeGreaterThan(5);
      expect(stats.avgScore).toBeLessThan(10);
      // Angle distribution should have 3 angles (contrarian, first-principles, scamper)
      expect(Object.keys(stats.angleDistribution)).toHaveLength(3);
    });

    it("validateDatasetQuality returns structured result", () => {
      const examples = Array.from({ length: 60 }, (_, i) => makeMockExample(i));
      const dataset = buildFineTuningDataset(examples, { name: "large" });
      const result = validateDatasetQuality(dataset);
      expect(result).toMatchObject({
        valid: expect.any(Boolean),
        issues: expect.any(Array),
        warnings: expect.any(Array),
      });
    });

    it("getFineTuningRecommendations returns exact hyperparameters for small dataset", () => {
      const stats = getDatasetStats({
        examples: Array.from({ length: 50 }, (_, i) => makeMockExample(i)),
      });
      const recs = getFineTuningRecommendations(stats);
      expect(recs.hyperparameters).toMatchObject({
        epochs: 5,
        batchSize: 4,
        learningRate: expect.any(Number),
        warmupSteps: expect.any(Number),
      });
      expect(recs.reasoning.length).toBeGreaterThan(0);
    });

    it("getFineTuningRecommendations returns exact hyperparameters for large dataset", () => {
      const examples = Array.from({ length: 6000 }, (_, i) => makeMockExample(i));
      const stats = getDatasetStats({ examples });
      const recs = getFineTuningRecommendations(stats);
      expect(recs.hyperparameters.epochs).toBe(2);
      expect(recs.hyperparameters.batchSize).toBe(16);
    });
  });

  describe("edge cases", () => {
    it("handles dataset with 0 examples in stats", () => {
      const stats = getDatasetStats({ examples: [] });
      expect(stats).toEqual({
        totalExamples: 0,
        avgScore: 0,
        scoreDistribution: {},
        angleDistribution: {},
        subjectDiversity: 0,
      });
    });

    it("same scores produce equal improvements", async () => {
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          baselineScores: { a: 5.0 },
          fineTunedScores: { a: 5.0 },
          recommendations: [],
        })
      );
      const result = await evaluateFineTunedModel("job-1", [makeMockExample(0)]);
      expect(result.improvement.a).toBe(0);
    });
  });
});
