import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CustomAngle } from "../types.js";

// We need to mock the home dir before importing
const testDir = join(tmpdir(), `innovator-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const {
  loadCustomAngles,
  addCustomAngle,
  removeCustomAngle,
  getCustomAngle,
  updateCustomAngle,
  exportAnglePack,
  importAnglePack,
  buildCustomAnglePrompt,
} = await import("../innovation/custom-angles.js");

const sampleAngle: CustomAngle = {
  id: "test-angle",
  name: "Test Angle",
  description: "A test angle for unit tests",
  promptTemplate: "Analyze {{subject}} using the investigation: {{investigation}}",
  icon: "🧪",
};

describe("custom-angles", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when no file exists", () => {
    expect(loadCustomAngles()).toEqual([]);
  });

  it("adds and loads a custom angle", () => {
    addCustomAngle(sampleAngle);
    const angles = loadCustomAngles();
    expect(angles).toHaveLength(1);
    expect(angles[0].id).toBe("test-angle");
  });

  it("rejects duplicate angle IDs", () => {
    addCustomAngle(sampleAngle);
    expect(() => addCustomAngle(sampleAngle)).toThrow("already exists");
  });

  it("removes a custom angle", () => {
    addCustomAngle(sampleAngle);
    expect(removeCustomAngle("test-angle")).toBe(true);
    expect(loadCustomAngles()).toHaveLength(0);
  });

  it("returns false when removing non-existent angle", () => {
    expect(removeCustomAngle("nonexistent")).toBe(false);
  });

  it("gets a custom angle by ID", () => {
    addCustomAngle(sampleAngle);
    const angle = getCustomAngle("test-angle");
    expect(angle?.name).toBe("Test Angle");
  });

  it("exports angle pack", () => {
    addCustomAngle(sampleAngle);
    const pack = exportAnglePack("test-pack");
    expect(pack.name).toBe("test-pack");
    expect(pack.angles).toHaveLength(1);
  });

  it("imports angle pack", () => {
    const pack = {
      name: "imported-pack",
      angles: [{ ...sampleAngle, id: "imported-angle" }],
    };
    const result = importAnglePack(pack);
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips duplicate IDs on import", () => {
    addCustomAngle(sampleAngle);
    const pack = {
      name: "pack",
      angles: [sampleAngle, { ...sampleAngle, id: "new-angle" }],
    };
    const result = importAnglePack(pack);
    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual(["test-angle"]);
  });

  it("builds prompt from template", () => {
    const prompt = buildCustomAnglePrompt(sampleAngle, "solar energy", "context here");
    expect(prompt).toBe("Analyze solar energy using the investigation: context here");
  });

  it("validates angle ID format", () => {
    expect(() => addCustomAngle({ ...sampleAngle, id: "Invalid ID!" })).toThrow();
  });

  // ---- updateCustomAngle ----
  it("updates an existing custom angle", () => {
    addCustomAngle(sampleAngle);
    updateCustomAngle({ ...sampleAngle, name: "Updated Angle" });
    const angle = getCustomAngle("test-angle");
    expect(angle?.name).toBe("Updated Angle");
  });

  it("throws when updating non-existent angle", () => {
    expect(() => updateCustomAngle({ ...sampleAngle, id: "nonexistent" })).toThrow("not found");
  });

  // ---- Corrupt JSON handling ----
  it("returns empty array when file contains corrupt JSON", () => {
    const anglesFile = join(testDir, ".innovator", "custom-angles.json");
    writeFileSync(anglesFile, "{ invalid json }", "utf-8");
    expect(loadCustomAngles()).toEqual([]);
  });

  it("filters out invalid entries in JSON array", () => {
    const anglesFile = join(testDir, ".innovator", "custom-angles.json");
    writeFileSync(anglesFile, JSON.stringify([sampleAngle, { invalid: true }]), "utf-8");
    const angles = loadCustomAngles();
    expect(angles).toHaveLength(1);
    expect(angles[0].id).toBe("test-angle");
  });

  it("returns empty array when file contains non-array JSON", () => {
    const anglesFile = join(testDir, ".innovator", "custom-angles.json");
    writeFileSync(anglesFile, JSON.stringify({ not: "an array" }), "utf-8");
    expect(loadCustomAngles()).toEqual([]);
  });

  // ---- buildCustomAnglePrompt with multiple substitutions ----
  it("replaces multiple occurrences of {{subject}}", () => {
    const angle: CustomAngle = {
      ...sampleAngle,
      promptTemplate: "Topic: {{subject}}. Let me repeat: {{subject}}. Context: {{investigation}}.",
    };
    const prompt = buildCustomAnglePrompt(angle, "AI", "summary");
    expect(prompt).toBe("Topic: AI. Let me repeat: AI. Context: summary.");
  });

  // ---- exportAnglePack with selective IDs ----
  it("exports only selected angle IDs", () => {
    addCustomAngle(sampleAngle);
    addCustomAngle({ ...sampleAngle, id: "another-angle", name: "Another" });
    const pack = exportAnglePack("selective", ["test-angle"]);
    expect(pack.angles).toHaveLength(1);
    expect(pack.angles[0].id).toBe("test-angle");
  });

  it("throws when exporting with no matching angles", () => {
    expect(() => exportAnglePack("empty")).toThrow("No angles to export");
  });
});
