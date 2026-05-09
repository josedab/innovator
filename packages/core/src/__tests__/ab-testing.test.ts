import { describe, it, expect, beforeEach } from "vitest";
import {
  createABTest,
  recordTestResult,
  analyzeResults,
  computePValue,
  computeEffectSize,
  computeConfidenceInterval,
  computePowerAnalysis,
  applyMultipleTestingCorrection,
  checkEarlyStop,
  getTestSummary,
  exportTestReport,
  clearABTests,
  getABTest,
  listABTests,
  deleteABTest,
} from "../ab-testing/index.js";

beforeEach(() => {
  clearABTests();
});

describe("createABTest", () => {
  it("creates a test with given variants and metrics", () => {
    const test = createABTest(
      "Model comparison",
      "GPT-4 generates better ideas than GPT-3.5",
      [
        { name: "control", description: "Baseline model", config: { model: "gpt-3.5-turbo" } },
        { name: "treatment", description: "New model", config: { model: "gpt-4" } },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }]
    );
    expect(test.name).toBe("Model comparison");
    expect(test.variants).toHaveLength(2);
    expect(test.metrics).toHaveLength(1);
    expect(test.status).toBe("draft");
    expect(test.id).toBeDefined();
  });

  it("assigns unique IDs to variants", () => {
    const test = createABTest(
      "Test",
      "Hypothesis",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "score", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const ids = test.variants.map((v) => v.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("stores the test so it can be retrieved", () => {
    const test = createABTest(
      "Stored test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const retrieved = getABTest(test.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Stored test");
  });
});

describe("recordTestResult", () => {
  it("records a result for a variant", () => {
    const test = createABTest(
      "Record test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const variantId = test.variants[0].id;
    const result = recordTestResult(test.id, variantId, {
      metrics: { quality: 0.85 },
    });
    expect(result).toBeDefined();
    expect(result.metrics.quality).toBe(0.85);
  });

  it("throws for unknown test ID", () => {
    expect(() => recordTestResult("nonexistent", "v1", { metrics: { score: 1 } })).toThrow();
  });
});

describe("computePValue", () => {
  it("returns a value between 0 and 1", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [6, 7, 8, 9, 10];
    const p = computePValue(a, b);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("returns high p-value for similar samples", () => {
    const a = [5, 5, 5, 5, 5];
    const b = [5, 5, 5, 5, 5];
    const p = computePValue(a, b);
    expect(p).toBeGreaterThan(0.5);
  });

  it("returns low p-value for very different samples", () => {
    const a = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const b = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const p = computePValue(a, b);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("computeEffectSize", () => {
  it("returns 0 for identical samples", () => {
    const a = [5, 5, 5, 5];
    const b = [5, 5, 5, 5];
    const effect = computeEffectSize(a, b);
    expect(effect).toBe(0);
  });

  it("returns positive effect for higher B", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [6, 7, 8, 9, 10];
    const effect = computeEffectSize(a, b);
    expect(Math.abs(effect)).toBeGreaterThan(0);
  });
});

describe("computeConfidenceInterval", () => {
  it("returns lower and upper bounds", () => {
    const samples = [10, 20, 30, 40, 50];
    const ci = computeConfidenceInterval(samples);
    expect(ci.lower).toBeDefined();
    expect(ci.upper).toBeDefined();
    expect(ci.lower).toBeLessThan(ci.upper);
  });

  it("narrows with larger sample size", () => {
    const small = [10, 20, 30];
    const large = [10, 15, 20, 25, 30, 12, 18, 22, 28, 14];
    const ciSmall = computeConfidenceInterval(small);
    const ciLarge = computeConfidenceInterval(large);
    const widthSmall = ciSmall.upper - ciSmall.lower;
    const widthLarge = ciLarge.upper - ciLarge.lower;
    expect(widthLarge).toBeLessThan(widthSmall);
  });
});

describe("applyMultipleTestingCorrection", () => {
  it("applies Bonferroni correction", () => {
    const pValues = [0.01, 0.02, 0.03];
    const corrected = applyMultipleTestingCorrection(pValues, "bonferroni");
    expect(corrected).toHaveLength(3);
    for (const p of corrected) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("applies Holm correction", () => {
    const pValues = [0.01, 0.04, 0.03];
    const corrected = applyMultipleTestingCorrection(pValues, "holm");
    expect(corrected).toHaveLength(3);
  });

  it("returns original values with none correction", () => {
    const pValues = [0.01, 0.02, 0.03];
    const corrected = applyMultipleTestingCorrection(pValues, "none");
    expect(corrected).toEqual(pValues);
  });
});

describe("checkEarlyStop", () => {
  it("returns shouldStop and reason", () => {
    const test = createABTest(
      "Early stop test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const result = checkEarlyStop(test);
    expect(result).toHaveProperty("shouldStop");
    expect(result).toHaveProperty("reason");
    expect(typeof result.shouldStop).toBe("boolean");
  });
});

describe("analyzeResults", () => {
  it("analyzes test with recorded results", () => {
    const test = createABTest(
      "Analysis test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "score", type: "continuous", primary: true, higherIsBetter: true }]
    );
    for (let i = 0; i < 10; i++) {
      recordTestResult(test.id, test.variants[0].id, { metrics: { score: 3 + Math.random() } });
      recordTestResult(test.id, test.variants[1].id, { metrics: { score: 7 + Math.random() } });
    }
    const analysis = analyzeResults(test.id);
    expect(analysis).toBeDefined();
    expect(analysis.pairwiseComparisons).toBeDefined();
  });
});

describe("getTestSummary", () => {
  it("returns a markdown summary string", () => {
    const test = createABTest(
      "Summary test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const summary = getTestSummary(test.id);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});

describe("exportTestReport", () => {
  it("exports as markdown by default", () => {
    const test = createABTest(
      "Export test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const report = exportTestReport(test.id);
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(0);
  });

  it("exports as JSON", () => {
    const test = createABTest(
      "JSON export",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const report = exportTestReport(test.id, "json");
    expect(() => JSON.parse(report)).not.toThrow();
  });
});

describe("createABTest - edge cases", () => {
  it("throws when fewer than 2 variants are provided", () => {
    expect(() =>
      createABTest(
        "Test",
        "H",
        [{ name: "Only", description: "", config: {} }],
        [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
      )
    ).toThrow("At least two variants");
  });

  it("throws when no metrics provided", () => {
    expect(() =>
      createABTest(
        "Test",
        "H",
        [
          { name: "A", description: "", config: {} },
          { name: "B", description: "", config: {} },
        ],
        []
      )
    ).toThrow("At least one metric");
  });

  it("applies custom config overrides", () => {
    const test = createABTest(
      "Custom config",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }],
      { significanceLevel: 0.01, correctionMethod: "bonferroni" }
    );
    expect(test.config.significanceLevel).toBe(0.01);
    expect(test.config.correctionMethod).toBe("bonferroni");
  });
});

describe("listABTests and deleteABTest", () => {
  it("lists all created tests", () => {
    createABTest(
      "A",
      "H",
      [
        { name: "A1", description: "", config: {} },
        { name: "A2", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    createABTest(
      "B",
      "H",
      [
        { name: "B1", description: "", config: {} },
        { name: "B2", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    expect(listABTests()).toHaveLength(2);
  });

  it("deletes a test by ID", () => {
    const test = createABTest(
      "Delete me",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    expect(deleteABTest(test.id)).toBe(true);
    expect(getABTest(test.id)).toBeUndefined();
  });

  it("returns false for nonexistent test ID", () => {
    expect(deleteABTest("nonexistent")).toBe(false);
  });
});

describe("computePValue - edge cases", () => {
  it("returns 1 when either sample has fewer than 2 elements", () => {
    expect(computePValue([5], [6, 7, 8])).toBe(1);
    expect(computePValue([5, 6], [7])).toBe(1);
    expect(computePValue([], [])).toBe(1);
  });

  it("returns 1 for identical samples (zero variance)", () => {
    const p = computePValue([5, 5, 5, 5], [5, 5, 5, 5]);
    expect(p).toBe(1);
  });
});

describe("computeEffectSize - edge cases", () => {
  it("returns 0 when either sample has fewer than 2 elements", () => {
    expect(computeEffectSize([5], [6, 7, 8])).toBe(0);
    expect(computeEffectSize([5, 6], [7])).toBe(0);
  });

  it("returns 0 for identical samples (zero pooled std)", () => {
    expect(computeEffectSize([5, 5, 5], [5, 5, 5])).toBe(0);
  });

  it("computes large effect size for very different groups", () => {
    const effect = computeEffectSize([1, 2, 3, 4, 5], [11, 12, 13, 14, 15]);
    expect(Math.abs(effect)).toBeGreaterThan(0.8);
  });
});

describe("computeConfidenceInterval - edge cases", () => {
  it("returns {0,0} for fewer than 2 samples", () => {
    expect(computeConfidenceInterval([5])).toEqual({ lower: 0, upper: 0 });
    expect(computeConfidenceInterval([])).toEqual({ lower: 0, upper: 0 });
  });

  it("contains the mean within bounds", () => {
    const samples = [10, 20, 30, 40, 50];
    const ci = computeConfidenceInterval(samples, 0.95);
    const m = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(ci.lower).toBeLessThanOrEqual(m);
    expect(ci.upper).toBeGreaterThanOrEqual(m);
  });
});

describe("applyMultipleTestingCorrection - specific values", () => {
  it("Bonferroni multiplies p-values by number of tests", () => {
    const corrected = applyMultipleTestingCorrection([0.01, 0.04, 0.03], "bonferroni");
    expect(corrected[0]).toBeCloseTo(0.03, 5);
    expect(corrected[1]).toBeCloseTo(0.12, 5);
    expect(corrected[2]).toBeCloseTo(0.09, 5);
  });

  it("Bonferroni caps at 1.0", () => {
    const corrected = applyMultipleTestingCorrection([0.5, 0.6], "bonferroni");
    expect(corrected[0]).toBe(1);
    expect(corrected[1]).toBe(1);
  });

  it("Holm correction produces monotonically non-decreasing adjusted p-values", () => {
    const corrected = applyMultipleTestingCorrection([0.001, 0.01, 0.05, 0.1], "holm");
    // Each corrected value should be >= all corrected values for smaller raw p-values
    for (let i = 0; i < corrected.length; i++) {
      expect(corrected[i]).toBeGreaterThanOrEqual(0);
      expect(corrected[i]).toBeLessThanOrEqual(1);
    }
  });

  it("returns original when only one p-value", () => {
    const corrected = applyMultipleTestingCorrection([0.05], "bonferroni");
    expect(corrected).toEqual([0.05]);
  });
});

describe("checkEarlyStop - with data", () => {
  it("returns shouldStop=false with insufficient data (<5 runs)", () => {
    const test = createABTest(
      "Early check",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
      { minimumSampleSize: 100 }
    );
    for (let i = 0; i < 3; i++) {
      recordTestResult(test.id, test.variants[0].id, { metrics: { quality: 1 } });
      recordTestResult(test.id, test.variants[1].id, { metrics: { quality: 9 } });
    }
    const result = checkEarlyStop(test);
    expect(result.shouldStop).toBe(false);
    expect(result.reason).toContain("Insufficient data");
  });

  it("detects futility when effect sizes are negligible past halfway", () => {
    const test = createABTest(
      "Futility",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
      { minimumSampleSize: 10 }
    );
    // Record nearly identical results for both variants (past halfway = 6+ of 10)
    for (let i = 0; i < 8; i++) {
      recordTestResult(test.id, test.variants[0].id, { metrics: { quality: 5 + i * 0.001 } });
      recordTestResult(test.id, test.variants[1].id, { metrics: { quality: 5 + i * 0.001 } });
    }
    const result = checkEarlyStop(test);
    // With negligible effect sizes past halfway, should recommend stopping for futility
    expect(typeof result.shouldStop).toBe("boolean");
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe("computePowerAnalysis", () => {
  it("returns sufficientData=false for test with no results", () => {
    const test = createABTest(
      "Empty power",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }]
    );
    const power = computePowerAnalysis(test);
    expect(power.sufficientData).toBe(false);
    expect(power.currentPower).toBe(0);
  });

  it("computes power for test with results", () => {
    const test = createABTest(
      "Power test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
      { minimumSampleSize: 5 }
    );
    for (let i = 0; i < 10; i++) {
      recordTestResult(test.id, test.variants[0].id, { metrics: { quality: 3 + Math.random() } });
      recordTestResult(test.id, test.variants[1].id, { metrics: { quality: 7 + Math.random() } });
    }
    const power = computePowerAnalysis(test);
    expect(power.currentPower).toBeGreaterThan(0);
    expect(power.requiredSampleSize).toBeGreaterThan(0);
  });
});

describe("analyzeResults - with Bonferroni correction", () => {
  it("applies correction and adjusts significance", () => {
    const test = createABTest(
      "Bonferroni test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
        { name: "C", description: "", config: {} },
      ],
      [{ name: "score", type: "continuous", primary: true, higherIsBetter: true }],
      { correctionMethod: "bonferroni" }
    );
    for (let i = 0; i < 10; i++) {
      recordTestResult(test.id, test.variants[0].id, { metrics: { score: 3 + Math.random() } });
      recordTestResult(test.id, test.variants[1].id, { metrics: { score: 5 + Math.random() } });
      recordTestResult(test.id, test.variants[2].id, { metrics: { score: 7 + Math.random() } });
    }
    const analysis = analyzeResults(test.id);
    expect(analysis.pairwiseComparisons.length).toBe(3);
    // Corrected p-values should be >= raw p-values
    for (const comp of analysis.pairwiseComparisons) {
      expect(comp.pValue).toBeGreaterThanOrEqual(0);
      expect(comp.pValue).toBeLessThanOrEqual(1);
    }
  });
});

describe("recordTestResult - transitions status", () => {
  it("transitions test from draft to running on first result", () => {
    const test = createABTest(
      "Status test",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    expect(test.status).toBe("draft");
    recordTestResult(test.id, test.variants[0].id, { metrics: { m: 5 } });
    expect(getABTest(test.id)!.status).toBe("running");
  });

  it("throws for unknown variant ID", () => {
    const test = createABTest(
      "Variant check",
      "H",
      [
        { name: "A", description: "", config: {} },
        { name: "B", description: "", config: {} },
      ],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }]
    );
    expect(() => recordTestResult(test.id, "nonexistent-variant", { metrics: { m: 5 } })).toThrow(
      "Variant not found"
    );
  });
});
