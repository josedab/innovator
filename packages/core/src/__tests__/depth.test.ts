import { describe, it, expect } from "vitest";
import {
  DepthSchema,
  DEPTH_CONFIGS,
  getDepthConfig,
  buildShallowInvestigationPrompt,
  buildSubTopicPrompt,
  buildDeepDivePrompt,
  buildDeepSynthesisPrompt,
  SubTopicSchema,
  DeepDiveResultSchema,
  suggestDepth,
} from "../depth/index.js";
import type { Depth } from "../depth/index.js";

const fakeInvestigation = {
  summary: "Test summary",
  keyAspects: [{ title: "A1", description: "D1" }],
  currentState: "Current",
  challenges: ["C1"],
  opportunities: ["O1"],
};

describe("depth", () => {
  // ---- DepthSchema ----

  describe("DepthSchema", () => {
    it("validates shallow, standard, deep", () => {
      expect(DepthSchema.parse("shallow")).toBe("shallow");
      expect(DepthSchema.parse("standard")).toBe("standard");
      expect(DepthSchema.parse("deep")).toBe("deep");
    });

    it("rejects invalid strings", () => {
      expect(() => DepthSchema.parse("invalid")).toThrow();
      expect(() => DepthSchema.parse("")).toThrow();
    });

    it("rejects non-string types", () => {
      expect(() => DepthSchema.parse(42)).toThrow();
      expect(() => DepthSchema.parse(undefined)).toThrow();
    });
  });

  // ---- DEPTH_CONFIGS ----

  describe("DEPTH_CONFIGS", () => {
    it("has entries for all depths", () => {
      expect(DEPTH_CONFIGS.shallow).toBeDefined();
      expect(DEPTH_CONFIGS.standard).toBeDefined();
      expect(DEPTH_CONFIGS.deep).toBeDefined();
    });

    it("shallow has 1 estimated call", () => {
      expect(DEPTH_CONFIGS.shallow.estimatedCalls).toBe(1);
    });

    it("deep has multiple estimated calls", () => {
      expect(DEPTH_CONFIGS.deep.estimatedCalls).toBeGreaterThan(1);
    });
  });

  // ---- getDepthConfig ----

  describe("getDepthConfig", () => {
    it("returns correct config for each depth", () => {
      for (const depth of ["shallow", "standard", "deep"] as Depth[]) {
        const config = getDepthConfig(depth);
        expect(config.depth).toBe(depth);
        expect(config.label).toBeDefined();
        expect(config.description).toBeDefined();
      }
    });
  });

  // ---- Prompt Builders ----

  describe("buildShallowInvestigationPrompt", () => {
    it("includes subject", () => {
      expect(buildShallowInvestigationPrompt("AI tools")).toContain("AI tools");
    });

    it("includes JSON format instructions", () => {
      expect(buildShallowInvestigationPrompt("test")).toContain("JSON");
    });

    it("handles empty subject", () => {
      const result = buildShallowInvestigationPrompt("");
      expect(typeof result).toBe("string");
    });
  });

  describe("buildSubTopicPrompt", () => {
    it("includes subject and investigation data", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = buildSubTopicPrompt("AI tools", fakeInvestigation as any);
      expect(result).toContain("AI tools");
      expect(result).toContain("Test summary");
    });
  });

  describe("buildDeepDivePrompt", () => {
    it("includes subject, sub-topic, and rationale", () => {
      const result = buildDeepDivePrompt(
        "AI tools",
        "LLM fine-tuning",
        "Important for customization"
      );
      expect(result).toContain("AI tools");
      expect(result).toContain("LLM fine-tuning");
      expect(result).toContain("Important for customization");
    });
  });

  describe("buildDeepSynthesisPrompt", () => {
    it("includes subject and deep-dive results", () => {
      const deepDives = [
        {
          subTopic: "Fine-tuning",
          findings: "Findings text",
          challenges: ["Ch1"],
          opportunities: ["Op1"],
          keyInsight: "Key insight here",
        },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = buildDeepSynthesisPrompt("AI tools", fakeInvestigation as any, deepDives);
      expect(result).toContain("AI tools");
      expect(result).toContain("Fine-tuning");
      expect(result).toContain("Key insight here");
    });
  });

  // ---- Schemas ----

  describe("SubTopicSchema", () => {
    it("validates correct sub-topics", () => {
      const data = { subTopics: [{ title: "T1", rationale: "R1" }] };
      expect(() => SubTopicSchema.parse(data)).not.toThrow();
    });

    it("rejects empty sub-topics", () => {
      expect(() => SubTopicSchema.parse({ subTopics: [] })).toThrow();
    });
  });

  describe("DeepDiveResultSchema", () => {
    it("validates correct result", () => {
      const data = {
        findings: "Findings",
        additionalChallenges: ["C1"],
        additionalOpportunities: ["O1"],
        keyInsight: "Insight",
      };
      expect(() => DeepDiveResultSchema.parse(data)).not.toThrow();
    });
  });

  // ---- suggestDepth ----

  describe("suggestDepth", () => {
    it("returns shallow for simple short subjects", () => {
      expect(suggestDepth("React hooks")).toBe("shallow");
    });

    it("returns standard for medium complexity", () => {
      const result = suggestDepth("AI ecosystem for enterprise transformation");
      expect(["standard", "deep"]).toContain(result);
    });

    it("returns deep for long subjects (>200 chars)", () => {
      const longSubject = "a".repeat(201);
      expect(suggestDepth(longSubject)).toBe("deep");
    });

    it("returns deep for multi-signal subjects", () => {
      expect(suggestDepth("platform ecosystem and transformation strategy and disruption")).toBe(
        "deep"
      );
    });

    it("returns valid Depth value", () => {
      const result = suggestDepth("anything");
      expect(["shallow", "standard", "deep"]).toContain(result);
    });

    it("handles empty subject", () => {
      const result = suggestDepth("");
      expect(["shallow", "standard", "deep"]).toContain(result);
    });
  });
});
