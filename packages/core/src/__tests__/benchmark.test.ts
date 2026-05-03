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
  evaluateAngleResult,
  runBenchmark,
  benchmarkToMarkdown,
  IdeaEvaluationSchema,
  BenchmarkReportSchema,
  EVALUATION_CRITERIA,
  type BenchmarkReport,
  type IdeaEvaluation,
} from "../benchmark/index.js";
import type { AngleResult, Investigation, AngleId } from "../types.js";

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
    { title: "Idea2", description: "Desc2", potentialImpact: "Medium", implementationHint: "Try it" },
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

describe("benchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);
  });

  describe("evaluateAngleResult", () => {
    it("returns valid IdeaEvaluationSchema results", async () => {
      const json = makeEvaluationsJson(MOCK_ANGLE_RESULT.ideas);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const evaluations = await evaluateAngleResult("test subject", MOCK_ANGLE_RESULT);

      expect(evaluations).toHaveLength(2);
      for (const e of evaluations) {
        expect(() => IdeaEvaluationSchema.parse(e)).not.toThrow();
        expect(e.diversity).toBeGreaterThanOrEqual(1);
        expect(e.diversity).toBeLessThanOrEqual(10);
        expect(e.overallScore).toBeGreaterThanOrEqual(1);
        expect(e.overallScore).toBeLessThanOrEqual(10);
      }
    });

    it("returns empty array for angle with no ideas", async () => {
      const emptyAngle: AngleResult = { ...MOCK_ANGLE_RESULT, ideas: [] };
      const result = await evaluateAngleResult("test", emptyAngle);
      expect(result).toEqual([]);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("passes judge model and signal", async () => {
      const json = makeEvaluationsJson(MOCK_ANGLE_RESULT.ideas);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);
      const controller = new AbortController();

      await evaluateAngleResult("test", MOCK_ANGLE_RESULT, "judge-model", controller.signal);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "judge-model", signal: controller.signal })
      );
    });
  });

  describe("runBenchmark", () => {
    beforeEach(() => {
      const json = makeEvaluationsJson(MOCK_ANGLE_RESULT.ideas);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);
    });

    it("aggregates scores across models and angles", async () => {
      const report = await runBenchmark("test", ["model-a", "model-b"], ["scamper" as AngleId]);

      expect(report.models).toEqual(["model-a", "model-b"]);
      expect(report.results.length).toBe(2);
      expect(report.summary.ranking.length).toBe(2);
    });

    it("tracks duration for each model/angle combination", async () => {
      const report = await runBenchmark("test", ["model-a"], ["scamper" as AngleId]);

      expect(report.results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("validates against BenchmarkReportSchema", async () => {
      const report = await runBenchmark("test", ["model-a"], ["scamper" as AngleId]);

      expect(() => BenchmarkReportSchema.parse(report)).not.toThrow();
    });

    it("computes average scores correctly", async () => {
      const report = await runBenchmark("test", ["model-a"], ["scamper" as AngleId]);

      const scores = report.results[0].averageScores;
      expect(scores.diversity).toBe(7);
      expect(scores.specificity).toBe(8);
      expect(scores.actionability).toBe(6);
      expect(scores.novelty).toBe(9);
      expect(scores.overall).toBe(7.5);
    });

    it("identifies bestOverall model", async () => {
      // model-b gets higher scores
      let callCount = 0;
      mockGenerateText.mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          // model-a evaluation
          return makeEvaluationsJson([{ title: "low" }]);
        }
        // model-b evaluation — higher scores
        return JSON.stringify({
          evaluations: [{
            ideaTitle: "high",
            diversity: 10, specificity: 10, actionability: 10, novelty: 10,
            overallScore: 10, feedback: "Perfect",
          }],
        });
      });
      mockExtractJson.mockImplementation((raw: string) => raw);

      const report = await runBenchmark("test", ["model-a", "model-b"], ["scamper" as AngleId]);

      expect(report.summary.bestOverall).toBeDefined();
    });

    it("identifies bestByCategory", async () => {
      const report = await runBenchmark("test", ["model-a"], ["scamper" as AngleId]);

      for (const criterion of EVALUATION_CRITERIA) {
        expect(report.summary.bestByCategory[criterion]).toBeDefined();
      }
    });

    it("handles error for a specific model gracefully", async () => {
      mockGenerateForAngle
        .mockResolvedValueOnce(MOCK_ANGLE_RESULT)
        .mockRejectedValueOnce(new Error("model-b failed"));

      const report = await runBenchmark("test", ["model-a", "model-b"], ["scamper" as AngleId]);

      expect(report.results).toHaveLength(2);
      const failedResult = report.results.find((r) => r.model === "model-b");
      expect(failedResult!.error).toBe("model-b failed");
      expect(failedResult!.ideaCount).toBe(0);
    });

    it("throws when no models provided", async () => {
      await expect(runBenchmark("test", [])).rejects.toThrow("At least one model");
    });

    it("defaults to first 3 angles when none specified", async () => {
      const report = await runBenchmark("test", ["model-a"]);

      expect(report.angleIds).toEqual(["scamper", "first-principles", "cross-domain"]);
    });

    it("fires progress callbacks", async () => {
      const messages: string[] = [];
      await runBenchmark("test", ["model-a"], ["scamper" as AngleId], undefined, (msg) =>
        messages.push(msg)
      );

      expect(messages.some((m) => m.includes("Investigating"))).toBe(true);
      expect(messages.some((m) => m.includes("Generating"))).toBe(true);
      expect(messages.some((m) => m.includes("Evaluating"))).toBe(true);
    });
  });

  describe("benchmarkToMarkdown", () => {
    const report: BenchmarkReport = {
      subject: "test subject",
      angleIds: ["scamper"],
      models: ["model-a", "model-b"],
      results: [
        {
          model: "model-a",
          angleId: "scamper",
          ideaCount: 2,
          evaluations: [],
          averageScores: { diversity: 7, specificity: 8, actionability: 6, novelty: 9, overall: 7.5 },
          durationMs: 1234,
        },
        {
          model: "model-b",
          angleId: "scamper",
          ideaCount: 0,
          evaluations: [],
          averageScores: { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 },
          durationMs: 500,
          error: "Failed",
        },
      ],
      summary: {
        bestOverall: "model-a",
        bestByCategory: { diversity: "model-a", specificity: "model-a", actionability: "model-a", novelty: "model-a" },
        ranking: [
          { model: "model-a", score: 7.5 },
          { model: "model-b", score: 0 },
        ],
      },
      createdAt: "2024-01-01T00:00:00Z",
    };

    it("includes report header with subject", () => {
      const md = benchmarkToMarkdown(report);
      expect(md).toContain("# Benchmark Report: test subject");
    });

    it("includes ranking", () => {
      const md = benchmarkToMarkdown(report);
      expect(md).toContain("model-a: 7.5/10");
      expect(md).toContain("model-b: 0/10");
    });

    it("includes bestOverall", () => {
      const md = benchmarkToMarkdown(report);
      expect(md).toContain("**Best Overall:** model-a");
    });

    it("shows error for failed models", () => {
      const md = benchmarkToMarkdown(report);
      expect(md).toContain("**Error:** Failed");
    });

    it("shows scores and duration for successful models", () => {
      const md = benchmarkToMarkdown(report);
      expect(md).toContain("Duration: 1234ms");
      expect(md).toContain("D:7");
    });
  });
});
