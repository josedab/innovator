import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  registerValidator,
  unregisterValidator,
  listValidators,
  clearValidators,
  validateIdea,
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
});
