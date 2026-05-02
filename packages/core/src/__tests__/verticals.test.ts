import { describe, it, expect, beforeEach } from "vitest";
import {
  getVerticalPack,
  listVerticalPacks,
  registerVerticalPack,
  unregisterVerticalPack,
  loadVerticalPackFromJson,
  getVerticalPromptContext,
  validateIdeaForVertical,
  searchVerticalPacks,
  resetVerticalPacks,
  HEALTHTECH_PACK,
  FINTECH_PACK,
  EDTECH_PACK,
  CLEANTECH_PACK,
  GOVTECH_PACK,
} from "../verticals/index.js";

describe("verticals", () => {
  beforeEach(() => {
    resetVerticalPacks();
  });

  describe("built-in packs", () => {
    it("includes 5 built-in packs", () => {
      expect(listVerticalPacks()).toHaveLength(5);
    });

    it("retrieves HealthTech pack by ID", () => {
      const pack = getVerticalPack("healthtech");
      expect(pack).toBeDefined();
      expect(pack!.name).toBe("HealthTech");
      expect(pack!.angles.length).toBeGreaterThan(0);
      expect(pack!.regulatoryContext.length).toBeGreaterThan(0);
    });

    it("retrieves FinTech pack by ID", () => {
      const pack = getVerticalPack("fintech");
      expect(pack).toBeDefined();
      expect(pack!.name).toBe("FinTech");
    });

    it("each built-in pack has valid structure", () => {
      for (const pack of [
        HEALTHTECH_PACK,
        FINTECH_PACK,
        EDTECH_PACK,
        CLEANTECH_PACK,
        GOVTECH_PACK,
      ]) {
        expect(pack.id).toBeTruthy();
        expect(pack.name).toBeTruthy();
        expect(pack.version).toBe("1.0.0");
        expect(pack.angles.length).toBeGreaterThan(0);
        expect(pack.keywords.length).toBeGreaterThan(0);
      }
    });
  });

  describe("custom packs", () => {
    it("registers a custom pack", () => {
      registerVerticalPack({
        id: "custom-pack",
        name: "Custom Pack",
        description: "A test pack",
        industry: "Testing",
        version: "1.0.0",
        angles: [],
        regulatoryContext: [],
        marketData: [],
        validationRules: [],
        keywords: ["test"],
      });
      expect(getVerticalPack("custom-pack")).toBeDefined();
      expect(listVerticalPacks()).toHaveLength(6);
    });

    it("unregisters a pack", () => {
      expect(unregisterVerticalPack("healthtech")).toBe(true);
      expect(getVerticalPack("healthtech")).toBeUndefined();
      expect(listVerticalPacks()).toHaveLength(4);
    });

    it("returns false when unregistering non-existent pack", () => {
      expect(unregisterVerticalPack("nonexistent")).toBe(false);
    });

    it("loads a pack from JSON", () => {
      const json = {
        id: "json-pack",
        name: "JSON Pack",
        description: "Loaded from JSON",
        industry: "Testing",
        version: "0.1.0",
        angles: [],
        regulatoryContext: [],
        marketData: [],
        validationRules: [],
        keywords: [],
      };
      const pack = loadVerticalPackFromJson(json);
      expect(pack.id).toBe("json-pack");
    });

    it("rejects invalid pack JSON", () => {
      expect(() => loadVerticalPackFromJson({ id: 123 })).toThrow();
    });
  });

  describe("getVerticalPromptContext", () => {
    it("returns prompt context with regulatory and market data", () => {
      const context = getVerticalPromptContext("healthtech");
      expect(context).toBeDefined();
      expect(context).toContain("HIPAA");
      expect(context).toContain("REGULATORY REQUIREMENTS");
      expect(context).toContain("MARKET CONTEXT");
    });

    it("returns undefined for unknown pack", () => {
      expect(getVerticalPromptContext("unknown")).toBeUndefined();
    });
  });

  describe("searchVerticalPacks", () => {
    it("searches by keyword", () => {
      const results = searchVerticalPacks({ keyword: "payments" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("fintech");
    });

    it("searches by industry", () => {
      const results = searchVerticalPacks({ industry: "Healthcare" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("healthtech");
    });

    it("returns empty for no match", () => {
      expect(searchVerticalPacks({ keyword: "quantum-physics" })).toHaveLength(0);
    });
  });

  describe("validateIdeaForVertical", () => {
    it("returns valid for unknown pack", () => {
      const result = validateIdeaForVertical("some idea", "unknown");
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("resetVerticalPacks", () => {
    it("restores built-in packs after custom registration", () => {
      registerVerticalPack({
        id: "temp-pack",
        name: "Temp",
        description: "Temporary",
        industry: "Test",
        version: "1.0.0",
        angles: [],
        regulatoryContext: [],
        marketData: [],
        validationRules: [],
        keywords: [],
      });
      expect(listVerticalPacks()).toHaveLength(6);
      resetVerticalPacks();
      expect(listVerticalPacks()).toHaveLength(5);
    });
  });
});
