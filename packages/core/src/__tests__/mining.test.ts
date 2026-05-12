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
  generateMiningReport,
} from "../mining/index.js";
import type { MiningDataPoint } from "../mining/index.js";
import { generateText, extractJson } from "../copilot/client.js";
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

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
    vi.clearAllMocks();
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

  describe("generateMiningReport", () => {
    it("mocked LLM returns NarratedInsight", async () => {
      const insights = {
        insights: [
          {
            title: "Test Insight",
            description: "A test insight from LLM",
            confidence: 0.85,
            category: "pattern",
            supportingData: "data",
          },
        ],
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(insights));
      mockExtractJson.mockReturnValue(JSON.stringify(insights));

      const report = await generateMiningReport(makeDataPoints());
      expect(report.dataPointCount).toBe(8);
      expect(report.insights).toHaveLength(1);
      expect(report.insights[0].title).toBe("Test Insight");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({ serverMode: true }));
      expect(mockExtractJson).toHaveBeenCalledTimes(1);
    });

    it("LLM failure returns fallback report", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM down"));

      const report = await generateMiningReport(makeDataPoints());
      expect(report.dataPointCount).toBe(8);
      expect(report.insights).toHaveLength(1);
      expect(report.insights[0].title).toBe("Automated Insights Unavailable");
    });

    it("empty data returns report with 0 insights", async () => {
      const report = await generateMiningReport([]);
      expect(report.dataPointCount).toBe(0);
      expect(report.insights).toHaveLength(0);
    });
  });

  describe("statistical edge cases", () => {
    it("pearsonCorrelation with zero-variance data returns 0", () => {
      const data: MiningDataPoint[] = [
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 5, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "what-if", ideaQualityScore: 5, timestamp: Date.now() },
        { subjectDomain: "health", angleId: "scamper", ideaQualityScore: 5, timestamp: Date.now() },
        { subjectDomain: "health", angleId: "what-if", ideaQualityScore: 5, timestamp: Date.now() },
      ];
      const correlations = computeCorrelationMatrix(data);
      if (correlations.length > 0) {
        expect(correlations[0].correlation).toBe(0);
      }
    });

    it("correlation with < 2 shared angles returns empty", () => {
      const data: MiningDataPoint[] = [
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 8, timestamp: Date.now() },
        { subjectDomain: "health", angleId: "what-if", ideaQualityScore: 6, timestamp: Date.now() },
      ];
      const correlations = computeCorrelationMatrix(data);
      expect(correlations).toHaveLength(0);
    });

    it("chi-squared with single domain returns pValue: 1", () => {
      const data: MiningDataPoint[] = [
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 8, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "what-if", ideaQualityScore: 6, timestamp: Date.now() },
      ];
      const result = chiSquaredAngleEffectiveness(data);
      expect(result.pValue).toBe(1);
      expect(result.significant).toBe(false);
    });

    it("median with even-count array", () => {
      const data: MiningDataPoint[] = [
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 4, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 6, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 8, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 10, timestamp: Date.now() },
      ];
      const effectiveness = computeAngleEffectiveness(data);
      const entry = effectiveness.find((e) => e.angleId === "scamper");
      // Median of [4,6,8,10] = (6+8)/2 = 7
      expect(entry?.medianQuality).toBe(7);
    });

    it("standard deviation with identical values returns 0", () => {
      const data: MiningDataPoint[] = [
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 5, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 5, timestamp: Date.now() },
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 5, timestamp: Date.now() },
      ];
      const effectiveness = computeAngleEffectiveness(data);
      const entry = effectiveness.find((e) => e.angleId === "scamper");
      expect(entry?.stdDev).toBe(0);
    });

    it("single data point has stdDev of 0", () => {
      const data: MiningDataPoint[] = [
        { subjectDomain: "tech", angleId: "scamper", ideaQualityScore: 7, timestamp: Date.now() },
      ];
      const effectiveness = computeAngleEffectiveness(data);
      const entry = effectiveness.find((e) => e.angleId === "scamper");
      expect(entry).toBeDefined();
      expect(entry?.sampleSize).toBe(1);
      expect(entry?.meanQuality).toBe(7);
      expect(entry?.stdDev).toBe(0);
    });

    it("known perfectly correlated data returns r ≈ 1.0", () => {
      // Two domains with same pattern across shared angles → r ≈ 1.0
      const data: MiningDataPoint[] = [
        { subjectDomain: "A", angleId: "a1", ideaQualityScore: 2, timestamp: Date.now() },
        { subjectDomain: "A", angleId: "a2", ideaQualityScore: 4, timestamp: Date.now() },
        { subjectDomain: "A", angleId: "a3", ideaQualityScore: 6, timestamp: Date.now() },
        { subjectDomain: "B", angleId: "a1", ideaQualityScore: 3, timestamp: Date.now() },
        { subjectDomain: "B", angleId: "a2", ideaQualityScore: 5, timestamp: Date.now() },
        { subjectDomain: "B", angleId: "a3", ideaQualityScore: 7, timestamp: Date.now() },
      ];
      const correlations = computeCorrelationMatrix(data);
      const abCorr = correlations.find(
        (c) => (c.domainA === "A" && c.domainB === "B") || (c.domainA === "B" && c.domainB === "A")
      );
      expect(abCorr).toBeDefined();
      expect(abCorr!.correlation).toBeCloseTo(1.0, 1);
    });

    it("heatmap has correct dimensions", () => {
      const data = makeDataPoints();
      const heatmap = buildHeatmap(data);
      // Should have one cell per unique (domain, angleId) pair
      const uniquePairs = new Set(data.map((d) => `${d.subjectDomain}:${d.angleId}`));
      expect(heatmap.length).toBe(uniquePairs.size);
    });
  });
});
