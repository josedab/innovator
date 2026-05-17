import { describe, it, expect } from "vitest";
import { ANGLES, getAngleById } from "../innovation/angles.js";
import { ANGLE_IDS } from "../types.js";

describe("ANGLES", () => {
  it("has an entry for every ANGLE_ID", () => {
    const angleIds = ANGLES.map((a) => a.id);
    for (const id of ANGLE_IDS) {
      expect(angleIds).toContain(id);
    }
  });

  it("has 8 angles", () => {
    expect(ANGLES).toHaveLength(8);
  });

  it("each angle has required fields with correct types", () => {
    for (const angle of ANGLES) {
      expect(typeof angle.id).toBe("string");
      expect(angle.id.length).toBeGreaterThan(0);
      expect(typeof angle.name).toBe("string");
      expect(angle.name.length).toBeGreaterThan(0);
      expect(typeof angle.shortDescription).toBe("string");
      expect(angle.shortDescription.length).toBeGreaterThan(0);
      expect(angle.shortDescription.length).toBeLessThanOrEqual(200);
      // Icon should be an emoji (at least one non-ASCII character)
      expect(angle.icon).toMatch(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u);
    }
  });

  it("each angle id matches one of ANGLE_IDS exactly", () => {
    for (const angle of ANGLES) {
      expect(ANGLE_IDS).toContain(angle.id);
    }
  });

  it("has no duplicate angle IDs", () => {
    const ids = ANGLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getAngleById", () => {
  it("returns the correct angle for a valid id", () => {
    const scamper = getAngleById("scamper");
    expect(scamper).toBeDefined();
    expect(scamper!.name).toBe("SCAMPER");
  });

  it("returns object with all required fields", () => {
    const angle = getAngleById("scamper");
    expect(angle).toBeDefined();
    expect(angle).toHaveProperty("id");
    expect(angle).toHaveProperty("name");
    expect(angle).toHaveProperty("shortDescription");
    expect(angle).toHaveProperty("icon");
  });

  it("returns undefined for an invalid id", () => {
    expect(getAngleById("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getAngleById("")).toBeUndefined();
  });

  it("returns undefined for numeric-like input", () => {
    expect(getAngleById("123" as any)).toBeUndefined();
  });

  it("finds all known angle IDs", () => {
    for (const id of ANGLE_IDS) {
      expect(getAngleById(id)).toBeDefined();
    }
  });
});
