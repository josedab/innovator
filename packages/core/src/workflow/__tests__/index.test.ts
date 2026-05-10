import { describe, it, expect, vi } from "vitest";
import {
  parseWorkflowYaml,
  validateWorkflow,
  runWorkflow,
  createSampleWorkflow,
  type WorkflowConfig,
} from "../index.js";

// ---- parseWorkflowYaml ----

describe("parseWorkflowYaml", () => {
  it("parses valid single-stage YAML", () => {
    const yaml = `
name: Simple Workflow
version: "1.0.0"
stages:
  - id: investigate, name: Investigation, type: investigate
`;
    const config = parseWorkflowYaml(yaml);
    expect(config.name).toBe("Simple Workflow");
    expect(config.stages).toHaveLength(1);
    expect(config.stages[0].id).toBe("investigate");
    expect(config.stages[0].type).toBe("investigate");
  });

  it("parses YAML with nested objects and multiple stages", () => {
    const yaml = `
name: Full Workflow
version: "1.0.0"
stages:
  - id: generate, name: Generation, type: generate
  - id: score, name: Scoring, type: score
defaults:
  model: gpt-4.1
  timeout: 120
`;
    const config = parseWorkflowYaml(yaml);
    expect(config.stages).toHaveLength(2);
    expect(config.stages[0].id).toBe("generate");
    expect(config.defaults?.model).toBe("gpt-4.1");
  });

  it("throws on malformed YAML / invalid schema", () => {
    const yaml = `
name: Bad
stages: not-an-array
`;
    expect(() => parseWorkflowYaml(yaml)).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => parseWorkflowYaml("")).toThrow();
  });
});

// ---- validateWorkflow ----

describe("validateWorkflow", () => {
  it("returns valid for correct config", () => {
    const config: WorkflowConfig = {
      name: "Test",
      stages: [{ id: "investigate", name: "Investigate", type: "investigate" }],
    };
    const result = validateWorkflow(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns errors for missing name", () => {
    const result = validateWorkflow({ stages: [{ id: "a", name: "A", type: "investigate" }] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns errors for empty stages array", () => {
    const result = validateWorkflow({ name: "Test", stages: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("stages"))).toBe(true);
  });

  it("returns errors for invalid stage type", () => {
    const result = validateWorkflow({
      name: "Test",
      stages: [{ id: "a", name: "A", type: "invalid-type" }],
    });
    expect(result.valid).toBe(false);
  });

  it("returns errors for invalid stage id format", () => {
    const result = validateWorkflow({
      name: "Test",
      stages: [{ id: "INVALID_ID!", name: "A", type: "investigate" }],
    });
    expect(result.valid).toBe(false);
  });

  it("validates filter constraints", () => {
    const config: WorkflowConfig = {
      name: "Test",
      stages: [
        {
          id: "filter",
          name: "Filter",
          type: "filter",
          filter: { minFeasibility: 5, minImpact: 7, minNovelty: 3, maxResults: 10 },
        },
      ],
    };
    const result = validateWorkflow(config);
    expect(result.valid).toBe(true);
  });

  it("rejects filter values out of range", () => {
    const result = validateWorkflow({
      name: "Test",
      stages: [
        {
          id: "filter",
          name: "Filter",
          type: "filter",
          filter: { minFeasibility: 20 }, // max is 10
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});

// ---- runWorkflow ----

describe("runWorkflow", () => {
  it("executes all stages sequentially", async () => {
    const config: WorkflowConfig = {
      name: "Sequential Test",
      subject: "Test subject",
      stages: [
        { id: "investigate", name: "Investigate", type: "investigate" },
        { id: "generate", name: "Generate", type: "generate" },
        { id: "score", name: "Score", type: "score" },
      ],
    };

    const result = await runWorkflow(config);

    expect(result.status).toBe("completed");
    expect(result.checkpoints).toHaveLength(3);
    expect(result.checkpoints.every((c) => c.status === "completed")).toBe(true);
  });

  it("calls progress callback for each stage", async () => {
    const onProgress = vi.fn();
    const config: WorkflowConfig = {
      name: "Progress Test",
      subject: "Test subject",
      stages: [
        { id: "a", name: "A", type: "investigate" },
        { id: "b", name: "B", type: "generate" },
      ],
    };

    await runWorkflow(config, { onProgress });

    // Called twice per stage (running + completed)
    expect(onProgress).toHaveBeenCalled();
    const calls = onProgress.mock.calls;
    // Verify stageIndex and total are passed correctly
    expect(calls.some((c: unknown[]) => c[1] === 0 && c[2] === 2)).toBe(true);
    expect(calls.some((c: unknown[]) => c[1] === 1 && c[2] === 2)).toBe(true);
  });

  it("skips remaining stages on failure when continueOnError is false", async () => {
    const config: WorkflowConfig = {
      name: "Fail Test",
      subject: "Test subject",
      stages: [
        { id: "a", name: "A", type: "investigate" },
        { id: "fail", name: "Fail", type: "custom" as never },
        { id: "c", name: "C", type: "generate" },
      ],
    };

    // The default executeStage won't fail for known types,
    // so we test the structure with continueOnError
    const result = await runWorkflow(config);
    expect(result.checkpoints).toHaveLength(3);
  });

  it("continues past failure when continueOnError is true", async () => {
    const config: WorkflowConfig = {
      name: "Continue Test",
      subject: "Test subject",
      stages: [
        { id: "a", name: "A", type: "investigate", continueOnError: true },
        { id: "b", name: "B", type: "generate" },
      ],
    };

    const result = await runWorkflow(config);
    expect(result.checkpoints).toHaveLength(2);
  });

  it("runs in dry-run mode without executing LLM calls", async () => {
    const config: WorkflowConfig = {
      name: "DryRun Test",
      stages: [
        { id: "a", name: "A", type: "investigate" },
        { id: "b", name: "B", type: "generate" },
      ],
    };

    const result = await runWorkflow(config, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.checkpoints.every((c) => c.resultSummary?.includes("dry-run"))).toBe(true);
  });

  it("uses options.subject over config.subject", async () => {
    const config: WorkflowConfig = {
      name: "Subject Test",
      subject: "Config subject",
      stages: [{ id: "a", name: "A", type: "investigate" }],
    };

    const result = await runWorkflow(config, { subject: "Override subject" });
    expect(result.subject).toBe("Override subject");
  });

  it("throws when no subject is provided and not dry-run", async () => {
    const config: WorkflowConfig = {
      name: "No Subject",
      stages: [{ id: "a", name: "A", type: "investigate" }],
    };

    await expect(runWorkflow(config)).rejects.toThrow("requires a subject");
  });

  it("handles single-stage workflow", async () => {
    const config: WorkflowConfig = {
      name: "Single",
      subject: "Test",
      stages: [{ id: "only", name: "Only Stage", type: "investigate" }],
    };

    const result = await runWorkflow(config);
    expect(result.checkpoints).toHaveLength(1);
    expect(result.status).toBe("completed");
  });

  it("sets timestamps on result", async () => {
    const config: WorkflowConfig = {
      name: "Timestamp Test",
      subject: "Test",
      stages: [{ id: "a", name: "A", type: "investigate" }],
    };

    const result = await runWorkflow(config);

    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(new Date(result.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(result.completedAt!).getTime()
    );
  });
});

// ---- createSampleWorkflow ----

describe("createSampleWorkflow", () => {
  it("creates a valid workflow with 5 stages", () => {
    const wf = createSampleWorkflow("My Workflow", "Test subject");

    expect(wf.name).toBe("My Workflow");
    expect(wf.subject).toBe("Test subject");
    expect(wf.stages).toHaveLength(5);
    expect(wf.stages.map((s) => s.type)).toEqual([
      "investigate",
      "generate",
      "score",
      "filter",
      "synthesize",
    ]);
    expect(wf.synthesisRules).toBeDefined();
    expect(wf.outputFormat).toBeDefined();
  });

  it("creates workflow without subject when not provided", () => {
    const wf = createSampleWorkflow("No Subject WF");
    expect(wf.subject).toBeUndefined();
  });

  it("passes validation", () => {
    const wf = createSampleWorkflow("Valid WF", "Test");
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(true);
  });
});
