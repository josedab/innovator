import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { getRegulatoryDatabase, RegulatoryFrameworkSchema } from "../index.js";

describe("regulatory-screen", () => {
  describe("getRegulatoryDatabase", () => {
    it("returns 6 built-in frameworks", () => {
      const db = getRegulatoryDatabase();
      expect(db).toHaveLength(6);
    });

    it("all frameworks have valid schemas", () => {
      const db = getRegulatoryDatabase();
      for (const f of db) {
        expect(() => RegulatoryFrameworkSchema.parse(f)).not.toThrow();
      }
    });

    it("includes major frameworks", () => {
      const db = getRegulatoryDatabase();
      const codes = db.map((f) => f.shortCode);
      expect(codes).toContain("GDPR");
      expect(codes).toContain("HIPAA");
      expect(codes).toContain("PCI-DSS");
      expect(codes).toContain("SOX");
      expect(codes).toContain("FDA");
      expect(codes).toContain("FCC");
    });

    it("all frameworks have provisions", () => {
      const db = getRegulatoryDatabase();
      for (const f of db) {
        expect(f.provisions.length).toBeGreaterThan(0);
      }
    });

    it("provisions have risk areas", () => {
      const db = getRegulatoryDatabase();
      for (const f of db) {
        for (const p of f.provisions) {
          expect(p.riskAreas.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
