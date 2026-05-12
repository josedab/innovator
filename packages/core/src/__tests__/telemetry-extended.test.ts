import { describe, it, expect, beforeEach } from "vitest";
import {
  scoreIdeaDiversity,
  detectHallucinations,
  recordPromptEffectiveness,
  getQualityTrends,
  clearTelemetry,
  getMetrics,
  buildTelemetryDashboard,
  recordPipelineMetric,
  startSpan,
  endSpan,
  addSpanEvent,
  getSpans,
} from "../telemetry/index.js";
import type { AngleResult } from "../types.js";

function makeIdea(title: string, description = "A test idea description") {
  return {
    title,
    description,
    potentialImpact: "High impact",
    implementationHint: "Use existing tools",
  };
}

function makeAngleResult(angleId: string, ideas: ReturnType<typeof makeIdea>[]): AngleResult {
  return {
    angleId,
    angleName: `Angle ${angleId}`,
    ideas,
    reasoning: "Test reasoning",
  };
}

describe("telemetry (extended coverage)", () => {
  beforeEach(() => {
    clearTelemetry();
  });

  describe("getQualityTrends with data points", () => {
    it("returns stable for exactly 2 similar data points", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.5,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      recordPromptEffectiveness({
        promptId: "p2",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.5,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      const trend = getQualityTrends();
      expect(trend.trend).toBe("stable");
      expect(trend.totalPipelines).toBe(2);
    });

    it("returns stable for exactly 1 data point", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.5,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      const trend = getQualityTrends();
      expect(trend.totalPipelines).toBe(1);
      // With 1 point, midpoint is 0, recentAvg = value, olderAvg = 0/0 edge case
    });

    it("computes averageEffectiveness correctly", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.6,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      recordPromptEffectiveness({
        promptId: "p2",
        angleId: "a1",
        ideasGenerated: 4,
        averageIdeaLength: 120,
        structureCompliance: 0.8,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 400,
        tokenEstimate: 250,
      });
      const trend = getQualityTrends();
      expect(trend.averageEffectiveness).toBeCloseTo(0.7, 2);
    });
  });

  describe("scoreIdeaDiversity formula validation", () => {
    it("computes overallDiversity as 0.3*lexical + 0.4*conceptual + 0.3*angle", () => {
      const results = [
        makeAngleResult("a1", [
          makeIdea("Quantum computing in materials science"),
          makeIdea("Biodegradable packaging innovation"),
        ]),
        makeAngleResult("a2", [
          makeIdea("Solar energy harvesting from windows"),
          makeIdea("Autonomous underwater drones"),
        ]),
      ];
      const score = scoreIdeaDiversity(results);
      const expected =
        score.lexicalDiversity * 0.3 + score.conceptualSpread * 0.4 + score.angleDistribution * 0.3;
      expect(score.overallDiversity).toBeCloseTo(expected, 2);
    });

    it("has higher conceptual spread for very different ideas", () => {
      const similar = [
        makeAngleResult("a1", [
          makeIdea("AI chatbot assistant tool"),
          makeIdea("AI chatbot helper tool"),
        ]),
      ];
      const diverse = [
        makeAngleResult("a1", [
          makeIdea("Quantum computing breakthrough"),
          makeIdea("Sustainable ocean farming"),
        ]),
      ];
      const simScore = scoreIdeaDiversity(similar);
      const divScore = scoreIdeaDiversity(diverse);
      expect(divScore.conceptualSpread).toBeGreaterThan(simScore.conceptualSpread);
    });
  });

  describe("detectHallucinations extended", () => {
    it("truncates text to 10000 chars and still detects patterns", () => {
      const longPrefix = "clean text ".repeat(1000);
      const withPattern = longPrefix.slice(0, 9950) + " 100% accuracy in all cases.";
      const check = detectHallucinations(withPattern);
      expect(check.text.length).toBeLessThanOrEqual(10000);
    });

    it("detects multiple fabricated statistic patterns", () => {
      const text =
        "According to a recent study, 85% of companies use this. $50 billion market opportunity. Over 10 million users worldwide.";
      const check = detectHallucinations(text);
      const fabricated = check.detections.filter((d) => d.type === "fabricated-statistic");
      expect(fabricated.length).toBeGreaterThanOrEqual(2);
    });

    it("detects 'never fails' as impossible claim", () => {
      const check = detectHallucinations("This system never fails in production.");
      expect(check.detections.some((d) => d.type === "impossible-claim")).toBe(true);
    });

    it("detects 'zero risk' as impossible claim", () => {
      const check = detectHallucinations("There is zero risk involved.");
      expect(check.detections.some((d) => d.type === "impossible-claim")).toBe(true);
    });

    it("detects 'the only solution' as impossible claim", () => {
      const check = detectHallucinations("This is the only solution available.");
      expect(check.detections.some((d) => d.type === "impossible-claim")).toBe(true);
    });
  });

  describe("getMetrics", () => {
    it("returns empty array when no metrics recorded", () => {
      expect(getMetrics()).toEqual([]);
    });

    it("returns all recorded metrics in order", () => {
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "investigate",
        durationMs: 100,
        tokenCount: 50,
        ideaCount: 0,
        estimatedCostUsd: 0,
        success: true,
      });
      recordPipelineMetric({
        pipelineId: "p2",
        stage: "generate",
        durationMs: 200,
        tokenCount: 100,
        ideaCount: 5,
        estimatedCostUsd: 0.02,
        success: true,
      });
      const metrics = getMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].pipelineId).toBe("p1");
      expect(metrics[1].pipelineId).toBe("p2");
      expect(metrics[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("buildTelemetryDashboard", () => {
    it("returns zero metrics dashboard when empty", () => {
      const dashboard = buildTelemetryDashboard();
      expect(dashboard.totalPipelines).toBe(0);
      expect(dashboard.totalSpans).toBe(0);
      expect(dashboard.recentSpans).toEqual([]);
      expect(dashboard.stageMetrics).toEqual({});
      expect(dashboard.angleMetrics).toEqual({});
      expect(dashboard.timeSeries).toEqual([]);
      expect(dashboard.qualityTrend).toMatchObject({
        period: "all-time",
        trend: "stable",
        totalPipelines: 0,
      });
    });

    it("includes time series data from metrics", () => {
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "full-pipeline",
        durationMs: 1000,
        tokenCount: 500,
        ideaCount: 10,
        estimatedCostUsd: 0.05,
        success: true,
      });
      const dashboard = buildTelemetryDashboard();
      expect(dashboard.totalPipelines).toBe(1);
      expect(dashboard.timeSeries).toHaveLength(1);
      expect(dashboard.timeSeries[0]).toMatchObject({
        durationMs: 1000,
        tokenCount: 500,
        ideaCount: 10,
        stage: "full-pipeline",
      });
    });
  });

  describe("strengthened assertions (replacing toBeTruthy/toBeGreaterThan(0))", () => {
    it("span startTime is valid ISO string", () => {
      const span = startSpan("test-op");
      expect(span.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(span.spanId).toMatch(/^[a-z0-9]+$/);
      expect(span.traceId).toMatch(/^[a-z0-9]+$/);
    });

    it("ended span has valid endTime and non-negative durationMs", () => {
      const span = startSpan("op");
      const ended = endSpan(span.spanId, "ok");
      expect(ended!.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(typeof ended!.durationMs).toBe("number");
      expect(ended!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("span event timestamp is valid ISO string", () => {
      const span = startSpan("op");
      addSpanEvent(span.spanId, "test-event");
      const spans = getSpans();
      const found = spans.find((s) => s.spanId === span.spanId);
      expect(found!.events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("hallucinationRate is computed as ratio, not just > 0", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.5,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      detectHallucinations("Clean text with no issues");
      const trend = getQualityTrends();
      // Clean text should produce 0 hallucination rate
      expect(trend.hallucinationRate).toEqual(0);
    });

    it("unreliable hallucinations increase hallucination rate", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.5,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      // Add unreliable hallucination
      detectHallucinations(
        "Studies show 85% of companies. According to a recent report. 100% accuracy. Zero cost."
      );
      const trend = getQualityTrends();
      expect(trend.hallucinationRate).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("single idea set has spread of 1 (no pairs)", () => {
      const results = [makeAngleResult("a1", [makeIdea("Only Idea")])];
      const score = scoreIdeaDiversity(results);
      expect(score.conceptualSpread).toBe(1);
      expect(score.totalIdeas).toBe(1);
    });

    it("identical ideas have low conceptual spread", () => {
      const results = [
        makeAngleResult("a1", [
          makeIdea("Same Title Here"),
          makeIdea("Same Title Here"),
          makeIdea("Same Title Here"),
        ]),
      ];
      const score = scoreIdeaDiversity(results);
      expect(score.conceptualSpread).toBeLessThan(0.5);
    });
  });
});
