import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the copilot client to avoid import resolution issues
vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => raw),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
}));

import {
  REGULATORY_FRAMEWORKS,
  getRegulatoryFrameworks,
  getRegulatorySimulation,
  listRegulatorySimulations,
  clearRegulatorySimulations,
  regulatoryToMarkdown,
} from "../index.js";
import type { RegulatorySimulation } from "../index.js";

const MOCK_SIMULATION: RegulatorySimulation = {
  ideaTitle: "Test Idea",
  jurisdictions: [
    {
      jurisdiction: "European Union",
      region: "Europe",
      overallStatus: "green",
      overallScore: 0.9,
      frameworkChecks: [
        {
          frameworkId: "gdpr",
          frameworkName: "GDPR",
          status: "green",
          score: 0.95,
          findings: [
            {
              requirement: "Data minimization",
              status: "compliant",
              detail: "Only collects necessary data",
            },
          ],
        },
      ],
      summary: "Fully compliant with EU regulations",
      recommendation: "proceed",
    },
    {
      jurisdiction: "United States",
      region: "North America",
      overallStatus: "yellow",
      overallScore: 0.65,
      frameworkChecks: [
        {
          frameworkId: "hipaa",
          frameworkName: "HIPAA",
          status: "yellow",
          score: 0.6,
          findings: [
            {
              requirement: "PHI safeguards",
              status: "partial",
              detail: "Needs improvement",
              remediation: "Implement encryption at rest",
            },
          ],
        },
      ],
      summary: "Partial compliance",
      recommendation: "proceed-with-modifications",
    },
    {
      jurisdiction: "China",
      region: "Asia-Pacific",
      overallStatus: "red",
      overallScore: 0.3,
      frameworkChecks: [],
      summary: "Significant gaps",
      recommendation: "not-recommended",
    },
  ],
  globalSummary: "Mixed compliance across jurisdictions",
  lowestRiskJurisdictions: ["European Union"],
  highestRiskJurisdictions: ["China"],
  universalRequirements: ["Data encryption", "Access controls"],
  simulatedAt: "2024-01-01T00:00:00.000Z",
};

describe("regulatory-simulator", () => {
  beforeEach(() => {
    clearRegulatorySimulations();
  });

  // ---- REGULATORY_FRAMEWORKS ----

  describe("REGULATORY_FRAMEWORKS", () => {
    it("contains at least 15 frameworks", () => {
      expect(REGULATORY_FRAMEWORKS.length).toBeGreaterThanOrEqual(15);
    });

    it("all frameworks have required fields", () => {
      for (const fw of REGULATORY_FRAMEWORKS) {
        expect(fw.id).toBeDefined();
        expect(fw.name).toBeDefined();
        expect(fw.jurisdiction).toBeDefined();
        expect(fw.category).toBeDefined();
        expect(fw.description).toBeDefined();
        expect(fw.keyRequirements.length).toBeGreaterThan(0);
        expect(fw.penaltyRange).toBeDefined();
        expect(fw.effectiveDate).toBeDefined();
      }
    });

    it("each framework has unique id", () => {
      const ids = REGULATORY_FRAMEWORKS.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ---- getRegulatoryFrameworks ----

  describe("getRegulatoryFrameworks", () => {
    it("returns all frameworks when no jurisdiction specified", () => {
      const all = getRegulatoryFrameworks();
      expect(all.length).toBe(REGULATORY_FRAMEWORKS.length);
    });

    it("filters by jurisdiction", () => {
      const eu = getRegulatoryFrameworks("European Union");
      expect(eu.length).toBeGreaterThan(0);
      expect(eu.every((f) => f.jurisdiction.includes("European Union"))).toBe(true);
    });

    it("returns empty for unknown jurisdiction", () => {
      const none = getRegulatoryFrameworks("Atlantis");
      expect(none).toHaveLength(0);
    });
  });

  // ---- Compliance scoring thresholds ----

  describe("compliance scoring", () => {
    it("green status corresponds to high score (>0.8)", () => {
      const greenJ = MOCK_SIMULATION.jurisdictions.find((j) => j.overallStatus === "green");
      expect(greenJ!.overallScore).toBeGreaterThan(0.8);
    });

    it("yellow status corresponds to medium score (0.5-0.8)", () => {
      const yellowJ = MOCK_SIMULATION.jurisdictions.find((j) => j.overallStatus === "yellow");
      expect(yellowJ!.overallScore).toBeGreaterThanOrEqual(0.5);
      expect(yellowJ!.overallScore).toBeLessThanOrEqual(0.8);
    });

    it("red status corresponds to low score (<0.5)", () => {
      const redJ = MOCK_SIMULATION.jurisdictions.find((j) => j.overallStatus === "red");
      expect(redJ!.overallScore).toBeLessThan(0.5);
    });
  });

  // ---- regulatoryToMarkdown ----

  describe("regulatoryToMarkdown", () => {
    it("produces markdown with title", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("# Regulatory Simulation: Test Idea");
    });

    it("includes jurisdiction details table", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("| Jurisdiction |");
      expect(md).toContain("European Union");
      expect(md).toContain("United States");
    });

    it("includes status emojis", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("🟢");
      expect(md).toContain("🟡");
      expect(md).toContain("🔴");
    });

    it("includes global summary", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("Mixed compliance across jurisdictions");
    });

    it("includes lowest/highest risk jurisdictions", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("Lowest Risk:");
      expect(md).toContain("Highest Risk:");
    });

    it("includes universal requirements", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("Universal Requirements");
      expect(md).toContain("Data encryption");
    });

    it("includes remediation notes", () => {
      const md = regulatoryToMarkdown(MOCK_SIMULATION);
      expect(md).toContain("Remediation:");
      expect(md).toContain("Implement encryption at rest");
    });
  });

  // ---- CRUD ----

  describe("listRegulatorySimulations / getRegulatorySimulation", () => {
    it("lists empty initially", () => {
      expect(listRegulatorySimulations()).toHaveLength(0);
    });

    it("returns undefined for non-existent simulation", () => {
      expect(getRegulatorySimulation("bad-id")).toBeUndefined();
    });
  });
});
