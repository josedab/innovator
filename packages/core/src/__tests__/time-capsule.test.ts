import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  createTimeCapsule,
  getTimeCapsule,
  listTimeCapsules,
  getDueCapsules,
  deleteTimeCapsule,
  openTimeCapsule,
  openingCeremonyToMarkdown,
} from "../time-capsule/index.js";
import { generateText } from "../copilot/client.js";
import type { InnovationIdea } from "../types.js";

const mockGenerateText = vi.mocked(generateText);

const TEST_IDEA: InnovationIdea = {
  title: "Quantum Computing Platform",
  description: "Cloud-based quantum computing for enterprises",
  potentialImpact: "Revolutionize optimization problems",
  implementationHint: "Partner with quantum hardware providers",
};

describe("time-capsule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CRUD operations", () => {
    it("should create a time capsule", () => {
      const capsule = createTimeCapsule(TEST_IDEA, "2027-01-01T00:00:00Z", {
        notes: "Check quantum readiness",
        tags: ["quantum", "enterprise"],
        score: 7,
      });

      expect(capsule.id).toBeTruthy();
      expect(capsule.status).toBe("sealed");
      expect(capsule.ideaSnapshot.title).toBe("Quantum Computing Platform");
      expect(capsule.tags).toContain("quantum");
    });

    it("should retrieve a capsule by ID", () => {
      const created = createTimeCapsule(TEST_IDEA, "2027-06-01T00:00:00Z");
      const retrieved = getTimeCapsule(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it("should list all capsules", () => {
      const before = listTimeCapsules().length;
      createTimeCapsule(TEST_IDEA, "2028-01-01T00:00:00Z");
      expect(listTimeCapsules().length).toBe(before + 1);
    });

    it("should filter by status", () => {
      createTimeCapsule(TEST_IDEA, "2029-01-01T00:00:00Z");
      const sealed = listTimeCapsules("sealed");
      expect(sealed.every((c) => c.status === "sealed")).toBe(true);
    });

    it("should delete a capsule", () => {
      const created = createTimeCapsule(TEST_IDEA, "2030-01-01T00:00:00Z");
      expect(deleteTimeCapsule(created.id)).toBe(true);
      expect(getTimeCapsule(created.id)).toBeUndefined();
    });

    it("should return false when deleting non-existent capsule", () => {
      expect(deleteTimeCapsule("non-existent")).toBe(false);
    });
  });

  describe("getDueCapsules", () => {
    it("should return capsules past their open date", () => {
      createTimeCapsule(TEST_IDEA, "2020-01-01T00:00:00Z"); // past date
      const due = getDueCapsules();
      expect(due.length).toBeGreaterThan(0);
    });
  });

  describe("openTimeCapsule", () => {
    it("should open a capsule and generate ceremony", async () => {
      const futureContextResponse = JSON.stringify({
        predictedDate: "2027-01-01",
        marketTrends: ["Quantum computing maturing"],
        technologyShifts: ["Error correction breakthroughs"],
        competitiveLandscape: "Major cloud providers offering quantum",
        regulatoryChanges: ["Quantum-safe cryptography mandates"],
        consumerBehavior: "Growing quantum literacy",
        confidenceLevel: 0.6,
      });

      const reEvalResponse = JSON.stringify({
        updatedScore: 8,
        scoreDelta: 1,
        stillRelevant: true,
        whatChanged: "Quantum hardware became more accessible",
        newOpportunities: ["Government contracts"],
        newRisks: ["Commoditization"],
        recommendation: "pursue-now",
        reasoning: "Market is ready now",
      });

      let callIdx = 0;
      mockGenerateText.mockImplementation(async () => {
        callIdx++;
        return callIdx === 1 ? futureContextResponse : reEvalResponse;
      });

      const capsule = createTimeCapsule(TEST_IDEA, "2020-01-01T00:00:00Z", {
        score: 7,
      });

      const ceremony = await openTimeCapsule(capsule.id);

      expect(ceremony.ideaTitle).toBe("Quantum Computing Platform");
      expect(ceremony.reEvaluation.recommendation).toBe("pursue-now");
      expect(ceremony.sideByComparison.originalScore).toBe(7);
      expect(ceremony.sideByComparison.updatedScore).toBe(8);
    });

    it("should throw for non-existent capsule", async () => {
      await expect(openTimeCapsule("non-existent")).rejects.toThrow("Time capsule not found");
    });
  });

  describe("openingCeremonyToMarkdown", () => {
    it("should produce markdown", () => {
      const md = openingCeremonyToMarkdown({
        capsuleId: "c1",
        ideaTitle: "Test",
        originalSnapshot: {
          title: "Test",
          description: "desc",
          potentialImpact: "impact",
          feasibility: "medium",
          originalScore: 6,
          capturedAt: "2024-01-01T00:00:00Z",
        },
        futureContext: {
          predictedDate: "2026-01-01",
          marketTrends: ["trend1"],
          technologyShifts: ["shift1"],
          competitiveLandscape: "competitive",
          regulatoryChanges: [],
          consumerBehavior: "evolving",
          confidenceLevel: 0.5,
        },
        reEvaluation: {
          updatedScore: 8,
          scoreDelta: 2,
          stillRelevant: true,
          whatChanged: "Market shifted",
          newOpportunities: ["opp1"],
          newRisks: ["risk1"],
          recommendation: "pursue-now",
          reasoning: "Now is the time",
        },
        sideByComparison: {
          originalScore: 6,
          updatedScore: 8,
          keyDifferences: ["Score improved"],
          verdict: "Pursue immediately",
        },
        openedAt: "2026-01-01T00:00:00Z",
      });

      expect(md).toContain("Time Capsule Opening Ceremony");
      expect(md).toContain("Test");
      expect(md).toContain("pursue-now");
    });
  });
});
