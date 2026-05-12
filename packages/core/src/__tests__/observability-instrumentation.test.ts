import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../telemetry/index.js", () => ({
  startSpan: vi.fn().mockReturnValue({
    traceId: "trace-123",
    spanId: "span-1",
    operationName: "pipeline.investigate",
    startTime: new Date().toISOString(),
  }),
  endSpan: vi.fn(),
  addSpanEvent: vi.fn(),
}));

vi.mock("../observability/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../observability/metrics.js", () => ({
  recordPipelineExecution: vi.fn(),
  recordLLMLatency: vi.fn(),
}));

import {
  beginStage,
  endStage,
  addStageEvent,
  getActiveStages,
  clearActiveStages,
} from "../observability/instrumentation.js";
import { startSpan, endSpan, addSpanEvent } from "../telemetry/index.js";
import { logger } from "../observability/logger.js";
import { recordPipelineExecution, recordLLMLatency } from "../observability/metrics.js";

describe("observability/instrumentation", () => {
  beforeEach(() => {
    clearActiveStages();
    vi.clearAllMocks();
    let spanCounter = 0;
    vi.mocked(startSpan).mockImplementation(
      (opName) =>
        ({
          traceId: "trace-123",
          spanId: `span-${++spanCounter}`,
          operationName: opName,
          startTime: new Date().toISOString(),
        }) as ReturnType<typeof startSpan>
    );
  });

  describe("beginStage", () => {
    it("creates a span and tracks the stage", () => {
      const { stageId, span } = beginStage("investigate", { model: "gpt-4.1" });
      expect(stageId).toBe("span-1");
      expect(span.traceId).toBe("trace-123");
      expect(startSpan).toHaveBeenCalledWith(
        "pipeline.investigate",
        expect.objectContaining({ stage: "investigate", model: "gpt-4.1" }),
        undefined,
        undefined
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Pipeline stage started: investigate",
        expect.any(Object)
      );
      expect(getActiveStages()).toHaveLength(1);
      expect(getActiveStages()[0].stage).toBe("investigate");
    });

    it("passes traceId and parentSpanId to startSpan", () => {
      beginStage("generate", {}, "trace-abc", "parent-span");
      expect(startSpan).toHaveBeenCalledWith(
        "pipeline.generate",
        expect.objectContaining({ stage: "generate" }),
        "parent-span",
        "trace-abc"
      );
    });

    it("initializes tokenUsage to zero", () => {
      beginStage("investigate");
      const stages = getActiveStages();
      expect(stages[0].tokenUsage).toEqual({ input: 0, output: 0 });
    });
  });

  describe("endStage", () => {
    it("records duration and metrics on success", () => {
      const { stageId } = beginStage("investigate");
      const result = endStage(stageId, {
        success: true,
        tokenUsage: { input: 100, output: 200 },
        model: "gpt-4.1",
      });

      expect(result).toBeDefined();
      expect(result!.stage).toBe("investigate");
      expect(result!.endTime).toBeDefined();
      expect(result!.durationMs).toBeGreaterThanOrEqual(0);
      expect(result!.tokenUsage).toEqual({ input: 100, output: 200 });
      expect(result!.model).toBe("gpt-4.1");

      expect(endSpan).toHaveBeenCalledWith(stageId, "ok", expect.any(Object));
      expect(recordPipelineExecution).toHaveBeenCalledWith(
        "investigate",
        expect.any(Number),
        "gpt-4.1",
        true,
        300,
        0
      );
      // recordLLMLatency only called when durationMs > 0
      // In test, duration may be 0 since begin/end happen same tick
      expect(getActiveStages()).toHaveLength(0);
    });

    it("records error status on failure", () => {
      const { stageId } = beginStage("generate");
      const result = endStage(stageId, {
        success: false,
        error: "LLM timeout",
      });

      expect(result!.error).toBe("LLM timeout");
      expect(endSpan).toHaveBeenCalledWith(stageId, "error", expect.any(Object));
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("failed"),
        expect.any(Object)
      );
    });

    it("returns undefined for unknown stageId", () => {
      expect(endStage("nonexistent")).toBeUndefined();
    });

    it("defaults to success when success is not specified", () => {
      const { stageId } = beginStage("synthesize");
      endStage(stageId);
      expect(endSpan).toHaveBeenCalledWith(stageId, "ok", expect.any(Object));
    });

    it("uses 'unknown' model when not specified", () => {
      const { stageId } = beginStage("score");
      endStage(stageId, { success: true });
      expect(recordPipelineExecution).toHaveBeenCalledWith(
        "score",
        expect.any(Number),
        "unknown",
        true,
        0,
        0
      );
    });
  });

  describe("addStageEvent", () => {
    it("delegates to telemetry addSpanEvent", () => {
      const { stageId } = beginStage("investigate");
      addStageEvent(stageId, "retry", { attempt: 2 });
      expect(addSpanEvent).toHaveBeenCalledWith(stageId, "retry", { attempt: 2 });
    });
  });

  describe("clearActiveStages", () => {
    it("removes all active stages", () => {
      beginStage("investigate");
      beginStage("generate");
      expect(getActiveStages()).toHaveLength(2);
      clearActiveStages();
      expect(getActiveStages()).toHaveLength(0);
    });
  });
});
