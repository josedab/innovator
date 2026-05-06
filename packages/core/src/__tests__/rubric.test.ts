import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: (s: string) => s,
  sanitizeUserInput: (s: string) => s,
  wrapUserInput: (_label: string, val: string) => val,
}));

import {
  createRubric,
  getRubric,
  listRubrics,
  updateRubric,
  deleteRubric,
  scoreWithRubric,
  clearRubrics,
  BUILT_IN_RUBRICS,
} from "../rubric/index.js";
import type { AngleResult } from "../types.js";

const testDimensions = [
  {
    id: "d1",
    name: "Quality",
    description: "Code quality",
    weight: 0.6,
    minScore: 1,
    maxScore: 10,
  },
  {
    id: "d2",
    name: "Speed",
    description: "Time to market",
    weight: 0.4,
    minScore: 1,
    maxScore: 10,
  },
];

describe("rubric", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRubrics();
  });

  describe("createRubric", () => {
    it("stores and returns rubric with valid dimensions", () => {
      const rubric = createRubric({
        id: "test-rubric",
        name: "Test Rubric",
        description: "For testing",
        dimensions: testDimensions,
        tags: ["test"],
      });

      expect(rubric.id).toBe("test-rubric");
      expect(rubric.name).toBe("Test Rubric");
      expect(rubric.dimensions).toHaveLength(2);
      expect(rubric.createdAt).toBeDefined();
      expect(getRubric("test-rubric")).toBeDefined();
    });

    it("throws when weights do not sum to 1.0", () => {
      expect(() =>
        createRubric({
          id: "bad",
          name: "Bad",
          description: "Bad weights",
          tags: [],
          dimensions: [
            { id: "d1", name: "A", description: "A", weight: 0.3, minScore: 1, maxScore: 10 },
            { id: "d2", name: "B", description: "B", weight: 0.3, minScore: 1, maxScore: 10 },
          ],
        })
      ).toThrow("weights must sum to 1.0");
    });

    it("accepts weights summing to ~1.0 within tolerance", () => {
      const rubric = createRubric({
        id: "close",
        name: "Close",
        description: "Close to 1.0",
        tags: [],
        dimensions: [
          { id: "d1", name: "A", description: "A", weight: 0.505, minScore: 1, maxScore: 10 },
          { id: "d2", name: "B", description: "B", weight: 0.5, minScore: 1, maxScore: 10 },
        ],
      });
      expect(rubric.id).toBe("close");
    });
  });

  describe("getRubric", () => {
    it("returns built-in rubric by ID", () => {
      const rubric = getRubric("regulatory-risk");
      expect(rubric).toBeDefined();
      expect(rubric?.name).toBe("Regulatory Risk Assessment");
    });

    it("returns undefined for non-existent ID", () => {
      expect(getRubric("nonexistent")).toBeUndefined();
    });
  });

  describe("listRubrics", () => {
    it("includes built-in rubrics on initialization", () => {
      const rubrics = listRubrics();
      expect(rubrics.length).toBe(BUILT_IN_RUBRICS.length);
    });

    it("includes custom rubrics after creation", () => {
      createRubric({
        id: "custom",
        name: "Custom",
        description: "Custom rubric",
        tags: [],
        dimensions: testDimensions,
      });
      const rubrics = listRubrics();
      expect(rubrics.length).toBe(BUILT_IN_RUBRICS.length + 1);
    });
  });

  describe("updateRubric", () => {
    it("updates an existing rubric", () => {
      createRubric({
        id: "updatable",
        name: "Old Name",
        description: "Old",
        tags: [],
        dimensions: testDimensions,
      });

      const updated = updateRubric("updatable", { name: "New Name" });
      expect(updated?.name).toBe("New Name");
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(updated!.createdAt);
    });

    it("returns undefined for non-existent rubric", () => {
      expect(updateRubric("nonexistent", { name: "X" })).toBeUndefined();
    });

    it("validates weights on dimension update", () => {
      createRubric({
        id: "val",
        name: "Val",
        description: "Val",
        tags: [],
        dimensions: testDimensions,
      });

      expect(() =>
        updateRubric("val", {
          dimensions: [
            { id: "d1", name: "A", description: "A", weight: 0.1, minScore: 1, maxScore: 10 },
          ],
        })
      ).toThrow("weights must sum to 1.0");
    });
  });

  describe("deleteRubric", () => {
    it("deletes an existing rubric", () => {
      createRubric({
        id: "deletable",
        name: "Del",
        description: "Del",
        tags: [],
        dimensions: testDimensions,
      });
      expect(deleteRubric("deletable")).toBe(true);
      expect(getRubric("deletable")).toBeUndefined();
    });

    it("returns false for non-existent rubric", () => {
      expect(deleteRubric("nonexistent")).toBe(false);
    });
  });

  describe("scoreWithRubric", () => {
    const testAngleResults: AngleResult[] = [
      {
        angleId: "scamper",
        angleName: "SCAMPER",
        reasoning: "Applied SCAMPER",
        ideas: [
          {
            title: "Idea A",
            description: "Description A",
            potentialImpact: "High",
            implementationHint: "Start here",
          },
        ],
      },
    ];

    it("calls LLM and computes weighted scores", async () => {
      const scoreResponse = JSON.stringify({
        scores: [
          {
            ideaTitle: "Idea A",
            angleId: "scamper",
            dimensionScores: [
              {
                dimensionId: "compliance-burden",
                dimensionName: "Compliance Burden",
                score: 8,
                rationale: "Good",
              },
              {
                dimensionId: "regulatory-risk",
                dimensionName: "Regulatory Risk",
                score: 6,
                rationale: "Moderate",
              },
              {
                dimensionId: "data-privacy",
                dimensionName: "Data Privacy Impact",
                score: 7,
                rationale: "OK",
              },
              {
                dimensionId: "market-access",
                dimensionName: "Market Access",
                score: 9,
                rationale: "Excellent",
              },
            ],
            compositeScore: 7.4,
            confidence: 0.85,
            summary: "Overall good performance",
          },
        ],
      });
      mockGenerateText.mockResolvedValue(scoreResponse);
      mockExtractJson.mockReturnValue(scoreResponse);

      const result = await scoreWithRubric("regulatory-risk", "AI Safety", testAngleResults);

      expect(result.rubricId).toBe("regulatory-risk");
      expect(result.rubricName).toBe("Regulatory Risk Assessment");
      expect(result.scores).toHaveLength(1);
      expect(result.scores[0].compositeScore).toBeCloseTo(7.4, 1);
      expect(mockGenerateText).toHaveBeenCalledOnce();
    });

    it("throws on non-existent rubric ID", async () => {
      await expect(scoreWithRubric("nonexistent", "subject", testAngleResults)).rejects.toThrow(
        "Rubric not found"
      );
    });

    it("handles empty angleResults gracefully", async () => {
      const result = await scoreWithRubric("regulatory-risk", "subject", []);
      expect(result.scores).toEqual([]);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });
  });

  describe("built-in rubric initialization", () => {
    it("initializes regulatory-risk rubric", () => {
      const rubric = getRubric("regulatory-risk");
      expect(rubric).toBeDefined();
      expect(rubric?.dimensions).toHaveLength(4);
    });

    it("initializes sustainability-impact rubric", () => {
      const rubric = getRubric("sustainability-impact");
      expect(rubric).toBeDefined();
    });

    it("initializes brand-alignment rubric", () => {
      const rubric = getRubric("brand-alignment");
      expect(rubric).toBeDefined();
    });

    it("clearRubrics re-initializes built-in rubrics", () => {
      deleteRubric("regulatory-risk");
      expect(getRubric("regulatory-risk")).toBeUndefined();
      clearRubrics();
      expect(getRubric("regulatory-risk")).toBeDefined();
    });
  });
});
