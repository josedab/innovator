import { describe, it, expect, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  findRelevantEntries,
  biomimicryToMarkdown,
  BIOMIMICRY_TAXONOMY,
} from "../biomimicry/index.js";

describe("biomimicry", () => {
  describe("BIOMIMICRY_TAXONOMY", () => {
    it("should contain 200+ entries", () => {
      expect(BIOMIMICRY_TAXONOMY.length).toBeGreaterThanOrEqual(200);
    });

    it("each entry should have required fields", () => {
      for (const entry of BIOMIMICRY_TAXONOMY) {
        expect(entry.id).toBeTruthy();
        expect(entry.organism).toBeTruthy();
        expect(entry.biologicalStrategy).toBeTruthy();
        expect(entry.function).toBeTruthy();
        expect(entry.mechanism).toBeTruthy();
        expect(entry.technicalAnalogy).toBeTruthy();
      }
    });

    it("should cover multiple biological functions", () => {
      const functions = new Set(BIOMIMICRY_TAXONOMY.map((e) => e.function));
      expect(functions.size).toBeGreaterThanOrEqual(10);
    });
  });

  describe("findRelevantEntries", () => {
    it("should find entries relevant to a subject", () => {
      const entries = findRelevantEntries("solar energy harvesting");
      expect(entries.length).toBeGreaterThan(0);
    });

    it("should filter by biological function", () => {
      const entries = findRelevantEntries("any subject", {
        functions: ["energy-capture"],
      });
      for (const entry of entries) {
        expect(entry.function).toBe("energy-capture");
      }
    });

    it("should respect maxTransfers limit", () => {
      const entries = findRelevantEntries("network optimization routing", {
        maxTransfers: 3,
      });
      expect(entries.length).toBeLessThanOrEqual(3);
    });
  });

  describe("biomimicryToMarkdown", () => {
    it("should produce markdown report", () => {
      const md = biomimicryToMarkdown({
        subject: "Water Collection",
        matchedEntries: [],
        transfers: [
          {
            entryId: "mt-04",
            organism: "Namibian Fog Beetle",
            biologicalStrategy: "Harvest water from fog",
            technicalApplication: "Fog harvesting surfaces",
            transferabilityScore: 0.8,
            feasibilityScore: 0.7,
            noveltyScore: 0.6,
            implementationPath: "Surface engineering",
            challenges: ["Scale"],
            potentialImpact: "Arid region water supply",
          },
        ],
        synthesisNarrative: "Nature shows us how to collect water.",
        topInspiration: "Fog beetle surfaces",
      });

      expect(md).toContain("Biomimicry Innovation Report");
      expect(md).toContain("Namibian Fog Beetle");
      expect(md).toContain("Water Collection");
    });
  });
});
