/**
 * Tests for orchestration/builtin-templates — verifies all 5 built-in DSL
 * templates are present with correct structure and metadata.
 */
import { describe, it, expect } from "vitest";
import {
  listBuiltinDSLs,
  getBuiltinDSL,
  QUICK_EXPLORE_DSL,
  DEEP_DIVE_DSL,
  COMPETITIVE_ANALYSIS_DSL,
  PRODUCT_LAUNCH_DSL,
  PATENT_SCAN_DSL,
  BUILTIN_WORKFLOW_DSLS,
} from "../builtin-templates.js";

const TEMPLATE_IDS = [
  "quick-explore",
  "deep-dive",
  "competitive-analysis",
  "product-launch",
  "patent-scan",
];

describe("builtin-templates", () => {
  describe("listBuiltinDSLs", () => {
    it("returns all 5 templates", () => {
      const list = listBuiltinDSLs();
      expect(list).toHaveLength(5);
    });

    it("each entry has id, name, and description", () => {
      const list = listBuiltinDSLs();
      for (const entry of list) {
        expect(entry.id).toEqual(expect.any(String));
        expect(entry.name).toEqual(expect.any(String));
        expect(entry.description).toEqual(expect.any(String));
      }
    });

    it("returns all expected template IDs", () => {
      const list = listBuiltinDSLs();
      const ids = list.map((e) => e.id);
      for (const id of TEMPLATE_IDS) {
        expect(ids).toContain(id);
      }
    });
  });

  describe("getBuiltinDSL", () => {
    it("returns undefined for nonexistent template", () => {
      expect(getBuiltinDSL("nonexistent")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(getBuiltinDSL("")).toBeUndefined();
    });

    it.each(TEMPLATE_IDS)("returns a valid DSL for '%s'", (id) => {
      const dsl = getBuiltinDSL(id);
      expect(dsl).toBeDefined();
      expect(dsl!.name).toEqual(expect.any(String));
      expect(dsl!.version).toBe("1.0.0");
      expect(dsl!.steps.length).toBeGreaterThan(0);
      expect(dsl!.tags).toEqual(expect.any(Array));
    });
  });

  describe("quick-explore template", () => {
    it("has 3 steps: investigate → generate → synthesize", () => {
      expect(QUICK_EXPLORE_DSL.steps).toHaveLength(3);
      expect(QUICK_EXPLORE_DSL.steps[0].type).toBe("investigate");
      expect(QUICK_EXPLORE_DSL.steps[1].type).toBe("generate");
      expect(QUICK_EXPLORE_DSL.steps[2].type).toBe("synthesize");
    });

    it("generate step uses 3 angles", () => {
      const gen = QUICK_EXPLORE_DSL.steps.find((s) => s.id === "generate");
      expect(gen?.angles).toHaveLength(3);
    });
  });

  describe("deep-dive template", () => {
    it("includes debate and human-review steps", () => {
      const types = DEEP_DIVE_DSL.steps.map((s) => s.type);
      expect(types).toContain("debate");
      expect(types).toContain("human-review");
    });

    it("has PRD artifact generation", () => {
      const artifact = DEEP_DIVE_DSL.steps.find((s) => s.type === "artifact");
      expect(artifact).toBeDefined();
      expect(artifact?.config?.type).toBe("prd");
    });

    it("has 5 angles in generate step", () => {
      const gen = DEEP_DIVE_DSL.steps.find((s) => s.id === "generate");
      expect(gen?.angles).toHaveLength(5);
    });
  });

  describe("competitive-analysis template", () => {
    it("includes redteam wargaming step", () => {
      const redteam = COMPETITIVE_ANALYSIS_DSL.steps.find((s) => s.type === "redteam");
      expect(redteam).toBeDefined();
      expect(redteam?.config?.mode).toBe("competitive-response");
    });

    it("has parallel generate steps", () => {
      const generateSteps = COMPETITIVE_ANALYSIS_DSL.steps.filter((s) => s.type === "generate");
      expect(generateSteps.length).toBe(2);
    });
  });

  describe("product-launch template", () => {
    it("includes PRD generation step", () => {
      const prd = PRODUCT_LAUNCH_DSL.steps.find((s) => s.id === "prd");
      expect(prd).toBeDefined();
      expect(prd?.config?.type).toBe("prd");
    });

    it("has human-review step for team sign-off", () => {
      const review = PRODUCT_LAUNCH_DSL.steps.find((s) => s.type === "human-review");
      expect(review).toBeDefined();
      expect(review?.approve?.approvers).toBe(2);
    });

    it("includes filter step with score threshold", () => {
      const filter = PRODUCT_LAUNCH_DSL.steps.find((s) => s.type === "filter");
      expect(filter).toBeDefined();
      expect(filter?.config?.minScore).toBe(65);
    });
  });

  describe("patent-scan template", () => {
    it("includes conditional loop for refinement", () => {
      const condition = PATENT_SCAN_DSL.steps.find((s) => s.type === "condition");
      expect(condition).toBeDefined();
      expect(condition?.then).toContain("synthesize");
      expect(condition?.else).toContain("refine-loop");
    });

    it("has loop step for iterative refinement", () => {
      const loop = PATENT_SCAN_DSL.steps.find((s) => s.type === "loop");
      expect(loop).toBeDefined();
      expect(loop?.repeat?.times).toBe(2);
    });

    it("IP challenge uses patent-challenge mode", () => {
      const challenge = PATENT_SCAN_DSL.steps.find((s) => s.id === "ip-challenge");
      expect(challenge).toBeDefined();
      expect(challenge?.config?.mode).toBe("patent-challenge");
    });
  });

  describe("step type validation", () => {
    const VALID_STEP_TYPES = [
      "investigate",
      "generate",
      "score",
      "redteam",
      "debate",
      "human-review",
      "synthesize",
      "artifact",
      "export",
      "filter",
      "condition",
      "loop",
    ];

    it("all steps across all templates use valid step types", () => {
      for (const [_id, dsl] of Object.entries(BUILTIN_WORKFLOW_DSLS)) {
        for (const step of dsl.steps) {
          expect(VALID_STEP_TYPES).toContain(step.type);
        }
      }
    });

    it("all templates have required metadata fields", () => {
      for (const [_id, dsl] of Object.entries(BUILTIN_WORKFLOW_DSLS)) {
        expect(dsl.name).toEqual(expect.any(String));
        expect(dsl.name.length).toBeGreaterThan(0);
        expect(dsl.description).toEqual(expect.any(String));
        expect(dsl.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(dsl.tags?.length).toBeGreaterThan(0);
      }
    });
  });
});
