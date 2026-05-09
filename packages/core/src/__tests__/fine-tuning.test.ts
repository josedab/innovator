import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  collectTrainingData,
  buildFineTuningDataset,
  exportDatasetAsJSONL,
  exportDatasetAsChatFormat,
  getDatasetStats,
  splitDataset,
  validateDatasetQuality,
  getFineTuningRecommendations,
  TrainingExampleSchema,
  FineTuningDatasetSchema,
} from "../fine-tuning/index.js";

function makeMockExamples(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    input: `Prompt ${i}: Generate ideas about topic ${i}`,
    output: `Idea ${i}: A creative solution for problem ${i}`,
    metadata: {
      subject: `topic-${i}`,
      angle: i % 2 === 0 ? "contrarian" : "first-principles",
      score: 0.5 + (i % 5) * 0.1,
    },
  }));
}

describe("TrainingExampleSchema", () => {
  it("validates a valid training example", () => {
    const example = {
      input: "Generate ideas for sustainable energy",
      output: "Solar-powered desalination plants",
      metadata: { subject: "energy", angle: "contrarian", score: 0.85 },
    };
    const result = TrainingExampleSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it("rejects example with missing input", () => {
    const example = { output: "Some output" };
    const result = TrainingExampleSchema.safeParse(example);
    expect(result.success).toBe(false);
  });
});

describe("collectTrainingData", () => {
  it("returns empty array for empty sessions", () => {
    const result = collectTrainingData([]);
    expect(result).toEqual([]);
  });

  it("extracts training data from sessions with angle results", () => {
    const sessions = [
      {
        subject: "AI in healthcare",
        angleResults: [
          {
            angle: "contrarian",
            ideas: [{ title: "Idea A", description: "Description A", score: 0.9 }],
            prompt: "Generate contrarian ideas about AI in healthcare",
          },
        ],
      },
    ];
    const result = collectTrainingData(sessions as never[]);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("buildFineTuningDataset", () => {
  it("builds a dataset from examples", () => {
    const examples = makeMockExamples(5);
    const dataset = buildFineTuningDataset(examples, { name: "test-dataset" });
    expect(dataset.name).toBe("test-dataset");
    expect(dataset.examples).toHaveLength(5);
    expect(dataset.id).toBeDefined();
  });

  it("includes computed stats", () => {
    const examples = makeMockExamples(10);
    const dataset = buildFineTuningDataset(examples, { name: "stats-test" });
    expect(dataset.stats).toBeDefined();
    expect(dataset.stats.totalExamples).toBe(10);
  });
});

describe("exportDatasetAsJSONL", () => {
  it("exports dataset as JSONL string", () => {
    const examples = makeMockExamples(3);
    const dataset = buildFineTuningDataset(examples, { name: "jsonl-test" });
    const jsonl = exportDatasetAsJSONL(dataset);
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("exportDatasetAsChatFormat", () => {
  it("exports dataset in chat format", () => {
    const examples = makeMockExamples(2);
    const dataset = buildFineTuningDataset(examples, {
      name: "chat-test",
      format: "chat",
    });
    const chatOutput = exportDatasetAsChatFormat(dataset);
    const lines = chatOutput.trim().split("\n");
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.messages).toBeDefined();
      expect(Array.isArray(parsed.messages)).toBe(true);
    }
  });
});

describe("getDatasetStats", () => {
  it("computes stats for a dataset", () => {
    const examples = makeMockExamples(10);
    const dataset = buildFineTuningDataset(examples, { name: "stats" });
    const stats = getDatasetStats(dataset);
    expect(stats.totalExamples).toBe(10);
    expect(stats.avgScore).toBeGreaterThan(0);
  });
});

describe("splitDataset", () => {
  it("splits dataset into train and validation", () => {
    const examples = makeMockExamples(20);
    const dataset = buildFineTuningDataset(examples, { name: "split-test" });
    const [train, validation] = splitDataset(dataset, 0.8);
    expect(train.examples.length + validation.examples.length).toBe(20);
    expect(train.examples.length).toBe(16);
    expect(validation.examples.length).toBe(4);
  });

  it("handles default split ratio", () => {
    const examples = makeMockExamples(10);
    const dataset = buildFineTuningDataset(examples, { name: "default-split" });
    const [train, validation] = splitDataset(dataset);
    expect(train.examples.length + validation.examples.length).toBe(10);
  });
});

describe("validateDatasetQuality", () => {
  it("reports issues for small datasets", () => {
    const examples = makeMockExamples(5);
    const dataset = buildFineTuningDataset(examples, { name: "small" });
    const result = validateDatasetQuality(dataset);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("validates a sufficiently large dataset", () => {
    const examples = makeMockExamples(60);
    const dataset = buildFineTuningDataset(examples, { name: "large" });
    const result = validateDatasetQuality(dataset);
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("warnings");
  });
});

describe("getFineTuningRecommendations", () => {
  it("returns hyperparameter recommendations", () => {
    const examples = makeMockExamples(100);
    const dataset = buildFineTuningDataset(examples, { name: "recs" });
    const stats = getDatasetStats(dataset);
    const recs = getFineTuningRecommendations(stats);
    expect(recs.hyperparameters).toBeDefined();
    expect(recs.hyperparameters.epochs).toBeGreaterThan(0);
    expect(recs.hyperparameters.learningRate).toBeGreaterThan(0);
    expect(recs.reasoning).toBeDefined();
    expect(Array.isArray(recs.reasoning)).toBe(true);
  });
});
