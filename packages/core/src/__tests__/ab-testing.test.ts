import { describe, it, expect, beforeEach } from "vitest";
import {
  createABTest,
  recordTestResult,
  analyzeResults,
  computePValue,
  computeEffectSize,
  computeConfidenceInterval,
  applyMultipleTestingCorrection,
  checkEarlyStop,
  getTestSummary,
  exportTestReport,
  clearABTests,
  getABTest,
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
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
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
      [{ name: "score", type: "continuous", primary: true, higherIsBetter: true }],
    );
    const ids = test.variants.map((v) => v.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("stores the test so it can be retrieved", () => {
    const test = createABTest(
      "Stored test",
      "H",
      [{ name: "A", description: "", config: {} }, { name: "B", description: "", config: {} }],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }],
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
      [{ name: "A", description: "", config: {} }, { name: "B", description: "", config: {} }],
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
    );
    const variantId = test.variants[0].id;
    const result = recordTestResult(test.id, variantId, {
      metrics: { quality: 0.85 },
    });
    expect(result).toBeDefined();
    expect(result.metrics.quality).toBe(0.85);
  });

  it("throws for unknown test ID", () => {
    expect(() =>
      recordTestResult("nonexistent", "v1", { metrics: { score: 1 } }),
    ).toThrow();
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
      [{ name: "quality", type: "continuous", primary: true, higherIsBetter: true }],
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
      [{ name: "score", type: "continuous", primary: true, higherIsBetter: true }],
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
      [{ name: "A", description: "", config: {} }, { name: "B", description: "", config: {} }],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }],
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
      [{ name: "A", description: "", config: {} }, { name: "B", description: "", config: {} }],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }],
    );
    const report = exportTestReport(test.id);
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(0);
  });

  it("exports as JSON", () => {
    const test = createABTest(
      "JSON export",
      "H",
      [{ name: "A", description: "", config: {} }, { name: "B", description: "", config: {} }],
      [{ name: "m", type: "continuous", primary: true, higherIsBetter: true }],
    );
    const report = exportTestReport(test.id, "json");
    expect(() => JSON.parse(report)).not.toThrow();
  });
});
