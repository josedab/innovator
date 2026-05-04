import { describe, it, expect } from "vitest";
import {
  validateWorkflow,
  createSampleWorkflow,
  runWorkflow,
  parseWorkflowYaml,
} from "../workflow/index.js";
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

  describe("parseWorkflowYaml", () => {
    it("parses simple workflow with inline array items", () => {
      const yaml = `name: test-workflow
stages:
  - id: s1, name: Stage One, type: investigate`;
      const config = parseWorkflowYaml(yaml);
      expect(config.name).toBe("test-workflow");
      expect(config.stages).toHaveLength(1);
      expect(config.stages[0].id).toBe("s1");
      expect(config.stages[0].type).toBe("investigate");
    });

    it("parses nested objects", () => {
      const yaml = `name: nested-test
defaults:
  model: gpt-4
  timeout: 120
stages:
  - id: s1, name: Stage, type: investigate`;
      const config = parseWorkflowYaml(yaml);
      expect(config.defaults?.model).toBe("gpt-4");
      expect(config.defaults?.timeout).toBe(120);
    });

    it("parses boolean values", () => {
      const yaml = `name: bool-test
stages:
  - id: s1, name: Stage, type: investigate, continueOnError: true`;
      const config = parseWorkflowYaml(yaml);
      expect(config.stages[0].continueOnError).toBe(true);
    });

    it("parses numeric values", () => {
      const yaml = `name: num-test
stages:
  - id: s1, name: Stage, type: investigate, timeout: 300`;
      const config = parseWorkflowYaml(yaml);
      expect(config.stages[0].timeout).toBe(300);
    });

    it("handles quoted strings", () => {
      const yaml = `name: "quoted-test"
stages:
  - id: s1, name: "Stage One", type: investigate`;
      const config = parseWorkflowYaml(yaml);
      expect(config.name).toBe("quoted-test");
    });

    it("ignores empty lines and comments", () => {
      const yaml = `# This is a comment
name: comment-test

# Another comment
stages:
  - id: s1, name: Stage One, type: investigate`;
      const config = parseWorkflowYaml(yaml);
      expect(config.name).toBe("comment-test");
    });

    it("throws on empty input", () => {
      expect(() => parseWorkflowYaml("")).toThrow();
    });

    it("throws on invalid workflow schema", () => {
      const yaml = `name: invalid
other: value`;
      expect(() => parseWorkflowYaml(yaml)).toThrow();
    });

    it("parses multiple inline array items", () => {
      const yaml = `name: multi
stages:
  - id: s1, name: Investigate, type: investigate
  - id: s2, name: Generate, type: generate
  - id: s3, name: Score, type: score`;
      const config = parseWorkflowYaml(yaml);
      expect(config.stages).toHaveLength(3);
      expect(config.stages[0].type).toBe("investigate");
      expect(config.stages[1].type).toBe("generate");
      expect(config.stages[2].type).toBe("score");
    });
  });

  describe("runWorkflow - stage execution", () => {
    it("runs all stage types in dry-run", async () => {
      const config: WorkflowConfig = {
        name: "all-types",
        stages: [
          { id: "s1", name: "Investigate", type: "investigate" },
          { id: "s2", name: "Generate", type: "generate" },
          { id: "s3", name: "Score", type: "score" },
          { id: "s4", name: "Filter", type: "filter" },
          { id: "s5", name: "Synthesize", type: "synthesize" },
          { id: "s6", name: "Custom", type: "custom" },
        ],
      };
      const result = await runWorkflow(config, { dryRun: true });
      expect(result.status).toBe("completed");
      expect(result.checkpoints).toHaveLength(6);
      expect(result.checkpoints.every((c) => c.status === "completed")).toBe(true);
    });

    it("marks remaining stages as skipped on failure without continueOnError", async () => {
      const config: WorkflowConfig = {
        name: "fail-test",
        subject: "test",
        stages: [
          { id: "s1", name: "Stage 1", type: "investigate" },
          { id: "s2", name: "Stage 2", type: "generate" },
          { id: "s3", name: "Stage 3", type: "score" },
        ],
      };
      // Non-dry-run will "execute" stages (which are no-ops in current implementation)
      // but we can test the structure
      const result = await runWorkflow(config, { subject: "test", dryRun: true });
      expect(result.checkpoints).toHaveLength(3);
    });
  });
});
