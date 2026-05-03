import { describe, it, expect } from "vitest";
import {
  OUTPUT_MODES,
  OutputModeSchema,
  OUTPUT_MODE_DEFINITIONS,
  getOutputMode,
  buildExecutivePrompt,
  buildTechnicalPrompt,
  buildPitchPrompt,
  buildResearchPrompt,
  OUTPUT_MODE_PROMPTS,
} from "../prompts/output-modes/index.js";

describe("output-modes", () => {
  // ---- OUTPUT_MODES constant ----

  describe("OUTPUT_MODES", () => {
    it("contains all 4 modes", () => {
      expect(OUTPUT_MODES).toHaveLength(4);
      expect(OUTPUT_MODES).toContain("executive");
      expect(OUTPUT_MODES).toContain("technical");
      expect(OUTPUT_MODES).toContain("pitch");
      expect(OUTPUT_MODES).toContain("research");
    });
  });

  // ---- OutputModeSchema ----

  describe("OutputModeSchema", () => {
    it("validates all valid modes", () => {
      for (const mode of OUTPUT_MODES) {
        expect(OutputModeSchema.parse(mode)).toBe(mode);
      }
    });

    it("rejects invalid mode", () => {
      expect(() => OutputModeSchema.parse("invalid")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => OutputModeSchema.parse("")).toThrow();
    });
  });

  // ---- OUTPUT_MODE_DEFINITIONS ----

  describe("OUTPUT_MODE_DEFINITIONS", () => {
    it("has a definition for each mode", () => {
      expect(OUTPUT_MODE_DEFINITIONS).toHaveLength(4);
      const ids = OUTPUT_MODE_DEFINITIONS.map((d) => d.id);
      for (const mode of OUTPUT_MODES) {
        expect(ids).toContain(mode);
      }
    });

    it("each definition has required fields", () => {
      for (const def of OUTPUT_MODE_DEFINITIONS) {
        expect(def.id).toBeDefined();
        expect(def.name).toBeDefined();
        expect(def.audience).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.icon).toBeDefined();
      }
    });
  });

  // ---- getOutputMode ----

  describe("getOutputMode", () => {
    it("returns definition for each valid mode", () => {
      for (const mode of OUTPUT_MODES) {
        const def = getOutputMode(mode);
        expect(def).toBeDefined();
        expect(def!.id).toBe(mode);
      }
    });

    it("returns undefined for unknown mode", () => {
      expect(getOutputMode("unknown")).toBeUndefined();
    });

    it("returns correct audience for executive", () => {
      const def = getOutputMode("executive");
      expect(def!.audience).toContain("C-suite");
    });
  });

  // ---- Prompt Builders ----

  const sampleSynthesis = JSON.stringify({ topIdeas: [], themes: [], recommendation: "Test rec" });
  const subject = "AI in healthcare";

  describe("buildExecutivePrompt", () => {
    it("includes subject and synthesis", () => {
      const result = buildExecutivePrompt(sampleSynthesis, subject);
      expect(result).toContain(subject);
      expect(result).toContain(sampleSynthesis);
    });

    it("includes executive-specific instructions", () => {
      const result = buildExecutivePrompt(sampleSynthesis, subject);
      expect(result).toContain("executive");
      expect(result).toContain("ROI");
      expect(result).toContain("JSON");
    });

    it("handles empty content", () => {
      const result = buildExecutivePrompt("", subject);
      expect(typeof result).toBe("string");
    });
  });

  describe("buildTechnicalPrompt", () => {
    it("includes subject and synthesis", () => {
      const result = buildTechnicalPrompt(sampleSynthesis, subject);
      expect(result).toContain(subject);
    });

    it("includes technical-specific instructions", () => {
      const result = buildTechnicalPrompt(sampleSynthesis, subject);
      expect(result).toContain("architect");
      expect(result).toContain("architecture");
      expect(result).toContain("JSON");
    });
  });

  describe("buildPitchPrompt", () => {
    it("includes subject and synthesis", () => {
      const result = buildPitchPrompt(sampleSynthesis, subject);
      expect(result).toContain(subject);
    });

    it("includes pitch-specific instructions", () => {
      const result = buildPitchPrompt(sampleSynthesis, subject);
      expect(result).toContain("pitch");
      expect(result).toContain("market");
      expect(result).toContain("JSON");
    });
  });

  describe("buildResearchPrompt", () => {
    it("includes subject and synthesis", () => {
      const result = buildResearchPrompt(sampleSynthesis, subject);
      expect(result).toContain(subject);
    });

    it("includes research-specific instructions", () => {
      const result = buildResearchPrompt(sampleSynthesis, subject);
      expect(result).toContain("research");
      expect(result).toContain("methodology");
      expect(result).toContain("JSON");
    });
  });

  // ---- OUTPUT_MODE_PROMPTS ----

  describe("OUTPUT_MODE_PROMPTS", () => {
    it("has prompt builder for each mode", () => {
      for (const mode of OUTPUT_MODES) {
        expect(typeof OUTPUT_MODE_PROMPTS[mode]).toBe("function");
      }
    });

    it("maps to correct builders", () => {
      expect(OUTPUT_MODE_PROMPTS.executive).toBe(buildExecutivePrompt);
      expect(OUTPUT_MODE_PROMPTS.technical).toBe(buildTechnicalPrompt);
      expect(OUTPUT_MODE_PROMPTS.pitch).toBe(buildPitchPrompt);
      expect(OUTPUT_MODE_PROMPTS.research).toBe(buildResearchPrompt);
    });

    it("each builder returns a string", () => {
      for (const mode of OUTPUT_MODES) {
        const result = OUTPUT_MODE_PROMPTS[mode]("content", "subject");
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
