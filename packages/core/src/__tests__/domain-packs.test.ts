import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPack,
  getPack,
  listPacks,
  searchPacks,
  getPacksByCategory,
  unregisterPack,
  clearPacks,
  HEALTHTECH_PACK,
  CLEANTECH_PACK,
  FINTECH_PACK,
  EDTECH_PACK,
  DEVTOOLS_PACK,
} from "../presets/domain-packs.js";
import type { InnovationPack } from "../presets/domain-packs.js";

const BUILT_IN_PACKS = [HEALTHTECH_PACK, CLEANTECH_PACK, FINTECH_PACK, EDTECH_PACK, DEVTOOLS_PACK];

beforeEach(() => {
  clearPacks();
  BUILT_IN_PACKS.forEach((p) => registerPack(p));
});

describe("Built-in packs", () => {
  it("registers all 5 built-in packs with unique IDs", () => {
    const packs = listPacks();
    expect(packs).toHaveLength(5);
    const ids = new Set(packs.map((p) => p.id));
    expect(ids.size).toBe(5);
  });

  it("getPack('healthtech') returns correct pack with rubric weights summing to 1.0", () => {
    const pack = getPack("healthtech");
    expect(pack).toBeDefined();
    expect(pack!.name).toContain("HealthTech");
    const totalWeight = pack!.evaluationRubric.criteria.reduce((s, c) => s + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it.each(["healthtech", "cleantech", "fintech", "edtech", "devtools"])(
    "%s pack rubric weights sum to 1.0",
    (packId) => {
      const pack = getPack(packId)!;
      const totalWeight = pack.evaluationRubric.criteria.reduce((s, c) => s + c.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    }
  );

  it.each(["healthtech", "cleantech", "fintech", "edtech", "devtools"])(
    "%s pack has non-empty customAngles, presets, and contextHints",
    (packId) => {
      const pack = getPack(packId)!;
      expect(pack.customAngles.length).toBeGreaterThan(0);
      expect(pack.presets.length).toBeGreaterThan(0);
      expect(pack.contextHints.length).toBeGreaterThan(0);
    }
  );
});

describe("searchPacks", () => {
  it("matches case-insensitively by name", () => {
    const results = searchPacks("HEALTHTECH");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("healthtech");
  });

  it("matches by description substring", () => {
    const results = searchPacks("circular economy");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("cleantech");
  });

  it("matches by tag", () => {
    const results = searchPacks("defi");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fintech");
  });

  it("returns empty for nonexistent term", () => {
    expect(searchPacks("zzzznonexistent")).toHaveLength(0);
  });
});

describe("getPacksByCategory", () => {
  it("filters by category case-insensitively", () => {
    const results = getPacksByCategory("healthcare");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("healthtech");
  });

  it("returns all technology packs", () => {
    const results = getPacksByCategory("Technology");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for non-existent category", () => {
    expect(getPacksByCategory("NonExistent")).toHaveLength(0);
  });
});

describe("Registry lifecycle", () => {
  it("registerPack adds a new pack", () => {
    const custom: InnovationPack = {
      id: "custom-pack",
      name: "Custom Pack",
      description: "Test pack",
      icon: "🔧",
      category: "Test",
      version: "1.0.0",
      author: "Test",
      tags: ["test"],
      presets: [],
      customAngles: [],
      contextHints: [],
      evaluationRubric: { criteria: [], domainSpecificQuestions: [] },
    };
    registerPack(custom);
    expect(getPack("custom-pack")).toBeDefined();
    expect(listPacks()).toHaveLength(6);
  });

  it("unregisterPack removes a pack and returns true", () => {
    expect(unregisterPack("healthtech")).toBe(true);
    expect(getPack("healthtech")).toBeUndefined();
  });

  it("unregisterPack returns false for non-existent pack", () => {
    expect(unregisterPack("nope")).toBe(false);
  });

  it("clearPacks removes all packs", () => {
    clearPacks();
    expect(listPacks()).toHaveLength(0);
  });
});
