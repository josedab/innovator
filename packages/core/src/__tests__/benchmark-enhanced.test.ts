import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

const mockInvestigate = vi.fn();
const mockGenerateForAngle = vi.fn();

vi.mock("../innovation/investigate.js", () => ({
  investigate: (...args: unknown[]) => mockInvestigate(...args),
}));

vi.mock("../innovation/generate.js", () => ({
  generateForAngle: (...args: unknown[]) => mockGenerateForAngle(...args),
}));

import {
  CANONICAL_SUBJECTS,
  EVALUATION_CRITERIA,
  computeBenchmarkMetrics,
  computeStatisticalSignificance,
  generateRadarChartData,
  generateComparativeReport,
  runBenchmarkSuite,
  BenchmarkMetricsSchema,
  StatisticalSignificanceSchema,
  RadarChartDataSchema,
  ComparativeReportSchema,
  type BenchmarkReport,
  type ModelBenchmark,
} from "../benchmark/index.js";
import type { AngleResult, Investigation, AngleId } from "../types.js";

// ---- Helpers ----

function makeMockResult(
  model: string,
  angleId: string,
  overrides?: Partial<ModelBenchmark>
): ModelBenchmark {
  return {
    model,
    angleId,
    ideaCount: 2,
    evaluations: [
      {
        ideaTitle: "Idea1",
        diversity: 7,
        specificity: 8,
        actionability: 6,
        novelty: 9,
        overallScore: 7.5,
        feedback: "Good",
      },
      {
        ideaTitle: "Idea2",
        diversity: 6,
        specificity: 7,
        actionability: 5,
        novelty: 8,
        overallScore: 6.5,
        feedback: "OK",
      },
    ],
    averageScores: {
      diversity: 6.5,
      specificity: 7.5,
      actionability: 5.5,
      novelty: 8.5,
      overall: 7.0,
    },
    durationMs: 1000,
    ...overrides,
  };
}

function makeMockReport(overrides?: Partial<BenchmarkReport>): BenchmarkReport {
  return {
    subject: "test subject",
    angleIds: ["scamper"],
    models: ["model-a", "model-b"],
    results: [
      makeMockResult("model-a", "scamper"),
      makeMockResult("model-b", "scamper", {
        averageScores: {
          diversity: 8,
          specificity: 9,
          actionability: 7,
          novelty: 9,
          overall: 8.25,
        },
        durationMs: 1500,
      }),
    ],
    summary: {
      bestOverall: "model-b",
      bestByCategory: {
        diversity: "model-b",
        specificity: "model-b",
        actionability: "model-b",
        novelty: "model-b",
      },
      ranking: [
        { model: "model-b", score: 8.25 },
        { model: "model-a", score: 7.0 },
      ],
    },
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test",
  keyAspects: [{ title: "A", description: "B" }],
  currentState: "Current",
  challenges: ["c1"],
  opportunities: ["o1"],
};

const MOCK_ANGLE_RESULT: AngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    { title: "Idea1", description: "Desc1", potentialImpact: "High", implementationHint: "Do it" },
  ],
  reasoning: "Applied SCAMPER",
};

function makeEvaluationsJson(ideas: { title: string }[]): string {
  return JSON.stringify({
    evaluations: ideas.map((idea) => ({
      ideaTitle: idea.title,
      diversity: 7,
      specificity: 8,
      actionability: 6,
      novelty: 9,
      overallScore: 7.5,
      feedback: "Good idea",
    })),
  });
}

// ---- Tests ----

describe("benchmark-enhanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);
  });

  describe("CANONICAL_SUBJECTS", () => {
    it("contains exactly 20 subjects", () => {
      expect(CANONICAL_SUBJECTS).toHaveLength(20);
    });

    it("contains only non-empty strings", () => {
      for (const subject of CANONICAL_SUBJECTS) {
        expect(typeof subject).toBe("string");
        expect(subject.length).toBeGreaterThan(0);
      }
    });

    it("has no duplicate entries", () => {
      const unique = new Set(CANONICAL_SUBJECTS);
      expect(unique.size).toBe(CANONICAL_SUBJECTS.length);
    });
  });

  describe("computeBenchmarkMetrics", () => {
    it("returns metrics for each model in the report", () => {
      const report = makeMockReport();
      const metrics = computeBenchmarkMetrics(report);

      expect(metrics).toHaveLength(2);
      const models = metrics.map((m) => m.model);
      expect(models).toContain("model-a");
      expect(models).toContain("model-b");
    });

    it("validates against BenchmarkMetricsSchema", () => {
      const report = makeMockReport();
      const metrics = computeBenchmarkMetrics(report);

      for (const m of metrics) {
        expect(() => BenchmarkMetricsSchema.parse(m)).not.toThrow();
      }
    });

    it("computes correct latency percentiles", () => {
      const report = makeMockReport({
        results: [
          makeMockResult("model-a", "scamper", { durationMs: 100 }),
          makeMockResult("model-a", "first-principles", { durationMs: 200 }),
          makeMockResult("model-a", "cross-domain", { durationMs: 300 }),
        ],
        models: ["model-a"],
      });
      const metrics = computeBenchmarkMetrics(report);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].latencyP50Ms).toBe(200);
      expect(metrics[0].latencyP90Ms).toBeGreaterThanOrEqual(200);
      expect(metrics[0].latencyP99Ms).toBeGreaterThanOrEqual(metrics[0].latencyP90Ms);
    });

    it("computes quality scores as averages across runs", () => {
      const report = makeMockReport({
        results: [
          makeMockResult("model-a", "scamper", {
            averageScores: {
              diversity: 6,
              specificity: 6,
              actionability: 6,
              novelty: 6,
              overall: 6,
            },
          }),
          makeMockResult("model-a", "first-principles", {
            averageScores: {
              diversity: 8,
              specificity: 8,
              actionability: 8,
              novelty: 8,
              overall: 8,
            },
          }),
        ],
        models: ["model-a"],
      });
      const metrics = computeBenchmarkMetrics(report);

      expect(metrics[0].qualityScores.diversity).toBe(7);
      expect(metrics[0].qualityScores.overall).toBe(7);
    });

    it("handles runs with no evaluations gracefully", () => {
      const report = makeMockReport({
        results: [makeMockResult("model-a", "scamper", { evaluations: [], ideaCount: 0 })],
        models: ["model-a"],
      });
      const metrics = computeBenchmarkMetrics(report);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].qualityScores.overall).toBe(0);
    });

    it("estimates cost based on idea count", () => {
      const report = makeMockReport({
        results: [makeMockResult("model-a", "scamper", { ideaCount: 10 })],
        models: ["model-a"],
      });
      const metrics = computeBenchmarkMetrics(report);

      expect(metrics[0].estimatedCostUsd).toBeGreaterThan(0);
      expect(metrics[0].avgTokensPerIdea).toBe(150);
    });
  });

  describe("computeStatisticalSignificance", () => {
    it("returns non-significant result for identical scores", () => {
      const report = makeMockReport({
        results: [
          makeMockResult("model-a", "s1", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
          makeMockResult("model-a", "s2", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
          makeMockResult("model-a", "s3", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
          makeMockResult("model-b", "s1", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
          makeMockResult("model-b", "s2", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
          makeMockResult("model-b", "s3", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
        ],
      });
      const result = computeStatisticalSignificance(report, "model-a", "model-b");

      expect(result.significant).toBe(false);
      expect(result.pValue).toBe(1);
      expect(result.tStatistic).toBe(0);
    });

    it("returns significant result for very different scores", () => {
      const report = makeMockReport({
        results: [
          makeMockResult("model-a", "s1", {
            averageScores: {
              diversity: 2,
              specificity: 2,
              actionability: 2,
              novelty: 2,
              overall: 2,
            },
          }),
          makeMockResult("model-a", "s2", {
            averageScores: {
              diversity: 2,
              specificity: 2,
              actionability: 2,
              novelty: 2,
              overall: 2.1,
            },
          }),
          makeMockResult("model-a", "s3", {
            averageScores: {
              diversity: 2,
              specificity: 2,
              actionability: 2,
              novelty: 2,
              overall: 1.9,
            },
          }),
          makeMockResult("model-b", "s1", {
            averageScores: {
              diversity: 9,
              specificity: 9,
              actionability: 9,
              novelty: 9,
              overall: 9,
            },
          }),
          makeMockResult("model-b", "s2", {
            averageScores: {
              diversity: 9,
              specificity: 9,
              actionability: 9,
              novelty: 9,
              overall: 9.1,
            },
          }),
          makeMockResult("model-b", "s3", {
            averageScores: {
              diversity: 9,
              specificity: 9,
              actionability: 9,
              novelty: 9,
              overall: 8.9,
            },
          }),
        ],
      });
      const result = computeStatisticalSignificance(report, "model-a", "model-b");

      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.tStatistic).not.toBe(0);
    });

    it("validates against StatisticalSignificanceSchema", () => {
      const report = makeMockReport();
      const result = computeStatisticalSignificance(report, "model-a", "model-b");
      expect(() => StatisticalSignificanceSchema.parse(result)).not.toThrow();
    });

    it("returns non-significant when fewer than 2 samples per model", () => {
      const report = makeMockReport({
        results: [makeMockResult("model-a", "s1"), makeMockResult("model-b", "s1")],
      });
      const result = computeStatisticalSignificance(report, "model-a", "model-b");

      expect(result.significant).toBe(false);
      expect(result.pValue).toBe(1);
      expect(result.degreesOfFreedom).toBe(0);
    });

    it("populates meanA and meanB correctly", () => {
      const report = makeMockReport({
        results: [
          makeMockResult("model-a", "s1", {
            averageScores: {
              diversity: 5,
              specificity: 5,
              actionability: 5,
              novelty: 5,
              overall: 5,
            },
          }),
          makeMockResult("model-a", "s2", {
            averageScores: {
              diversity: 7,
              specificity: 7,
              actionability: 7,
              novelty: 7,
              overall: 7,
            },
          }),
          makeMockResult("model-b", "s1", {
            averageScores: {
              diversity: 8,
              specificity: 8,
              actionability: 8,
              novelty: 8,
              overall: 8,
            },
          }),
          makeMockResult("model-b", "s2", {
            averageScores: {
              diversity: 6,
              specificity: 6,
              actionability: 6,
              novelty: 6,
              overall: 6,
            },
          }),
        ],
      });
      const result = computeStatisticalSignificance(report, "model-a", "model-b");

      expect(result.meanA).toBe(6);
      expect(result.meanB).toBe(7);
    });
  });

  describe("generateRadarChartData", () => {
    it("returns axes for all evaluation criteria", () => {
      const report = makeMockReport();
      const chart = generateRadarChartData(report);

      expect(chart.axisLabels).toEqual([...EVALUATION_CRITERIA]);
    });

    it("returns a series entry for each model", () => {
      const report = makeMockReport();
      const chart = generateRadarChartData(report);

      expect(chart.series).toHaveLength(2);
      const seriesModels = chart.series.map((s) => s.model);
      expect(seriesModels).toContain("model-a");
      expect(seriesModels).toContain("model-b");
    });

    it("each series has axes matching the criteria count", () => {
      const report = makeMockReport();
      const chart = generateRadarChartData(report);

      for (const s of chart.series) {
        expect(s.axes).toHaveLength(EVALUATION_CRITERIA.length);
      }
    });

    it("validates against RadarChartDataSchema", () => {
      const report = makeMockReport();
      const chart = generateRadarChartData(report);
      expect(() => RadarChartDataSchema.parse(chart)).not.toThrow();
    });

    it("computes averaged values when a model has multiple results", () => {
      const report = makeMockReport({
        results: [
          makeMockResult("model-a", "scamper", {
            averageScores: {
              diversity: 4,
              specificity: 4,
              actionability: 4,
              novelty: 4,
              overall: 4,
            },
          }),
          makeMockResult("model-a", "first-principles", {
            averageScores: {
              diversity: 8,
              specificity: 8,
              actionability: 8,
              novelty: 8,
              overall: 8,
            },
          }),
        ],
        models: ["model-a"],
      });
      const chart = generateRadarChartData(report);

      const series = chart.series.find((s) => s.model === "model-a")!;
      const diversityAxis = series.axes.find((a) => a.axis === "diversity")!;
      expect(diversityAxis.value).toBe(6);
    });
  });

  describe("generateComparativeReport", () => {
    it("contains all expected fields", () => {
      const report = makeMockReport();
      const comparative = generateComparativeReport(report);

      expect(comparative.subject).toBe("test subject");
      expect(comparative.models).toEqual(["model-a", "model-b"]);
      expect(comparative.metrics).toBeDefined();
      expect(comparative.radarChart).toBeDefined();
      expect(comparative.pairwiseSignificance).toBeDefined();
      expect(comparative.overallRanking).toBeDefined();
      expect(comparative.createdAt).toBeDefined();
    });

    it("validates against ComparativeReportSchema", () => {
      const report = makeMockReport();
      const comparative = generateComparativeReport(report);
      expect(() => ComparativeReportSchema.parse(comparative)).not.toThrow();
    });

    it("generates pairwise significance for all model pairs", () => {
      const report = makeMockReport({
        models: ["model-a", "model-b", "model-c"],
        results: [
          makeMockResult("model-a", "scamper"),
          makeMockResult("model-b", "scamper"),
          makeMockResult("model-c", "scamper"),
        ],
      });
      const comparative = generateComparativeReport(report);

      // 3 models => 3 pairs: (a,b), (a,c), (b,c)
      expect(comparative.pairwiseSignificance).toHaveLength(3);
    });

    it("preserves ranking from original report", () => {
      const report = makeMockReport();
      const comparative = generateComparativeReport(report);

      expect(comparative.overallRanking).toEqual(report.summary.ranking);
    });
  });

  describe("runBenchmarkSuite", () => {
    beforeEach(() => {
      const json = makeEvaluationsJson(MOCK_ANGLE_RESULT.ideas);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);
    });

    it("runs across provided subjects and returns results", async () => {
      const result = await runBenchmarkSuite(["model-a"], {
        subjects: ["Subject 1", "Subject 2"],
        angleIds: ["scamper" as AngleId],
      });

      expect(result.subjects).toEqual(["Subject 1", "Subject 2"]);
      expect(result.models).toEqual(["model-a"]);
      expect(result.reports).toHaveLength(2);
      expect(result.comparativeReports).toHaveLength(2);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.createdAt).toBeDefined();
    });

    it("fires progress callbacks", async () => {
      const progress: { status: string; completed: number; total: number }[] = [];
      await runBenchmarkSuite(["model-a"], {
        subjects: ["Subject 1"],
        angleIds: ["scamper" as AngleId],
        onProgress: (status, completed, total) => progress.push({ status, completed, total }),
      });

      expect(progress.length).toBeGreaterThan(0);
      expect(progress.some((p) => p.status.includes("Running benchmark"))).toBe(true);
    });

    it("computes aggregate ranking across subjects", async () => {
      const result = await runBenchmarkSuite(["model-a", "model-b"], {
        subjects: ["Subject 1"],
        angleIds: ["scamper" as AngleId],
      });

      expect(result.aggregateRanking.length).toBeGreaterThan(0);
      for (const entry of result.aggregateRanking) {
        expect(entry.model).toBeDefined();
        expect(typeof entry.score).toBe("number");
      }
    });

    it("handles failed subjects gracefully", async () => {
      mockInvestigate
        .mockResolvedValueOnce(MOCK_INVESTIGATION)
        .mockRejectedValueOnce(new Error("network error"));

      const result = await runBenchmarkSuite(["model-a"], {
        subjects: ["Good Subject", "Bad Subject"],
        angleIds: ["scamper" as AngleId],
      });

      // At least the first subject should succeed
      expect(result.reports.length).toBeGreaterThanOrEqual(1);
    });

    it("defaults to CANONICAL_SUBJECTS when no subjects provided", async () => {
      // We only verify the subjects list without running all 20
      const controller = new AbortController();
      controller.abort();

      const result = await runBenchmarkSuite(["model-a"], {
        angleIds: ["scamper" as AngleId],
        signal: controller.signal,
      });

      expect(result.subjects).toEqual([...CANONICAL_SUBJECTS]);
    });
  });
});
