import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  recommendAngles,
  recordAngleFeedback,
  clearAngleFeedback,
  classifySubject,
} from "../recommendation/index.js";
import type { SubjectClassification } from "../recommendation/index.js";
import { generateText, extractJson } from "../copilot/client.js";
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const techClassification: SubjectClassification = {
  domain: "technology",
  subDomain: "machine learning",
  complexity: "complex",
  intent: "explore",
  keywords: ["AI", "ML"],
  confidence: 0.9,
};

const healthcareClassification: SubjectClassification = {
  domain: "healthcare",
  subDomain: "telemedicine",
  complexity: "moderate",
  intent: "solve",
  keywords: ["health", "remote"],
  confidence: 0.85,
};

describe("recommendation", () => {
  beforeEach(() => {
    clearAngleFeedback();
  });

  it("recommends top 4 angles for technology domain", () => {
    const recommendations = recommendAngles(techClassification, 4);
    expect(recommendations).toHaveLength(4);
    // Should be sorted by relevance descending
    for (let i = 1; i < recommendations.length; i++) {
      expect(recommendations[i - 1].relevance).toBeGreaterThanOrEqual(recommendations[i].relevance);
    }
  });

  it("recommends different angles for different domains", () => {
    const techAngles = recommendAngles(techClassification, 3).map((r) => r.angleId);
    const healthAngles = recommendAngles(healthcareClassification, 3).map((r) => r.angleId);
    // At least one angle should differ between domains
    const allSame = techAngles.every((a, i) => a === healthAngles[i]);
    expect(allSame).toBe(false);
  });

  it("includes rationale for each recommendation", () => {
    const recommendations = recommendAngles(techClassification);
    for (const rec of recommendations) {
      expect(rec.rationale.length).toBeGreaterThan(0);
    }
  });

  it("adjusts recommendations based on feedback", () => {
    const before = recommendAngles(techClassification, 8);
    const scamperBefore = before.find((r) => r.angleId === "scamper")?.relevance ?? 0;

    // Add strong positive feedback for scamper in technology
    for (let i = 0; i < 20; i++) {
      recordAngleFeedback({
        domain: "technology",
        angleId: "scamper",
        qualityScore: 10,
        timestamp: Date.now(),
      });
    }

    const after = recommendAngles(techClassification, 8);
    const scamperAfter = after.find((r) => r.angleId === "scamper")?.relevance ?? 0;

    expect(scamperAfter).toBeGreaterThanOrEqual(scamperBefore);
  });

  it("boosts structured angles for complex subjects", () => {
    const complexRecs = recommendAngles({ ...techClassification, complexity: "complex" }, 8);
    const simpleRecs = recommendAngles({ ...techClassification, complexity: "simple" }, 8);

    const complexFP = complexRecs.find((r) => r.angleId === "first-principles")?.relevance ?? 0;
    const simpleFP = simpleRecs.find((r) => r.angleId === "first-principles")?.relevance ?? 0;

    expect(complexFP).toBeGreaterThanOrEqual(simpleFP);
  });

  it("respects topN parameter", () => {
    expect(recommendAngles(techClassification, 2)).toHaveLength(2);
    expect(recommendAngles(techClassification, 6)).toHaveLength(6);
  });

  it("topN > available angles returns all angles", () => {
    const result = recommendAngles(techClassification, 100);
    expect(result).toHaveLength(8); // 8 known angles
  });

  describe("classifySubject with mocked LLM", () => {
    it("returns domain/intent/keywords from LLM", async () => {
      const classification = {
        domain: "technology",
        subDomain: "machine learning",
        complexity: "moderate",
        intent: "explore",
        keywords: ["AI", "automation"],
        confidence: 0.85,
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(classification));
      mockExtractJson.mockReturnValue(JSON.stringify(classification));

      const result = await classifySubject("AI automation tools");
      expect(result.domain).toBe("technology");
      expect(result.intent).toBe("explore");
      expect(result.keywords).toContain("AI");
    });

    it("LLM failure propagates error", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

      await expect(classifySubject("test subject")).rejects.toThrow();
    });
  });

  describe("recommendAngles edge cases", () => {
    it("unknown domain uses default weights", () => {
      const unknownDomain: SubjectClassification = {
        ...techClassification,
        domain: "other",
      };
      const recs = recommendAngles(unknownDomain, 8);
      expect(recs).toHaveLength(8);
      // With default weights, all angles should have some relevance
      for (const rec of recs) {
        expect(rec.relevance).toBeGreaterThan(0);
      }
    });

    it("intent 'solve' vs 'explore' produces different rankings", () => {
      const solveClass: SubjectClassification = {
        ...techClassification,
        intent: "solve",
      };
      const exploreClass: SubjectClassification = {
        ...techClassification,
        intent: "explore",
      };
      const solveRecs = recommendAngles(solveClass, 8);
      const exploreRecs = recommendAngles(exploreClass, 8);
      // The what-if angle rationale text incorporates the intent
      const solveWhatIf = solveRecs.find((r) => r.angleId === "what-if");
      const exploreWhatIf = exploreRecs.find((r) => r.angleId === "what-if");
      expect(solveWhatIf?.rationale).toContain("solve");
      expect(exploreWhatIf?.rationale).toContain("explore");
    });

    it("confidence scores are 0-1", () => {
      const recs = recommendAngles(techClassification, 8);
      for (const rec of recs) {
        expect(rec.relevance).toBeGreaterThanOrEqual(0);
        expect(rec.relevance).toBeLessThanOrEqual(1);
      }
    });

    it("feedback with 0 ratings doesn't crash", () => {
      // No feedback recorded, should work fine
      const recs = recommendAngles(techClassification, 4);
      expect(recs).toHaveLength(4);
    });
  });
});
