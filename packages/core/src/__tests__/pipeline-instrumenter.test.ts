import { describe, it, expect, beforeEach } from "vitest";
import { PipelineInstrumenter } from "../learning-loop/pipeline-instrumenter.js";

describe("PipelineInstrumenter", () => {
  let inst: PipelineInstrumenter;

  beforeEach(() => {
    inst = new PipelineInstrumenter();
  });

  describe("startStage", () => {
    it("returns a unique event id", () => {
      const id = inst.startStage("s1", "investigation", "input text");
      expect(id).toMatch(/^evt-/);
    });

    it("increments the size counter", () => {
      inst.startStage("s1", "investigation", "input");
      inst.startStage("s1", "generation", "input");
      expect(inst.size).toBe(2);
    });

    it("stores angleId and model from options", () => {
      const id = inst.startStage("s1", "generation", "input", {
        angleId: "biomimicry",
        model: "gpt-4",
      });
      const events = inst.getSessionEvents("s1");
      const event = events.find((e) => e.id === id);
      expect(event?.angleId).toBe("biomimicry");
      expect(event?.model).toBe("gpt-4");
    });

    it("truncates input to 2000 chars", () => {
      const longInput = "x".repeat(3000);
      const id = inst.startStage("s1", "investigation", longInput);
      const events = inst.getSessionEvents("s1");
      const event = events.find((e) => e.id === id);
      expect(event?.inputSummary.length).toBe(2000);
    });
  });

  describe("endStage", () => {
    it("records duration and output", () => {
      const id = inst.startStage("s1", "investigation", "input");
      const result = inst.endStage(id, "output text", {
        relevance: 8,
        novelty: 7,
      });
      expect(result).toBeDefined();
      expect(result!.duration).toBeGreaterThanOrEqual(0);
      expect(result!.outputSummary).toBe("output text");
      expect(result!.qualityMetrics?.relevance).toBe(8);
    });

    it("returns undefined for unknown eventId", () => {
      const result = inst.endStage("nonexistent", "output");
      expect(result).toBeUndefined();
    });

    it("truncates output to 2000 chars", () => {
      const id = inst.startStage("s1", "investigation", "input");
      const longOutput = "y".repeat(3000);
      const result = inst.endStage(id, longOutput);
      expect(result!.outputSummary!.length).toBe(2000);
    });
  });

  describe("getSessionEvents", () => {
    it("returns events for the given session ordered by timestamp", () => {
      inst.startStage("s1", "investigation", "first");
      inst.startStage("s1", "generation", "second");
      inst.startStage("s2", "debate", "other session");
      const events = inst.getSessionEvents("s1");
      expect(events).toHaveLength(2);
      expect(events[0].stage).toBe("investigation");
      expect(events[1].stage).toBe("generation");
    });

    it("returns empty array for unknown session", () => {
      expect(inst.getSessionEvents("nonexistent")).toHaveLength(0);
    });
  });

  describe("getAggregateMetrics", () => {
    it("computes averages grouped by stage", () => {
      const id1 = inst.startStage("s1", "investigation", "input1");
      inst.endStage(id1, "output1", { overallScore: 8 });
      const id2 = inst.startStage("s1", "investigation", "input2");
      inst.endStage(id2, "output2", { overallScore: 6 });

      const metrics = inst.getAggregateMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].stage).toBe("investigation");
      expect(metrics[0].eventCount).toBe(2);
      expect(metrics[0].qualityDistribution.averageOverall).toBe(7);
    });

    it("filters by stage", () => {
      inst.startStage("s1", "investigation", "input");
      inst.startStage("s1", "generation", "input");
      const metrics = inst.getAggregateMetrics({ stage: "generation" });
      expect(metrics).toHaveLength(1);
      expect(metrics[0].stage).toBe("generation");
    });

    it("filters by sessionId", () => {
      inst.startStage("s1", "investigation", "input");
      inst.startStage("s2", "investigation", "input");
      const metrics = inst.getAggregateMetrics({ sessionId: "s1" });
      expect(metrics[0].eventCount).toBe(1);
    });

    it("returns empty for no matching events", () => {
      expect(inst.getAggregateMetrics({ stage: "debate" })).toHaveLength(0);
    });

    it("handles events without duration", () => {
      inst.startStage("s1", "investigation", "input");
      const metrics = inst.getAggregateMetrics();
      expect(metrics[0].averageDuration).toBe(0);
      expect(metrics[0].minDuration).toBe(0);
      expect(metrics[0].maxDuration).toBe(0);
    });
  });
});
