import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../innovation/investigate.js", () => ({
  investigate: vi.fn(),
}));

vi.mock("../innovation/generate.js", () => ({
  generateForAngle: vi.fn(),
}));

vi.mock("../prompts/investigation.js", () => ({
  buildSynthesisPrompt: vi.fn().mockReturnValue("synthesis prompt"),
}));

import { generateText, extractJson } from "../copilot/client.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import { runAutoPipeline } from "../innovation/pipeline.js";
import type { Investigation, AngleResult, PipelineProgress } from "../types.js";

const mockInvestigate = vi.mocked(investigate);
const mockGenerateForAngle = vi.mocked(generateForAngle);
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test",
  keyAspects: [{ title: "A", description: "B" }],
  currentState: "Current",
  challenges: ["c1"],
  opportunities: ["o1"],
};

const MOCK_ANGLE_RESULT: AngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    { title: "Idea", description: "Desc", potentialImpact: "High", implementationHint: "Do it" },
  ],
  reasoning: "Applied SCAMPER",
};

describe("runAutoPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);
    mockGenerateText.mockResolvedValue("{}");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        topIdeas: [],
        themes: ["theme1"],
        recommendation: "Do something",
      })
    );
  });

  it("progresses through all stages", async () => {
    const stages: string[] = [];
    const onProgress = (p: PipelineProgress) => stages.push(p.stage);

    const result = await runAutoPipeline("test subject", onProgress, undefined, ["scamper"]);

    expect(stages).toContain("investigating");
    expect(stages).toContain("generating");
    expect(stages).toContain("synthesizing");
    // "complete" stage is set after terminated=true, so the callback may not receive it
    expect(result.stage).toBe("complete");
  });

  it("calls investigate with subject and model", async () => {
    await runAutoPipeline("test", () => {}, "gpt-5", ["scamper"]);

    expect(mockInvestigate).toHaveBeenCalledWith("test", "gpt-5", undefined);
  });

  it("calls generateForAngle for each selected angle", async () => {
    await runAutoPipeline("test", () => {}, undefined, ["scamper", "inversion"]);

    expect(mockGenerateForAngle).toHaveBeenCalledTimes(2);
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "test",
      MOCK_INVESTIGATION,
      "scamper",
      undefined,
      undefined
    );
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "test",
      MOCK_INVESTIGATION,
      "inversion",
      undefined,
      undefined
    );
  });

  it("includes investigation in result", async () => {
    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.investigation).toEqual(MOCK_INVESTIGATION);
  });

  it("includes synthesis in result", async () => {
    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.synthesis).toBeDefined();
    expect(result.synthesis!.recommendation).toBe("Do something");
  });

  it("reports error stage when investigation fails", async () => {
    mockInvestigate.mockRejectedValue(new Error("Investigation failed"));
    const stages: string[] = [];

    const result = await runAutoPipeline("test", (p) => stages.push(p.stage), undefined, [
      "scamper",
    ]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Investigation encountered an internal error");
  });

  it("reports error stage when generation fails", async () => {
    mockGenerateForAngle.mockRejectedValue(new Error("Gen failed"));

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Generation encountered an internal error");
  });

  it("reports error stage when synthesis fails", async () => {
    mockExtractJson.mockReturnValue("invalid json{");

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Synthesis encountered an internal error");
  });

  it("tracks completed angles in progress", async () => {
    const completedAngles: string[][] = [];
    const onProgress = (p: PipelineProgress) => {
      completedAngles.push([...p.completedAngles]);
    };

    await runAutoPipeline("test", onProgress, undefined, ["scamper"]);

    // At some point, scamper should appear in completedAngles
    const hasScamper = completedAngles.some((arr) => arr.includes("scamper"));
    expect(hasScamper).toBe(true);
  });

  it("uses all 8 angles when none specified", async () => {
    await runAutoPipeline("test", () => {});

    expect(mockGenerateForAngle).toHaveBeenCalledTimes(8);
  });

  // ---- AbortSignal tests ----

  it("aborts before investigation when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runAutoPipeline(
      "test",
      () => {},
      undefined,
      ["scamper"],
      controller.signal
    );

    expect(result.stage).toBe("error");
    expect(result.error).toContain("aborted");
    expect(mockInvestigate).not.toHaveBeenCalled();
  });

  it("aborts before generation when signal fires after investigation", async () => {
    const controller = new AbortController();
    mockInvestigate.mockImplementation(async () => {
      controller.abort();
      return MOCK_INVESTIGATION;
    });

    const result = await runAutoPipeline(
      "test",
      () => {},
      undefined,
      ["scamper"],
      controller.signal
    );

    expect(result.stage).toBe("error");
    expect(result.error).toContain("aborted");
  });

  it("aborts before synthesis when signal fires after generation", async () => {
    const controller = new AbortController();
    mockGenerateForAngle.mockImplementation(async () => {
      controller.abort();
      return MOCK_ANGLE_RESULT;
    });

    const result = await runAutoPipeline(
      "test",
      () => {},
      undefined,
      ["scamper"],
      controller.signal
    );

    expect(result.stage).toBe("error");
    expect(result.error).toContain("aborted");
  });

  // ---- Partial failure tests ----

  it("investigation failure prevents generate/synthesize", async () => {
    mockInvestigate.mockRejectedValue(new Error("fail"));

    await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(mockGenerateForAngle).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("partial angle failures → remaining angles synthesized", async () => {
    mockGenerateForAngle.mockImplementation(async (_s, _i, angleId) => {
      if (angleId === "scamper") throw new Error("angle fail");
      return { ...MOCK_ANGLE_RESULT, angleId: angleId as string, angleName: angleId as string };
    });

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper", "inversion"]);

    expect(result.stage).toBe("complete");
    expect(result.angleResults).toHaveLength(1);
    expect(result.angleResults[0].angleId).toBe("inversion");
    expect(result.failedAngles).toHaveLength(1);
    expect(result.failedAngles![0].angleId).toBe("scamper");
  });

  it("all angles fail → error state", async () => {
    mockGenerateForAngle.mockRejectedValue(new Error("all fail"));

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper", "inversion"]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Generation");
  });

  // ---- Concurrency ----

  it("runWithConcurrency respects MAX_CONCURRENCY of 2", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    mockGenerateForAngle.mockImplementation(async (_s, _i, angleId) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      return { ...MOCK_ANGLE_RESULT, angleId: angleId as string };
    });

    await runAutoPipeline("test", () => {}, undefined, [
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  // ---- Progress callback resilience ----

  it("pipeline continues when progress callback throws", async () => {
    const onProgress = vi.fn().mockImplementation(() => {
      throw new Error("callback crash");
    });

    const result = await runAutoPipeline("test", onProgress, undefined, ["scamper"]);

    expect(result.stage).toBe("complete");
  });

  // ---- Model routing ----

  it("passes modelRouting to each stage", async () => {
    const routing = {
      investigation: "model-a",
      generation: "model-b",
      synthesis: "model-c",
    };

    await runAutoPipeline("test", () => {}, undefined, ["scamper"], undefined, routing);

    expect(mockInvestigate).toHaveBeenCalledWith("test", "model-a", undefined);
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "test",
      MOCK_INVESTIGATION,
      "scamper",
      "model-b",
      undefined
    );
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({ model: "model-c" }));
  });

  // ---- Per-angle duration tracking ----

  it("tracks per-angle durations in durationMs.perAngle", async () => {
    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper", "inversion"]);

    expect(result.stage).toBe("complete");
    expect(result.durationMs).toBeDefined();
    expect(result.durationMs!.perAngle).toBeDefined();
    expect(result.durationMs!.perAngle!["scamper"]).toBeGreaterThanOrEqual(0);
    expect(result.durationMs!.perAngle!["inversion"]).toBeGreaterThanOrEqual(0);
  });

  it("reports per-angle durations incrementally via progress callbacks", async () => {
    let lastPerAngle: Record<string, number> | undefined;
    const onProgress = (p: PipelineProgress) => {
      if (p.durationMs?.perAngle) {
        lastPerAngle = { ...p.durationMs.perAngle };
      }
    };

    await runAutoPipeline("test", onProgress, undefined, ["scamper"]);

    expect(lastPerAngle).toBeDefined();
    expect(lastPerAngle!["scamper"]).toBeGreaterThanOrEqual(0);
  });

  it("includes per-angle durations even when some angles fail", async () => {
    let callCount = 0;
    mockGenerateForAngle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return MOCK_ANGLE_RESULT;
      throw new Error("angle failed");
    });

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper", "inversion"]);

    // At least the successful angle should have a duration
    expect(result.durationMs?.perAngle?.["scamper"]).toBeGreaterThanOrEqual(0);
  });
});
