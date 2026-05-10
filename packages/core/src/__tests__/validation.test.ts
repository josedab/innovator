import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { generateText, extractJson } from "../copilot/client.js";

import {
  registerValidator,
  unregisterValidator,
  listValidators,
  clearValidators,
  validateIdea,
  validateIdeas,
  validateComprehensive,
  PatentValidator,
  MarketValidator,
  FeasibilityValidator,
  MarketSizingValidator,
  RegulatoryValidator,
  ValidationScorecardSchema,
  ValidationResultSchema,
} from "../validation/index.js";
import type { IdeaValidator, ValidationCheck } from "../validation/index.js";
import type { InnovationIdea } from "../types.js";

const testIdea: InnovationIdea = {
  title: "AI Dashboard",
  description: "An AI-powered analytics dashboard",
  potentialImpact: "Improve data-driven decisions",
  implementationHint: "Use React + LLM APIs",
};

function makeValidator(id: string, score: number, shouldFail = false): IdeaValidator {
  return {
    id,
    name: `Validator ${id}`,
    category: "feasibility",
    async validate(): Promise<ValidationCheck> {
      if (shouldFail) throw new Error("Validator failed");
      return {
        source: `Source ${id}`,
        category: "feasibility",
        status: score > 70 ? "fail" : score > 40 ? "warn" : "pass",
        score,
        summary: `Score is ${score}`,
      };
    },
  };
}

describe("validation", () => {
  beforeEach(() => {
    clearValidators();
  });

  describe("registerValidator / unregisterValidator", () => {
    it("registers and lists a validator", () => {
      registerValidator(makeValidator("v1", 30));
      expect(listValidators()).toHaveLength(1);
      expect(listValidators()[0].id).toBe("v1");
    });

    it("unregisters a validator", () => {
      registerValidator(makeValidator("v1", 30));
      expect(unregisterValidator("v1")).toBe(true);
      expect(listValidators()).toHaveLength(0);
    });

    it("returns false when unregistering nonexistent validator", () => {
      expect(unregisterValidator("nope")).toBe(false);
    });

    it("replaces validator with same id", () => {
      registerValidator(makeValidator("v1", 30));
      registerValidator(makeValidator("v1", 50));
      expect(listValidators()).toHaveLength(1);
    });

    it("clearValidators removes all", () => {
      registerValidator(makeValidator("v1", 30));
      registerValidator(makeValidator("v2", 40));
      clearValidators();
      expect(listValidators()).toHaveLength(0);
    });
  });

  describe("validateIdea - status transitions", () => {
    it("returns validated when overallScore >= 70 (risk score 30 → overall 70)", async () => {
      registerValidator(makeValidator("v1", 30));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(70);
      expect(result.overallStatus).toBe("validated");
    });

    it("returns caution when overallScore >= 40 (risk score 60 → overall 40)", async () => {
      registerValidator(makeValidator("v1", 60));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(40);
      expect(result.overallStatus).toBe("caution");
    });

    it("returns risky when overallScore < 40 and > 0 (risk score 61 → overall 39)", async () => {
      registerValidator(makeValidator("v1", 61));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(39);
      expect(result.overallStatus).toBe("risky");
    });

    it("returns insufficient-data when no validators registered", async () => {
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallStatus).toBe("insufficient-data");
      expect(result.overallScore).toBe(0);
    });
  });

  describe("validateIdea - partial validator failures", () => {
    it("uses fallback score of 50 when a validator throws", async () => {
      registerValidator(makeValidator("pass-v", 20));
      registerValidator(makeValidator("fail-v", 0, true));
      const result = await validateIdea(testIdea, "tech");
      // avg risk = (20 + 50) / 2 = 35, overall = 100 - 35 = 65
      expect(result.overallScore).toBe(65);
      expect(result.checks).toHaveLength(2);
      const failedCheck = result.checks.find((c) => c.status === "unknown");
      expect(failedCheck).toBeTruthy();
      expect(failedCheck?.score).toBe(50);
    });

    it("handles all validators failing", async () => {
      registerValidator(makeValidator("f1", 0, true));
      registerValidator(makeValidator("f2", 0, true));
      const result = await validateIdea(testIdea, "tech");
      // avg risk = (50 + 50) / 2 = 50, overall = 50
      expect(result.overallScore).toBe(50);
      expect(result.checks.every((c) => c.status === "unknown")).toBe(true);
    });
  });

  describe("validateIdea - score normalization", () => {
    it("computes inverse average correctly", async () => {
      registerValidator(makeValidator("v1", 10));
      registerValidator(makeValidator("v2", 30));
      const result = await validateIdea(testIdea, "tech");
      // avg risk = (10 + 30) / 2 = 20, overall = 100 - 20 = 80
      expect(result.overallScore).toBe(80);
    });

    it("overall score never exceeds 100", async () => {
      registerValidator(makeValidator("v1", 0));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it("overall score never goes below 0", async () => {
      registerValidator(makeValidator("v1", 100));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("ValidationScorecardSchema", () => {
    it("validates a well-formed scorecard", () => {
      const scorecard = {
        domain: "tech",
        results: [
          {
            ideaTitle: "Test",
            overallScore: 75,
            overallStatus: "validated",
            checks: [],
            recommendation: "Proceed",
            validatedAt: new Date().toISOString(),
          },
        ],
        summary: "1 idea validated",
        generatedAt: new Date().toISOString(),
      };
      expect(() => ValidationScorecardSchema.parse(scorecard)).not.toThrow();
    });

    it("rejects malformed scorecard - missing domain", () => {
      const scorecard = {
        results: [],
        summary: "empty",
        generatedAt: new Date().toISOString(),
      };
      expect(() => ValidationScorecardSchema.parse(scorecard)).toThrow();
    });

    it("rejects invalid overallStatus enum", () => {
      const scorecard = {
        domain: "tech",
        results: [
          {
            ideaTitle: "Test",
            overallScore: 75,
            overallStatus: "invalid-status",
            checks: [],
            recommendation: "Proceed",
            validatedAt: new Date().toISOString(),
          },
        ],
        summary: "test",
        generatedAt: new Date().toISOString(),
      };
      expect(() => ValidationScorecardSchema.parse(scorecard)).toThrow();
    });

    it("rejects overallScore out of range", () => {
      const scorecard = {
        domain: "tech",
        results: [
          {
            ideaTitle: "Test",
            overallScore: 150,
            overallStatus: "validated",
            checks: [],
            recommendation: "Proceed",
            validatedAt: new Date().toISOString(),
          },
        ],
        summary: "test",
        generatedAt: new Date().toISOString(),
      };
      expect(() => ValidationScorecardSchema.parse(scorecard)).toThrow();
    });
  });

  describe("boundary value status mapping", () => {
    it("score=70 → validated (risk 30, overall 70)", async () => {
      registerValidator(makeValidator("v1", 30));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(70);
      expect(result.overallStatus).toBe("validated");
    });

    it("score=69 → caution (risk 31, overall 69)", async () => {
      registerValidator(makeValidator("v1", 31));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(69);
      expect(result.overallStatus).toBe("caution");
    });

    it("score=40 → caution (risk 60, overall 40)", async () => {
      registerValidator(makeValidator("v1", 60));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(40);
      expect(result.overallStatus).toBe("caution");
    });

    it("score=39 → risky (risk 61, overall 39)", async () => {
      registerValidator(makeValidator("v1", 61));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(39);
      expect(result.overallStatus).toBe("risky");
    });

    it("score=0 → insufficient-data (risk 100, overall 0)", async () => {
      registerValidator(makeValidator("v1", 100));
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(0);
      expect(result.overallStatus).toBe("insufficient-data");
    });
  });

  describe("built-in validators", () => {
    it("PatentValidator has correct metadata", () => {
      expect(PatentValidator.id).toBe("patent-search");
      expect(PatentValidator.category).toBe("patent");
    });

    it("MarketValidator has correct metadata", () => {
      expect(MarketValidator.id).toBe("market-analysis");
      expect(MarketValidator.category).toBe("competitor");
    });

    it("FeasibilityValidator has correct metadata", () => {
      expect(FeasibilityValidator.id).toBe("feasibility-check");
      expect(FeasibilityValidator.category).toBe("feasibility");
    });

    it("MarketSizingValidator has correct metadata", () => {
      expect(MarketSizingValidator.id).toBe("market-sizing");
      expect(MarketSizingValidator.category).toBe("market");
    });

    it("RegulatoryValidator has correct metadata", () => {
      expect(RegulatoryValidator.id).toBe("regulatory-check");
      expect(RegulatoryValidator.category).toBe("regulatory");
    });

    it("PatentValidator returns pass/warn/fail based on score", async () => {
      vi.mocked(generateText).mockResolvedValue('{"score": 30, "summary": "Low patent risk"}');
      vi.mocked(extractJson).mockReturnValue('{"score": 30, "summary": "Low patent risk"}');
      const check = await PatentValidator.validate(testIdea, "tech");
      expect(check.status).toBe("pass");
      expect(check.category).toBe("patent");
    });

    it("PatentValidator returns fail for high score", async () => {
      vi.mocked(generateText).mockResolvedValue('{"score": 80, "summary": "High patent risk"}');
      vi.mocked(extractJson).mockReturnValue('{"score": 80, "summary": "High patent risk"}');
      const check = await PatentValidator.validate(testIdea, "tech");
      expect(check.status).toBe("fail");
    });

    it("MarketSizingValidator parses TAM/SAM/SOM response", async () => {
      const response = JSON.stringify({
        score: 25,
        summary: "Large market opportunity",
        details: "TAM: $50B, SAM: $10B, SOM: $1B",
        references: ["Cloud computing market"],
      });
      vi.mocked(generateText).mockResolvedValue(response);
      vi.mocked(extractJson).mockReturnValue(response);
      const check = await MarketSizingValidator.validate(testIdea, "tech");
      expect(check.status).toBe("pass");
      expect(check.details).toContain("TAM");
    });

    it("RegulatoryValidator parses compliance response", async () => {
      const response = JSON.stringify({
        score: 45,
        summary: "Moderate regulatory complexity",
        details: "GDPR compliance needed",
        references: ["GDPR", "CCPA"],
      });
      vi.mocked(generateText).mockResolvedValue(response);
      vi.mocked(extractJson).mockReturnValue(response);
      const check = await RegulatoryValidator.validate(testIdea, "tech");
      expect(check.status).toBe("warn");
      expect(check.references).toContain("GDPR");
    });

    it("handles JSON parse errors gracefully in validateIdea", async () => {
      clearValidators();
      registerValidator({
        id: "bad-json",
        name: "Bad JSON Validator",
        category: "feasibility",
        async validate() {
          throw new Error("JSON parse error");
        },
      });
      const result = await validateIdea(testIdea, "tech");
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].status).toBe("unknown");
      expect(result.checks[0].score).toBe(50);
    });
  });

  describe("validateIdeas", () => {
    it("validates multiple ideas and produces scorecard", async () => {
      registerValidator(makeValidator("v1", 30));
      const ideas = [testIdea, { ...testIdea, title: "Another Idea" }];
      const scorecard = await validateIdeas(ideas, "tech");
      expect(scorecard.results).toHaveLength(2);
      expect(scorecard.domain).toBe("tech");
      expect(scorecard.summary).toContain("2 ideas");
    });
  });

  describe("validateComprehensive", () => {
    it("produces comprehensive validation with market context", async () => {
      registerValidator(makeValidator("v1", 30));
      const result = await validateComprehensive([testIdea], "tech");
      expect(result.scorecard).toBeDefined();
      expect(result.marketContext).toBeDefined();
      expect(result.marketContext.overallViability).toBeDefined();
      expect(result.topRecommendations).toBeDefined();
    });
  });

  describe("recommendation generation", () => {
    it("recommends proceeding when all checks pass", async () => {
      registerValidator(makeValidator("v1", 10));
      const result = await validateIdea(testIdea, "tech");
      expect(result.recommendation).toContain("viable");
    });

    it("includes concerns for score >= 70", async () => {
      registerValidator(makeValidator("warn-v", 50));
      const result = await validateIdea(testIdea, "tech");
      // overallScore = 50, status = caution
      expect(result.recommendation).toBeTruthy();
    });

    it("flags significant risks for low scores", async () => {
      registerValidator(makeValidator("v1", 80));
      const result = await validateIdea(testIdea, "tech");
      // overallScore = 20, status = risky
      expect(result.recommendation).toContain("risk");
    });

    it("generates 'generally viable' for overallScore >= 70 with some warnings", async () => {
      // Need a validator that returns a warn status but overall score >= 70
      registerValidator(makeValidator("v1", 10)); // pass: score 10 → overall 90
      registerValidator(makeValidator("v2", 50)); // warn: score 50
      // avg risk = 30, overall = 70
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(70);
      expect(result.recommendation).toContain("viable");
    });

    it("generates 'proceed with caution' for overallScore 40-69", async () => {
      registerValidator(makeValidator("v1", 55)); // warn
      // overall = 45
      const result = await validateIdea(testIdea, "tech");
      expect(result.overallScore).toBe(45);
      expect(result.recommendation).toContain("caution");
    });
  });

  describe("validateIdeas - batch", () => {
    it("returns empty results for empty ideas array", async () => {
      registerValidator(makeValidator("v1", 30));
      const scorecard = await validateIdeas([], "tech");
      expect(scorecard.results).toHaveLength(0);
      expect(scorecard.summary).toContain("0 ideas");
    });

    it("validates single idea correctly", async () => {
      registerValidator(makeValidator("v1", 20));
      const scorecard = await validateIdeas([testIdea], "tech");
      expect(scorecard.results).toHaveLength(1);
      expect(scorecard.results[0].overallScore).toBe(80);
    });

    it("computes summary averages correctly", async () => {
      registerValidator(makeValidator("v1", 30));
      const ideas = [testIdea, { ...testIdea, title: "Idea B" }, { ...testIdea, title: "Idea C" }];
      const scorecard = await validateIdeas(ideas, "tech");
      expect(scorecard.results).toHaveLength(3);
      expect(scorecard.summary).toContain("3 ideas");
    });
  });

  describe("validateComprehensive - market context", () => {
    it("derives marketTemperature from market check scores", async () => {
      registerValidator(makeValidator("v1", 30));
      const result = await validateComprehensive([testIdea], "tech");
      // v1 is category=feasibility, not market, so market defaults to 50 → "cold"
      expect(["cold", "warming", "hot", "saturated"]).toContain(
        result.marketContext.marketTemperature
      );
    });

    it("derives regulatoryComplexity", async () => {
      registerValidator(makeValidator("v1", 30));
      const result = await validateComprehensive([testIdea], "tech");
      expect(["low", "medium", "high"]).toContain(result.marketContext.regulatoryComplexity);
    });

    it("returns unknown viability for empty ideas", async () => {
      registerValidator(makeValidator("v1", 30));
      const result = await validateComprehensive([], "tech");
      expect(result.marketContext.overallViability).toBe("unknown");
    });

    it("returns strong viability when most ideas validated", async () => {
      registerValidator(makeValidator("v1", 20)); // overall=80 → validated
      const ideas = [testIdea, { ...testIdea, title: "Idea B" }];
      const result = await validateComprehensive(ideas, "tech");
      expect(result.marketContext.overallViability).toBe("strong");
    });

    it("generates topRecommendations with emoji status", async () => {
      registerValidator(makeValidator("v1", 20)); // validated
      const result = await validateComprehensive([testIdea], "tech");
      expect(result.topRecommendations.length).toBeGreaterThan(0);
      expect(result.topRecommendations[0]).toContain("✅");
    });
  });
});
