import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  evaluateConstraints,
  flattenIdeas,
  parseConstraintString,
  ConstraintSchema,
} from "../constraints/index.js";
import { generateText } from "../copilot/client.js";
import type { Constraint, ConstraintResult } from "../constraints/index.js";

const mockGenerateText = vi.mocked(generateText);

describe("constraints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseConstraintString", () => {
    it("parses != operator", () => {
      const c = parseConstraintString("platform!=mobile");
      expect(c.dimension).toBe("platform");
      expect(c.operator).toBe("not-equals");
      expect(c.value).toBe("mobile");
      expect(c.type).toBe("hard");
    });

    it("parses <= operator", () => {
      const c = parseConstraintString("budget<=50K");
      expect(c.operator).toBe("less-than");
      expect(c.dimension).toBe("budget");
      expect(c.value).toBe("50K");
    });

    it("parses >= operator", () => {
      const c = parseConstraintString("users>=1000");
      expect(c.operator).toBe("greater-than");
      expect(c.dimension).toBe("users");
      expect(c.value).toBe("1000");
    });

    it("parses < operator", () => {
      const c = parseConstraintString("time<3months");
      expect(c.operator).toBe("less-than");
      expect(c.dimension).toBe("time");
      expect(c.value).toBe("3months");
    });

    it("parses > operator", () => {
      const c = parseConstraintString("revenue>1M");
      expect(c.operator).toBe("greater-than");
      expect(c.dimension).toBe("revenue");
      expect(c.value).toBe("1M");
    });

    it("parses = operator", () => {
      const c = parseConstraintString("platform=web");
      expect(c.operator).toBe("equals");
      expect(c.dimension).toBe("platform");
      expect(c.value).toBe("web");
    });

    it("parses ~ operator (contains)", () => {
      const c = parseConstraintString("tech~cloud");
      expect(c.operator).toBe("contains");
      expect(c.value).toBe("cloud");
    });

    it("parses ! operator (excludes)", () => {
      const c = parseConstraintString("scope!legacy");
      expect(c.operator).toBe("excludes");
      expect(c.value).toBe("legacy");
    });

    it("throws for invalid constraint string", () => {
      expect(() => parseConstraintString("invalid")).toThrow("Cannot parse constraint");
      expect(() => parseConstraintString("")).toThrow("Cannot parse constraint");
    });

    it("handles operator precedence: != before =", () => {
      const c = parseConstraintString("x!=y");
      expect(c.operator).toBe("not-equals");
    });

    it("handles operator precedence: <= before <", () => {
      const c = parseConstraintString("x<=y");
      expect(c.operator).toBe("less-than");
    });
  });

  describe("evaluateConstraints", () => {
    it("returns empty result for empty ideas", async () => {
      const result = await evaluateConstraints([], []);
      expect(result.evaluations).toEqual([]);
      expect(result.filteredIdeas).toEqual([]);
      expect(result.summary).toBe("No ideas to evaluate.");
    });

    it("returns all-pass for empty constraints", async () => {
      const ideas = [
        { title: "Idea A", description: "Desc A" },
        { title: "Idea B", description: "Desc B" },
      ];
      const result = await evaluateConstraints(ideas, []);
      expect(result.evaluations).toHaveLength(2);
      expect(result.evaluations[0].passes).toBe(true);
      expect(result.evaluations[0].score).toBe(100);
      expect(result.filteredIdeas).toEqual(["Idea A", "Idea B"]);
      expect(result.summary).toBe("No constraints applied. All ideas pass.");
    });

    it("evaluates with mocked LLM and Zod schema parsing", async () => {
      const mockResult: ConstraintResult = {
        evaluations: [
          {
            ideaTitle: "Idea A",
            passes: true,
            score: 85,
            constraintResults: [
              { dimension: "budget", satisfied: true, explanation: "Under budget" },
            ],
          },
        ],
        filteredIdeas: ["Idea A"],
        rankedIdeas: ["Idea A"],
        summary: "Evaluated",
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(mockResult));

      const constraints: Constraint[] = [
        { type: "hard", dimension: "budget", operator: "less-than", value: "50K" },
      ];
      const result = await evaluateConstraints(
        [{ title: "Idea A", description: "Desc" }],
        constraints
      );
      expect(result.evaluations).toHaveLength(1);
      expect(result.filteredIdeas).toContain("Idea A");
    });
  });

  describe("flattenIdeas", () => {
    it("flattens multiple AngleResults", () => {
      const angleResults = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            { title: "A", description: "Da", potentialImpact: "H", implementationHint: "Do it" },
            { title: "B", description: "Db", potentialImpact: "M", implementationHint: "Try it" },
          ],
          reasoning: "R",
        },
        {
          angleId: "inversion",
          angleName: "Inversion",
          ideas: [
            { title: "C", description: "Dc", potentialImpact: "L", implementationHint: "Start" },
          ],
          reasoning: "R2",
        },
      ];
      const flat = flattenIdeas(angleResults);
      expect(flat).toHaveLength(3);
      expect(flat[0]).toEqual({ title: "A", description: "Da" });
      expect(flat[2]).toEqual({ title: "C", description: "Dc" });
    });

    it("returns empty array for empty input", () => {
      expect(flattenIdeas([])).toEqual([]);
    });
  });

  describe("ConstraintSchema", () => {
    it("validates with optional weight", () => {
      const valid = {
        type: "hard",
        dimension: "budget",
        operator: "less-than",
        value: "50K",
      };
      expect(() => ConstraintSchema.parse(valid)).not.toThrow();
    });

    it("validates with weight provided", () => {
      const valid = {
        type: "soft",
        dimension: "budget",
        operator: "less-than",
        value: "50K",
        weight: 0.8,
      };
      expect(() => ConstraintSchema.parse(valid)).not.toThrow();
    });

    it("rejects invalid type enum", () => {
      expect(() =>
        ConstraintSchema.parse({
          type: "invalid",
          dimension: "d",
          operator: "less-than",
          value: "v",
        })
      ).toThrow();
    });

    it("rejects weight above 1", () => {
      expect(() =>
        ConstraintSchema.parse({
          type: "soft",
          dimension: "budget",
          operator: "less-than",
          value: "50K",
          weight: 1.5,
        })
      ).toThrow();
    });

    it("rejects weight below 0", () => {
      expect(() =>
        ConstraintSchema.parse({
          type: "soft",
          dimension: "budget",
          operator: "less-than",
          value: "50K",
          weight: -0.1,
        })
      ).toThrow();
    });

    it("rejects empty dimension", () => {
      expect(() =>
        ConstraintSchema.parse({
          type: "hard",
          dimension: "",
          operator: "less-than",
          value: "50K",
        })
      ).toThrow();
    });

    it("rejects empty value", () => {
      expect(() =>
        ConstraintSchema.parse({
          type: "hard",
          dimension: "budget",
          operator: "less-than",
          value: "",
        })
      ).toThrow();
    });

    it("rejects missing required fields", () => {
      expect(() => ConstraintSchema.parse({ type: "hard" })).toThrow();
      expect(() => ConstraintSchema.parse({})).toThrow();
    });
  });

  describe("parseConstraintString — whitespace handling", () => {
    it("trims whitespace around dimension and value", () => {
      const c = parseConstraintString("  budget  <  50K  ");
      expect(c.dimension).toBe("budget");
      expect(c.value).toBe("50K");
    });

    it("throws descriptive error for no operator", () => {
      expect(() => parseConstraintString("noop")).toThrow(/Cannot parse constraint.*format/);
    });

    it("throws descriptive error for empty string", () => {
      expect(() => parseConstraintString("")).toThrow(/Cannot parse constraint/);
    });
  });
});
