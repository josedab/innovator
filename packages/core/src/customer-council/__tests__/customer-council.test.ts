import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  getBuiltInCustomerPersonas,
  createCustomerPersona,
  calibrateCouncil,
  CustomerPersonaSchema,
} from "../index.js";

describe("customer-council", () => {
  describe("getBuiltInCustomerPersonas", () => {
    it("returns 10 built-in personas", () => {
      const personas = getBuiltInCustomerPersonas();
      expect(personas).toHaveLength(10);
    });

    it("all personas have valid schemas", () => {
      const personas = getBuiltInCustomerPersonas();
      for (const p of personas) {
        expect(() => CustomerPersonaSchema.parse(p)).not.toThrow();
      }
    });

    it("has unique IDs", () => {
      const personas = getBuiltInCustomerPersonas();
      const ids = new Set(personas.map((p) => p.id));
      expect(ids.size).toBe(10);
    });

    it("covers diverse tech savviness levels", () => {
      const personas = getBuiltInCustomerPersonas();
      const levels = new Set(personas.map((p) => p.techSavviness));
      expect(levels.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe("createCustomerPersona", () => {
    it("creates a custom persona with auto-generated ID", () => {
      const persona = createCustomerPersona({
        name: "Test User",
        archetype: "Test Archetype",
        ageRange: "20-30",
        incomeBracket: "$50K",
        occupation: "Tester",
        traits: ["detail-oriented"],
        painPoints: ["bugs"],
        values: ["quality"],
        techSavviness: "high",
        priceSensitivity: 5,
        riskTolerance: 5,
        brandLoyalty: 5,
      });
      expect(persona.id).toBe("test-user");
      expect(persona.name).toBe("Test User");
    });

    it("uses provided ID if given", () => {
      const persona = createCustomerPersona({
        id: "custom-id",
        name: "Custom",
        archetype: "Custom",
        ageRange: "20-30",
        incomeBracket: "$50K",
        occupation: "Tester",
        traits: ["testing"],
        painPoints: ["none"],
        values: ["quality"],
        techSavviness: "medium",
        priceSensitivity: 5,
        riskTolerance: 5,
        brandLoyalty: 5,
      });
      expect(persona.id).toBe("custom-id");
    });
  });

  describe("calibrateCouncil", () => {
    it("records a calibration data point", () => {
      const record = calibrateCouncil({
        ideaId: "idea-1",
        ideaTitle: "Test Idea",
        predictedEnthusiasm: 75,
        actualOutcome: "success",
        actualAdoptionRate: 0.6,
        accuracy: 0.8,
      });
      expect(record.ideaId).toBe("idea-1");
      expect(record.recordedAt).toBeDefined();
    });
  });
});
