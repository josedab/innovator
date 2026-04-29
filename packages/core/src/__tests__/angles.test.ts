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

  it("each angle has required fields", () => {
    for (const angle of ANGLES) {
      expect(angle.id).toBeTruthy();
      expect(angle.name).toBeTruthy();
      expect(angle.shortDescription).toBeTruthy();
      expect(angle.icon).toBeTruthy();
    }
  });
});

describe("getAngleById", () => {
  it("returns the correct angle for a valid id", () => {
    const scamper = getAngleById("scamper");
    expect(scamper).toBeDefined();
    expect(scamper!.name).toBe("SCAMPER");
  });

  it("returns undefined for an invalid id", () => {
    expect(getAngleById("nonexistent")).toBeUndefined();
  });

  it("finds all known angle IDs", () => {
    for (const id of ANGLE_IDS) {
      expect(getAngleById(id)).toBeDefined();
    }
  });
});
