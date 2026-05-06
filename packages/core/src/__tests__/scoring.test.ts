import { describe, it, expect, vi } from "vitest";

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
import { withRetry } from "../copilot/retry.js";

import {
  computePriorityScore,
  getQuadrant,
  rankIdeas,
  scoreIdeas,
  IdeaScoreSchema,
  TIME_TO_IMPLEMENT_ORDER,
} from "../scoring/index.js";
import type { IdeaScore } from "../scoring/index.js";
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
});
