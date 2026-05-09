import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementCounter,
  setGauge,
  observeHistogram,
  renderPrometheusMetrics,
  recordPipelineExecution,
  recordLLMLatency,
  clearMetrics,
  getAllMetrics,
} from "../observability/metrics.js";

describe("Prometheus metrics collector", () => {
  beforeEach(() => {
    clearMetrics();
  });

  // ---- Counter ----

  describe("incrementCounter", () => {
    it("increments by 1 by default", () => {
      incrementCounter("test_total", "Test counter");
      const metrics = getAllMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(1);
    });

    it("increments by custom amount", () => {
      incrementCounter("test_total", "Test counter", {}, 5);
      const metrics = getAllMetrics();
      expect(metrics[0].value).toBe(5);
    });

    it("accumulates across multiple increments", () => {
      incrementCounter("test_total", "Test counter");
      incrementCounter("test_total", "Test counter");
      incrementCounter("test_total", "Test counter");
      const metrics = getAllMetrics();
      expect(metrics[0].value).toBe(3);
    });

    it("tracks multiple label combinations independently", () => {
      incrementCounter("req_total", "Requests", { method: "GET" });
      incrementCounter("req_total", "Requests", { method: "POST" });
      incrementCounter("req_total", "Requests", { method: "GET" });
      const metrics = getAllMetrics().filter((m) => m.name === "req_total");
      expect(metrics).toHaveLength(2);
      const getMetric = metrics.find((m) => m.labels.method === "GET");
      const postMetric = metrics.find((m) => m.labels.method === "POST");
      expect(getMetric!.value).toBe(2);
      expect(postMetric!.value).toBe(1);
    });
  });

  // ---- Gauge ----

  describe("setGauge", () => {
    it("sets a gauge value", () => {
      setGauge("temp", "Temperature", 42);
      const metrics = getAllMetrics();
      expect(metrics[0].value).toBe(42);
    });

    it("overwrites previous gauge value", () => {
      setGauge("temp", "Temperature", 42);
      setGauge("temp", "Temperature", 99);
      const metrics = getAllMetrics();
      expect(metrics[0].value).toBe(99);
    });
  });

  // ---- Histogram ----

  describe("observeHistogram", () => {
    it("distributes value into correct buckets", () => {
      observeHistogram("latency", "Latency", 150);
      const output = renderPrometheusMetrics();
      // 150 should be in buckets >= 150 (250, 500, 1000, ..., +Inf)
      expect(output).toContain("latency_bucket");
      expect(output).toContain("latency_count");
    });

    it("value exceeding all finite buckets goes to Infinity bucket", () => {
      observeHistogram("latency", "Latency", 999999);
      const output = renderPrometheusMetrics();
      expect(output).toContain('le="+Inf"} 1');
    });

    it("small value lands in smallest applicable bucket", () => {
      observeHistogram("latency", "Latency", 5, {}, [10, 100, 1000]);
      const output = renderPrometheusMetrics();
      // Value 5 <= 10, so bucket 10 should have count 1
      expect(output).toContain('le="10"} 1');
    });

    it("tracks count correctly across multiple observations", () => {
      observeHistogram("latency", "Latency", 100);
      observeHistogram("latency", "Latency", 200);
      observeHistogram("latency", "Latency", 300);
      const output = renderPrometheusMetrics();
      expect(output).toMatch(/latency_count\s+3/);
    });
  });

  // ---- Prometheus Format ----

  describe("renderPrometheusMetrics", () => {
    it("renders valid HELP and TYPE lines", () => {
      incrementCounter("my_counter", "A helpful description");
      const output = renderPrometheusMetrics();
      expect(output).toContain("# HELP my_counter A helpful description");
      expect(output).toContain("# TYPE my_counter counter");
    });

    it("renders labels in correct format", () => {
      incrementCounter("req_total", "Requests", { method: "GET", path: "/api" });
      const output = renderPrometheusMetrics();
      expect(output).toContain('req_total{method="GET",path="/api"} 1');
    });

    it("renders empty labels without braces", () => {
      incrementCounter("simple", "Simple counter");
      const output = renderPrometheusMetrics();
      expect(output).toContain("simple 1");
      expect(output).not.toContain("simple{");
    });

    it("returns empty-ish output when no metrics registered", () => {
      const output = renderPrometheusMetrics();
      expect(output.trim()).toBe("");
    });
  });

  // ---- Pre-defined metrics helpers ----

  describe("recordPipelineExecution", () => {
    it("records counter and histogram for successful execution", () => {
      recordPipelineExecution("investigate", 500, "gpt-5", true, 1000, 0.03);
      const metrics = getAllMetrics();
      const counterNames = metrics.map((m) => m.name);
      expect(counterNames).toContain("innovator_pipeline_executions_total");
      expect(counterNames).toContain("innovator_llm_tokens_total");
      expect(counterNames).toContain("innovator_llm_cost_usd_total");
    });

    it("records error counter on failure", () => {
      recordPipelineExecution("generate", 100, "gpt-5", false);
      const metrics = getAllMetrics();
      const errorMetric = metrics.find((m) => m.name === "innovator_pipeline_errors_total");
      expect(errorMetric).toBeDefined();
    });
  });

  describe("recordLLMLatency", () => {
    it("records histogram observation", () => {
      recordLLMLatency("openai", "gpt-5", 350);
      const output = renderPrometheusMetrics();
      expect(output).toContain("innovator_llm_request_duration_ms");
    });
  });

  // ---- clearMetrics ----

  describe("clearMetrics", () => {
    it("resets all state", () => {
      incrementCounter("test", "Test");
      setGauge("gauge", "Gauge", 42);
      clearMetrics();
      const metrics = getAllMetrics();
      expect(metrics).toHaveLength(0);
      expect(renderPrometheusMetrics().trim()).toBe("");
    });
  });
});
