import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  generateCoachingPrompts,
  generateLearningPath,
  mapGapsToFeatures,
  completeStep,
  validateMaturityLevel,
  computeCompletionAnalytics,
} from "../maturity-assessment/learning-paths.js";

describe("maturity-assessment/learning-paths", () => {
  describe("generateCoachingPrompts", () => {
    it("generates coaching prompts for a dimension", () => {
      const prompts = generateCoachingPrompts("strategy", 2);
      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].dimension).toBe("strategy");
      expect(prompts[0].prompt.length).toBeGreaterThan(0);
    });

    it("returns prompts with suggested actions", () => {
      const prompts = generateCoachingPrompts("metrics", 1);
      for (const prompt of prompts) {
        expect(prompt.suggestedAction).toBeDefined();
        expect(prompt.feature).toBeDefined();
      }
    });

    it("handles unknown dimension gracefully", () => {
      const prompts = generateCoachingPrompts("unknown-dimension", 1);
      expect(prompts).toHaveLength(0);
    });
  });

  describe("generateLearningPath", () => {
    it("generates a learning path for a gap", () => {
      const path = generateLearningPath("process", 1, 3);
      expect(path.dimension).toBe("process");
      expect(path.currentLevel).toBe(1);
      expect(path.targetLevel).toBe(3);
      expect(path.steps.length).toBeGreaterThan(0);
      expect(path.progress).toBe(0);
    });

    it("generates fallback step for unknown dimension", () => {
      const path = generateLearningPath("unknown", 1, 2);
      expect(path.steps.length).toBe(1);
      expect(path.steps[0].difficulty).toBe("beginner");
    });
  });

  describe("mapGapsToFeatures", () => {
    it("maps dimension gaps to features", () => {
      const mappings = mapGapsToFeatures([
        { dimension: "strategy", score: 2, benchmark: 4 },
        { dimension: "metrics", score: 1, benchmark: 3 },
      ]);
      expect(mappings).toHaveLength(2);
      expect(mappings[0].gap).toBeGreaterThan(0);
      expect(mappings[0].features.length).toBeGreaterThan(0);
    });

    it("ignores dimensions at or above benchmark", () => {
      const mappings = mapGapsToFeatures([{ dimension: "strategy", score: 5, benchmark: 4 }]);
      expect(mappings).toHaveLength(0);
    });

    it("sorts by gap size descending", () => {
      const mappings = mapGapsToFeatures([
        { dimension: "strategy", score: 3, benchmark: 4 },
        { dimension: "metrics", score: 1, benchmark: 4 },
      ]);
      expect(mappings[0].gap).toBeGreaterThanOrEqual(mappings[1].gap);
    });
  });

  describe("completeStep", () => {
    it("marks a step as completed and updates progress", () => {
      const path = generateLearningPath("culture", 1, 3);
      expect(path.progress).toBe(0);

      if (path.steps.length > 0) {
        const updated = completeStep(path, path.steps[0].id);
        expect(updated.steps[0].completed).toBe(true);
        expect(updated.progress).toBeGreaterThan(0);
      }
    });
  });

  describe("validateMaturityLevel", () => {
    it("validates a self-assessed level against evidence", () => {
      const result = validateMaturityLevel("process", 3, [
        { type: "session_count", value: 20 },
        { type: "feature_usage", value: 6 },
      ]);
      expect(result.dimension).toBe("process");
      expect(result.claimedLevel).toBe(3);
      expect(result.validatedLevel).toBeGreaterThanOrEqual(1);
      expect(result.evidenceItems.length).toBeGreaterThan(0);
    });

    it("detects gaps when evidence is insufficient", () => {
      const result = validateMaturityLevel("culture", 4, [
        { type: "team_participation", value: 2 },
        { type: "idea_count", value: 5 },
      ]);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.validatedLevel).toBeLessThan(4);
    });

    it("validates level 1 with minimal evidence", () => {
      const result = validateMaturityLevel("strategy", 1, []);
      expect(result.validatedLevel).toBe(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe("computeCompletionAnalytics", () => {
    it("computes analytics for multiple paths", () => {
      const path1 = generateLearningPath("process", 1, 3);
      const path2 = generateLearningPath("culture", 1, 3);
      if (path1.steps.length > 0) completeStep(path1, path1.steps[0].id);

      const analytics = computeCompletionAnalytics([path1, path2]);
      expect(analytics.totalPaths).toBe(2);
      expect(analytics.completedSteps).toBeGreaterThanOrEqual(1);
      expect(analytics.stepCompletionRate).toBeGreaterThan(0);
      expect(analytics.byDimension).toHaveLength(2);
    });

    it("returns empty analytics for no paths", () => {
      const analytics = computeCompletionAnalytics([]);
      expect(analytics.totalPaths).toBe(0);
      expect(analytics.averageProgress).toBe(0);
    });
  });
});
