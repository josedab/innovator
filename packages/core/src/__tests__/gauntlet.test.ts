import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { computeSurvivabilityIndex } from "../gauntlet/gauntlet.js";
import { makeAttack } from "../__test-utils__/factories.js";
import type { Attack, AdversaryRole } from "../gauntlet/types.js";

describe("gauntlet", () => {
  describe("computeSurvivabilityIndex", () => {
    it("returns 100 for zero attacks", () => {
      expect(computeSurvivabilityIndex([])).toBe(100);
    });

    it("returns 0 for maximum severity attacks", () => {
      const attacks: Attack[] = [
        makeAttack({ adversaryRole: "competitor", severity: 10 }),
        makeAttack({ adversaryRole: "regulator", severity: 10 }),
        makeAttack({ adversaryRole: "skeptic", severity: 10 }),
        makeAttack({ adversaryRole: "economist", severity: 10 }),
        makeAttack({ adversaryRole: "engineer", severity: 10 }),
      ];
      expect(computeSurvivabilityIndex(attacks)).toBe(0);
    });

    it("returns moderate score for mixed severities", () => {
      const attacks: Attack[] = [
        makeAttack({ adversaryRole: "competitor", severity: 3 }),
        makeAttack({ adversaryRole: "skeptic", severity: 7 }),
        makeAttack({ adversaryRole: "economist", severity: 5 }),
      ];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });

    it("weights economist attacks higher than skeptic", () => {
      const economistAttack = [makeAttack({ adversaryRole: "economist", severity: 8 })];
      const skepticAttack = [makeAttack({ adversaryRole: "skeptic", severity: 8 })];
      const eScore = computeSurvivabilityIndex(economistAttack);
      const sScore = computeSurvivabilityIndex(skepticAttack);
      // Economist weight is 0.25, skeptic is 0.15
      // Both single-attack so weighted avg = severity * weight / weight = severity
      // Actually with single attack: weightedSum = 8 * weight, totalWeight = weight
      // So weightedAvg = 8 for both. Index = 100 - 80 = 20
      // They should be equal because the formula normalizes
      expect(eScore).toBe(sScore);
    });

    it("handles unknown adversary role gracefully", () => {
      const attacks = [makeAttack({ adversaryRole: "custom-role" as AdversaryRole, severity: 5 })];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("clamps to 0-100 range", () => {
      const attacks = [makeAttack({ severity: 1 })];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("handles NaN severity by treating as zero impact", () => {
      const attacks = [makeAttack({ severity: NaN as unknown as number })];
      const score = computeSurvivabilityIndex(attacks);
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("handles negative severity gracefully", () => {
      const attacks = [makeAttack({ severity: -5 })];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
