import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue(
      '{"level":"moderate","score":0.5,"factors":[],"domainSpecificity":0.3,"novelty":0.3,"technicalDepth":0.5}'
    ),
  extractJson: vi.fn((raw: string) => raw),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  classifyComplexity,
  classifyComplexityHeuristic,
  generateExecutionPlan,
  recordExecution,
  getExecutionStats,
  clearExecutionHistory,
  type ComplexityClassification,
  type ExpertiseProfile,
} from "../adaptive-scaling/index.js";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

const DEFAULT_COMPLEXITY = {
  level: "moderate",
  score: 0.5,
  factors: [],
  domainSpecificity: 0.3,
  novelty: 0.3,
  technicalDepth: 0.5,
} satisfies ComplexityClassification;

const DEFAULT_EXPERTISE = {
  level: "intermediate",
  domains: [],
  preferredDepth: "standard",
  sessionCount: 0,
} satisfies ExpertiseProfile;

function makeComplexity(
  overrides: Partial<ComplexityClassification> = {}
): ComplexityClassification {
  return {
    ...DEFAULT_COMPLEXITY,
    ...overrides,
  };
}

describe("adaptive-scaling", () => {
  beforeEach(() => {
    clearExecutionHistory();
    vi.clearAllMocks();
    vi.mocked(generateText).mockResolvedValue(JSON.stringify(DEFAULT_COMPLEXITY));
    vi.mocked(extractJson).mockImplementation((raw: string) => raw);
    vi.mocked(withRetry).mockImplementation(((fn: () => Promise<unknown>) =>
      fn()) as typeof withRetry);
  });

  describe("classifyComplexityHeuristic", () => {
    it("detects strong technical depth for quantum blockchain subjects", () => {
      const result = classifyComplexityHeuristic("quantum blockchain");

      expect(result.technicalDepth).toBe(0.8);
      expect(result.domainSpecificity).toBe(0.3);
      expect(result.novelty).toBe(0.3);
      expect(result.level).toBe("moderate");
      expect(result.factors).toHaveLength(3);
    });

    it("detects strong domain specificity for regulated industries", () => {
      const result = classifyComplexityHeuristic("healthcare regulatory workflow automation");

      expect(result.domainSpecificity).toBe(0.8);
      expect(result.level).toBe("moderate");
    });

    it("detects novelty indicators for breakthrough language", () => {
      const result = classifyComplexityHeuristic("novel breakthrough energy storage platform");

      expect(result.novelty).toBe(0.7);
      expect(result.level).toBe("moderate");
    });

    it("classifies very simple subjects near the trivial boundary", () => {
      const result = classifyComplexityHeuristic("hello");

      expect(result.level).toBe("simple");
      expect(result.score).toBeLessThan(0.35);
      expect(result.technicalDepth).toBe(0.2);
    });

    it("uses word-count fallback depth for long non-technical subjects", () => {
      const result = classifyComplexityHeuristic(
        "a long subject with many plain words that describes multiple customer needs without any technical jargon or regulated industry language at all today"
      );

      expect(result.technicalDepth).toBe(0.5);
      expect(result.domainSpecificity).toBe(0.3);
      expect(result.novelty).toBe(0.3);
    });
  });

  describe("classifyComplexity", () => {
    it("returns parsed LLM classification and forwards options", async () => {
      const signal = new AbortController().signal;
      vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify(DEFAULT_COMPLEXITY));

      const result = await classifyComplexity("adaptive robotics", {
        model: "gpt-4o-mini",
        signal,
      });

      expect(result).toEqual(DEFAULT_COMPLEXITY);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-mini", signal })
      );
      expect(extractJson).toHaveBeenCalledWith(JSON.stringify(DEFAULT_COMPLEXITY));
      expect(withRetry).toHaveBeenCalledTimes(1);
    });

    it("throws when the subject is empty", async () => {
      await expect(classifyComplexity("   ")).rejects.toThrow(
        "Subject is required for complexity classification"
      );
    });

    it("throws when the LLM response is not valid JSON", async () => {
      vi.mocked(generateText).mockResolvedValueOnce("not-json");

      await expect(classifyComplexity("adaptive robotics")).rejects.toThrow(
        "Failed to parse complexity response"
      );
    });
  });

  describe("generateExecutionPlan", () => {
    it("creates a shallow, low-cost plan for trivial subjects", () => {
      const plan = generateExecutionPlan(
        "hello",
        makeComplexity({ level: "trivial", score: 0.1, technicalDepth: 0.1 }),
        DEFAULT_EXPERTISE
      );

      expect(plan.recommendedDepth).toBe("shallow");
      expect(plan.angleCount).toBe(3);
      expect(plan.recommendedAngles).toHaveLength(3);
      expect(plan.modelSelection).toEqual({
        investigation: "ollama-local",
        generation: "ollama-local",
        synthesis: "ollama-local",
      });
      expect(plan.estimatedTimeSeconds).toBe(15);
    });

    it("creates a deep premium plan for complex subjects", () => {
      const plan = generateExecutionPlan(
        "distributed quantum coordination",
        makeComplexity({ level: "complex", score: 0.8, technicalDepth: 0.8 }),
        DEFAULT_EXPERTISE
      );

      expect(plan.recommendedDepth).toBe("deep");
      expect(plan.angleCount).toBe(8);
      expect(plan.recommendedAngles).toHaveLength(8);
      expect(plan.modelSelection.generation).toBe("gpt-4o");
      expect(plan.modelSelection.synthesis).toBe("gpt-4o");
      expect(plan.estimatedTimeSeconds).toBe(120);
    });

    it("overrides depth when prioritizeSpeed is enabled", () => {
      const plan = generateExecutionPlan(
        "distributed quantum coordination",
        makeComplexity({ level: "complex", score: 0.8 }),
        { ...DEFAULT_EXPERTISE, preferredDepth: "exhaustive" },
        { prioritizeSpeed: true, prioritizeQuality: false }
      );

      expect(plan.recommendedDepth).toBe("shallow");
      expect(plan.angleCount).toBe(3);
      expect(plan.adjustments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ parameter: "depth", adjusted: "shallow" }),
        ])
      );
    });

    it("respects maxAngles budget caps", () => {
      const plan = generateExecutionPlan(
        "distributed quantum coordination",
        makeComplexity({ level: "complex", score: 0.8 }),
        DEFAULT_EXPERTISE,
        { prioritizeSpeed: false, prioritizeQuality: false, maxAngles: 2 }
      );

      expect(plan.angleCount).toBe(2);
      expect(plan.recommendedAngles).toHaveLength(2);
      expect(plan.adjustments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ parameter: "angleCount", adjusted: "2" }),
        ])
      );
    });

    it("accepts prioritizeQuality while preserving tier-based model selection", () => {
      const plan = generateExecutionPlan(
        "platform modernization",
        makeComplexity({ level: "moderate", score: 0.6 }),
        DEFAULT_EXPERTISE,
        { prioritizeSpeed: false, prioritizeQuality: true }
      );

      expect(plan.recommendedDepth).toBe("standard");
      expect(plan.modelSelection.generation).toBe("gpt-4o-mini");
      expect(plan.modelSelection.synthesis).toBe("gpt-4o");
    });
  });

  describe("execution history", () => {
    it("returns zeroed statistics when no executions have been recorded", () => {
      expect(getExecutionStats()).toEqual({
        totalExecutions: 0,
        avgCostSavings: 0,
        avgQuality: 0,
        byComplexity: {},
      });
    });

    it("tracks executions and aggregates stats by complexity", () => {
      const simplePlan = generateExecutionPlan(
        "hello",
        makeComplexity({ level: "trivial", score: 0.1 }),
        DEFAULT_EXPERTISE
      );
      const complexPlan = generateExecutionPlan(
        "distributed quantum coordination",
        makeComplexity({ level: "complex", score: 0.8 }),
        DEFAULT_EXPERTISE
      );

      recordExecution(simplePlan, 0, 0.8);
      recordExecution(complexPlan, 1.25, 0.9);

      const stats = getExecutionStats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.avgQuality).toBeCloseTo(0.85);
      expect(stats.avgCostSavings).toBeCloseTo(
        (simplePlan.costSavingsPercent + complexPlan.costSavingsPercent) / 2
      );
      expect(stats.byComplexity.trivial).toEqual(
        expect.objectContaining({ count: 1, avgCost: 0, avgQuality: 0.8 })
      );
      expect(stats.byComplexity.complex).toEqual(
        expect.objectContaining({ count: 1, avgCost: 1.25, avgQuality: 0.9 })
      );
    });

    it("clears execution history between runs", () => {
      const plan = generateExecutionPlan(
        "hello",
        makeComplexity({ level: "trivial", score: 0.1 }),
        DEFAULT_EXPERTISE
      );

      recordExecution(plan, 0, 1);
      expect(getExecutionStats().totalExecutions).toBe(1);

      clearExecutionHistory();

      expect(getExecutionStats().totalExecutions).toBe(0);
    });
  });
});
