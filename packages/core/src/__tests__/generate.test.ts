import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../innovation/custom-angles.js", () => ({
  getCustomAngle: vi.fn().mockReturnValue(undefined),
  buildCustomAnglePrompt: vi.fn().mockReturnValue("custom angle prompt"),
}));

vi.mock("../prompts/angles/index.js", () => ({
  buildScamperPrompt: vi.fn().mockReturnValue("scamper prompt"),
  buildFirstPrinciplesPrompt: vi.fn().mockReturnValue("first-principles prompt"),
  buildCrossDomainPrompt: vi.fn().mockReturnValue("cross-domain prompt"),
  buildConstraintsPrompt: vi.fn().mockReturnValue("constraints prompt"),
  buildInversionPrompt: vi.fn().mockReturnValue("inversion prompt"),
  buildPerspectivesPrompt: vi.fn().mockReturnValue("perspectives prompt"),
  buildWhatIfPrompt: vi.fn().mockReturnValue("what-if prompt"),
  buildTrendCollisionPrompt: vi.fn().mockReturnValue("trend-collision prompt"),
}));

import { generateText, extractJson } from "../copilot/client.js";
import { generateForAngle } from "../innovation/generate.js";
import { getCustomAngle, buildCustomAnglePrompt } from "../innovation/custom-angles.js";
import type { AngleId, AngleResult, Investigation } from "../types.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);
const mockGetCustomAngle = vi.mocked(getCustomAngle);
const _mockBuildCustomAnglePrompt = vi.mocked(buildCustomAnglePrompt);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect", description: "Description" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

const MOCK_ANGLE_RESULT: AngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    { title: "Idea", description: "Desc", potentialImpact: "High", implementationHint: "Hint" },
  ],
  reasoning: "Applied SCAMPER",
};

describe("generateForAngle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue("raw response");
    mockExtractJson.mockReturnValue(JSON.stringify(MOCK_ANGLE_RESULT));
  });

  it("generates for scamper angle", async () => {
    const result = await generateForAngle("test", MOCK_INVESTIGATION, "scamper");

    expect(mockGenerateText).toHaveBeenCalledWith({
      prompt: "scamper prompt",
      model: undefined,
      serverMode: true,
      signal: undefined,
    });
    expect(result.angleId).toBe("scamper");
  });

  it("generates for first-principles angle", async () => {
    const fpResult = {
      ...MOCK_ANGLE_RESULT,
      angleId: "first-principles",
      angleName: "First Principles",
    };
    mockExtractJson.mockReturnValue(JSON.stringify(fpResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "first-principles");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "first-principles prompt" })
    );
    expect(result.angleId).toBe("first-principles");
  });

  it("generates for cross-domain angle", async () => {
    const cdResult = { ...MOCK_ANGLE_RESULT, angleId: "cross-domain", angleName: "Cross-Domain" };
    mockExtractJson.mockReturnValue(JSON.stringify(cdResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "cross-domain");
    expect(result.angleId).toBe("cross-domain");
  });

  it("generates for constraints angle", async () => {
    const cResult = { ...MOCK_ANGLE_RESULT, angleId: "constraints", angleName: "Constraints" };
    mockExtractJson.mockReturnValue(JSON.stringify(cResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "constraints");
    expect(result.angleId).toBe("constraints");
  });

  it("generates for inversion angle", async () => {
    const iResult = { ...MOCK_ANGLE_RESULT, angleId: "inversion", angleName: "Inversion" };
    mockExtractJson.mockReturnValue(JSON.stringify(iResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "inversion");
    expect(result.angleId).toBe("inversion");
  });

  it("generates for perspectives angle", async () => {
    const pResult = { ...MOCK_ANGLE_RESULT, angleId: "perspectives", angleName: "Perspectives" };
    mockExtractJson.mockReturnValue(JSON.stringify(pResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "perspectives");
    expect(result.angleId).toBe("perspectives");
  });

  it("generates for what-if angle", async () => {
    const wResult = { ...MOCK_ANGLE_RESULT, angleId: "what-if", angleName: "What-If" };
    mockExtractJson.mockReturnValue(JSON.stringify(wResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "what-if");
    expect(result.angleId).toBe("what-if");
  });

  it("generates for trend-collision angle", async () => {
    const tResult = {
      ...MOCK_ANGLE_RESULT,
      angleId: "trend-collision",
      angleName: "Trend Collision",
    };
    mockExtractJson.mockReturnValue(JSON.stringify(tResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "trend-collision");
    expect(result.angleId).toBe("trend-collision");
  });

  it("throws for unknown angle", async () => {
    await expect(
      generateForAngle("test", MOCK_INVESTIGATION, "unknown" as AngleId)
    ).rejects.toThrow("Unknown angle: unknown");
  });

  it("passes model and signal through", async () => {
    const controller = new AbortController();
    await generateForAngle("test", MOCK_INVESTIGATION, "scamper", "gpt-5", controller.signal);

    expect(mockGenerateText).toHaveBeenCalledWith({
      prompt: "scamper prompt",
      model: "gpt-5",
      serverMode: true,
      signal: controller.signal,
    });
  });

  it("throws when JSON parsing fails", async () => {
    mockExtractJson.mockReturnValue("not valid json");

    await expect(generateForAngle("test", MOCK_INVESTIGATION, "scamper")).rejects.toThrow(
      "Failed to parse scamper response as JSON"
    );
  });

  it("throws when schema validation fails", async () => {
    mockExtractJson.mockReturnValue(JSON.stringify({ angleId: "scamper" }));

    await expect(generateForAngle("test", MOCK_INVESTIGATION, "scamper")).rejects.toThrow();
  });

  it("propagates generateText errors", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM timeout"));

    await expect(generateForAngle("test", MOCK_INVESTIGATION, "scamper")).rejects.toThrow(
      "LLM timeout"
    );
  });

  it("retries transient network errors with the shared retry policy", async () => {
    vi.useFakeTimers();
    try {
      mockGenerateText
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValue("raw response");

      const resultPromise = generateForAngle("test", MOCK_INVESTIGATION, "scamper");
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toEqual(MOCK_ANGLE_RESULT);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- Custom angle fallback ----
  it("falls back to custom angle when ID not in built-in map", async () => {
    const customAngle = {
      id: "biomimicry",
      name: "Biomimicry",
      description: "Inspired by nature",
      promptTemplate: "Apply biomimicry to {{subject}} given {{investigation}}",
      createdAt: new Date().toISOString(),
    };
    mockGetCustomAngle.mockReturnValue(customAngle as unknown as ReturnType<typeof getCustomAngle>);
    const customResult = { ...MOCK_ANGLE_RESULT, angleId: "biomimicry", angleName: "Biomimicry" };
    mockExtractJson.mockReturnValue(JSON.stringify(customResult));

    const result = await generateForAngle("test", MOCK_INVESTIGATION, "biomimicry");
    expect(mockGetCustomAngle).toHaveBeenCalledWith("biomimicry");
    expect(result.angleId).toBe("biomimicry");
  });

  it("throws for unknown angle when custom angle also not found", async () => {
    mockGetCustomAngle.mockReturnValue(undefined);
    await expect(generateForAngle("test", MOCK_INVESTIGATION, "nonexistent")).rejects.toThrow(
      "Unknown angle: nonexistent"
    );
  });

  // ---- AngleResult validation on malformed responses ----
  it("rejects response missing required ideas array", async () => {
    mockExtractJson.mockReturnValue(
      JSON.stringify({ angleId: "scamper", angleName: "SCAMPER", reasoning: "test" })
    );
    await expect(generateForAngle("test", MOCK_INVESTIGATION, "scamper")).rejects.toThrow();
  });

  it("rejects response with invalid idea structure", async () => {
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        angleId: "scamper",
        angleName: "SCAMPER",
        ideas: [{ title: 123 }], // title should be string
        reasoning: "test",
      })
    );
    await expect(generateForAngle("test", MOCK_INVESTIGATION, "scamper")).rejects.toThrow();
  });
});
