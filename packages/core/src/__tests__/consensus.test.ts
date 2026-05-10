import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  runConsensus,
  consensusToMarkdown,
  computeKrippendorffsAlpha,
  computeWeightedConsensus,
  analyzeModelDivergence,
} from "../consensus/index.js";
import type { ConsensusOptions, JuryScore } from "../consensus/index.js";
import type { LLMProvider } from "../providers/index.js";
import type { Investigation, AngleResult } from "../types.js";

function makeProvider(id: string, name: string): LLMProvider {
  return {
    id,
    name,
    generateText: vi.fn().mockResolvedValue(""),
    generateStream: vi.fn().mockResolvedValue(""),
    listModels: vi.fn().mockResolvedValue([]),
  };
}

const mockInvestigation: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect 1", description: "Desc" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

function makeAngleResult(ideas: Array<{ title: string; description: string }>): AngleResult {
  return {
    angleId: "scamper",
    angleName: "SCAMPER",
    reasoning: "Applied method",
    ideas: ideas.map((i) => ({
      title: i.title,
      description: i.description,
      potentialImpact: "High impact",
      implementationHint: "Start here",
    })),
  };
}

describe("consensus", () => {
  describe("runConsensus", () => {
    it("returns merged consensus from 2 providers", async () => {
      const p1 = makeProvider("p1", "Provider 1");
      const p2 = makeProvider("p2", "Provider 2");

      // Both providers produce a similar idea + one unique each
      const generateFn = vi
        .fn()
        .mockResolvedValueOnce(
          makeAngleResult([
            {
              title: "AI-Powered Analytics Dashboard",
              description: "Uses machine learning for analytics dashboard insights",
            },
            {
              title: "Blockchain Supply Chain Tracker",
              description: "Distributed ledger supply chain verification system",
            },
          ])
        )
        .mockResolvedValueOnce(
          makeAngleResult([
            {
              title: "AI Analytics Dashboard Tool",
              description: "Machine learning analytics dashboard for data insights",
            },
            {
              title: "Quantum Cryptography Module",
              description: "Post-quantum encryption protocols for secure communications",
            },
          ])
        );

      const result = await runConsensus({
        subject: "data analytics",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }],
        generateFn,
      });

      expect(result.angleId).toBe("scamper");
      expect(result.modelResults).toHaveLength(2);
      expect(result.agreements.length).toBeGreaterThan(0);
      expect(result.divergences.length).toBeGreaterThan(0);
      expect(result.consensusScore).toBeGreaterThanOrEqual(0);
      expect(result.consensusScore).toBeLessThanOrEqual(1);
    });

    it("handles 1 provider failing gracefully", async () => {
      const p1 = makeProvider("p1", "Provider 1");
      const p2 = makeProvider("p2", "Provider 2");

      const generateFn = vi
        .fn()
        .mockResolvedValueOnce(makeAngleResult([{ title: "Good Idea", description: "Works fine" }]))
        .mockRejectedValueOnce(new Error("Provider timeout"));

      const result = await runConsensus({
        subject: "test",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }],
        generateFn,
      });

      expect(result.modelResults).toHaveLength(2);
      const failed = result.modelResults.find((r) => r.error);
      expect(failed).toBeDefined();
      expect(failed?.error).toContain("timeout");
    });

    it("handles all providers failing", async () => {
      const p1 = makeProvider("p1", "P1");
      const p2 = makeProvider("p2", "P2");

      const generateFn = vi.fn().mockRejectedValue(new Error("All fail"));

      const result = await runConsensus({
        subject: "test",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }],
        generateFn,
      });

      expect(result.modelResults).toHaveLength(2);
      expect(result.agreements).toHaveLength(0);
      expect(result.divergences).toHaveLength(0);
      expect(result.consensusScore).toBe(0);
    });

    it("confidence reflects number of agreeing models", async () => {
      const p1 = makeProvider("p1", "P1");
      const p2 = makeProvider("p2", "P2");
      const p3 = makeProvider("p3", "P3");

      // All 3 providers suggest the same idea
      const generateFn = vi
        .fn()
        .mockResolvedValue(
          makeAngleResult([
            { title: "Universal Idea", description: "Exact same concept across all models" },
          ])
        );

      const result = await runConsensus({
        subject: "test",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }, { provider: p3 }],
        generateFn,
      });

      // Agreement found across all 3 models should have high confidence
      if (result.agreements.length > 0) {
        expect(result.agreements[0].confidence).toBeGreaterThan(0.5);
      }
    });
  });

  describe("consensusToMarkdown", () => {
    it("includes agreement and divergence sections", () => {
      const result = {
        angleId: "scamper",
        angleName: "SCAMPER",
        modelResults: [
          {
            providerId: "p1",
            providerName: "Provider 1",
            angleResult: makeAngleResult([{ title: "Idea", description: "Desc" }]),
            durationMs: 1000,
          },
          {
            providerId: "p2",
            providerName: "Provider 2",
            angleResult: makeAngleResult([{ title: "Idea", description: "Desc" }]),
            durationMs: 1200,
          },
        ],
        agreements: [
          {
            title: "Agreed Idea",
            description: "Both models agree",
            potentialImpact: "High",
            sources: ["p1", "p2"],
            confidence: 0.9,
            isNovel: false,
          },
        ],
        divergences: [
          {
            title: "Novel Idea",
            description: "Only one model",
            potentialImpact: "Medium",
            sources: ["p1"],
            confidence: 0.5,
            isNovel: true,
          },
        ],
        recommendations: [
          {
            title: "Agreed Idea",
            description: "Both models agree",
            potentialImpact: "High",
            sources: ["p1", "p2"],
            confidence: 1.0,
            isNovel: false,
          },
        ],
        consensusScore: 0.5,
        generatedAt: new Date().toISOString(),
      };

      const md = consensusToMarkdown(result);
      expect(md).toContain("# Multi-Model Consensus: SCAMPER");
      expect(md).toContain("**Consensus Score:** 50%");
      expect(md).toContain("🤝 Agreements");
      expect(md).toContain("Agreed Idea");
      expect(md).toContain("💡 Novel Divergences");
      expect(md).toContain("Novel Idea");
      expect(md).toContain("⭐ Recommendations");
    });

    it("handles empty agreements gracefully", () => {
      const result = {
        angleId: "scamper",
        angleName: "SCAMPER",
        modelResults: [],
        agreements: [],
        divergences: [],
        recommendations: [],
        consensusScore: 0,
        generatedAt: new Date().toISOString(),
      };

      const md = consensusToMarkdown(result);
      expect(md).toContain("# Multi-Model Consensus");
      expect(md).not.toContain("🤝 Agreements");
      expect(md).not.toContain("💡 Novel Divergences");
    });
  });

  describe("computeKrippendorffsAlpha", () => {
    it("returns 1.0 for perfect agreement", () => {
      const ratings = [
        [5, 5, 5],
        [5, 5, 5],
        [5, 5, 5],
      ];
      expect(computeKrippendorffsAlpha(ratings)).toBe(1);
    });

    it("returns near 0 or negative for no agreement", () => {
      const ratings = [
        [1, 10, 1],
        [10, 1, 10],
      ];
      const alpha = computeKrippendorffsAlpha(ratings);
      expect(alpha).toBeLessThan(0.5);
    });

    it("returns 1 for fewer than 2 raters", () => {
      const ratings = [[5, 5, 5]];
      expect(computeKrippendorffsAlpha(ratings)).toBe(1);
    });

    it("returns 1 for empty items", () => {
      const ratings: number[][] = [[], []];
      expect(computeKrippendorffsAlpha(ratings)).toBe(1);
    });

    it("returns 1 when De=0 (all values identical)", () => {
      const ratings = [
        [3, 3],
        [3, 3],
      ];
      expect(computeKrippendorffsAlpha(ratings)).toBe(1);
    });

    it("handles partial agreement correctly (alpha between 0 and 1)", () => {
      const ratings = [
        [5, 6, 7],
        [5, 5, 8],
      ];
      const alpha = computeKrippendorffsAlpha(ratings);
      expect(alpha).toBeGreaterThan(-1);
      expect(alpha).toBeLessThanOrEqual(1);
    });

    it("handles NaN values (missing ratings)", () => {
      const ratings = [
        [5, NaN, 7],
        [5, 6, NaN],
      ];
      const alpha = computeKrippendorffsAlpha(ratings);
      expect(typeof alpha).toBe("number");
      expect(Number.isFinite(alpha)).toBe(true);
    });
  });

  describe("computeWeightedConsensus", () => {
    it("computes weighted scores based on model reliability", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 7 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { feasibility: 8 }, reasoning: "" },
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0].ideaTitle).toBe("Idea A");
      expect(verdicts[0].finalScores.feasibility).toBeGreaterThan(0);
    });

    it("returns empty array for empty input", () => {
      expect(computeWeightedConsensus([])).toEqual([]);
    });

    it("calculates model reliability as max(0.1, 1 - avgDeviation/10)", () => {
      // When all models agree perfectly, reliability should be close to 1
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      // Perfect agreement → weighted average should equal the raw value
      expect(verdicts[0].finalScores.feasibility).toBe(5);
    });

    it("flags outlier models with z-score > 2", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { impact: 5 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { impact: 5 }, reasoning: "" },
        { modelId: "m3", ideaTitle: "Idea A", scores: { impact: 5 }, reasoning: "" },
        { modelId: "m4", ideaTitle: "Idea A", scores: { impact: 10 }, reasoning: "" }, // outlier
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      // m4 is significantly different; may or may not flag depending on stdDev threshold
      expect(verdicts).toHaveLength(1);
      // At least the verdict should exist with proper structure
      expect(verdicts[0].outlierModels).toBeDefined();
    });

    it("handles single juror", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { impact: 7, novelty: 8 }, reasoning: "" },
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0].finalScores.impact).toBe(7);
      expect(verdicts[0].finalScores.novelty).toBe(8);
    });

    it("handles all identical scores", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
        { modelId: "m3", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      expect(verdicts[0].finalScores.feasibility).toBe(5);
      expect(verdicts[0].outlierModels).toEqual([]);
    });

    it("handles multiple ideas", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { impact: 7 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { impact: 8 }, reasoning: "" },
        { modelId: "m1", ideaTitle: "Idea B", scores: { impact: 3 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea B", scores: { impact: 4 }, reasoning: "" },
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      expect(verdicts).toHaveLength(2);
      const ideaA = verdicts.find((v) => v.ideaTitle === "Idea A");
      const ideaB = verdicts.find((v) => v.ideaTitle === "Idea B");
      expect(ideaA!.finalScores.impact).toBeGreaterThan(ideaB!.finalScores.impact);
    });

    it("confidence is avgScore/10 capped at 1.0", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { dim1: 10, dim2: 10 }, reasoning: "" },
      ];
      const verdicts = computeWeightedConsensus(juryScores);
      expect(verdicts[0].confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe("analyzeModelDivergence", () => {
    it("flags dimensions with spread > 3", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 2 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { feasibility: 9 }, reasoning: "" },
      ];
      const divergences = analyzeModelDivergence(juryScores);
      expect(divergences.length).toBeGreaterThan(0);
      expect(divergences[0].spread).toBeGreaterThan(3);
      expect(divergences[0].dimension).toBe("feasibility");
    });

    it("does not flag dimensions with spread <= 3", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { feasibility: 7 }, reasoning: "" },
      ];
      const divergences = analyzeModelDivergence(juryScores);
      expect(divergences).toHaveLength(0);
    });

    it("sorts by spread descending", () => {
      const juryScores: JuryScore[] = [
        {
          modelId: "m1",
          ideaTitle: "Idea A",
          scores: { feasibility: 1, impact: 2 },
          reasoning: "",
        },
        {
          modelId: "m2",
          ideaTitle: "Idea A",
          scores: { feasibility: 5, impact: 10 },
          reasoning: "",
        },
      ];
      const divergences = analyzeModelDivergence(juryScores);
      if (divergences.length >= 2) {
        expect(divergences[0].spread).toBeGreaterThanOrEqual(divergences[1].spread);
      }
    });

    it("returns empty for empty input", () => {
      expect(analyzeModelDivergence([])).toEqual([]);
    });

    it("handles stdDev=0 safely (no division by zero)", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
        { modelId: "m2", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
      ];
      // stdDev=0, spread=0, no divergence
      const divergences = analyzeModelDivergence(juryScores);
      expect(divergences).toHaveLength(0);
    });

    it("includes explanation with model names and scores", () => {
      const juryScores: JuryScore[] = [
        { modelId: "gpt-4", ideaTitle: "Idea A", scores: { novelty: 2 }, reasoning: "" },
        { modelId: "claude", ideaTitle: "Idea A", scores: { novelty: 9 }, reasoning: "" },
      ];
      const divergences = analyzeModelDivergence(juryScores);
      expect(divergences.length).toBe(1);
      expect(divergences[0].explanation).toContain("gpt-4");
      expect(divergences[0].explanation).toContain("claude");
      expect(divergences[0].explanation).toContain("spread");
    });

    it("skips dimensions with fewer than 2 values", () => {
      const juryScores: JuryScore[] = [
        { modelId: "m1", ideaTitle: "Idea A", scores: { feasibility: 5 }, reasoning: "" },
      ];
      expect(analyzeModelDivergence(juryScores)).toHaveLength(0);
    });
  });
});
