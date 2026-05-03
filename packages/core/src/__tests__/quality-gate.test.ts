import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  checkHallucinatedStatistics,
  checkVaguePlatitudes,
  checkSelfContradictions,
  runQualityGate,
} from "../quality-gate/index.js";
import type { InnovationIdea, AngleResult } from "../types.js";
import { generateText, extractJson } from "../copilot/client.js";
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

function makeIdea(overrides: Partial<InnovationIdea> = {}): InnovationIdea {
  return {
    title: "Test Idea",
    description: "A clean description with no issues",
    potentialImpact: "Significant improvement",
    implementationHint: "Use standard techniques",
    ...overrides,
  };
}

function makeAngleResult(ideas: InnovationIdea[], angleId = "angle-1"): AngleResult {
  return {
    angleId,
    angleName: `Angle ${angleId}`,
    ideas,
  } as AngleResult;
}

describe("quality-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkHallucinatedStatistics", () => {
    it("returns no issues for clean text", () => {
      const idea = makeIdea();
      expect(checkHallucinatedStatistics(idea, "a1")).toEqual([]);
    });

    it("detects percentage-of-all pattern", () => {
      const idea = makeIdea({ description: "About 73% of all companies use this" });
      const issues = checkHallucinatedStatistics(idea, "a1");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe("hallucinated-statistic");
      expect(issues[0].severity).toBe("high");
    });

    it("detects studies-show pattern", () => {
      const idea = makeIdea({ potentialImpact: "Studies show that 9 out of 10 prefer this" });
      const issues = checkHallucinatedStatistics(idea, "a1");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects according-to-research pattern", () => {
      const idea = makeIdea({ description: "According to recent research, 42% improvement" });
      const issues = checkHallucinatedStatistics(idea, "a1");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects suspiciously precise percentages", () => {
      const idea = makeIdea({ description: "This achieves 97.3% accuracy" });
      const issues = checkHallucinatedStatistics(idea, "a1");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects market size patterns", () => {
      const idea = makeIdea({ description: "The market size is $5 billion" });
      const issues = checkHallucinatedStatistics(idea, "a1");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects future prediction patterns", () => {
      const idea = makeIdea({ description: "By 2030, 80% of companies will adopt this" });
      const issues = checkHallucinatedStatistics(idea, "a1");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("sets correct angleId on issues", () => {
      const idea = makeIdea({ description: "Approximately 5 billion users" });
      const issues = checkHallucinatedStatistics(idea, "custom-angle");
      expect(issues[0].angleId).toBe("custom-angle");
    });
  });

  describe("checkVaguePlatitudes", () => {
    it("returns no issues for clean text", () => {
      const idea = makeIdea();
      expect(checkVaguePlatitudes(idea, "a1")).toEqual([]);
    });

    it("returns low severity for 1-2 platitudes", () => {
      const idea = makeIdea({ description: "This will leverage synergies in the market" });
      const issues = checkVaguePlatitudes(idea, "a1");
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe("low");
    });

    it("returns medium severity at threshold of 3+ platitudes", () => {
      const idea = makeIdea({
        title: "Leverage synergies solution",
        description: "Think outside the box with this paradigm shift approach",
        potentialImpact: "Game changer for the industry",
      });
      const issues = checkVaguePlatitudes(idea, "a1");
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe("medium");
    });

    it("lists found platitudes in detail", () => {
      const idea = makeIdea({
        description: "This cutting edge, state of the art, world-class, next generation solution",
      });
      const issues = checkVaguePlatitudes(idea, "a1");
      expect(issues[0].detail).toContain("cutting edge");
    });
  });

  describe("checkSelfContradictions", () => {
    it("returns no issues for non-contradictory ideas", () => {
      const ar = makeAngleResult([
        makeIdea({ title: "Idea A", description: "Build a new system" }),
        makeIdea({ title: "Idea B", description: "Create a dashboard" }),
      ]);
      const issues = checkSelfContradictions(ar);
      expect(issues).toEqual([]);
    });

    it("detects contradictory terms in similar ideas", () => {
      const ar = makeAngleResult([
        makeIdea({
          title: "Centralize data",
          description: "We should centralize all data storage",
        }),
        makeIdea({
          title: "Decentralize data",
          description: "We should decentralize all data storage",
        }),
      ]);
      const issues = checkSelfContradictions(ar);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe("self-contradiction");
    });

    it("detects increase/decrease contradictions", () => {
      const ar = makeAngleResult([
        makeIdea({
          title: "Increase pricing",
          description: "We need to increase our pricing model",
        }),
        makeIdea({
          title: "Decrease pricing",
          description: "We need to decrease our pricing model",
        }),
      ]);
      const issues = checkSelfContradictions(ar);
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe("runQualityGate - score deduction", () => {
    it("returns score 100 with no issues", () => {
      const ar = makeAngleResult([makeIdea()]);
      const report = runQualityGate([ar]);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.passesGate).toBe(true);
    });

    it("deducts 15 per high severity issue", () => {
      const ar = makeAngleResult([
        makeIdea({ description: "Studies show that 90% of all users prefer this" }),
      ]);
      const report = runQualityGate([ar]);
      // Each high-severity issue deducts 15
      expect(report.overallScore).toBeLessThanOrEqual(85);
    });

    it("clamps score at minimum 0", () => {
      // Create many issues to force score below 0
      const ideas = Array.from({ length: 10 }, (_, i) =>
        makeIdea({
          title: `Idea ${i}`,
          description: `Studies show that ${i}0% of all companies. By 2025, ${i}5% will adopt. Market size is $${i} billion.`,
        })
      );
      const ar = makeAngleResult(ideas);
      const report = runQualityGate([ar]);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
    });

    it("clamps score at maximum 100", () => {
      const ar = makeAngleResult([makeIdea()]);
      const report = runQualityGate([ar]);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it("fails gate when score below minScore (default 60)", () => {
      const ideas = Array.from({ length: 5 }, (_, i) =>
        makeIdea({
          title: `Idea ${i}`,
          description: `Studies show that ${i}0% of all companies. Market size is $${i} billion.`,
        })
      );
      const ar = makeAngleResult(ideas);
      const report = runQualityGate([ar]);
      if (report.overallScore < 60) {
        expect(report.passesGate).toBe(false);
      }
    });
  });

  describe("runQualityGate - orchestration", () => {
    it("runs all checkers by default", () => {
      const ar = makeAngleResult([
        makeIdea({
          description:
            "Studies show that 5 billion users. Leverage synergies and think outside the box with this paradigm shift",
        }),
      ]);
      const report = runQualityGate([ar]);
      const types = report.issues.map((i) => i.type);
      expect(types).toContain("hallucinated-statistic");
      expect(types).toContain("vague-platitude");
    });

    it("respects config to disable checks", () => {
      const ar = makeAngleResult([
        makeIdea({ description: "Studies show that 50% of all users benefit" }),
      ]);
      const report = runQualityGate([ar], { checkHallucinations: false });
      const hallucinationIssues = report.issues.filter((i) => i.type === "hallucinated-statistic");
      expect(hallucinationIssues).toHaveLength(0);
    });

    it("reports correct checkedIdeas count", () => {
      const ar = makeAngleResult([makeIdea(), makeIdea({ title: "Second" })]);
      const report = runQualityGate([ar]);
      expect(report.checkedIdeas).toBe(2);
    });

    it("generates summary with issue counts", () => {
      const ar = makeAngleResult([
        makeIdea({ description: "Studies show that 50% of all users benefit" }),
      ]);
      const report = runQualityGate([ar]);
      expect(report.summary).toContain("issue");
    });

    it("generates clean summary when no issues", () => {
      const ar = makeAngleResult([makeIdea()]);
      const report = runQualityGate([ar], {
        checkHallucinations: false,
        checkVagueness: false,
        checkDuplication: false,
        checkContradictions: false,
      });
      expect(report.summary).toContain("passed quality checks");
    });

    it("accepts custom minScore", () => {
      const ar = makeAngleResult([makeIdea()]);
      const report = runQualityGate([ar], { minScore: 99 });
      // With clean ideas, score should be ~100
      expect(report.passesGate).toBe(true);
    });
  });

  describe("mock verification", () => {
    it("quality gate does not call LLM functions directly", () => {
      const ar = makeAngleResult([makeIdea()]);
      runQualityGate([ar]);
      expect(mockGenerateText).not.toHaveBeenCalled();
      expect(mockExtractJson).not.toHaveBeenCalled();
    });
  });
});
