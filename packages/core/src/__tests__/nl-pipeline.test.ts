import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((l: string, c: string) => `[${l}]: ${c}`),
}));

const mockParsePipelineRequest = vi.fn();
const mockCompilePipelineDAG = vi.fn();

vi.mock("../pipeline-builder/index.js", () => ({
  parsePipelineRequest: (...args: unknown[]) => mockParsePipelineRequest(...args),
  compilePipelineDAG: (...args: unknown[]) => mockCompilePipelineDAG(...args),
  PipelineConfigSchema: {
    parse: vi.fn((v: unknown) => v),
  },
}));

import {
  parseNLIntent,
  refinePipeline,
  NLPipelineSession,
  dryRunPipeline,
  validatePipelineConfig,
  suggestPipelineFromGoal,
  pipelineSessionToMarkdown,
} from "../nl-pipeline/index.js";
import type { PipelineConfig, PipelineDAG, DAGNode } from "../pipeline-builder/index.js";

// ---- Helpers ----

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    subject: "AI in healthcare",
    phases: ["investigate", "generate", "synthesize"],
    ...overrides,
  } as PipelineConfig;
}

function makeNode(overrides?: Partial<DAGNode>): DAGNode {
  return {
    id: "investigate-0",
    type: "investigate",
    label: "Investigate",
    dependsOn: [],
    status: "pending",
    ...overrides,
  } as DAGNode;
}

function makeDAG(nodes?: DAGNode[], overrides?: Partial<PipelineDAG>): PipelineDAG {
  return {
    id: "dag-1",
    name: "Test Pipeline",
    nodes: nodes ?? [
      makeNode({ id: "investigate-0", type: "investigate", label: "Investigate", dependsOn: [] }),
      makeNode({
        id: "generate-1",
        type: "generate",
        label: "Generate",
        dependsOn: ["investigate-0"],
      }),
      makeNode({
        id: "synthesize-2",
        type: "synthesize",
        label: "Synthesize",
        dependsOn: ["generate-1"],
      }),
    ],
    subject: "AI in healthcare",
    createdAt: new Date().toISOString(),
    status: "pending",
    ...overrides,
  } as PipelineDAG;
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- 1. parseNLIntent ----

describe("parseNLIntent", () => {
  it("parses a create intent from LLM response", async () => {
    const intentJson = JSON.stringify({
      action: "create",
      target: "investigate",
      params: { depth: "deep" },
      naturalLanguage: "build a pipeline",
    });
    mockGenerateText.mockResolvedValue(intentJson);
    mockExtractJson.mockReturnValue(intentJson);

    const result = await parseNLIntent("build a pipeline");

    expect(result.action).toBe("create");
    expect(result.naturalLanguage).toBe("build a pipeline");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("throws on empty input", async () => {
    await expect(parseNLIntent("")).rejects.toThrow("Intent input cannot be empty");
    await expect(parseNLIntent("   ")).rejects.toThrow("Intent input cannot be empty");
  });

  it("preserves original input in naturalLanguage field", async () => {
    const intentJson = JSON.stringify({
      action: "modify",
      naturalLanguage: "LLM overwrote this",
    });
    mockGenerateText.mockResolvedValue(intentJson);
    mockExtractJson.mockReturnValue(intentJson);

    const result = await parseNLIntent("user original text");
    expect(result.naturalLanguage).toBe("user original text");
  });
});

// ---- 2. refinePipeline ----

describe("refinePipeline", () => {
  it("returns a refinement with updated config", async () => {
    const refinement = {
      originalConfig: { subject: "AI" },
      modification: "Added score phase",
      resultConfig: { subject: "AI", phases: ["investigate", "generate", "score"] },
      explanation: "Added scoring after generation",
    };
    const json = JSON.stringify(refinement);
    mockGenerateText.mockResolvedValue(json);
    mockExtractJson.mockReturnValue(json);

    const result = await refinePipeline(makeConfig(), "add scoring");

    expect(result.modification).toBe("Added score phase");
    expect(result.explanation).toContain("scoring");
  });

  it("throws on empty modification text", async () => {
    await expect(refinePipeline(makeConfig(), "")).rejects.toThrow(
      "Refinement request cannot be empty"
    );
  });
});

// ---- 3. validatePipelineConfig ----

describe("validatePipelineConfig", () => {
  it("accepts a valid config", () => {
    const result = validatePipelineConfig(makeConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty subject", () => {
    const result = validatePipelineConfig(makeConfig({ subject: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Pipeline subject is required.");
  });

  it("rejects empty phases", () => {
    const result = validatePipelineConfig(makeConfig({ phases: [] as never }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Pipeline must have at least one phase.");
  });

  it("detects invalid phases", () => {
    const result = validatePipelineConfig(
      makeConfig({ phases: ["investigate", "bogus" as never] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid phase: "bogus"'))).toBe(true);
  });

  it("warns on duplicate phases", () => {
    const result = validatePipelineConfig(
      makeConfig({ phases: ["investigate", "investigate"] as never })
    );
    expect(result.warnings.some((w) => w.includes("Duplicate phase"))).toBe(true);
  });

  it("warns on unknown angles", () => {
    const result = validatePipelineConfig(makeConfig({ angles: ["scamper", "nonexistent-angle"] }));
    expect(result.warnings.some((w) => w.includes('Unknown angle: "nonexistent-angle"'))).toBe(
      true
    );
  });

  it("warns when angles present but generate phase missing", () => {
    const result = validatePipelineConfig(
      makeConfig({ phases: ["investigate", "synthesize"], angles: ["scamper"] })
    );
    expect(result.warnings.some((w) => w.includes('"generate" phase is not included'))).toBe(true);
  });

  it("warns when synthesize is before generate", () => {
    const result = validatePipelineConfig(
      makeConfig({ phases: ["synthesize", "generate"] as never })
    );
    expect(result.warnings.some((w) => w.includes('"synthesize" is before "generate"'))).toBe(true);
  });

  it("warns when score is before generate", () => {
    const result = validatePipelineConfig(makeConfig({ phases: ["score", "generate"] as never }));
    expect(result.warnings.some((w) => w.includes('"score" is before "generate"'))).toBe(true);
  });

  it("errors when maxIdeas < 1", () => {
    const result = validatePipelineConfig(makeConfig({ maxIdeas: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("maxIdeas must be at least 1.");
  });

  it("errors when all phases are skipped", () => {
    const result = validatePipelineConfig(
      makeConfig({
        phases: ["investigate"],
        skipPhases: ["investigate"],
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("All phases are skipped"))).toBe(true);
  });

  it("warns when skipPhases contains phases not in the phases list", () => {
    const result = validatePipelineConfig(
      makeConfig({
        phases: ["investigate"],
        skipPhases: ["generate"],
      })
    );
    expect(
      result.warnings.some((w) => w.includes('Skip phase "generate" is not in the phases list'))
    ).toBe(true);
  });
});

// ---- 4. dryRunPipeline ----

describe("dryRunPipeline", () => {
  it("estimates tokens for a 3-phase pipeline", () => {
    const config = makeConfig();
    const dag = makeDAG();
    const result = dryRunPipeline(config, dag);

    expect(result.estimatedTokens.perNode).toHaveLength(3);
    expect(result.estimatedTokens.totalInput).toBeGreaterThan(0);
    expect(result.estimatedTokens.totalOutput).toBeGreaterThan(0);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.estimatedDurationSeconds).toBeGreaterThan(0);
  });

  it("builds stub DAG when no DAG provided", () => {
    const config = makeConfig({ phases: ["investigate"] });
    const result = dryRunPipeline(config);

    expect(result.estimatedTokens.perNode).toHaveLength(1);
    expect(result.estimatedTokens.perNode[0].label).toBe("Investigate");
  });

  it("warns on deep depth", () => {
    const config = makeConfig({ depth: "deep" });
    const result = dryRunPipeline(config, makeDAG());

    expect(result.warnings.some((w) => w.includes("Deep investigation depth"))).toBe(true);
  });

  it("warns when more than 5 angles selected", () => {
    const config = makeConfig({
      angles: [
        "scamper",
        "first-principles",
        "cross-domain",
        "constraints",
        "inversion",
        "perspectives",
      ],
    });
    const result = dryRunPipeline(config, makeDAG());

    expect(result.warnings.some((w) => w.includes("6 angles selected"))).toBe(true);
  });

  it("uses default token estimates for unknown node types", () => {
    const unknownNode = makeNode({ id: "custom-0", type: "validate", label: "Validate" });
    const dag = makeDAG([unknownNode]);
    const result = dryRunPipeline(makeConfig({ phases: ["validate"] }), dag);

    expect(result.estimatedTokens.perNode[0].estimatedInputTokens).toBe(500);
    expect(result.estimatedTokens.perNode[0].estimatedOutputTokens).toBe(600);
  });
});

// ---- 5. NLPipelineSession ----

describe("NLPipelineSession", () => {
  it("starts with empty state", () => {
    const session = new NLPipelineSession();
    expect(session.currentConfig).toBeNull();
    expect(session.currentDAG).toBeNull();
    expect(session.getHistory()).toHaveLength(0);
  });

  it("describe() creates a pipeline and records history", async () => {
    const config = makeConfig();
    const dag = makeDAG();
    mockParsePipelineRequest.mockResolvedValue(config);
    mockCompilePipelineDAG.mockResolvedValue(dag);

    const session = new NLPipelineSession("gpt-4");
    const result = await session.describe("brainstorm healthcare AI");

    expect(result).toBe(dag);
    expect(session.currentConfig).toBe(config);
    expect(session.currentDAG).toBe(dag);
    expect(session.getHistory()).toHaveLength(2); // user + system
    expect(session.getHistory()[0].role).toBe("user");
    expect(session.getHistory()[1].role).toBe("system");
  });

  it("refine() throws if no pipeline described yet", async () => {
    const session = new NLPipelineSession();
    await expect(session.refine("add scoring")).rejects.toThrow(
      "No pipeline to refine. Call describe() first."
    );
  });

  it("preview() returns message when no DAG configured", () => {
    const session = new NLPipelineSession();
    expect(session.preview()).toBe("No pipeline configured yet. Call describe() first.");
  });

  it("preview() renders DAG as text", async () => {
    const config = makeConfig();
    const dag = makeDAG();
    mockParsePipelineRequest.mockResolvedValue(config);
    mockCompilePipelineDAG.mockResolvedValue(dag);

    const session = new NLPipelineSession();
    await session.describe("test");

    const preview = session.preview();
    expect(preview).toContain("Pipeline: Test Pipeline");
    expect(preview).toContain("Investigate");
  });

  it("estimateCost() returns null before describe()", () => {
    const session = new NLPipelineSession();
    expect(session.estimateCost()).toBeNull();
  });

  it("estimateCost() returns estimates after describe()", async () => {
    const config = makeConfig();
    const dag = makeDAG();
    mockParsePipelineRequest.mockResolvedValue(config);
    mockCompilePipelineDAG.mockResolvedValue(dag);

    const session = new NLPipelineSession();
    await session.describe("test");

    const cost = session.estimateCost();
    expect(cost).not.toBeNull();
    expect(cost!.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("reset() clears all state", async () => {
    const config = makeConfig();
    const dag = makeDAG();
    mockParsePipelineRequest.mockResolvedValue(config);
    mockCompilePipelineDAG.mockResolvedValue(dag);

    const session = new NLPipelineSession();
    await session.describe("test");
    session.reset();

    expect(session.currentConfig).toBeNull();
    expect(session.currentDAG).toBeNull();
    expect(session.getHistory()).toHaveLength(0);
  });

  it("getHistory() returns a copy of the history", async () => {
    const config = makeConfig();
    const dag = makeDAG();
    mockParsePipelineRequest.mockResolvedValue(config);
    mockCompilePipelineDAG.mockResolvedValue(dag);

    const session = new NLPipelineSession();
    await session.describe("test");

    const history = session.getHistory();
    history.push({ role: "user", content: "extra", timestamp: "" });
    expect(session.getHistory()).toHaveLength(2);
  });
});

// ---- 5b. dryRunPipeline (additional coverage) ----

describe("dryRunPipeline — additional coverage", () => {
  it("calculates correct token totals for known phases", () => {
    // investigate: input=800, output=1500
    // generate: input=1000, output=2000
    const config = makeConfig({ phases: ["investigate", "generate"] });
    const dag = makeDAG([
      makeNode({ id: "investigate-0", type: "investigate", label: "Investigate", dependsOn: [] }),
      makeNode({ id: "generate-1", type: "generate", label: "Generate", dependsOn: ["investigate-0"] }),
    ]);
    const result = dryRunPipeline(config, dag);

    expect(result.estimatedTokens.totalInput).toBe(800 + 1000);
    expect(result.estimatedTokens.totalOutput).toBe(1500 + 2000);
  });

  it("calculates cost using known formula", () => {
    const config = makeConfig({ phases: ["investigate"] });
    const dag = makeDAG([
      makeNode({ id: "investigate-0", type: "investigate", label: "Investigate", dependsOn: [] }),
    ]);
    const result = dryRunPipeline(config, dag);

    // cost = (800/1000)*0.01 + (1500/1000)*0.03 = 0.008 + 0.045 = 0.053
    expect(result.estimatedCostUsd).toBeCloseTo(0.053, 3);
  });

  it("calculates duration as (totalInput + totalOutput) / 50", () => {
    const config = makeConfig({ phases: ["score"] });
    const dag = makeDAG([
      makeNode({ id: "score-0", type: "score", label: "Score", dependsOn: [] }),
    ]);
    const result = dryRunPipeline(config, dag);

    // score: input=600, output=800 => (600+800)/50 = 28
    expect(result.estimatedDurationSeconds).toBe(28);
  });

  it("warns when more than 20 nodes", () => {
    const nodes: DAGNode[] = Array.from({ length: 21 }, (_, i) =>
      makeNode({ id: `node-${i}`, type: "investigate", label: `Node ${i}`, dependsOn: i > 0 ? [`node-${i - 1}`] : [] })
    );
    const config = makeConfig();
    const dag = makeDAG(nodes);
    const result = dryRunPipeline(config, dag);

    expect(result.warnings.some((w) => w.includes("more than 20 nodes"))).toBe(true);
  });

  it("uses fallback estimates for unknown phase type", () => {
    const nodes = [makeNode({ id: "unknown-0", type: "nonexistent" as never, label: "Unknown", dependsOn: [] })];
    const dag = makeDAG(nodes);
    const config = makeConfig({ phases: ["investigate"] });
    const result = dryRunPipeline(config, dag);

    expect(result.estimatedTokens.perNode[0].estimatedInputTokens).toBe(500);
    expect(result.estimatedTokens.perNode[0].estimatedOutputTokens).toBe(500);
  });
});

// ---- 5c. buildStubDAG via dryRunPipeline ----

describe("buildStubDAG (via dryRunPipeline)", () => {
  it("creates chained dependencies for multi-phase config", () => {
    const config = makeConfig({ phases: ["investigate", "generate", "synthesize"] });
    const result = dryRunPipeline(config);

    const perNode = result.estimatedTokens.perNode;
    expect(perNode).toHaveLength(3);
    expect(perNode[0].nodeId).toBe("investigate-0");
    expect(perNode[1].nodeId).toBe("generate-1");
    expect(perNode[2].nodeId).toBe("synthesize-2");
  });

  it("capitalizes phase labels", () => {
    const config = makeConfig({ phases: ["score"] });
    const result = dryRunPipeline(config);

    expect(result.estimatedTokens.perNode[0].label).toBe("Score");
  });
});

// ---- 6. suggestPipelineFromGoal ----

describe("suggestPipelineFromGoal", () => {
  it("returns a pipeline config from LLM suggestion", async () => {
    const suggestion = {
      subject: "Mobile healthcare",
      phases: ["investigate", "generate"],
      angles: ["scamper"],
      outputFormat: "markdown",
      depth: "standard",
    };
    const json = JSON.stringify(suggestion);
    mockGenerateText.mockResolvedValue(json);
    mockExtractJson.mockReturnValue(json);

    const result = await suggestPipelineFromGoal("brainstorm mobile app ideas for healthcare");
    expect(result.subject).toBe("Mobile healthcare");
    expect(result.phases).toContain("investigate");
  });

  it("throws on empty goal", async () => {
    await expect(suggestPipelineFromGoal("")).rejects.toThrow("Goal cannot be empty");
  });
});

// ---- 7. pipelineSessionToMarkdown ----

describe("pipelineSessionToMarkdown", () => {
  it("renders empty session", () => {
    const session = new NLPipelineSession();
    const md = pipelineSessionToMarkdown(session);
    expect(md).toContain("# Pipeline Session");
    expect(md).not.toContain("## Configuration");
  });

  it("renders session with config and DAG", async () => {
    const config = makeConfig({ angles: ["scamper"], outputFormat: "markdown", depth: "standard" });
    const dag = makeDAG();
    mockParsePipelineRequest.mockResolvedValue(config);
    mockCompilePipelineDAG.mockResolvedValue(dag);

    const session = new NLPipelineSession();
    await session.describe("test pipeline");

    const md = pipelineSessionToMarkdown(session);

    expect(md).toContain("# Pipeline Session");
    expect(md).toContain("## Configuration");
    expect(md).toContain("**Subject**: AI in healthcare");
    expect(md).toContain("**Phases**: investigate, generate, synthesize");
    expect(md).toContain("**Angles**: scamper");
    expect(md).toContain("## Pipeline DAG");
    expect(md).toContain("## Conversation History");
    expect(md).toContain("## Cost Estimate");
  });
});
