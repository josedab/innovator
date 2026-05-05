import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInvestigate, mockGenerateForAngle, mockRunAutoPipeline } = vi.hoisted(() => ({
  mockInvestigate: vi.fn(),
  mockGenerateForAngle: vi.fn(),
  mockRunAutoPipeline: vi.fn(),
}));

vi.mock("@innovator/core", () => ({
  investigate: mockInvestigate,
  generateForAngle: mockGenerateForAngle,
  runAutoPipeline: mockRunAutoPipeline,
  ANGLE_IDS: [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ],
}));

import { handleInvestigate, handleGenerate, handleAutoPipeline } from "./handlers.js";

describe("handleInvestigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns investigation JSON for valid subject", async () => {
    const investigation = {
      summary: "AI summary",
      keyAspects: [{ title: "ML", description: "Machine learning" }],
      currentState: "Evolving",
      challenges: ["Scale"],
      opportunities: ["Automation"],
    };
    mockInvestigate.mockResolvedValue(investigation);

    const result = await handleInvestigate({ subject: "AI innovation" });
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBe("AI summary");
    expect(mockInvestigate).toHaveBeenCalledWith("AI innovation", undefined);
  });

  it("passes model override through", async () => {
    mockInvestigate.mockResolvedValue({ summary: "test" });
    await handleInvestigate({ subject: "test", model: "gpt-5" });
    expect(mockInvestigate).toHaveBeenCalledWith("test", "gpt-5");
  });

  it("throws Zod validation error for empty subject", async () => {
    await expect(handleInvestigate({ subject: "" })).rejects.toThrow();
  });

  it("throws Zod validation error for missing subject", async () => {
    await expect(handleInvestigate({})).rejects.toThrow();
  });

  it("throws for subject exceeding 500 chars", async () => {
    await expect(handleInvestigate({ subject: "x".repeat(501) })).rejects.toThrow();
  });

  it("accepts subject at exactly 500 char boundary", async () => {
    mockInvestigate.mockResolvedValue({ summary: "ok" });
    const result = await handleInvestigate({ subject: "x".repeat(500) });
    expect(JSON.parse(result).summary).toBe("ok");
  });

  it("throws for null subject", async () => {
    await expect(handleInvestigate({ subject: null })).rejects.toThrow();
  });
});

describe("handleGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validArgs = {
    subject: "AI innovation",
    investigation: {
      summary: "AI is evolving",
      keyAspects: [{ title: "ML", description: "Machine learning" }],
      currentState: "Evolving",
      challenges: ["Scale"],
      opportunities: ["Automation"],
    },
    angleId: "scamper",
  };

  it("returns angle result for valid args", async () => {
    const angleResult = {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [{ title: "Idea 1", description: "desc" }],
      reasoning: "Applied SCAMPER",
    };
    mockGenerateForAngle.mockResolvedValue(angleResult);

    const result = await handleGenerate(validArgs);
    const parsed = JSON.parse(result);
    expect(parsed.angleId).toBe("scamper");
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "AI innovation",
      validArgs.investigation,
      "scamper",
      undefined
    );
  });

  it("passes model override through", async () => {
    mockGenerateForAngle.mockResolvedValue({ angleId: "scamper" });
    await handleGenerate({ ...validArgs, model: "gpt-5" });
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "AI innovation",
      validArgs.investigation,
      "scamper",
      "gpt-5"
    );
  });

  it("throws for missing investigation fields", async () => {
    await expect(
      handleGenerate({
        subject: "AI",
        investigation: { summary: "s" },
        angleId: "scamper",
      })
    ).rejects.toThrow();
  });

  it("throws for missing angleId", async () => {
    await expect(
      handleGenerate({
        subject: "AI",
        investigation: validArgs.investigation,
      })
    ).rejects.toThrow();
  });

  it("throws for empty angleId", async () => {
    await expect(
      handleGenerate({
        ...validArgs,
        angleId: "",
      })
    ).rejects.toThrow();
  });
});

describe("handleAutoPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pipeline result with progress log for valid subject", async () => {
    const pipelineResult = {
      investigation: { summary: "test" },
      angleResults: [],
      synthesis: { topIdeas: [] },
    };
    mockRunAutoPipeline.mockImplementation(async (subject, onProgress) => {
      onProgress({ stage: "investigating", completedAngles: [], totalAngles: 3 });
      onProgress({ stage: "generating", completedAngles: ["scamper"], totalAngles: 3 });
      onProgress({
        stage: "complete",
        completedAngles: ["scamper", "inversion", "what-if"],
        totalAngles: 3,
      });
      return pipelineResult;
    });

    const result = await handleAutoPipeline({ subject: "AI innovation" });
    const parsed = JSON.parse(result);
    expect(parsed.finalResult).toBeDefined();
    expect(parsed.progressLog).toHaveLength(3);
    expect(parsed.progressLog[0].stage).toBe("investigating");
    expect(parsed.progressLog[2].completedAngles).toEqual(["scamper", "inversion", "what-if"]);
  });

  it("progress callback accumulates stages", async () => {
    mockRunAutoPipeline.mockImplementation(async (_sub, onProgress) => {
      onProgress({ stage: "investigating", completedAngles: [], totalAngles: 2 });
      onProgress({ stage: "synthesizing", completedAngles: ["a", "b"], totalAngles: 2 });
      return {};
    });

    const result = await handleAutoPipeline({ subject: "test" });
    const parsed = JSON.parse(result);
    expect(parsed.progressLog).toHaveLength(2);
    expect(parsed.progressLog[1].stage).toBe("synthesizing");
  });

  it("passes model and angles options", async () => {
    mockRunAutoPipeline.mockResolvedValue({});
    await handleAutoPipeline({
      subject: "test",
      model: "gpt-5",
      angles: ["scamper", "inversion"],
    });
    expect(mockRunAutoPipeline).toHaveBeenCalledWith("test", expect.any(Function), "gpt-5", [
      "scamper",
      "inversion",
    ]);
  });

  it("propagates thrown error from pipeline", async () => {
    mockRunAutoPipeline.mockRejectedValue(new Error("LLM failure"));
    await expect(handleAutoPipeline({ subject: "test" })).rejects.toThrow("LLM failure");
  });

  it("throws for empty subject", async () => {
    await expect(handleAutoPipeline({ subject: "" })).rejects.toThrow();
  });

  it("accepts subject at 500 char boundary", async () => {
    mockRunAutoPipeline.mockResolvedValue({});
    await expect(handleAutoPipeline({ subject: "x".repeat(500) })).resolves.toBeDefined();
  });
});
