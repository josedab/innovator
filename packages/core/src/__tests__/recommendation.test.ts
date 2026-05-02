import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  recommendAngles,
  recordAngleFeedback,
  clearAngleFeedback,
} from "../recommendation/index.js";
import type { SubjectClassification } from "../recommendation/index.js";

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
});
