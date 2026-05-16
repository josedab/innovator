import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  getSeedCasePack,
  computeAccuracyMetrics,
  generateCalibrationReport,
  BacktestCaseSchema,
  CasePackSchema,
  PipelineReplayResultSchema,
  AccuracyMetricsSchema,
} from "../index.js";

describe("backtesting", () => {
  describe("getSeedCasePack", () => {
    it("returns a valid case pack with 10 seed cases", () => {
      const pack = getSeedCasePack();
      expect(CasePackSchema.parse(pack)).toBeDefined();
      expect(pack.cases).toHaveLength(10);
    });

    it("includes both success and failure cases", () => {
      const pack = getSeedCasePack();
      const successes = pack.cases.filter((c) => c.outcome.succeeded);
      const failures = pack.cases.filter((c) => !c.outcome.succeeded);
      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
    });

    it("covers multiple domains", () => {
      const pack = getSeedCasePack();
      const domains = new Set(pack.cases.map((c) => c.domain));
      expect(domains.size).toBeGreaterThanOrEqual(4);
    });

    it("all cases have valid schemas", () => {
      const pack = getSeedCasePack();
      for (const c of pack.cases) {
        expect(() => BacktestCaseSchema.parse(c)).not.toThrow();
      }
    });
  });

  describe("computeAccuracyMetrics", () => {
    const cases = getSeedCasePack().cases;

    it("returns zero metrics for empty results", () => {
      const metrics = computeAccuracyMetrics([], []);
      expect(metrics.hitRate).toBe(0);
      expect(metrics.averageSimilarity).toBe(0);
      expect(metrics.casesEvaluated).toBe(0);
    });

    it("computes hit rate correctly", () => {
      const results = [
        {
          caseId: "iphone-2007",
          hitActualInnovation: true,
          similarityToActual: 0.8,
          ideasGenerated: 5,
          matchingAngles: ["first-principles"],
          durationMs: 1000,
          replayedAt: new Date().toISOString(),
        },
        {
          caseId: "airbnb-2009",
          hitActualInnovation: false,
          similarityToActual: 0.3,
          ideasGenerated: 4,
          matchingAngles: [],
          durationMs: 900,
          replayedAt: new Date().toISOString(),
        },
      ];
      const metrics = computeAccuracyMetrics(results, cases);
      expect(metrics.hitRate).toBe(0.5);
      expect(metrics.averageSimilarity).toBeCloseTo(0.55);
      expect(metrics.casesEvaluated).toBe(2);
    });

    it("groups metrics by domain", () => {
      const results = [
        {
          caseId: "iphone-2007",
          hitActualInnovation: true,
          similarityToActual: 0.9,
          ideasGenerated: 5,
          matchingAngles: ["first-principles"],
          durationMs: 1000,
          replayedAt: new Date().toISOString(),
        },
        {
          caseId: "airbnb-2009",
          hitActualInnovation: false,
          similarityToActual: 0.2,
          ideasGenerated: 3,
          matchingAngles: [],
          durationMs: 800,
          replayedAt: new Date().toISOString(),
        },
      ];
      const metrics = computeAccuracyMetrics(results, cases);
      expect(metrics.byDomain["technology"]).toBeDefined();
      expect(metrics.byDomain["hospitality"]).toBeDefined();
      expect(metrics.byDomain["technology"].hitRate).toBe(1);
      expect(metrics.byDomain["hospitality"].hitRate).toBe(0);
    });
  });

  describe("generateCalibrationReport", () => {
    it("generates recommendations for low hit rate", () => {
      const metrics = {
        hitRate: 0.2,
        averageSimilarity: 0.3,
        scoreOutcomeCorrelation: 0,
        feasibilityMAE: 0,
        impactMAE: 0,
        casesEvaluated: 5,
        byDomain: {},
      };
      const report = generateCalibrationReport(metrics, []);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some((r) => r.includes("below 30%"))).toBe(true);
      expect(report.overallCalibrationScore).toBeCloseTo(0.25);
    });

    it("generates positive feedback for high hit rate", () => {
      const metrics = {
        hitRate: 0.75,
        averageSimilarity: 0.7,
        scoreOutcomeCorrelation: 0.5,
        feasibilityMAE: 1.0,
        impactMAE: 0.8,
        casesEvaluated: 10,
        byDomain: {},
      };
      const report = generateCalibrationReport(metrics, []);
      expect(report.recommendations.some((r) => r.includes("strong"))).toBe(true);
    });
  });

  describe("schema validation", () => {
    it("validates pipeline replay result", () => {
      const result = {
        caseId: "test-case",
        hitActualInnovation: true,
        similarityToActual: 0.85,
        ideasGenerated: 5,
        bestMatchTitle: "Test Innovation",
        matchingAngles: ["first-principles"],
        durationMs: 5000,
        replayedAt: new Date().toISOString(),
      };
      expect(() => PipelineReplayResultSchema.parse(result)).not.toThrow();
    });
  });
});
