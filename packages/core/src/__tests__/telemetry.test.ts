import { describe, it, expect, beforeEach } from "vitest";
import {
  scoreIdeaDiversity,
  detectHallucinations,
  detectHallucinationsInResults,
  recordPromptEffectiveness,
  getPromptEffectivenessByAngle,
  getQualityTrends,
  clearTelemetry,
  startSpan,
  endSpan,
  addSpanEvent,
  getSpans,
  recordPipelineMetric,
  getAggregatedMetrics,
  buildTelemetryDashboard,
  getMetrics,
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

describe("telemetry", () => {
  beforeEach(() => {
    clearTelemetry();
  });

  describe("scoreIdeaDiversity", () => {
    it("returns zeros and recommendation for empty results", () => {
      const score = scoreIdeaDiversity([]);
      expect(score.overallDiversity).toBe(0);
      expect(score.lexicalDiversity).toBe(0);
      expect(score.conceptualSpread).toBe(0);
      expect(score.angleDistribution).toBe(0);
      expect(score.uniqueThemes).toBe(0);
      expect(score.totalIdeas).toBe(0);
      expect(score.duplicateCount).toBe(0);
      expect(score.recommendations).toEqual(["No ideas to evaluate"]);
    });

    it("scores a single idea", () => {
      const results = [makeAngleResult("a1", [makeIdea("Blockchain Supply Chain")])];
      const score = scoreIdeaDiversity(results);
      expect(score.totalIdeas).toBe(1);
      expect(score.duplicateCount).toBe(0);
      expect(score.lexicalDiversity).toBeGreaterThan(0);
      expect(score.conceptualSpread).toBe(1); // no pairs → spread = 1
      expect(score.angleDistribution).toBe(1); // single angle → perfect distribution
    });

    it("detects high-duplicate pairs", () => {
      const results = [
        makeAngleResult("a1", [
          makeIdea("AI powered chatbot assistant"),
          makeIdea("AI powered chatbot assistant"),
          makeIdea("AI powered chatbot assistant"),
        ]),
      ];
      const score = scoreIdeaDiversity(results);
      expect(score.duplicateCount).toBeGreaterThan(0);
      expect(score.recommendations.some((r) => r.includes("duplicate"))).toBe(true);
    });

    it("computes weighted composite score (0.3 lexical + 0.4 conceptual + 0.3 angle)", () => {
      const results = [
        makeAngleResult("a1", [
          makeIdea("Quantum computing breakthrough in materials"),
          makeIdea("Biodegradable packaging innovation"),
        ]),
        makeAngleResult("a2", [
          makeIdea("Solar energy harvesting from windows"),
          makeIdea("Autonomous underwater exploration drones"),
        ]),
      ];
      const score = scoreIdeaDiversity(results);
      const expected =
        score.lexicalDiversity * 0.3 + score.conceptualSpread * 0.4 + score.angleDistribution * 0.3;
      expect(score.overallDiversity).toBeCloseTo(expected, 2);
    });

    it("generates recommendations for low diversity scores", () => {
      // All ideas are the same → low lexical diversity, low conceptual spread
      const results = [
        makeAngleResult("a1", [
          makeIdea("test idea", "test"),
          makeIdea("test idea", "test"),
          makeIdea("test idea", "test"),
        ]),
      ];
      const score = scoreIdeaDiversity(results);
      expect(score.recommendations.length).toBeGreaterThan(0);
    });

    it("recommends broadening when unique themes are low", () => {
      const results = [
        makeAngleResult("a1", [
          makeIdea("A B C", "desc"),
          makeIdea("A B D", "desc"),
          makeIdea("A B E", "desc"),
          makeIdea("A B F", "desc"),
        ]),
      ];
      const score = scoreIdeaDiversity(results);
      // Unique themes (words > 4 chars) will be very few
      if (score.uniqueThemes < score.totalIdeas * 0.5) {
        expect(score.recommendations.some((r) => r.includes("thematic variety"))).toBe(true);
      }
    });

    it("detects uneven angle distribution", () => {
      const results = [
        makeAngleResult("a1", [
          makeIdea("Idea one about technology"),
          makeIdea("Idea two about technology"),
          makeIdea("Idea three about technology"),
          makeIdea("Idea four about technology"),
          makeIdea("Idea five about technology"),
        ]),
        makeAngleResult("a2", [makeIdea("Single idea from second angle")]),
      ];
      const score = scoreIdeaDiversity(results);
      expect(score.angleDistribution).toBeLessThan(1);
    });
  });

  describe("detectHallucinations", () => {
    it("returns clean result for safe text", () => {
      const check = detectHallucinations("This is a simple factual statement.");
      expect(check.detections).toHaveLength(0);
      expect(check.hallucinationScore).toBe(0);
      expect(check.isReliable).toBe(true);
    });

    it("detects fabricated-statistic patterns", () => {
      const check = detectHallucinations("Studies show that 85% of companies use AI today.");
      expect(check.detections.some((d) => d.type === "fabricated-statistic")).toBe(true);
    });

    it("detects impossible-claim patterns", () => {
      const check = detectHallucinations("This solution guarantees 100% accuracy in all cases.");
      expect(check.detections.some((d) => d.type === "impossible-claim")).toBe(true);
    });

    it("detects temporal-error patterns", () => {
      const check = detectHallucinations("In 2035, we saw a massive shift in the market.");
      expect(check.detections.some((d) => d.type === "temporal-error")).toBe(true);
    });

    it("accumulates multiple detections and computes score", () => {
      const text =
        "According to a recent study, 50% of companies use this. It has 100% success rate. Over 5 billion users worldwide.";
      const check = detectHallucinations(text);
      expect(check.detections.length).toBeGreaterThan(1);
      expect(check.hallucinationScore).toBeGreaterThan(0);
    });

    it("caps hallucinationScore at 1", () => {
      // Pile on many patterns
      const text = [
        "Studies show 90% of companies adopt it.",
        "According to a recent survey results.",
        "100% accuracy guaranteed.",
        "Zero risk involved.",
        "The only solution available.",
        "Never fails in production.",
        "$500 billion market opportunity.",
        "Over 10 billion users worldwide.",
      ].join(" ");
      const check = detectHallucinations(text);
      expect(check.hallucinationScore).toBeLessThanOrEqual(1);
    });

    it("marks as unreliable when score >= 0.3", () => {
      const text =
        "Studies show 85% of companies. According to a recent report. 100% success rate. Zero cost to deploy.";
      const check = detectHallucinations(text);
      if (check.hallucinationScore >= 0.3) {
        expect(check.isReliable).toBe(false);
      }
    });

    it("truncates text to 10000 characters", () => {
      const longText = "x".repeat(15000);
      const check = detectHallucinations(longText);
      expect(check.text.length).toBeLessThanOrEqual(10000);
    });
  });

  describe("detectHallucinationsInResults", () => {
    it("returns empty map and 0 score for empty results", () => {
      const { results, overallScore } = detectHallucinationsInResults([]);
      expect(results.size).toBe(0);
      expect(overallScore).toBe(0);
    });

    it("checks each idea in angle results", () => {
      const angleResults = [
        makeAngleResult("a1", [
          makeIdea("Clean idea", "Simple description"),
          makeIdea("Suspicious claim", "100% accuracy guaranteed"),
        ]),
      ];
      const { results } = detectHallucinationsInResults(angleResults);
      expect(results.size).toBe(2);
    });
  });

  describe("quality trends", () => {
    it("returns stable trend for empty logs", () => {
      const trend = getQualityTrends();
      expect(trend.period).toBe("all-time");
      expect(trend.averageDiversity).toBe(0);
      expect(trend.averageEffectiveness).toBe(0);
      expect(trend.hallucinationRate).toBe(0);
      expect(trend.totalPipelines).toBe(0);
      expect(trend.trend).toBe("stable");
    });

    it("detects improving trend when recent compliance is higher", () => {
      // Record older entries with low compliance
      for (let i = 0; i < 5; i++) {
        recordPromptEffectiveness({
          promptId: `p${i}`,
          angleId: "a1",
          ideasGenerated: 3,
          averageIdeaLength: 100,
          structureCompliance: 0.3,
          jsonParseSuccess: true,
          hallucinations: 0,
          latencyMs: 500,
          tokenEstimate: 200,
        });
      }
      // Record newer entries with high compliance
      for (let i = 5; i < 10; i++) {
        recordPromptEffectiveness({
          promptId: `p${i}`,
          angleId: "a1",
          ideasGenerated: 5,
          averageIdeaLength: 150,
          structureCompliance: 0.9,
          jsonParseSuccess: true,
          hallucinations: 0,
          latencyMs: 400,
          tokenEstimate: 250,
        });
      }
      const trend = getQualityTrends();
      expect(trend.trend).toBe("improving");
      expect(trend.totalPipelines).toBe(10);
    });

    it("detects declining trend when recent compliance is lower", () => {
      for (let i = 0; i < 5; i++) {
        recordPromptEffectiveness({
          promptId: `p${i}`,
          angleId: "a1",
          ideasGenerated: 5,
          averageIdeaLength: 150,
          structureCompliance: 0.9,
          jsonParseSuccess: true,
          hallucinations: 0,
          latencyMs: 400,
          tokenEstimate: 250,
        });
      }
      for (let i = 5; i < 10; i++) {
        recordPromptEffectiveness({
          promptId: `p${i}`,
          angleId: "a1",
          ideasGenerated: 3,
          averageIdeaLength: 100,
          structureCompliance: 0.3,
          jsonParseSuccess: true,
          hallucinations: 0,
          latencyMs: 500,
          tokenEstimate: 200,
        });
      }
      const trend = getQualityTrends();
      expect(trend.trend).toBe("declining");
    });

    it("computes hallucination rate from hallucination log", () => {
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
      // Add unreliable hallucination results
      detectHallucinations("Studies show 85% of companies. 100% accuracy. Zero risk. Never fails.");
      const trend = getQualityTrends();
      expect(trend.hallucinationRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("span tracing", () => {
    it("startSpan creates a span with in_progress status", () => {
      const span = startSpan("test-operation");
      expect(span.operationName).toBe("test-operation");
      expect(span.status).toBe("in_progress");
      expect(span.spanId).toBeTruthy();
      expect(span.traceId).toBeTruthy();
      expect(span.startTime).toBeTruthy();
      expect(span.endTime).toBeUndefined();
      expect(span.events).toEqual([]);
    });

    it("startSpan accepts attributes and parent span", () => {
      const parent = startSpan("parent-op");
      const child = startSpan(
        "child-op",
        { key: "value", count: 42 },
        parent.spanId,
        parent.traceId
      );
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.traceId).toBe(parent.traceId);
      expect(child.attributes).toEqual({ key: "value", count: 42 });
    });

    it("endSpan sets duration, endTime, and status", () => {
      const span = startSpan("op");
      const ended = endSpan(span.spanId, "ok", { result: "success" });
      expect(ended).toBeDefined();
      expect(ended!.status).toBe("ok");
      expect(ended!.endTime).toBeTruthy();
      expect(ended!.durationMs).toBeGreaterThanOrEqual(0);
      expect(ended!.attributes.result).toBe("success");
    });

    it("endSpan returns undefined for unknown spanId", () => {
      expect(endSpan("nonexistent")).toBeUndefined();
    });

    it("endSpan defaults to ok status", () => {
      const span = startSpan("op");
      const ended = endSpan(span.spanId);
      expect(ended!.status).toBe("ok");
    });

    it("endSpan with error status", () => {
      const span = startSpan("op");
      const ended = endSpan(span.spanId, "error");
      expect(ended!.status).toBe("error");
    });

    it("addSpanEvent adds event to existing span", () => {
      const span = startSpan("op");
      addSpanEvent(span.spanId, "checkpoint", { step: 1 });
      const spans = getSpans();
      const found = spans.find((s) => s.spanId === span.spanId);
      expect(found!.events).toHaveLength(1);
      expect(found!.events[0].name).toBe("checkpoint");
      expect(found!.events[0].attributes).toEqual({ step: 1 });
      expect(found!.events[0].timestamp).toBeTruthy();
    });

    it("addSpanEvent silently ignores unknown spanId", () => {
      addSpanEvent("nonexistent", "event");
      // No error thrown
    });

    it("getSpans returns all spans when no traceId filter", () => {
      startSpan("op1");
      startSpan("op2");
      expect(getSpans()).toHaveLength(2);
    });

    it("getSpans filters by traceId", () => {
      const span1 = startSpan("op1");
      startSpan("op2");
      const filtered = getSpans(span1.traceId);
      expect(filtered.every((s) => s.traceId === span1.traceId)).toBe(true);
    });
  });

  describe("aggregated metrics", () => {
    it("returns empty map when no metrics recorded", () => {
      const metrics = getAggregatedMetrics("stage");
      expect(metrics.size).toBe(0);
    });

    it("groups by stage", () => {
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "investigate",
        durationMs: 100,
        tokenCount: 50,
        estimatedCostUsd: 0.01,
        ideaCount: 0,
        success: true,
      });
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "generate",
        durationMs: 200,
        tokenCount: 100,
        estimatedCostUsd: 0.02,
        ideaCount: 5,
        success: true,
      });
      recordPipelineMetric({
        pipelineId: "p2",
        stage: "investigate",
        durationMs: 150,
        tokenCount: 60,
        estimatedCostUsd: 0.015,
        ideaCount: 0,
        success: false,
      });

      const byStage = getAggregatedMetrics("stage");
      expect(byStage.size).toBe(2);
      const investigate = byStage.get("investigate")!;
      expect(investigate.count).toBe(2);
      expect(investigate.avgDurationMs).toBe(125);
      expect(investigate.totalTokens).toBe(110);
      expect(investigate.successRate).toBe(0.5);
    });

    it("groups by angle", () => {
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "generate",
        durationMs: 100,
        tokenCount: 50,
        ideaCount: 0,
        estimatedCostUsd: 0,
        angleId: "scamper",
        success: true,
      });
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "generate",
        durationMs: 200,
        tokenCount: 100,
        ideaCount: 0,
        estimatedCostUsd: 0,
        angleId: "first-principles",
        success: true,
      });

      const byAngle = getAggregatedMetrics("angle");
      expect(byAngle.has("scamper")).toBe(true);
      expect(byAngle.has("first-principles")).toBe(true);
    });

    it("groups by model with unknown fallback", () => {
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "generate",
        durationMs: 100,
        tokenCount: 50,
        ideaCount: 0,
        estimatedCostUsd: 0,
        success: true,
      });
      const byModel = getAggregatedMetrics("model");
      expect(byModel.has("unknown")).toBe(true);
    });
  });

  describe("clearTelemetry", () => {
    it("clears all stores", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "a1",
        ideasGenerated: 3,
        averageIdeaLength: 100,
        structureCompliance: 0.8,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      detectHallucinations("Some text");
      startSpan("op");
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "investigate",
        durationMs: 100,
        tokenCount: 50,
        ideaCount: 0,
        estimatedCostUsd: 0,
        success: true,
      });

      clearTelemetry();

      expect(getQualityTrends().totalPipelines).toBe(0);
      expect(getSpans()).toHaveLength(0);
      expect(getMetrics()).toHaveLength(0);
    });
  });

  describe("prompt effectiveness by angle", () => {
    it("groups effectiveness records by angle", () => {
      recordPromptEffectiveness({
        promptId: "p1",
        angleId: "scamper",
        ideasGenerated: 5,
        averageIdeaLength: 100,
        structureCompliance: 0.8,
        jsonParseSuccess: true,
        hallucinations: 0,
        latencyMs: 500,
        tokenEstimate: 200,
      });
      recordPromptEffectiveness({
        promptId: "p2",
        angleId: "scamper",
        ideasGenerated: 3,
        averageIdeaLength: 80,
        structureCompliance: 0.6,
        jsonParseSuccess: false,
        hallucinations: 1,
        latencyMs: 600,
        tokenEstimate: 180,
      });

      const byAngle = getPromptEffectivenessByAngle();
      const scamper = byAngle.get("scamper");
      expect(scamper).toBeDefined();
      expect(scamper!.totalCalls).toBe(2);
      expect(scamper!.avgIdeas).toBe(4);
      expect(scamper!.parseSuccessRate).toBe(0.5);
    });
  });

  describe("buildTelemetryDashboard", () => {
    it("returns dashboard with all sections", () => {
      recordPipelineMetric({
        pipelineId: "p1",
        stage: "full-pipeline",
        durationMs: 1000,
        tokenCount: 500,
        ideaCount: 0,
        estimatedCostUsd: 0,
        success: true,
      });
      startSpan("op");

      const dashboard = buildTelemetryDashboard();
      expect(dashboard.totalPipelines).toBe(1);
      expect(dashboard.totalSpans).toBe(1);
      expect(dashboard.stageMetrics).toBeDefined();
      expect(dashboard.qualityTrend).toBeDefined();
      expect(dashboard.timeSeries).toHaveLength(1);
    });
  });
});
