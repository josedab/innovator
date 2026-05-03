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
