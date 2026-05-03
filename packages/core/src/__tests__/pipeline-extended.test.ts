import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
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
import type { Investigation, AngleResult, PipelineProgress, AngleId } from "../types.js";

const mockInvestigate = vi.mocked(investigate);
const mockGenerateForAngle = vi.mocked(generateForAngle);
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "A", description: "B" }],
  currentState: "Current state",
  challenges: ["c1"],
  opportunities: ["o1"],
};

const MOCK_ANGLE_RESULT: AngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    { title: "Idea1", description: "Desc1", potentialImpact: "High", implementationHint: "Do it" },
  ],
  reasoning: "Applied SCAMPER",
};

const MOCK_SYNTHESIS_JSON = JSON.stringify({
  topIdeas: [
    {
      title: "Top Idea",
      description: "Best idea",
      sourceAngle: "scamper",
      potentialImpact: "High",
      feasibility: "high",
    },
  ],
  themes: ["theme1"],
  recommendation: "Do something",
});

describe("runAutoPipeline (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);
    mockGenerateForAngle.mockResolvedValue(MOCK_ANGLE_RESULT);
    mockGenerateText.mockResolvedValue("{}");
    mockExtractJson.mockReturnValue(MOCK_SYNTHESIS_JSON);
  });

  it("respects MAX_CONCURRENCY (at most 2 concurrent tasks)", async () => {
    let maxConcurrent = 0;
    let current = 0;

    mockGenerateForAngle.mockImplementation(async () => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return MOCK_ANGLE_RESULT;
    });

    const angles: AngleId[] = ["scamper", "first-principles", "cross-domain", "constraints"];
    await runAutoPipeline("test", () => {}, undefined, angles);

    // MAX_CONCURRENCY is 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it("stops when AbortSignal is aborted before investigation", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"], controller.signal);

    expect(result.stage).toBe("error");
    expect(result.error).toBe("Request was aborted");
    expect(mockInvestigate).not.toHaveBeenCalled();
  });

  it("stops when AbortSignal is aborted after investigation", async () => {
    const controller = new AbortController();
    mockInvestigate.mockImplementation(async () => {
      controller.abort();
      return MOCK_INVESTIGATION;
    });

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"], controller.signal);

    expect(result.stage).toBe("error");
    expect(result.error).toBe("Request was aborted");
  });

  it("handles partial angle failures (some succeed, some fail)", async () => {
    let callCount = 0;
    mockGenerateForAngle.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error("Angle failed");
      return {
        ...MOCK_ANGLE_RESULT,
        angleId: callCount === 1 ? "scamper" : "cross-domain",
      };
    });

    const result = await runAutoPipeline("test", () => {}, undefined, [
      "scamper",
      "first-principles",
      "cross-domain",
    ]);

    expect(result.stage).toBe("complete");
    expect(result.angleResults.length).toBeGreaterThanOrEqual(1);
    expect(result.failedAngles).toBeDefined();
    expect(result.failedAngles!.length).toBe(1);
    expect(result.failedAngles![0].angleId).toBe("first-principles");
  });

  it("returns error when all angles fail", async () => {
    mockGenerateForAngle.mockRejectedValue(new Error("All fail"));

    const result = await runAutoPipeline("test", () => {}, undefined, [
      "scamper",
      "first-principles",
    ]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Generation encountered an internal error");
  });

  it("fires progress callbacks for each stage", async () => {
    const stages: string[] = [];
    await runAutoPipeline("test", (p) => stages.push(p.stage), undefined, ["scamper"]);

    expect(stages).toContain("investigating");
    expect(stages).toContain("generating");
    expect(stages).toContain("synthesizing");
  });

  it("handles empty angles array gracefully", async () => {
    const result = await runAutoPipeline("test", () => {}, undefined, []);

    // All angles "completed" (none to run), but no results → error
    expect(result.stage).toBe("error");
    expect(result.error).toContain("Generation encountered an internal error");
  });

  it("handles error in synthesis stage", async () => {
    mockExtractJson.mockReturnValue("not valid json{");

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Synthesis encountered an internal error");
  });

  it("sanitizeErrorMessage strips internals", async () => {
    mockInvestigate.mockRejectedValue(new Error("Internal stack trace: at Module.foo:123"));

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.error).toBe("Investigation encountered an internal error. Please try again.");
    expect(result.error).not.toContain("stack trace");
    expect(result.error).not.toContain("Module.foo");
  });

  it("continues if progress callback throws", async () => {
    const onProgress = vi.fn().mockImplementation((p: PipelineProgress) => {
      if (p.stage === "generating") throw new Error("UI crash");
    });

    const result = await runAutoPipeline("test", onProgress, undefined, ["scamper"]);

    expect(result.stage).toBe("complete");
  });

  it("supports model routing per stage", async () => {
    await runAutoPipeline(
      "test",
      () => {},
      undefined,
      ["scamper"],
      undefined,
      { investigation: "model-a", generation: "model-b", synthesis: "model-c" }
    );

    expect(mockInvestigate).toHaveBeenCalledWith("test", "model-a", undefined);
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "test", MOCK_INVESTIGATION, "scamper", "model-b", undefined
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-c" })
    );
  });
});
