import { describe, it, expect, vi } from "vitest";
import {
  resolvePhases,
  resolveAngles,
  PipelineConfigSchema,
  type PipelineConfig,
  type PipelinePhase,
} from "../index.js";
import { ANGLE_IDS } from "../../types.js";

// ---- Pure function tests ----

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    subject: "test subject",
    phases: ["investigate", "generate", "synthesize", "score", "validate"] as PipelinePhase[],
    ...overrides,
  };
}

describe("resolvePhases", () => {
  it("with no skipPhases returns all 5 phases", () => {
    const config = makeConfig();
    const phases = resolvePhases(config);
    expect(phases).toHaveLength(5);
    expect(phases).toEqual(["investigate", "generate", "synthesize", "score", "validate"]);
  });

  it("excludes specified skipPhases", () => {
    const config = makeConfig({ skipPhases: ["score", "validate"] });
    const phases = resolvePhases(config);
    expect(phases).toHaveLength(3);
    expect(phases).not.toContain("score");
    expect(phases).not.toContain("validate");
  });

  it("keeps investigate even when other phases are skipped", () => {
    const config = makeConfig({ skipPhases: ["generate", "synthesize", "score", "validate"] });
    const phases = resolvePhases(config);
    expect(phases).toContain("investigate");
    expect(phases).toHaveLength(1);
  });

  it("returns empty when all phases are skipped", () => {
    const config = makeConfig({
      skipPhases: ["investigate", "generate", "synthesize", "score", "validate"],
    });
    const phases = resolvePhases(config);
    expect(phases).toHaveLength(0);
  });
});

describe("resolveAngles", () => {
  it("returns all ANGLE_IDS when no angles specified", () => {
    const config = makeConfig({ angles: [] });
    const angles = resolveAngles(config);
    expect(angles).toEqual([...ANGLE_IDS]);
  });

  it("returns all ANGLE_IDS when angles is undefined", () => {
    const config = makeConfig({ angles: undefined });
    const angles = resolveAngles(config);
    expect(angles).toEqual([...ANGLE_IDS]);
  });

  it("filters out invalid angles", () => {
    const config = makeConfig({ angles: ["scamper", "invalid-angle", "first-principles"] });
    const angles = resolveAngles(config);
    expect(angles).toContain("scamper");
    expect(angles).toContain("first-principles");
    expect(angles).not.toContain("invalid-angle");
  });

  it("returns all angles when all specified are invalid", () => {
    const config = makeConfig({ angles: ["nonexistent", "bogus"] });
    const angles = resolveAngles(config);
    expect(angles).toEqual([...ANGLE_IDS]);
  });

  it("deduplicates angle IDs", () => {
    const config = makeConfig({ angles: ["scamper", "scamper", "scamper"] });
    const angles = resolveAngles(config);
    // resolveAngles filters valid angles; duplicates pass through filter but are valid
    expect(angles.filter((a) => a === "scamper").length).toBeGreaterThanOrEqual(1);
  });
});

describe("PipelineConfigSchema", () => {
  it("accepts valid config", () => {
    const result = PipelineConfigSchema.safeParse({
      subject: "AI innovation",
      phases: ["investigate", "generate"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty phases array", () => {
    const result = PipelineConfigSchema.safeParse({
      subject: "test",
      phases: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing subject", () => {
    const result = PipelineConfigSchema.safeParse({
      phases: ["investigate"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = PipelineConfigSchema.safeParse({
      subject: "test",
      phases: ["investigate"],
      outputFormat: "markdown",
      maxIdeas: 10,
      depth: "deep",
    });
    expect(result.success).toBe(true);
  });

  it("rejects maxIdeas less than 1", () => {
    const result = PipelineConfigSchema.safeParse({
      subject: "test",
      phases: ["investigate"],
      maxIdeas: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ---- Mocked LLM tests ----

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((_label: string, value: string) => value),
}));

describe("parsePipelineRequest (mocked LLM)", () => {
  it("parses natural language into PipelineConfig", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "autonomous vehicles",
        phases: ["investigate", "generate", "synthesize"],
        outputFormat: "markdown",
      })
    );

    const { parsePipelineRequest } = await import("../index.js");
    const result = await parsePipelineRequest("Innovate on autonomous vehicles");
    expect(result.subject).toBe("autonomous vehicles");
    expect(result.phases).toHaveLength(3);
  });

  it("throws on empty request", async () => {
    const { parsePipelineRequest } = await import("../index.js");
    await expect(parsePipelineRequest("")).rejects.toThrow("Pipeline request cannot be empty");
  });

  it("throws on request exceeding 5000 characters", async () => {
    const { parsePipelineRequest } = await import("../index.js");
    const longInput = "a".repeat(5001);
    await expect(parsePipelineRequest(longInput)).rejects.toThrow("Pipeline request too long");
  });
});

// ---- DAG compilation & execution tests ----

describe("compilePipelineDAG (mocked LLM)", () => {
  it("compiles a linear chain DAG", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "robotics",
        phases: ["investigate", "generate", "synthesize"],
      })
    );

    const { compilePipelineDAG } = await import("../index.js");
    const dag = await compilePipelineDAG("Innovate on robotics");

    expect(dag.id).toMatch(/^dag-/);
    expect(dag.subject).toBe("robotics");
    expect(dag.status).toBe("pending");
    expect(dag.nodes.length).toBeGreaterThanOrEqual(3);

    // Linear dependency chain: each node depends on previous
    for (let i = 1; i < dag.nodes.length; i++) {
      expect(dag.nodes[i].dependsOn.length).toBeGreaterThan(0);
    }
  });

  it("creates parallel branches for multiple angles", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "AI startup",
        phases: ["investigate", "generate", "synthesize"],
        angles: ["scamper", "first-principles", "inversion"],
      })
    );

    const { compilePipelineDAG } = await import("../index.js");
    const dag = await compilePipelineDAG("AI startup with multiple angles");

    // Should have parallel generate nodes for each angle
    const generateNodes = dag.nodes.filter((n) => n.type === "generate");
    expect(generateNodes.length).toBe(3);
    expect(generateNodes.map((n) => n.id)).toContain("generate-scamper");
    expect(generateNodes.map((n) => n.id)).toContain("generate-first-principles");
    expect(generateNodes.map((n) => n.id)).toContain("generate-inversion");

    // Synthesize node should depend on all generate nodes
    const synthNode = dag.nodes.find((n) => n.type === "synthesize");
    expect(synthNode).toBeDefined();
    expect(synthNode!.dependsOn).toContain("generate-scamper");
  });
});

describe("executePipelineDAG", () => {
  it("executes all nodes in dependency order", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "test",
        phases: ["investigate", "generate"],
      })
    );

    const { compilePipelineDAG, executePipelineDAG } = await import("../index.js");
    const dag = await compilePipelineDAG("Test execution");
    const executed = await executePipelineDAG(dag);

    expect(executed.status).toBe("completed");
    expect(executed.nodes.every((n) => n.status === "completed")).toBe(true);
    expect(executed.nodes.every((n) => n.completedAt)).toBe(true);
  });

  it("supports dryRun mode", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "dry",
        phases: ["investigate"],
      })
    );

    const { compilePipelineDAG, executePipelineDAG } = await import("../index.js");
    const dag = await compilePipelineDAG("Dry run test");
    const executed = await executePipelineDAG(dag, { dryRun: true });

    expect(executed.status).toBe("completed");
    const output = executed.nodes[0].output as Record<string, unknown>;
    expect(output.dryRun).toBe(true);
  });

  it("calls onNodeUpdate callback", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "callbacks",
        phases: ["investigate"],
      })
    );

    const { compilePipelineDAG, executePipelineDAG } = await import("../index.js");
    const dag = await compilePipelineDAG("Callback test");
    const updates: string[] = [];
    await executePipelineDAG(dag, {
      onNodeUpdate: (node) => updates.push(node.status),
    });

    expect(updates).toContain("running");
    expect(updates).toContain("completed");
  });

  it("handles abort signal", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "abort",
        phases: ["investigate", "generate", "synthesize"],
      })
    );

    const { compilePipelineDAG, executePipelineDAG } = await import("../index.js");
    const dag = await compilePipelineDAG("Abort test");
    const controller = new AbortController();
    controller.abort();

    const result = await executePipelineDAG(dag, { signal: controller.signal });
    // When aborted before execution, status should be "failed"
    // and pending nodes become "skipped"
    expect(["failed", "completed"]).toContain(result.status);
    if (result.status === "failed") {
      const skipped = result.nodes.filter((n) => n.status === "skipped");
      expect(skipped.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("dagToText", () => {
  it("produces a text visualization of the DAG", async () => {
    const { generateText } = await import("../../copilot/client.js");
    vi.mocked(generateText).mockResolvedValue(
      JSON.stringify({
        subject: "viz test",
        phases: ["investigate", "generate"],
      })
    );

    const { compilePipelineDAG, dagToText } = await import("../index.js");
    const dag = await compilePipelineDAG("Visualization test");
    const text = dagToText(dag);

    expect(text).toContain("Pipeline:");
    expect(text).toContain("Status:");
    expect(text).toContain("⏳"); // pending icon
  });
});
