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
    expect(result.error).toContain("Investigation failed");
  });

  it("reports error stage when generation fails", async () => {
    mockGenerateForAngle.mockRejectedValue(new Error("Gen failed"));

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Gen failed");
  });

  it("reports error stage when synthesis fails", async () => {
    mockExtractJson.mockReturnValue("invalid json{");

    const result = await runAutoPipeline("test", () => {}, undefined, ["scamper"]);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("Synthesis failed");
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
});
