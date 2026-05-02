import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  ingestDataPoints,
  getDataPoints,
  clearMiningData,
  computeAngleEffectiveness,
  buildHeatmap,
  computeCorrelationMatrix,
  chiSquaredAngleEffectiveness,
} from "../mining/index.js";
import type { MiningDataPoint } from "../mining/index.js";

function makeDataPoints(): MiningDataPoint[] {
  return [
    { subjectDomain: "technology", angleId: "scamper", ideaQualityScore: 8, timestamp: Date.now() },
    { subjectDomain: "technology", angleId: "scamper", ideaQualityScore: 7, timestamp: Date.now() },
    {
      subjectDomain: "technology",
      angleId: "first-principles",
      ideaQualityScore: 9,
      timestamp: Date.now(),
    },
    { subjectDomain: "healthcare", angleId: "scamper", ideaQualityScore: 5, timestamp: Date.now() },
    {
      subjectDomain: "healthcare",
      angleId: "first-principles",
      ideaQualityScore: 6,
      timestamp: Date.now(),
    },
    {
      subjectDomain: "healthcare",
      angleId: "perspectives",
      ideaQualityScore: 9,
      timestamp: Date.now(),
    },
    { subjectDomain: "education", angleId: "scamper", ideaQualityScore: 7, timestamp: Date.now() },
    { subjectDomain: "education", angleId: "what-if", ideaQualityScore: 8, timestamp: Date.now() },
  ];
}

describe("mining", () => {
  beforeEach(() => {
    clearMiningData();
  });

  it("ingests and retrieves data points", () => {
    ingestDataPoints(makeDataPoints());
    expect(getDataPoints()).toHaveLength(8);
  });

  it("computes angle effectiveness per domain", () => {
    const data = makeDataPoints();
    const effectiveness = computeAngleEffectiveness(data);
    expect(effectiveness.length).toBeGreaterThan(0);

    const techScamper = effectiveness.find(
      (e) => e.domain === "technology" && e.angleId === "scamper"
    );
    expect(techScamper).toBeTruthy();
    expect(techScamper?.meanQuality).toBe(7.5);
    expect(techScamper?.sampleSize).toBe(2);
  });

  it("computes effectiveness ranks within domains", () => {
    const data = makeDataPoints();
    const effectiveness = computeAngleEffectiveness(data);

    const techEntries = effectiveness
      .filter((e) => e.domain === "technology")
      .sort((a, b) => a.effectivenessRank - b.effectivenessRank);

    expect(techEntries[0].effectivenessRank).toBe(1);
    expect(techEntries[0].angleId).toBe("first-principles"); // score 9 > 7.5
  });

  it("builds heatmap", () => {
    const data = makeDataPoints();
    const heatmap = buildHeatmap(data);
    expect(heatmap.length).toBeGreaterThan(0);

    const cell = heatmap.find((c) => c.domain === "technology" && c.angleId === "scamper");
    expect(cell?.score).toBe(7.5);
    expect(cell?.sampleSize).toBe(2);
  });

  it("computes correlation matrix", () => {
    const data = makeDataPoints();
    const correlations = computeCorrelationMatrix(data);
    expect(correlations.length).toBeGreaterThan(0);
    // Correlations should be between -1 and 1
    for (const c of correlations) {
      expect(c.correlation).toBeGreaterThanOrEqual(-1);
      expect(c.correlation).toBeLessThanOrEqual(1);
    }
  });

  it("runs chi-squared test", () => {
    const data = makeDataPoints();
    const result = chiSquaredAngleEffectiveness(data);
    expect(result.testName).toBe("Chi-Squared Angle Effectiveness");
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it("handles empty data gracefully", () => {
    const effectiveness = computeAngleEffectiveness([]);
    expect(effectiveness).toHaveLength(0);

    const heatmap = buildHeatmap([]);
    expect(heatmap).toHaveLength(0);

    const chiResult = chiSquaredAngleEffectiveness([]);
    expect(chiResult.significant).toBe(false);
  });
});
