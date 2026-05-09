import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  runConstraintLadder,
  constraintLadderToMarkdown,
  DIFFICULTY_CONFIGS,
  DIFFICULTY_BADGES,
} from "../constraint-ladder/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("constraint-ladder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DIFFICULTY_CONFIGS", () => {
    it("should define 5 difficulty levels", () => {
      expect(Object.keys(DIFFICULTY_CONFIGS)).toHaveLength(5);
    });

    it("constraint counts should increase with difficulty", () => {
      const counts = Object.values(DIFFICULTY_CONFIGS).map((c) => c.constraintCount);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
      }
    });
  });

  describe("DIFFICULTY_BADGES", () => {
    it("should define badges for all levels", () => {
      expect(Object.keys(DIFFICULTY_BADGES)).toHaveLength(5);
    });
  });

  describe("runConstraintLadder", () => {
    it("should progress through difficulty levels", async () => {
      const constraintResponse = JSON.stringify({
        constraints: [{ type: "budget", description: "Budget halved", severity: 0.5 }],
      });

      const ideaResponse = JSON.stringify({
        ideas: [
          {
            title: "Lean MVP",
            description: "Build minimal version",
            potentialImpact: "Fast validation",
            noveltyScore: 0.7,
            feasibilityScore: 0.8,
            constraintsSatisfied: ["Budget halved"],
            creativeSolution: "Used open source tools",
          },
        ],
      });

      mockGenerateText.mockImplementation(async () => {
        // Alternate between constraint and idea responses
        return mockGenerateText.mock.calls.length % 2 === 1 ? constraintResponse : ideaResponse;
      });

      const result = await runConstraintLadder("AI Assistant", undefined, {
        startLevel: "novice",
        maxLevel: "intermediate",
      });

      expect(result.subject).toBe("AI Assistant");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.totalIdeasGenerated).toBeGreaterThan(0);
    });
  });

  describe("constraintLadderToMarkdown", () => {
    it("should produce markdown", () => {
      const md = constraintLadderToMarkdown({
        subject: "Test",
        steps: [
          {
            level: "novice",
            constraints: [
              {
                id: "c1",
                type: "budget",
                description: "Limited budget",
                severity: 0.3,
                appliedAtLevel: "novice",
              },
            ],
            ideas: [
              {
                title: "Simple Idea",
                description: "desc",
                potentialImpact: "impact",
                noveltyScore: 0.6,
                feasibilityScore: 0.8,
                constraintsSatisfied: ["budget"],
                creativeSolution: "creativity",
              },
            ],
            averageNovelty: 0.6,
            passedThreshold: true,
            badge: "🌱 Seedling Innovator",
          },
        ],
        highestLevelReached: "novice",
        totalIdeasGenerated: 1,
        progressionInsight: "Good progress",
      });

      expect(md).toContain("Constraint Ladder Results");
      expect(md).toContain("NOVICE");
      expect(md).toContain("Simple Idea");
    });
  });
});
