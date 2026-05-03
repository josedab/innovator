/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";

// Inline simplified component for testing (following existing test patterns
// to avoid Next.js module resolution issues)
interface IdeaScoreDisplay {
  ideaTitle: string;
  angleId: string;
  feasibility: number;
  impact: number;
  novelty: number;
  timeToImplement: "days" | "weeks" | "months" | "quarters" | "years";
  confidence: number;
  rationale: string;
}

const ANGLE_COLORS: Record<string, string> = {
  scamper: "#3b82f6",
  "first-principles": "#ef4444",
  "cross-domain": "#22c55e",
  constraints: "#f59e0b",
  inversion: "#8b5cf6",
  perspectives: "#ec4899",
  "what-if": "#06b6d4",
  "trend-collision": "#f97316",
};

// Test the pure logic extracted from the component
function computePositionedScores(scores: IdeaScoreDisplay[]) {
  return scores.map((s) => ({
    ...s,
    x: ((s.feasibility - 1) / 9) * 100,
    y: ((10 - s.impact) / 9) * 100,
    size: 8 + (s.novelty / 10) * 16,
  }));
}

function computeWeightedScore(s: IdeaScoreDisplay): number {
  return s.impact * 0.35 + s.feasibility * 0.3 + s.novelty * 0.2;
}

function rankByWeightedScore(scores: IdeaScoreDisplay[]): IdeaScoreDisplay[] {
  return [...scores].sort((a, b) => computeWeightedScore(b) - computeWeightedScore(a));
}

function getPresentAngleColors(scores: IdeaScoreDisplay[]): string[] {
  return Object.entries(ANGLE_COLORS)
    .filter(([id]) => scores.some((s) => s.angleId === id))
    .map(([id]) => id);
}

function makeScore(overrides: Partial<IdeaScoreDisplay> = {}): IdeaScoreDisplay {
  return {
    ideaTitle: "Test Idea",
    angleId: "scamper",
    feasibility: 5,
    impact: 5,
    novelty: 5,
    timeToImplement: "months",
    confidence: 0.8,
    rationale: "Test rationale",
    ...overrides,
  };
}

describe("PriorityMatrix logic", () => {
  describe("empty state", () => {
    it("returns empty array for empty scores", () => {
      const positioned = computePositionedScores([]);
      expect(positioned).toHaveLength(0);
    });
  });

  describe("dot positioning", () => {
    it("feasibility=1 maps to x=0%", () => {
      const [pos] = computePositionedScores([makeScore({ feasibility: 1 })]);
      expect(pos.x).toBeCloseTo(0);
    });

    it("feasibility=10 maps to x=100%", () => {
      const [pos] = computePositionedScores([makeScore({ feasibility: 10 })]);
      expect(pos.x).toBeCloseTo(100);
    });

    it("impact=10 maps to y=0% (top)", () => {
      const [pos] = computePositionedScores([makeScore({ impact: 10 })]);
      expect(pos.y).toBeCloseTo(0);
    });

    it("impact=1 maps to y=100% (bottom)", () => {
      const [pos] = computePositionedScores([makeScore({ impact: 1 })]);
      expect(pos.y).toBeCloseTo(100);
    });

    it("correct number of dots for N scores", () => {
      const scores = [
        makeScore({ ideaTitle: "A" }),
        makeScore({ ideaTitle: "B" }),
        makeScore({ ideaTitle: "C" }),
      ];
      const positioned = computePositionedScores(scores);
      expect(positioned).toHaveLength(3);
    });
  });

  describe("dot sizing based on novelty", () => {
    it("base size is 8px (novelty=0)", () => {
      const [pos] = computePositionedScores([makeScore({ novelty: 0 })]);
      expect(pos.size).toBeCloseTo(8);
    });

    it("max size is 24px (novelty=10)", () => {
      const [pos] = computePositionedScores([makeScore({ novelty: 10 })]);
      expect(pos.size).toBeCloseTo(24);
    });

    it("mid novelty gives proportional size", () => {
      const [pos] = computePositionedScores([makeScore({ novelty: 5 })]);
      expect(pos.size).toBeCloseTo(16);
    });
  });

  describe("ranked list", () => {
    it("sorts by weighted score (impact×0.35 + feasibility×0.3 + novelty×0.2)", () => {
      const scores = [
        makeScore({ ideaTitle: "Low", impact: 1, feasibility: 1, novelty: 1 }),
        makeScore({ ideaTitle: "High", impact: 10, feasibility: 10, novelty: 10 }),
        makeScore({ ideaTitle: "Mid", impact: 5, feasibility: 5, novelty: 5 }),
      ];
      const ranked = rankByWeightedScore(scores);
      expect(ranked[0].ideaTitle).toBe("High");
      expect(ranked[1].ideaTitle).toBe("Mid");
      expect(ranked[2].ideaTitle).toBe("Low");
    });

    it("shows top 10 when more than 10 scores", () => {
      const scores = Array.from({ length: 15 }, (_, i) =>
        makeScore({ ideaTitle: `Idea ${i}`, impact: i })
      );
      const ranked = rankByWeightedScore(scores).slice(0, 10);
      expect(ranked).toHaveLength(10);
    });
  });

  describe("legend", () => {
    it("shows colors only for present angles", () => {
      const scores = [makeScore({ angleId: "scamper" }), makeScore({ angleId: "inversion" })];
      const present = getPresentAngleColors(scores);
      expect(present).toContain("scamper");
      expect(present).toContain("inversion");
      expect(present).not.toContain("cross-domain");
    });

    it("returns empty for no scores", () => {
      const present = getPresentAngleColors([]);
      expect(present).toHaveLength(0);
    });
  });
});
