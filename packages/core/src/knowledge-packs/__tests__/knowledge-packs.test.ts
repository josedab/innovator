import { describe, it, expect, beforeEach } from "vitest";
import {
  registerKnowledgePack,
  getKnowledgePack,
  listKnowledgePacks,
  searchEntities,
  validatePackSchema,
  getPackEnrichmentContext,
  removeKnowledgePack,
  clearKnowledgePacks,
  BUILT_IN_PACKS,
} from "../index.js";
import type { KnowledgePack } from "../index.js";

function makeCustomPack(overrides: Partial<KnowledgePack> = {}): KnowledgePack {
  return {
    id: "custom-test",
    name: "Custom Test Pack",
    version: "1.0.0",
    domain: "Testing",
    description: "A test knowledge pack",
    entities: [
      {
        id: "test-entity",
        name: "Test Entity",
        type: "concept",
        description: "An entity for testing",
        tags: ["test", "custom"],
      },
    ],
    regulations: [],
    trends: [],
    scoringRubrics: [],
    personas: [],
    suggestedAngles: ["first-principles"],
    ...overrides,
  };
}

describe("knowledge-packs", () => {
  beforeEach(() => {
    clearKnowledgePacks();
    // Re-register built-ins (clearKnowledgePacks removes everything)
    for (const pack of BUILT_IN_PACKS) {
      registerKnowledgePack(pack);
    }
  });

  // ---- registerKnowledgePack ----

  describe("registerKnowledgePack", () => {
    it("registers a custom pack", () => {
      registerKnowledgePack(makeCustomPack());
      const pack = getKnowledgePack("custom-test");
      expect(pack).toBeDefined();
      expect(pack!.name).toBe("Custom Test Pack");
    });

    it("overwrites existing pack with same ID", () => {
      registerKnowledgePack(makeCustomPack());
      registerKnowledgePack(makeCustomPack({ name: "Updated Pack" }));
      expect(getKnowledgePack("custom-test")!.name).toBe("Updated Pack");
    });
  });

  // ---- getKnowledgePack ----

  describe("getKnowledgePack", () => {
    it("returns built-in healthcare pack", () => {
      const pack = getKnowledgePack("healthcare");
      expect(pack).toBeDefined();
      expect(pack!.domain).toBe("Healthcare");
    });

    it("returns built-in fintech pack", () => {
      expect(getKnowledgePack("fintech")).toBeDefined();
    });

    it("returns built-in climate pack", () => {
      expect(getKnowledgePack("climate")).toBeDefined();
    });

    it("returns undefined for missing pack", () => {
      expect(getKnowledgePack("nonexistent")).toBeUndefined();
    });
  });

  // ---- listKnowledgePacks ----

  describe("listKnowledgePacks", () => {
    it("includes all built-in packs", () => {
      const packs = listKnowledgePacks();
      expect(packs.length).toBeGreaterThanOrEqual(BUILT_IN_PACKS.length);
      const ids = packs.map((p) => p.id);
      expect(ids).toContain("healthcare");
      expect(ids).toContain("fintech");
      expect(ids).toContain("climate");
    });

    it("includes custom packs alongside built-ins", () => {
      registerKnowledgePack(makeCustomPack());
      const packs = listKnowledgePacks();
      expect(packs.length).toBe(BUILT_IN_PACKS.length + 1);
    });
  });

  // ---- searchEntities ----

  describe("searchEntities", () => {
    it("finds entities by keyword", () => {
      const results = searchEntities("telehealth");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name.toLowerCase()).toContain("telehealth");
    });

    it("returns empty for no matches", () => {
      const results = searchEntities("xyznonexistent987");
      expect(results).toHaveLength(0);
    });

    it("scopes search to specific pack", () => {
      const results = searchEntities("blockchain", "fintech");
      // Should not find healthcare entities
      expect(results.length).toBeGreaterThan(0);
    });

    it("searches across tags", () => {
      registerKnowledgePack(makeCustomPack());
      const results = searchEntities("custom");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ---- validatePackSchema ----

  describe("validatePackSchema", () => {
    it("validates a correct pack", () => {
      const result = validatePackSchema(makeCustomPack());
      expect(result.valid).toBe(true);
    });

    it("rejects invalid pack", () => {
      const result = validatePackSchema({ id: "bad" });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("rejects non-object", () => {
      const result = validatePackSchema("not an object");
      expect(result.valid).toBe(false);
    });
  });

  // ---- getPackEnrichmentContext ----

  describe("getPackEnrichmentContext", () => {
    it("returns formatted context for healthcare pack", () => {
      const ctx = getPackEnrichmentContext("healthcare");
      expect(ctx).toBeDefined();
      expect(ctx).toContain("Domain: Healthcare");
      expect(ctx).toContain("Key Concepts:");
      expect(ctx).toContain("Current Trends:");
      expect(ctx).toContain("Regulatory Context:");
    });

    it("returns undefined for non-existent pack", () => {
      expect(getPackEnrichmentContext("nonexistent")).toBeUndefined();
    });
  });

  // ---- removeKnowledgePack ----

  describe("removeKnowledgePack", () => {
    it("removes a custom pack", () => {
      registerKnowledgePack(makeCustomPack());
      expect(removeKnowledgePack("custom-test")).toBe(true);
      expect(getKnowledgePack("custom-test")).toBeUndefined();
    });

    it("can remove built-in packs", () => {
      // Note: The actual code doesn't prevent removal of built-ins
      expect(removeKnowledgePack("healthcare")).toBe(true);
      expect(getKnowledgePack("healthcare")).toBeUndefined();
    });

    it("returns false for non-existent pack", () => {
      expect(removeKnowledgePack("nonexistent")).toBe(false);
    });
  });

  // ---- clearKnowledgePacks ----

  describe("clearKnowledgePacks", () => {
    it("removes all packs", () => {
      clearKnowledgePacks();
      expect(listKnowledgePacks()).toHaveLength(0);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("pack with 0 entities is valid", () => {
      const pack = makeCustomPack({ entities: [] });
      const result = validatePackSchema(pack);
      expect(result.valid).toBe(true);
    });

    it("handles special characters in search", () => {
      registerKnowledgePack(
        makeCustomPack({
          id: "special",
          entities: [
            {
              id: "sp-1",
              name: "AI/ML & Data Science",
              type: "concept",
              description: "Testing <special> chars",
            },
          ],
        })
      );
      const results = searchEntities("AI/ML");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
