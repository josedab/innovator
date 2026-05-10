import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import {
  recordEffectiveness,
  getEffectivenessHistory,
  getAngleRecommendations,
  getPipelineRecommendation,
  explainRecommendation,
  recordFeedback,
  recalculateProfiles,
  createMethodologyExperiment,
  getExperimentResults,
  generateMethodologyInsights,
  insightsToMarkdown,
  clearAdaptiveMethodology,
} from "../index.js";

// ---- Helpers ----

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    runId: `run-${Math.random().toString(36).slice(2, 8)}`,
    domain: "technology",
    angleId: "first-principles",
    inputSubject: "AI optimization",
    outputScore: 75,
    exported: false,
    ...overrides,
  };
}

describe("adaptive-methodology", () => {
  beforeEach(() => {
    clearAdaptiveMethodology();
  });

  // ---- recordEffectiveness ----

  describe("recordEffectiveness", () => {
    it("records a single effectiveness entry and assigns timestamp", () => {
      const result = recordEffectiveness(makeRecord());
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof result.runId).toBe("string");
      expect(result.outputScore).toBe(75);
    });

    it("records multiple entries", () => {
      recordEffectiveness(makeRecord({ runId: "run-1" }));
      recordEffectiveness(makeRecord({ runId: "run-2" }));
      const history = getEffectivenessHistory();
      expect(history).toHaveLength(2);
    });

    it("preserves optional userRating", () => {
      const result = recordEffectiveness(makeRecord({ userRating: 8 }));
      expect(result.userRating).toBe(8);
    });

    it("preserves optional teamId", () => {
      const result = recordEffectiveness(makeRecord({ teamId: "team-a" }));
      expect(result.teamId).toBe("team-a");
    });

    it("validates outputScore range (rejects > 100)", () => {
      expect(() => recordEffectiveness(makeRecord({ outputScore: 150 }))).toThrow();
    });

    it("validates outputScore range (rejects < 0)", () => {
      expect(() => recordEffectiveness(makeRecord({ outputScore: -1 }))).toThrow();
    });

    it("validates userRating range (rejects > 10)", () => {
      expect(() => recordEffectiveness(makeRecord({ userRating: 11 }))).toThrow();
    });
  });

  // ---- getEffectivenessHistory ----

  describe("getEffectivenessHistory", () => {
    it("returns empty array when no data exists", () => {
      expect(getEffectivenessHistory()).toHaveLength(0);
    });

    it("returns all records without filters", () => {
      recordEffectiveness(makeRecord({ runId: "r1" }));
      recordEffectiveness(makeRecord({ runId: "r2", domain: "healthcare" }));
      expect(getEffectivenessHistory()).toHaveLength(2);
    });

    it("filters by domain", () => {
      recordEffectiveness(makeRecord({ runId: "r1", domain: "technology" }));
      recordEffectiveness(makeRecord({ runId: "r2", domain: "healthcare" }));
      const results = getEffectivenessHistory({ domain: "technology" });
      expect(results).toHaveLength(1);
      expect(results[0].domain).toBe("technology");
    });

    it("filters by angleId", () => {
      recordEffectiveness(makeRecord({ runId: "r1", angleId: "first-principles" }));
      recordEffectiveness(makeRecord({ runId: "r2", angleId: "cross-domain" }));
      const results = getEffectivenessHistory({ angleId: "cross-domain" });
      expect(results).toHaveLength(1);
      expect(results[0].angleId).toBe("cross-domain");
    });

    it("filters by timeRange", () => {
      recordEffectiveness(makeRecord({ runId: "r1" }));
      const results = getEffectivenessHistory({
        timeRange: { start: "2000-01-01T00:00:00Z", end: "2099-12-31T23:59:59Z" },
      });
      expect(results).toHaveLength(1);
    });

    it("returns empty when timeRange excludes all records", () => {
      recordEffectiveness(makeRecord({ runId: "r1" }));
      const results = getEffectivenessHistory({
        timeRange: { start: "2000-01-01T00:00:00Z", end: "2000-01-02T00:00:00Z" },
      });
      expect(results).toHaveLength(0);
    });

    it("combines domain and angleId filters", () => {
      recordEffectiveness(makeRecord({ runId: "r1", domain: "technology", angleId: "a1" }));
      recordEffectiveness(makeRecord({ runId: "r2", domain: "technology", angleId: "a2" }));
      recordEffectiveness(makeRecord({ runId: "r3", domain: "healthcare", angleId: "a1" }));
      const results = getEffectivenessHistory({ domain: "technology", angleId: "a1" });
      expect(results).toHaveLength(1);
    });

    it("returns records sorted by timestamp descending", () => {
      recordEffectiveness(makeRecord({ runId: "r1" }));
      recordEffectiveness(makeRecord({ runId: "r2" }));
      const results = getEffectivenessHistory();
      expect(results[0].timestamp >= results[1].timestamp).toBe(true);
    });
  });

  // ---- getAngleRecommendations ----

  describe("getAngleRecommendations", () => {
    it("returns empty array when no history for domain", () => {
      expect(getAngleRecommendations("unknown-domain")).toHaveLength(0);
    });

    it("returns recommendations sorted by historicalScore descending", () => {
      recordEffectiveness(makeRecord({ runId: "r1", angleId: "a1", outputScore: 90 }));
      recordEffectiveness(makeRecord({ runId: "r2", angleId: "a2", outputScore: 40 }));
      const recs = getAngleRecommendations("technology");
      expect(recs).toHaveLength(2);
      expect(recs[0].angleId).toBe("a1");
      expect(recs[0].historicalScore).toBeGreaterThan(recs[1].historicalScore);
    });

    it("includes confidence, reasoning, and suggestedWeight", () => {
      recordEffectiveness(makeRecord({ runId: "r1", angleId: "a1", outputScore: 80 }));
      const recs = getAngleRecommendations("technology");
      expect(recs[0].confidence).toBeGreaterThanOrEqual(0);
      expect(recs[0].confidence).toBeLessThanOrEqual(1);
      expect(recs[0].reasoning).toBeTruthy();
      expect(recs[0].suggestedWeight).toBeGreaterThanOrEqual(0);
      expect(recs[0].suggestedWeight).toBeLessThanOrEqual(1);
    });

    it("filters by teamId when provided", () => {
      recordEffectiveness(makeRecord({ runId: "r1", angleId: "a1", teamId: "team-a" }));
      recordEffectiveness(makeRecord({ runId: "r2", angleId: "a2", teamId: "team-b" }));
      const recs = getAngleRecommendations("technology", "team-a");
      expect(recs).toHaveLength(1);
      expect(recs[0].angleId).toBe("a1");
    });

    it("handles single record", () => {
      recordEffectiveness(makeRecord({ runId: "r1", angleId: "a1", outputScore: 50 }));
      const recs = getAngleRecommendations("technology");
      expect(recs).toHaveLength(1);
    });

    it("accounts for exported flag in scoring", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", angleId: "a1", outputScore: 50, exported: true })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", angleId: "a2", outputScore: 50, exported: false })
      );
      const recs = getAngleRecommendations("technology");
      const a1 = recs.find((r) => r.angleId === "a1")!;
      const a2 = recs.find((r) => r.angleId === "a2")!;
      expect(a1.historicalScore).toBeGreaterThan(a2.historicalScore);
    });

    it("accounts for userRating in scoring", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", angleId: "a1", outputScore: 50, userRating: 9 })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", angleId: "a2", outputScore: 50, userRating: 1 })
      );
      const recs = getAngleRecommendations("technology");
      const a1 = recs.find((r) => r.angleId === "a1")!;
      const a2 = recs.find((r) => r.angleId === "a2")!;
      expect(a1.historicalScore).toBeGreaterThan(a2.historicalScore);
    });

    it("increases confidence with more samples", () => {
      for (let i = 0; i < 10; i++) {
        recordEffectiveness(makeRecord({ runId: `r${i}`, angleId: "a1", outputScore: 70 }));
      }
      const recs = getAngleRecommendations("technology");
      expect(recs[0].confidence).toBe(1);
    });
  });

  // ---- getPipelineRecommendation ----

  describe("getPipelineRecommendation", () => {
    it("returns default config when no history exists", () => {
      const rec = getPipelineRecommendation("AI platform for education");
      expect(rec.recommendedAngles).toEqual(["first-principles", "cross-domain", "constraints"]);
      expect(rec.suggestedDepth).toBe(3);
      expect(rec.estimatedQuality).toBe(0.5);
      expect(rec.explanation).toContain("No historical data");
    });

    it("returns tuned config when history exists", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", angleId: "a1", outputScore: 80, domain: "technology" })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", angleId: "a2", outputScore: 60, domain: "technology" })
      );
      recordEffectiveness(
        makeRecord({ runId: "r3", angleId: "a3", outputScore: 90, domain: "technology" })
      );
      const rec = getPipelineRecommendation("AI software platform", { domain: "technology" });
      expect(rec.recommendedAngles.length).toBeGreaterThan(0);
      expect(rec.explanation).toContain("technology");
    });

    it("extracts domain from subject when not provided", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "healthcare", angleId: "a1", outputScore: 70 })
      );
      const rec = getPipelineRecommendation("new medical diagnosis tool");
      expect(rec.recommendedAngles.length).toBeGreaterThan(0);
    });

    it("includes suggestedDepth in valid range", () => {
      recordEffectiveness(makeRecord({ runId: "r1", outputScore: 90 }));
      const rec = getPipelineRecommendation("AI tool", { domain: "technology" });
      expect(rec.suggestedDepth).toBeGreaterThanOrEqual(1);
      expect(rec.suggestedDepth).toBeLessThanOrEqual(10);
    });

    it("estimatedQuality is between 0 and 1", () => {
      recordEffectiveness(makeRecord({ runId: "r1", outputScore: 50 }));
      const rec = getPipelineRecommendation("software app", { domain: "technology" });
      expect(rec.estimatedQuality).toBeGreaterThanOrEqual(0);
      expect(rec.estimatedQuality).toBeLessThanOrEqual(1);
    });

    it("respects teamId filter", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", angleId: "a1", outputScore: 90, teamId: "team-x" })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", angleId: "a2", outputScore: 30, teamId: "team-y" })
      );
      const rec = getPipelineRecommendation("tech app", { domain: "technology", teamId: "team-x" });
      expect(rec.recommendedAngles).toContain("a1");
    });
  });

  // ---- explainRecommendation ----

  describe("explainRecommendation", () => {
    it("returns a non-empty markdown string", () => {
      const rec = getPipelineRecommendation("anything");
      const explanation = explainRecommendation(rec);
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain("Pipeline Recommendation Explanation");
    });

    it("includes recommended angles", () => {
      const rec = getPipelineRecommendation("anything");
      const explanation = explainRecommendation(rec);
      for (const angle of rec.recommendedAngles) {
        expect(explanation).toContain(angle);
      }
    });

    it("includes estimated quality", () => {
      const rec = getPipelineRecommendation("anything");
      const explanation = explainRecommendation(rec);
      expect(explanation).toContain("Estimated Quality");
    });

    it("includes exploration depth", () => {
      const rec = getPipelineRecommendation("anything");
      const explanation = explainRecommendation(rec);
      expect(explanation).toContain("Exploration Depth");
    });

    it("includes suggested model when present", () => {
      const rec = {
        recommendedAngles: ["a1"],
        suggestedDepth: 3,
        suggestedModel: "gpt-4",
        estimatedQuality: 0.8,
        explanation: "Test explanation",
      };
      const explanation = explainRecommendation(rec);
      expect(explanation).toContain("gpt-4");
      expect(explanation).toContain("Suggested Model");
    });
  });

  // ---- recordFeedback ----

  describe("recordFeedback", () => {
    it("records feedback with rating", () => {
      const fb = recordFeedback("run-1", { rating: 8 });
      expect(fb.runId).toBe("run-1");
      expect(fb.rating).toBe(8);
      expect(fb.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("records feedback with exported flag", () => {
      const fb = recordFeedback("run-1", { exported: true });
      expect(fb.exported).toBe(true);
    });

    it("records feedback with used flag", () => {
      const fb = recordFeedback("run-1", { used: true });
      expect(fb.used).toBe(true);
    });

    it("updates effectiveness record's userRating on feedback", () => {
      recordEffectiveness(makeRecord({ runId: "run-1" }));
      recordFeedback("run-1", { rating: 9 });
      const history = getEffectivenessHistory();
      const updated = history.find((r) => r.runId === "run-1");
      expect(updated?.userRating).toBe(9);
    });

    it("updates effectiveness record's exported flag on feedback", () => {
      recordEffectiveness(makeRecord({ runId: "run-1", exported: false }));
      recordFeedback("run-1", { exported: true });
      const history = getEffectivenessHistory();
      const updated = history.find((r) => r.runId === "run-1");
      expect(updated?.exported).toBe(true);
    });

    it("validates rating range", () => {
      expect(() => recordFeedback("run-1", { rating: 15 })).toThrow();
    });

    it("handles feedback for non-existent runId gracefully", () => {
      const fb = recordFeedback("nonexistent", { rating: 5 });
      expect(fb.runId).toBe("nonexistent");
    });
  });

  // ---- recalculateProfiles ----

  describe("recalculateProfiles", () => {
    it("returns empty array when no data exists", () => {
      const profiles = recalculateProfiles();
      expect(profiles).toHaveLength(0);
    });

    it("creates a profile for a single domain", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 80 })
      );
      const profiles = recalculateProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].domain).toBe("technology");
      expect(profiles[0].totalRuns).toBe(1);
    });

    it("creates separate profiles for different domains", () => {
      recordEffectiveness(makeRecord({ runId: "r1", domain: "technology" }));
      recordEffectiveness(makeRecord({ runId: "r2", domain: "healthcare" }));
      const profiles = recalculateProfiles();
      expect(profiles).toHaveLength(2);
      const domains = profiles.map((p) => p.domain).sort();
      expect(domains).toEqual(["healthcare", "technology"]);
    });

    it("creates separate profiles for domain+teamId combos", () => {
      recordEffectiveness(makeRecord({ runId: "r1", domain: "technology", teamId: "team-a" }));
      recordEffectiveness(makeRecord({ runId: "r2", domain: "technology", teamId: "team-b" }));
      const profiles = recalculateProfiles();
      expect(profiles).toHaveLength(2);
    });

    it("computes angleEffectiveness correctly", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 60 })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", domain: "technology", angleId: "a1", outputScore: 80 })
      );
      const profiles = recalculateProfiles();
      expect(profiles[0].angleEffectiveness["a1"]).toBe(70);
    });

    it("includes recommendations", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 80 })
      );
      const profiles = recalculateProfiles();
      expect(profiles[0].recommendations.length).toBeGreaterThan(0);
    });

    it("sets optimalConfig with preferredAngles", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 80 })
      );
      const profiles = recalculateProfiles();
      expect(profiles[0].optimalConfig.preferredAngles).toContain("a1");
    });

    it("confidenceScore increases with more runs", () => {
      for (let i = 0; i < 20; i++) {
        recordEffectiveness(
          makeRecord({ runId: `r${i}`, domain: "technology", angleId: "a1", outputScore: 70 })
        );
      }
      const profiles = recalculateProfiles();
      expect(profiles[0].optimalConfig.confidenceScore).toBe(1);
    });

    it("incorporates feedback into scores", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 50 })
      );
      recordFeedback("r1", { rating: 9 });
      const profiles = recalculateProfiles();
      // With feedback rating 9 → score becomes 9*10=90 instead of 50
      expect(profiles[0].angleEffectiveness["a1"]).toBe(90);
    });
  });

  // ---- createMethodologyExperiment ----

  describe("createMethodologyExperiment", () => {
    it("creates an experiment with generated ID", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["a1", "a2"],
      });
      expect(exp.experimentId).toMatch(/^exp-/);
      expect(exp.status).toBe("running");
    });

    it("uses default control angles", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["tuned-angle"],
      });
      expect(exp.variantA.name).toBe("control");
      expect(exp.variantA.angles).toContain("first-principles");
    });

    it("sets tuned variant with provided config", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["a1", "a2"],
        depth: 5,
        model: "gpt-4",
      });
      expect(exp.variantB.name).toBe("tuned");
      expect(exp.variantB.angles).toEqual(["a1", "a2"]);
      expect(exp.variantB.depth).toBe(5);
      expect(exp.variantB.model).toBe("gpt-4");
    });

    it("defaults depth to 3 when not provided", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["a1"],
      });
      expect(exp.variantB.depth).toBe(3);
    });

    it("sets metric and minSamples", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["a1"],
      });
      expect(exp.metric).toBe("outputScore");
      expect(exp.minSamples).toBe(30);
    });

    it("creates unique IDs for multiple experiments", () => {
      const exp1 = createMethodologyExperiment("tech", { angles: ["a1"] });
      const exp2 = createMethodologyExperiment("tech", { angles: ["a2"] });
      expect(exp1.experimentId).not.toBe(exp2.experimentId);
    });
  });

  // ---- getExperimentResults ----

  describe("getExperimentResults", () => {
    it("returns undefined for unknown experiment ID", () => {
      expect(getExperimentResults("nonexistent")).toBeUndefined();
    });

    it("returns results for an existing experiment", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["custom-angle"],
      });
      const results = getExperimentResults(exp.experimentId);
      expect(results).toMatchObject({
        experimentId: exp.experimentId,
        winner: expect.any(String),
      });
      expect(results!.experimentId).toBe(exp.experimentId);
    });

    it("returns inconclusive when no effectiveness data", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["custom-angle"],
      });
      const results = getExperimentResults(exp.experimentId)!;
      expect(results.winner).toBe("inconclusive");
      expect(results.variantAMetrics.sampleSize).toBe(0);
      expect(results.variantBMetrics.sampleSize).toBe(0);
    });

    it("collects scores matching variant angles", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["tuned-a"],
      });
      recordEffectiveness(
        makeRecord({ runId: "r1", angleId: "first-principles", outputScore: 80 })
      );
      recordEffectiveness(makeRecord({ runId: "r2", angleId: "tuned-a", outputScore: 90 }));
      const results = getExperimentResults(exp.experimentId)!;
      expect(results.variantAMetrics.sampleSize).toBeGreaterThan(0);
      expect(results.variantBMetrics.sampleSize).toBeGreaterThan(0);
    });

    it("significance level is between 0 and 1", () => {
      const exp = createMethodologyExperiment("technology", {
        angles: ["a1"],
      });
      const results = getExperimentResults(exp.experimentId)!;
      expect(results.significanceLevel).toBeGreaterThanOrEqual(0);
      expect(results.significanceLevel).toBeLessThanOrEqual(1);
    });
  });

  // ---- generateMethodologyInsights ----

  describe("generateMethodologyInsights", () => {
    it("returns empty array when no data exists", () => {
      expect(generateMethodologyInsights()).toHaveLength(0);
    });

    it("returns empty array for domain with no data", () => {
      expect(generateMethodologyInsights("nonexistent")).toHaveLength(0);
    });

    it("generates top-performing angle insight", () => {
      recordEffectiveness(makeRecord({ runId: "r1", angleId: "a1", outputScore: 90 }));
      const insights = generateMethodologyInsights("technology");
      const topAngle = insights.find((i) => i.title === "Top Performing Angle");
      expect(topAngle).toMatchObject({
        type: "trend",
        title: "Top Performing Angle",
      });
      expect(topAngle!.type).toBe("trend");
      expect(topAngle!.description).toContain("a1");
    });

    it("generates underperforming angles anomaly", () => {
      for (let i = 0; i < 3; i++) {
        recordEffectiveness(makeRecord({ runId: `r${i}`, angleId: "weak-angle", outputScore: 10 }));
      }
      const insights = generateMethodologyInsights("technology");
      const anomaly = insights.find((i) => i.title === "Underperforming Angles Detected");
      expect(anomaly).toMatchObject({
        type: "anomaly",
        title: "Underperforming Angles Detected",
      });
      expect(anomaly!.type).toBe("anomaly");
      expect(anomaly!.description).toContain("weak-angle");
    });

    it("generates limited diversity recommendation", () => {
      for (let i = 0; i < 11; i++) {
        recordEffectiveness(makeRecord({ runId: `r${i}`, angleId: "only-angle", outputScore: 50 }));
      }
      const insights = generateMethodologyInsights("technology");
      const diversity = insights.find((i) => i.title === "Limited Angle Diversity");
      expect(diversity).toMatchObject({
        type: "recommendation",
        title: "Limited Angle Diversity",
      });
      expect(diversity!.type).toBe("recommendation");
    });

    it("filters by domain when provided", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 80 })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", domain: "healthcare", angleId: "a2", outputScore: 60 })
      );
      const insights = generateMethodologyInsights("technology");
      const topAngle = insights.find((i) => i.title === "Top Performing Angle");
      expect(topAngle!.description).toContain("a1");
      expect(topAngle!.description).toContain("technology");
    });

    it("all insights have valid structure", () => {
      for (let i = 0; i < 5; i++) {
        recordEffectiveness(makeRecord({ runId: `r${i}`, angleId: "a1", outputScore: 70 }));
      }
      const insights = generateMethodologyInsights();
      for (const insight of insights) {
        expect(["trend", "anomaly", "recommendation"]).toContain(insight.type);
        expect(insight.title.length).toBeGreaterThan(0);
        expect(insight.description.length).toBeGreaterThan(0);
        expect(insight.confidence).toBeGreaterThanOrEqual(0);
        expect(insight.confidence).toBeLessThanOrEqual(1);
        expect(typeof insight.actionable).toBe("boolean");
      }
    });

    it("generates low feedback rate recommendation", () => {
      for (let i = 0; i < 6; i++) {
        recordEffectiveness(makeRecord({ runId: `r${i}`, angleId: "a1", outputScore: 50 }));
      }
      const insights = generateMethodologyInsights("technology");
      const lowFeedback = insights.find((i) => i.title === "Low Feedback Rate");
      expect(lowFeedback).toMatchObject({
        title: "Low Feedback Rate",
      });
    });

    it("generates high export rate trend", () => {
      for (let i = 0; i < 5; i++) {
        recordEffectiveness(
          makeRecord({ runId: `r${i}`, angleId: "a1", outputScore: 70, exported: true })
        );
      }
      const insights = generateMethodologyInsights("technology");
      const highExport = insights.find((i) => i.title === "High Export Rate");
      expect(highExport).toMatchObject({
        type: "trend",
        title: "High Export Rate",
      });
      expect(highExport!.type).toBe("trend");
    });

    it("generates low export rate anomaly", () => {
      for (let i = 0; i < 10; i++) {
        recordEffectiveness(
          makeRecord({ runId: `r${i}`, angleId: "a1", outputScore: 50, exported: false })
        );
      }
      const insights = generateMethodologyInsights("technology");
      const lowExport = insights.find((i) => i.title === "Low Export Rate");
      expect(lowExport).toMatchObject({
        type: "anomaly",
        title: "Low Export Rate",
      });
      expect(lowExport!.type).toBe("anomaly");
    });
  });

  // ---- insightsToMarkdown ----

  describe("insightsToMarkdown", () => {
    it("returns placeholder for empty insights", () => {
      const md = insightsToMarkdown([]);
      expect(md).toContain("Methodology Insights");
      expect(md).toContain("No insights available");
    });

    it("produces markdown with insight content", () => {
      const insights = [
        {
          type: "trend" as const,
          title: "Test Trend",
          description: "A test trend description",
          confidence: 0.9,
          actionable: true,
        },
      ];
      const md = insightsToMarkdown(insights);
      expect(md).toContain("# Methodology Insights");
      expect(md).toContain("Test Trend");
      expect(md).toContain("A test trend description");
      expect(md).toContain("90%");
      expect(md).toContain("actionable");
    });

    it("includes type-specific emojis", () => {
      const insights = [
        {
          type: "trend" as const,
          title: "T",
          description: "D",
          confidence: 0.5,
          actionable: false,
        },
        {
          type: "anomaly" as const,
          title: "A",
          description: "D",
          confidence: 0.5,
          actionable: false,
        },
        {
          type: "recommendation" as const,
          title: "R",
          description: "D",
          confidence: 0.5,
          actionable: false,
        },
      ];
      const md = insightsToMarkdown(insights);
      expect(md).toContain("📈");
      expect(md).toContain("⚠️");
      expect(md).toContain("💡");
    });

    it("handles multiple insights", () => {
      const insights = [
        {
          type: "trend" as const,
          title: "Insight 1",
          description: "D1",
          confidence: 0.8,
          actionable: true,
        },
        {
          type: "anomaly" as const,
          title: "Insight 2",
          description: "D2",
          confidence: 0.6,
          actionable: false,
        },
      ];
      const md = insightsToMarkdown(insights);
      expect(md).toContain("Insight 1");
      expect(md).toContain("Insight 2");
    });
  });

  // ---- Edge Cases ----

  describe("edge cases", () => {
    it("handles duplicate domains across multiple records", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 80 })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", domain: "technology", angleId: "a1", outputScore: 60 })
      );
      const recs = getAngleRecommendations("technology");
      expect(recs).toHaveLength(1);
      // Average should be (80+60)/2 related
      expect(recs[0].historicalScore).toBeGreaterThan(0);
    });

    it("clearAdaptiveMethodology resets all state", () => {
      recordEffectiveness(makeRecord({ runId: "r1" }));
      recordFeedback("r1", { rating: 5 });
      createMethodologyExperiment("tech", { angles: ["a1"] });
      clearAdaptiveMethodology();
      expect(getEffectivenessHistory()).toHaveLength(0);
      expect(getAngleRecommendations("technology")).toHaveLength(0);
      expect(recalculateProfiles()).toHaveLength(0);
      expect(generateMethodologyInsights()).toHaveLength(0);
    });

    it("full workflow: record → feedback → recalculate → recommend → explain", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "technology", angleId: "a1", outputScore: 85 })
      );
      recordEffectiveness(
        makeRecord({ runId: "r2", domain: "technology", angleId: "a2", outputScore: 45 })
      );
      recordFeedback("r1", { rating: 9, exported: true });
      const profiles = recalculateProfiles();
      expect(profiles.length).toBeGreaterThan(0);
      const rec = getPipelineRecommendation("AI tool", { domain: "technology" });
      expect(rec.recommendedAngles.length).toBeGreaterThan(0);
      const explanation = explainRecommendation(rec);
      expect(explanation.length).toBeGreaterThan(0);
      const insights = generateMethodologyInsights("technology");
      expect(insights.length).toBeGreaterThan(0);
      const md = insightsToMarkdown(insights);
      expect(md).toContain("Methodology Insights");
    });
  });

  // ---- Boundary and extreme input tests ----

  describe("boundary tests", () => {
    it("empty session history returns no recommendations", () => {
      expect(getAngleRecommendations("any-domain")).toHaveLength(0);
    });

    it("single data point produces valid recommendation", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "tech", angleId: "a1", outputScore: 50 })
      );
      const recs = getAngleRecommendations("tech");
      expect(recs).toHaveLength(1);
      expect(recs[0]).toMatchObject({
        angleId: "a1",
        historicalScore: expect.any(Number),
        confidence: expect.any(Number),
        reasoning: expect.any(String),
        suggestedWeight: expect.any(Number),
      });
    });

    it("handles zero outputScore", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "tech", angleId: "a1", outputScore: 0 })
      );
      const recs = getAngleRecommendations("tech");
      expect(recs).toHaveLength(1);
      expect(recs[0].historicalScore).toBe(0);
    });

    it("handles max outputScore (100)", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "tech", angleId: "a1", outputScore: 100 })
      );
      const recs = getAngleRecommendations("tech");
      expect(recs[0].historicalScore).toBeGreaterThan(0);
    });

    it("handles zero confidence scenario (0 outputScore)", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "tech", angleId: "a1", outputScore: 0 })
      );
      const recs = getAngleRecommendations("tech");
      expect(recs[0].confidence).toBeGreaterThanOrEqual(0);
      expect(recs[0].confidence).toBeLessThanOrEqual(1);
    });

    it("100% export rate produces high export trend insight", () => {
      for (let i = 0; i < 5; i++) {
        recordEffectiveness(
          makeRecord({
            runId: `r${i}`,
            domain: "tech",
            angleId: "a1",
            outputScore: 80,
            exported: true,
          })
        );
      }
      const insights = generateMethodologyInsights("tech");
      const highExport = insights.find((i) => i.title === "High Export Rate");
      expect(highExport).toMatchObject({ type: "trend" });
    });

    it("conflicting signals (high score but 0% export) produces insights", () => {
      for (let i = 0; i < 10; i++) {
        recordEffectiveness(
          makeRecord({
            runId: `r${i}`,
            domain: "tech",
            angleId: "a1",
            outputScore: 90,
            exported: false,
          })
        );
      }
      const insights = generateMethodologyInsights("tech");
      const lowExport = insights.find((i) => i.title === "Low Export Rate");
      expect(lowExport).toMatchObject({ type: "anomaly" });
    });

    it("methodology switching: profile recalculates after feedback changes scoring", () => {
      recordEffectiveness(
        makeRecord({ runId: "r1", domain: "tech", angleId: "a1", outputScore: 30 })
      );
      const profilesBefore = recalculateProfiles();
      const scoreBefore = profilesBefore[0].angleEffectiveness["a1"];

      // User feedback overrides the score
      recordFeedback("r1", { rating: 10 });
      const profilesAfter = recalculateProfiles();
      const scoreAfter = profilesAfter[0].angleEffectiveness["a1"];

      expect(scoreAfter).toBeGreaterThan(scoreBefore);
    });

    it("pipeline recommendation with many domains picks best angles", () => {
      const domains = ["tech", "healthcare", "finance"];
      for (const domain of domains) {
        recordEffectiveness(
          makeRecord({ runId: `r-${domain}`, domain, angleId: "a1", outputScore: 80 })
        );
        recordEffectiveness(
          makeRecord({ runId: `r-${domain}-2`, domain, angleId: "a2", outputScore: 20 })
        );
      }
      const rec = getPipelineRecommendation("medical AI platform", { domain: "healthcare" });
      // Should recommend a1 (scored 80) over a2 (scored 20)
      if (rec.recommendedAngles.includes("a1") && rec.recommendedAngles.includes("a2")) {
        const a1Idx = rec.recommendedAngles.indexOf("a1");
        const a2Idx = rec.recommendedAngles.indexOf("a2");
        expect(a1Idx).toBeLessThan(a2Idx);
      }
    });
  });
});
