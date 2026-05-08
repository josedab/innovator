import { describe, it, expect } from "vitest";

import {
  bassDiffusion,
  runMonteCarloSimulation,
  runSensitivityAnalysis,
  compareMonteCarloScenarios,
  generateProbabilityFan,
  generateTornadoData,
  monteCarloToMarkdown,
  MonteCarloResultSchema,
  TornadoEntrySchema,
  ScenarioComparisonSchema,
  MonteCarloParamsSchema,
} from "../simulation/monte-carlo.js";
import type {
  MonteCarloParams,
  MonteCarloResult,
  TornadoEntry,
} from "../simulation/monte-carlo.js";

const BASE_PARAMS: MonteCarloParams = {
  ideaTitle: "Test Idea",
  runs: 100,
  timeHorizonMonths: 12,
  marketSize: { min: 1000, max: 5000 },
  innovationCoefficient: { min: 0.01, max: 0.05 },
  imitationCoefficient: { min: 0.1, max: 0.4 },
  costPerUnit: { min: 10, max: 30 },
  revenuePerUnit: { min: 50, max: 100 },
  discountRate: 0.1,
};

// ---- bassDiffusion ----

describe("bassDiffusion", () => {
  it("returns correct number of periods", () => {
    const result = bassDiffusion(0.03, 0.38, 1000, 12);
    expect(result).toHaveLength(12);
  });

  it("period numbers are 1-indexed and sequential", () => {
    const result = bassDiffusion(0.03, 0.38, 1000, 6);
    expect(result.map((r) => r.period)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("produces S-curve: early low, middle high, late plateau", () => {
    const result = bassDiffusion(0.03, 0.38, 10000, 24);
    const earlyAdopters = result[1].newAdopters;
    const midAdopters = result[11].newAdopters;
    const lateAdopters = result[23].newAdopters;

    // Middle period should have more new adopters than early
    expect(midAdopters).toBeGreaterThan(earlyAdopters);
    // Late period should have fewer new adopters (market saturation)
    expect(lateAdopters).toBeLessThan(midAdopters);
  });

  it("cumulative adopters never exceed market size", () => {
    const result = bassDiffusion(0.05, 0.5, 500, 30);
    for (const pt of result) {
      expect(pt.cumulativeAdopters).toBeLessThanOrEqual(500);
    }
  });

  it("cumulative adopters are monotonically non-decreasing", () => {
    const result = bassDiffusion(0.03, 0.38, 1000, 20);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].cumulativeAdopters).toBeGreaterThanOrEqual(result[i - 1].cumulativeAdopters);
    }
  });

  it("adoption percent reaches near 100% with enough periods", () => {
    const result = bassDiffusion(0.03, 0.38, 1000, 50);
    const lastPt = result[result.length - 1];
    expect(lastPt.adoptionPercent).toBeGreaterThan(90);
  });

  it("handles zero market size (produces NaN due to division by zero)", () => {
    // Known limitation: q * cumulative / m divides by zero when m=0
    const result = bassDiffusion(0.03, 0.38, 0, 10);
    expect(result).toHaveLength(10);
    // First period: remaining=0, newAdopters = 0*(p + q*0/0) = NaN
    expect(result[0].newAdopters).toBeNaN();
  });
});

// ---- runMonteCarloSimulation ----

describe("runMonteCarloSimulation", () => {
  it("returns valid result matching schema", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    expect(() => MonteCarloResultSchema.parse(result)).not.toThrow();
  });

  it("runCount matches requested runs", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    expect(result.runCount).toBe(100);
  });

  it("percentiles are ordered: p5 <= p50 <= p95 for NPV", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    const { p5, p50, p95 } = result.percentiles.npv;
    expect(p5).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p95);
  });

  it("percentiles are ordered: p5 <= p50 <= p95 for ROI", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    const { p5, p50, p95 } = result.percentiles.roi;
    expect(p5).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p95);
  });

  it("confidence intervals bracket the mean for NPV", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    const { lower, upper } = result.confidenceInterval95.npv;
    expect(lower).toBeLessThanOrEqual(result.mean.npv);
    expect(upper).toBeGreaterThanOrEqual(result.mean.npv);
  });

  it("probability of profitability is between 0 and 1", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    expect(result.probabilityOfProfitability).toBeGreaterThanOrEqual(0);
    expect(result.probabilityOfProfitability).toBeLessThanOrEqual(1);
  });

  it("sensitivity rankings are populated", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    expect(result.sensitivityRankings.length).toBeGreaterThan(0);
    for (const r of result.sensitivityRankings) {
      expect(r.parameter).toBeTruthy();
      expect(typeof r.impactScore).toBe("number");
    }
  });

  it("adoption curves have correct length matching timeHorizonMonths", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    expect(result.adoptionCurves.optimistic).toHaveLength(12);
    expect(result.adoptionCurves.median).toHaveLength(12);
    expect(result.adoptionCurves.pessimistic).toHaveLength(12);
  });

  it("adoption curves: optimistic >= median >= pessimistic per month", () => {
    const result = runMonteCarloSimulation(BASE_PARAMS);
    for (let i = 0; i < result.adoptionCurves.median.length; i++) {
      expect(result.adoptionCurves.optimistic[i].adopters).toBeGreaterThanOrEqual(
        result.adoptionCurves.median[i].adopters
      );
      expect(result.adoptionCurves.median[i].adopters).toBeGreaterThanOrEqual(
        result.adoptionCurves.pessimistic[i].adopters
      );
    }
  });

  it("works with minimum valid runs (10)", () => {
    const params = { ...BASE_PARAMS, runs: 10 };
    const result = runMonteCarloSimulation(params);
    expect(result.runCount).toBe(10);
    expect(() => MonteCarloResultSchema.parse(result)).not.toThrow();
  });

  it("handles zero market size edge case (throws due to NaN propagation)", () => {
    // Known limitation: zero market causes NaN in Bass model, which fails schema validation
    const params: MonteCarloParams = {
      ...BASE_PARAMS,
      runs: 50,
      marketSize: { min: 0, max: 0 },
    };
    expect(() => runMonteCarloSimulation(params)).toThrow();
  });
});

// ---- runSensitivityAnalysis ----

describe("runSensitivityAnalysis", () => {
  it("returns entries for all default factors", () => {
    const entries = runSensitivityAnalysis({ ...BASE_PARAMS, runs: 50 });
    expect(entries.length).toBe(5);
    const params = entries.map((e) => e.parameter);
    expect(params).toContain("marketSize");
    expect(params).toContain("revenuePerUnit");
    expect(params).toContain("costPerUnit");
  });

  it("each entry validates against TornadoEntrySchema", () => {
    const entries = runSensitivityAnalysis({ ...BASE_PARAMS, runs: 50 });
    for (const entry of entries) {
      expect(() => TornadoEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it("entries are sorted by spread descending", () => {
    const entries = runSensitivityAnalysis({ ...BASE_PARAMS, runs: 50 });
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].spread).toBeGreaterThanOrEqual(entries[i].spread);
    }
  });

  it("respects factorsToVary filter", () => {
    const entries = runSensitivityAnalysis({ ...BASE_PARAMS, runs: 50 }, [
      "marketSize",
      "costPerUnit",
    ]);
    expect(entries.length).toBe(2);
    const params = entries.map((e) => e.parameter);
    expect(params).toContain("marketSize");
    expect(params).toContain("costPerUnit");
    expect(params).not.toContain("revenuePerUnit");
  });
});

// ---- compareMonteCarloScenarios ----

describe("compareMonteCarloScenarios", () => {
  it("returns comparison with correct number of scenarios", () => {
    const comparison = compareMonteCarloScenarios([
      { name: "Base", params: { ...BASE_PARAMS, runs: 50 } },
      {
        name: "Optimistic",
        params: { ...BASE_PARAMS, runs: 50, marketSize: { min: 5000, max: 10000 } },
      },
    ]);
    expect(comparison.scenarios).toHaveLength(2);
    expect(comparison.scenarios[0].name).toBe("Base");
    expect(comparison.scenarios[1].name).toBe("Optimistic");
  });

  it("validates against ScenarioComparisonSchema", () => {
    const comparison = compareMonteCarloScenarios([
      { name: "Only", params: { ...BASE_PARAMS, runs: 50 } },
    ]);
    expect(() => ScenarioComparisonSchema.parse(comparison)).not.toThrow();
  });

  it("larger market scenario has higher mean NPV", () => {
    const comparison = compareMonteCarloScenarios([
      { name: "Small", params: { ...BASE_PARAMS, runs: 100, marketSize: { min: 100, max: 200 } } },
      {
        name: "Large",
        params: { ...BASE_PARAMS, runs: 100, marketSize: { min: 10000, max: 20000 } },
      },
    ]);
    const small = comparison.scenarios.find((s) => s.name === "Small")!;
    const large = comparison.scenarios.find((s) => s.name === "Large")!;
    expect(large.result.mean.npv).toBeGreaterThan(small.result.mean.npv);
  });
});

// ---- generateProbabilityFan ----

describe("generateProbabilityFan", () => {
  it("returns one point per month", () => {
    const result = runMonteCarloSimulation({ ...BASE_PARAMS, runs: 50 });
    const fan = generateProbabilityFan(result);
    expect(fan).toHaveLength(12);
    expect(fan[0].month).toBe(1);
    expect(fan[11].month).toBe(12);
  });

  it("percentile bands are ordered: p5 <= p25 <= p50 <= p75 <= p95", () => {
    const result = runMonteCarloSimulation({ ...BASE_PARAMS, runs: 50 });
    const fan = generateProbabilityFan(result);
    for (const pt of fan) {
      expect(pt.p5).toBeLessThanOrEqual(pt.p25);
      expect(pt.p25).toBeLessThanOrEqual(pt.p50);
      expect(pt.p50).toBeLessThanOrEqual(pt.p75);
      expect(pt.p75).toBeLessThanOrEqual(pt.p95);
    }
  });
});

// ---- generateTornadoData ----

describe("generateTornadoData", () => {
  it("transforms entries with deltas relative to baseNpv", () => {
    const entries: TornadoEntry[] = [
      { parameter: "marketSize", baseNpv: 1000, lowNpv: 800, highNpv: 1200, spread: 400 },
      { parameter: "costPerUnit", baseNpv: 1000, lowNpv: 900, highNpv: 1100, spread: 200 },
    ];
    const data = generateTornadoData(entries);
    expect(data).toHaveLength(2);
    // Sorted by spread descending
    expect(data[0].parameter).toBe("marketSize");
    expect(data[0].lowDelta).toBe(-200);
    expect(data[0].highDelta).toBe(200);
    expect(data[0].baseNpv).toBe(1000);
  });

  it("handles empty entries", () => {
    const data = generateTornadoData([]);
    expect(data).toEqual([]);
  });
});

// ---- monteCarloToMarkdown ----

describe("monteCarloToMarkdown", () => {
  it("produces markdown with title and key sections", () => {
    const result = runMonteCarloSimulation({ ...BASE_PARAMS, runs: 50 });
    const md = monteCarloToMarkdown(result);
    expect(md).toContain("# Monte Carlo Simulation: Test Idea");
    expect(md).toContain("## Key Metrics");
    expect(md).toContain("## 95% Confidence Intervals");
    expect(md).toContain("## Adoption Curves");
    expect(md).toContain("Probability of Profitability");
  });

  it("includes sensitivity rankings table when present", () => {
    const result = runMonteCarloSimulation({ ...BASE_PARAMS, runs: 50 });
    const md = monteCarloToMarkdown(result);
    expect(md).toContain("## Sensitivity Rankings");
    expect(md).toContain("Impact Score");
  });
});

// ---- Schema validation ----

describe("MonteCarloParamsSchema", () => {
  it("rejects runs below minimum (10)", () => {
    const bad = { ...BASE_PARAMS, runs: 5 };
    expect(() => MonteCarloParamsSchema.parse(bad)).toThrow();
  });

  it("rejects timeHorizonMonths above maximum (120)", () => {
    const bad = { ...BASE_PARAMS, timeHorizonMonths: 200 };
    expect(() => MonteCarloParamsSchema.parse(bad)).toThrow();
  });
});
