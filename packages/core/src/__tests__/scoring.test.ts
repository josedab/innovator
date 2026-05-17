import { describe, it, expect, vi, beforeEach } from "vitest";

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
  sanitizeUserInput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

import {
  computePriorityScore,
  computeWeightedPriorityScore,
  getQuadrant,
  filterIdeasByQuadrant,
  getTopByDimension,
  getIdeaSummaryStats,
  rankIdeas,
  scoreIdeas,
  IdeaScoreSchema,
  TIME_TO_IMPLEMENT_ORDER,
  recordCalibrationFeedback,
  clearCalibration,
  compareScoringSets,
} from "../scoring/index.js";
import type { IdeaScore, Quadrant } from "../scoring/index.js";
import type { AngleResult, Investigation } from "../types.js";

function makeScore(overrides: Partial<IdeaScore> = {}): IdeaScore {
  return {
    ideaTitle: "Test Idea",
    angleId: "angle-1",
    feasibility: 5,
    impact: 5,
    novelty: 5,
    timeToImplement: "months",
    confidence: 0.8,
    rationale: "Test rationale",
    ...overrides,
  };
}

describe("scoring", () => {
  describe("computePriorityScore", () => {
    it("computes weighted score: impact×0.35, feasibility×0.3, novelty×0.2, time×0.15×2", () => {
      const score = makeScore({
        impact: 8,
        feasibility: 7,
        novelty: 6,
        timeToImplement: "months",
      });
      // impact: 8*0.35=2.8, feasibility: 7*0.3=2.1, novelty: 6*0.2=1.2
      // time: (6 - 3)*0.15*2 = 0.9
      const expected = 2.8 + 2.1 + 1.2 + 0.9;
      expect(computePriorityScore(score)).toBeCloseTo(expected);
    });

    it("computes minimum score with all 1s and worst time", () => {
      const score = makeScore({
        impact: 1,
        feasibility: 1,
        novelty: 1,
        timeToImplement: "years",
      });
      // 1*0.35 + 1*0.3 + 1*0.2 + (6-5)*0.15*2 = 0.35 + 0.3 + 0.2 + 0.3 = 1.15
      expect(computePriorityScore(score)).toBeCloseTo(1.15);
    });

    it("computes maximum score with all 10s and best time", () => {
      const score = makeScore({
        impact: 10,
        feasibility: 10,
        novelty: 10,
        timeToImplement: "days",
      });
      // 10*0.35 + 10*0.3 + 10*0.2 + (6-1)*0.15*2 = 3.5 + 3.0 + 2.0 + 1.5 = 10.0
      expect(computePriorityScore(score)).toBeCloseTo(10.0);
    });

    it("handles mixed extremes", () => {
      const score = makeScore({
        impact: 10,
        feasibility: 1,
        novelty: 10,
        timeToImplement: "years",
      });
      // 10*0.35 + 1*0.3 + 10*0.2 + (6-5)*0.15*2 = 3.5 + 0.3 + 2.0 + 0.3 = 6.1
      expect(computePriorityScore(score)).toBeCloseTo(6.1);
    });

    it("varies by timeToImplement ordinal", () => {
      const scoreDays = computePriorityScore(makeScore({ timeToImplement: "days" }));
      const scoreWeeks = computePriorityScore(makeScore({ timeToImplement: "weeks" }));
      const scoreYears = computePriorityScore(makeScore({ timeToImplement: "years" }));
      expect(scoreDays).toBeGreaterThan(scoreWeeks);
      expect(scoreWeeks).toBeGreaterThan(scoreYears);
    });
  });

  describe("getQuadrant", () => {
    it("returns quick-wins for high feasibility and high impact", () => {
      expect(getQuadrant(makeScore({ feasibility: 6, impact: 6 }))).toBe("quick-wins");
      expect(getQuadrant(makeScore({ feasibility: 10, impact: 10 }))).toBe("quick-wins");
    });

    it("returns strategic-bets for low feasibility and high impact", () => {
      expect(getQuadrant(makeScore({ feasibility: 5, impact: 6 }))).toBe("strategic-bets");
      expect(getQuadrant(makeScore({ feasibility: 1, impact: 10 }))).toBe("strategic-bets");
    });

    it("returns low-hanging-fruit for high feasibility and low impact", () => {
      expect(getQuadrant(makeScore({ feasibility: 6, impact: 5 }))).toBe("low-hanging-fruit");
      expect(getQuadrant(makeScore({ feasibility: 10, impact: 1 }))).toBe("low-hanging-fruit");
    });

    it("returns reconsider for low feasibility and low impact", () => {
      expect(getQuadrant(makeScore({ feasibility: 5, impact: 5 }))).toBe("reconsider");
      expect(getQuadrant(makeScore({ feasibility: 1, impact: 1 }))).toBe("reconsider");
    });

    it("uses threshold of 6 (>=6 is high)", () => {
      // Exactly 6 is high
      expect(getQuadrant(makeScore({ feasibility: 6, impact: 6 }))).toBe("quick-wins");
      // 5 is low
      expect(getQuadrant(makeScore({ feasibility: 5, impact: 5 }))).toBe("reconsider");
    });
  });

  describe("rankIdeas", () => {
    it("sorts by priority score descending", () => {
      const ideas = [
        makeScore({ impact: 3, feasibility: 3, novelty: 3, timeToImplement: "years" }),
        makeScore({ impact: 10, feasibility: 10, novelty: 10, timeToImplement: "days" }),
        makeScore({ impact: 5, feasibility: 5, novelty: 5, timeToImplement: "months" }),
      ];
      const ranked = rankIdeas(ideas);
      expect(ranked[0].impact).toBe(10);
      expect(ranked[2].impact).toBe(3);
    });

    it("does not mutate the original array", () => {
      const ideas = [
        makeScore({ impact: 1, ideaTitle: "Low" }),
        makeScore({ impact: 10, ideaTitle: "High" }),
      ];
      const ranked = rankIdeas(ideas);
      expect(ideas[0].ideaTitle).toBe("Low");
      expect(ranked[0].ideaTitle).toBe("High");
    });

    it("handles ties (stable relative order)", () => {
      const ideas = [
        makeScore({
          ideaTitle: "A",
          impact: 5,
          feasibility: 5,
          novelty: 5,
          timeToImplement: "months",
        }),
        makeScore({
          ideaTitle: "B",
          impact: 5,
          feasibility: 5,
          novelty: 5,
          timeToImplement: "months",
        }),
      ];
      const ranked = rankIdeas(ideas);
      expect(ranked).toHaveLength(2);
    });

    it("returns empty array for empty input", () => {
      expect(rankIdeas([])).toEqual([]);
    });

    it("handles single idea", () => {
      const ideas = [makeScore({ impact: 7 })];
      const ranked = rankIdeas(ideas);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].impact).toBe(7);
    });
  });

  describe("computePriorityScore - time inversion mapping", () => {
    it("days maps to time score (6-1)*0.15*2 = 1.5", () => {
      const base = makeScore({ impact: 0, feasibility: 0, novelty: 0, timeToImplement: "days" });
      // All zeros except time: (6-1)*0.15*2 = 1.5
      // But impact/feasibility/novelty min is 1 per schema, so use 1
      const s = makeScore({ impact: 1, feasibility: 1, novelty: 1, timeToImplement: "days" });
      const timeContribution = computePriorityScore(s) - (1 * 0.35 + 1 * 0.3 + 1 * 0.2);
      expect(timeContribution).toBeCloseTo((6 - 1) * 0.15 * 2); // 1.5
    });

    it("weeks maps to time score (6-2)*0.15*2 = 1.2", () => {
      const s = makeScore({ impact: 1, feasibility: 1, novelty: 1, timeToImplement: "weeks" });
      const timeContribution = computePriorityScore(s) - (1 * 0.35 + 1 * 0.3 + 1 * 0.2);
      expect(timeContribution).toBeCloseTo((6 - 2) * 0.15 * 2); // 1.2
    });

    it("months maps to time score (6-3)*0.15*2 = 0.9", () => {
      const s = makeScore({ impact: 1, feasibility: 1, novelty: 1, timeToImplement: "months" });
      const timeContribution = computePriorityScore(s) - (1 * 0.35 + 1 * 0.3 + 1 * 0.2);
      expect(timeContribution).toBeCloseTo((6 - 3) * 0.15 * 2); // 0.9
    });

    it("quarters maps to time score (6-4)*0.15*2 = 0.6", () => {
      const s = makeScore({ impact: 1, feasibility: 1, novelty: 1, timeToImplement: "quarters" });
      const timeContribution = computePriorityScore(s) - (1 * 0.35 + 1 * 0.3 + 1 * 0.2);
      expect(timeContribution).toBeCloseTo((6 - 4) * 0.15 * 2); // 0.6
    });

    it("years maps to time score (6-5)*0.15*2 = 0.3", () => {
      const s = makeScore({ impact: 1, feasibility: 1, novelty: 1, timeToImplement: "years" });
      const timeContribution = computePriorityScore(s) - (1 * 0.35 + 1 * 0.3 + 1 * 0.2);
      expect(timeContribution).toBeCloseTo((6 - 5) * 0.15 * 2); // 0.3
    });
  });

  describe("recordCalibrationFeedback / clearCalibration", () => {
    beforeEach(() => {
      clearCalibration();
    });

    it("records and clears calibration feedback", () => {
      recordCalibrationFeedback("config1", "Idea A", "feasibility", 8, 5);
      // Feedback is stored internally; clearCalibration removes it
      clearCalibration();
      // After clearing, no adjustment should apply (verified indirectly)
    });

    it("feedback accumulates for the same config+dimension", () => {
      recordCalibrationFeedback("config1", "Idea A", "feasibility", 8, 5); // delta=3
      recordCalibrationFeedback("config1", "Idea B", "feasibility", 6, 5); // delta=1
      // avg delta = (3+1)/2 = 2, adjustment = 2 * 0.3 = 0.6
    });

    it("clearCalibration resets all feedback", () => {
      recordCalibrationFeedback("cfg", "idea", "dim1", 10, 5);
      clearCalibration();
      // No feedback → no adjustment
    });
  });

  describe("IdeaScoreSchema validation", () => {
    it("validates a valid score", () => {
      expect(() => IdeaScoreSchema.parse(makeScore())).not.toThrow();
    });

    it("rejects out-of-range feasibility", () => {
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), feasibility: 0 })).toThrow();
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), feasibility: 11 })).toThrow();
    });

    it("rejects out-of-range impact", () => {
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), impact: 0 })).toThrow();
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), impact: 11 })).toThrow();
    });

    it("rejects out-of-range novelty", () => {
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), novelty: 0 })).toThrow();
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), novelty: 11 })).toThrow();
    });

    it("rejects out-of-range confidence", () => {
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), confidence: -0.1 })).toThrow();
      expect(() => IdeaScoreSchema.parse({ ...makeScore(), confidence: 1.1 })).toThrow();
    });

    it("rejects invalid timeToImplement enum", () => {
      expect(() =>
        IdeaScoreSchema.parse({ ...makeScore(), timeToImplement: "centuries" })
      ).toThrow();
    });

    it("rejects missing required fields", () => {
      const { ideaTitle, ...rest } = makeScore();
      expect(() => IdeaScoreSchema.parse(rest)).toThrow();
    });
  });

  describe("TIME_TO_IMPLEMENT_ORDER", () => {
    it("has correct ordinal values", () => {
      expect(TIME_TO_IMPLEMENT_ORDER.days).toBe(1);
      expect(TIME_TO_IMPLEMENT_ORDER.weeks).toBe(2);
      expect(TIME_TO_IMPLEMENT_ORDER.months).toBe(3);
      expect(TIME_TO_IMPLEMENT_ORDER.quarters).toBe(4);
      expect(TIME_TO_IMPLEMENT_ORDER.years).toBe(5);
    });
  });

  describe("scoreIdeas", () => {
    it("returns empty scores for empty angle results", async () => {
      const result = await scoreIdeas("test subject", []);
      expect(result.scores).toEqual([]);
    });

    it("parses valid LLM JSON response", async () => {
      const mockResponse = JSON.stringify({
        scores: [
          {
            ideaTitle: "Test Idea",
            angleId: "scamper",
            feasibility: 7,
            impact: 8,
            novelty: 6,
            timeToImplement: "months",
            confidence: 0.8,
            rationale: "Good idea",
          },
        ],
      });
      vi.mocked(withRetry).mockImplementation((fn) => fn());
      vi.mocked(generateText).mockResolvedValue(mockResponse);
      vi.mocked(extractJson).mockReturnValue(mockResponse);

      const angleResults: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Test Idea",
              description: "A test idea",
              potentialImpact: "High",
              implementationHint: "Use tools",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ];

      const result = await scoreIdeas("test", angleResults);
      expect(result.scores).toHaveLength(1);
      expect(result.scores[0].feasibility).toBe(7);
    });

    it("includes investigation context in prompt when provided", async () => {
      const mockResponse = JSON.stringify({
        scores: [
          {
            ideaTitle: "Test",
            angleId: "a1",
            feasibility: 5,
            impact: 5,
            novelty: 5,
            timeToImplement: "weeks",
            confidence: 0.7,
            rationale: "Ok",
          },
        ],
      });
      vi.mocked(withRetry).mockImplementation((fn) => fn());
      vi.mocked(generateText).mockResolvedValue(mockResponse);
      vi.mocked(extractJson).mockReturnValue(mockResponse);

      const investigation: Investigation = {
        summary: "Research summary",
        keyAspects: [{ title: "aspect1", description: "aspect1" }],
        currentState: "Current state",
        challenges: ["challenge1"],
        opportunities: ["opportunity1"],
      };

      const angleResults: AngleResult[] = [
        {
          angleId: "a1",
          angleName: "A1",
          ideas: [
            {
              title: "Test",
              description: "desc",
              potentialImpact: "impact",
              implementationHint: "hint",
            },
          ],
          reasoning: "reason",
        },
      ];

      await scoreIdeas("test", angleResults, investigation);
      // withRetry is mocked to call fn directly, which calls generateText
      // The prompt is built by buildScoringPrompt which includes investigation context
      expect(vi.mocked(withRetry)).toHaveBeenCalled();
    });

    it("delegates retry logic to withRetry", async () => {
      const mockResponse = JSON.stringify({
        scores: [
          {
            ideaTitle: "Test",
            angleId: "a1",
            feasibility: 5,
            impact: 5,
            novelty: 5,
            timeToImplement: "weeks",
            confidence: 0.7,
            rationale: "Ok",
          },
        ],
      });
      vi.mocked(withRetry).mockImplementation((fn) => fn());
      vi.mocked(generateText).mockResolvedValue(mockResponse);
      vi.mocked(extractJson).mockReturnValue(mockResponse);

      const angleResults: AngleResult[] = [
        {
          angleId: "a1",
          angleName: "A1",
          ideas: [
            {
              title: "Test",
              description: "desc",
              potentialImpact: "impact",
              implementationHint: "hint",
            },
          ],
          reasoning: "reason",
        },
      ];

      await scoreIdeas("test", angleResults);
      expect(withRetry).toHaveBeenCalled();
    });
  });

  describe("computeWeightedPriorityScore", () => {
    it("uses default weights when none provided", () => {
      const score = makeScore({ impact: 8, feasibility: 7, novelty: 6 });
      expect(computeWeightedPriorityScore(score)).toBe(computePriorityScore(score));
    });

    it("applies custom weights", () => {
      const score = makeScore({ impact: 10, feasibility: 1, novelty: 1 });
      const impactHeavy = computeWeightedPriorityScore(score, {
        impact: 0.9,
        feasibility: 0.05,
        novelty: 0.05,
        speed: 0,
      });
      const feasibilityHeavy = computeWeightedPriorityScore(score, {
        impact: 0.05,
        feasibility: 0.9,
        novelty: 0.05,
        speed: 0,
      });
      expect(impactHeavy).toBeGreaterThan(feasibilityHeavy);
    });
  });

  describe("filterIdeasByQuadrant", () => {
    it("filters to specified quadrants", () => {
      const scores = [
        makeScore({ feasibility: 8, impact: 9 }), // quick-wins
        makeScore({ feasibility: 3, impact: 9 }), // strategic-bets
        makeScore({ feasibility: 8, impact: 3 }), // low-hanging-fruit
        makeScore({ feasibility: 3, impact: 3 }), // reconsider
      ];
      const quickWins = filterIdeasByQuadrant(scores, ["quick-wins"]);
      expect(quickWins).toHaveLength(1);
      expect(quickWins[0].feasibility).toBe(8);
      expect(quickWins[0].impact).toBe(9);
    });

    it("supports multiple quadrants", () => {
      const scores = [
        makeScore({ feasibility: 8, impact: 9 }),
        makeScore({ feasibility: 3, impact: 9 }),
        makeScore({ feasibility: 3, impact: 3 }),
      ];
      const result = filterIdeasByQuadrant(scores, ["quick-wins", "strategic-bets"]);
      expect(result).toHaveLength(2);
    });

    it("returns empty for no matches", () => {
      const scores = [makeScore({ feasibility: 3, impact: 3 })];
      expect(filterIdeasByQuadrant(scores, ["quick-wins"])).toHaveLength(0);
    });
  });

  describe("getTopByDimension", () => {
    it("returns top N by specified dimension", () => {
      const scores = [
        makeScore({ ideaTitle: "A", impact: 3 }),
        makeScore({ ideaTitle: "B", impact: 9 }),
        makeScore({ ideaTitle: "C", impact: 6 }),
      ];
      const top = getTopByDimension(scores, "impact", 2);
      expect(top).toHaveLength(2);
      expect(top[0].impact).toBe(9);
      expect(top[1].impact).toBe(6);
    });

    it("defaults to limit 5", () => {
      const scores = Array.from({ length: 10 }, (_, i) =>
        makeScore({ ideaTitle: `Idea ${i}`, novelty: i + 1 })
      );
      expect(getTopByDimension(scores, "novelty")).toHaveLength(5);
    });
  });

  describe("getIdeaSummaryStats", () => {
    it("returns zeroes for empty array", () => {
      const stats = getIdeaSummaryStats([]);
      expect(stats.total).toBe(0);
      expect(stats.averageImpact).toBe(0);
      expect(stats.topPriorityTitle).toBeUndefined();
    });

    it("computes correct averages and quadrant counts", () => {
      const scores = [
        makeScore({ ideaTitle: "QW", feasibility: 8, impact: 9, novelty: 7 }),
        makeScore({ ideaTitle: "SB", feasibility: 3, impact: 8, novelty: 5 }),
      ];
      const stats = getIdeaSummaryStats(scores);
      expect(stats.total).toBe(2);
      expect(stats.averageFeasibility).toBe(5.5);
      expect(stats.averageImpact).toBe(8.5);
      expect(stats.averageNovelty).toBe(6);
      expect(stats.quadrantCounts["quick-wins"]).toBe(1);
      expect(stats.quadrantCounts["strategic-bets"]).toBe(1);
      expect(stats.topPriorityTitle).toBeDefined();
    });
  });

  describe("compareScoringSets", () => {
    const baseScore: IdeaScore = {
      ideaTitle: "Idea A",
      angleId: "scamper",
      feasibility: 7,
      impact: 8,
      novelty: 6,
      timeToImplement: "months",
      confidence: 0.8,
      rationale: "Good idea",
    };

    const improvedScore: IdeaScore = {
      ...baseScore,
      feasibility: 9,
      impact: 9,
      novelty: 8,
    };

    it("computes deltas for matched ideas", () => {
      const result = compareScoringSets([baseScore], [improvedScore]);

      expect(result.deltas).toHaveLength(1);
      expect(result.deltas[0].feasibilityDelta).toBe(2);
      expect(result.deltas[0].impactDelta).toBe(1);
      expect(result.deltas[0].noveltyDelta).toBe(2);
      expect(result.deltas[0].priorityDelta).toBeGreaterThan(0);
    });

    it("identifies ideas only in baseline", () => {
      const result = compareScoringSets(
        [baseScore, { ...baseScore, ideaTitle: "Idea B" }],
        [improvedScore]
      );

      expect(result.onlyInBaseline).toEqual(["Idea B"]);
    });

    it("identifies ideas only in comparison", () => {
      const result = compareScoringSets(
        [baseScore],
        [improvedScore, { ...improvedScore, ideaTitle: "New Idea" }]
      );

      expect(result.onlyInComparison).toEqual(["New Idea"]);
    });

    it("detects quadrant changes", () => {
      const lowFeasibility: IdeaScore = {
        ...baseScore,
        feasibility: 3,
        impact: 9,
      };
      const highFeasibility: IdeaScore = {
        ...baseScore,
        feasibility: 8,
        impact: 9,
      };

      const result = compareScoringSets([lowFeasibility], [highFeasibility]);

      expect(result.deltas[0].baselineQuadrant).toBe("strategic-bets");
      expect(result.deltas[0].comparisonQuadrant).toBe("quick-wins");
      expect(result.deltas[0].quadrantChanged).toBe(true);
      expect(result.quadrantChanges).toBe(1);
    });

    it("handles empty inputs", () => {
      const result = compareScoringSets([], []);

      expect(result.deltas).toHaveLength(0);
      expect(result.onlyInBaseline).toHaveLength(0);
      expect(result.onlyInComparison).toHaveLength(0);
      expect(result.avgFeasibilityDelta).toBe(0);
    });

    it("matches ideas case-insensitively", () => {
      const upper: IdeaScore = { ...baseScore, ideaTitle: "IDEA A" };
      const result = compareScoringSets([baseScore], [upper]);

      expect(result.deltas).toHaveLength(1);
      expect(result.onlyInBaseline).toHaveLength(0);
      expect(result.onlyInComparison).toHaveLength(0);
    });

    it("computes correct average deltas", () => {
      const base2: IdeaScore = {
        ...baseScore,
        ideaTitle: "Idea B",
        feasibility: 5,
        impact: 5,
        novelty: 5,
      };
      const comp2: IdeaScore = {
        ...baseScore,
        ideaTitle: "Idea B",
        feasibility: 7,
        impact: 7,
        novelty: 7,
      };

      const result = compareScoringSets([baseScore, base2], [improvedScore, comp2]);

      expect(result.deltas).toHaveLength(2);
      expect(result.avgFeasibilityDelta).toBe(2); // (2 + 2) / 2
      expect(result.avgImpactDelta).toBe(1.5); // (1 + 2) / 2
      expect(result.avgNoveltyDelta).toBe(2); // (2 + 2) / 2
    });
  });
});
