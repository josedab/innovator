import { describe, it, expect } from "vitest";
import {
  BUILT_IN_PRESETS,
  getPresets,
  getPresetById,
  getPresetsByCategory,
  getPresetsByTag,
} from "../presets/index.js";

describe("presets", () => {
  it("ships 5 built-in presets", () => {
    expect(BUILT_IN_PRESETS).toHaveLength(5);
  });

  it("getPresets returns all presets", () => {
    const presets = getPresets();
    expect(presets.length).toBeGreaterThanOrEqual(5);
  });

  it("getPresetById returns the correct preset", () => {
    const preset = getPresetById("startup-validation");
    expect(preset).toBeDefined();
    expect(preset?.name).toBe("Startup Idea Validation");
  });

  it("getPresetById returns undefined for unknown ID", () => {
    expect(getPresetById("nonexistent")).toBeUndefined();
  });

  it("getPresetsByCategory filters correctly", () => {
    const business = getPresetsByCategory("Business");
    expect(business.length).toBeGreaterThanOrEqual(2);
    for (const p of business) {
      expect(p.category).toBe("Business");
    }
  });

  it("getPresetsByTag filters correctly", () => {
    const startup = getPresetsByTag("startup");
    expect(startup.length).toBeGreaterThanOrEqual(1);
  });

  it("all presets have valid angle selections", () => {
    const validAngles = [
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
      "inversion",
      "perspectives",
      "what-if",
      "trend-collision",
    ];
    for (const preset of BUILT_IN_PRESETS) {
      for (const angleId of preset.selectedAngles) {
        expect(validAngles).toContain(angleId);
      }
    }
  });

  it("all presets have required fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.icon).toBeTruthy();
      expect(preset.category).toBeTruthy();
      expect(preset.selectedAngles.length).toBeGreaterThan(0);
    }
  });
});
