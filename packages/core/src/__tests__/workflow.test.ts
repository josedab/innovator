import { describe, it, expect } from "vitest";
import { validateWorkflow, createSampleWorkflow, runWorkflow } from "../workflow/index.js";
import type { WorkflowConfig, WorkflowCheckpoint } from "../workflow/index.js";

describe("workflow", () => {
  describe("validateWorkflow", () => {
    it("validates a correct workflow config", () => {
      const config = createSampleWorkflow("test-workflow", "AI in education");
      const result = validateWorkflow(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty stages", () => {
      const result = validateWorkflow({ name: "test", stages: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects missing name", () => {
      const result = validateWorkflow({ stages: [{ id: "s1", name: "S1", type: "investigate" }] });
      expect(result.valid).toBe(false);
    });

    it("rejects invalid stage type", () => {
      const result = validateWorkflow({
        name: "test",
        stages: [{ id: "s1", name: "S1", type: "invalid" }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("createSampleWorkflow", () => {
    it("creates a valid sample workflow", () => {
      const config = createSampleWorkflow("my-workflow", "Test Subject");
      expect(config.name).toBe("my-workflow");
      expect(config.subject).toBe("Test Subject");
      expect(config.stages.length).toBeGreaterThan(0);
      expect(config.synthesisRules).toBeDefined();
      expect(config.outputFormat).toBeDefined();
    });

    it("creates workflow without subject", () => {
      const config = createSampleWorkflow("no-subject");
      expect(config.subject).toBeUndefined();
    });
  });

  describe("runWorkflow", () => {
    it("runs a dry-run workflow successfully", async () => {
      const config = createSampleWorkflow("test", "AI");
      const result = await runWorkflow(config, { dryRun: true });
      expect(result.status).toBe("completed");
      expect(result.dryRun).toBe(true);
      expect(result.checkpoints).toHaveLength(config.stages.length);
      expect(result.checkpoints.every((c) => c.status === "completed")).toBe(true);
    });

    it("tracks progress via callback", async () => {
      const config = createSampleWorkflow("test", "AI");
      const progress: WorkflowCheckpoint[] = [];
      await runWorkflow(config, {
        dryRun: true,
        onProgress: (checkpoint) => progress.push({ ...checkpoint }),
      });
      expect(progress.length).toBeGreaterThan(0);
    });

    it("throws without subject in non-dry-run mode", async () => {
      const config = createSampleWorkflow("test");
      await expect(runWorkflow(config)).rejects.toThrow("subject");
    });

    it("respects abort signal", async () => {
      const config = createSampleWorkflow("test", "AI");
      const controller = new AbortController();
      controller.abort();
      const result = await runWorkflow(config, { dryRun: true, signal: controller.signal });
      expect(result.checkpoints).toHaveLength(0);
    });

    it("uses subject from options over config", async () => {
      const config = createSampleWorkflow("test", "Config Subject");
      const result = await runWorkflow(config, { subject: "Override Subject", dryRun: true });
      expect(result.subject).toBe("Override Subject");
    });
  });
});
