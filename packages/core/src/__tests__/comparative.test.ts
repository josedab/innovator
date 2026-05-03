import { describe, it, expect, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../innovation/investigate.js", () => ({
  investigate: vi.fn(),
}));

vi.mock("../innovation/pipeline.js", () => ({
  runAutoPipeline: vi.fn(),
}));

import {
  buildComparativeSynthesisPrompt,
  runComparativePipeline,
} from "../innovation/comparative.js";
import { runAutoPipeline } from "../innovation/pipeline.js";
import { generateText, extractJson } from "../copilot/client.js";
import type { Investigation, Synthesis } from "../types.js";

const mockRunAutoPipeline = vi.mocked(runAutoPipeline);
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect1", description: "Desc1" }],
  currentState: "Current state",
  challenges: ["Challenge A", "Challenge B"],
  opportunities: ["Opportunity X"],
};

const MOCK_SYNTHESIS: Synthesis = {
  topIdeas: [
    {
      title: "Top Idea 1",
      description: "Desc",
      sourceAngle: "scamper",
      potentialImpact: "High",
      feasibility: "medium",
    },
  ],
  themes: ["Theme1"],
  recommendation: "Proceed",
};

describe("buildComparativeSynthesisPrompt", () => {
  it("includes all subject names numbered", () => {
    const prompt = buildComparativeSynthesisPrompt(
      ["AI in Healthcare", "Blockchain in Finance"],
      [
        { subject: "AI in Healthcare", investigation: MOCK_INVESTIGATION },
        { subject: "Blockchain in Finance", investigation: MOCK_INVESTIGATION },
      ]
    );
    expect(prompt).toContain("1. AI in Healthcare");
    expect(prompt).toContain("2. Blockchain in Finance");
  });

  it("includes investigation summaries, challenges, and opportunities", () => {
    const prompt = buildComparativeSynthesisPrompt(
      ["SubA"],
      [{ subject: "SubA", investigation: MOCK_INVESTIGATION }]
    );
    expect(prompt).toContain("Test summary");
    expect(prompt).toContain("Challenge A");
    expect(prompt).toContain("Opportunity X");
  });

  it("with synthesis includes top idea titles", () => {
    const prompt = buildComparativeSynthesisPrompt(
      ["SubA"],
      [{ subject: "SubA", investigation: MOCK_INVESTIGATION, synthesis: MOCK_SYNTHESIS }]
    );
    expect(prompt).toContain("Top Ideas:");
    expect(prompt).toContain("Top Idea 1");
  });

  it("without synthesis no 'Top Ideas' line", () => {
    const prompt = buildComparativeSynthesisPrompt(
      ["SubA"],
      [{ subject: "SubA", investigation: MOCK_INVESTIGATION }]
    );
    expect(prompt).not.toContain("Top Ideas:");
  });
});

describe("runComparativePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("with <2 subjects throws", async () => {
    await expect(runComparativePipeline(["only-one"], vi.fn())).rejects.toThrow(
      "requires 2-5 subjects"
    );
  });

  it("with >5 subjects throws", async () => {
    await expect(runComparativePipeline(["a", "b", "c", "d", "e", "f"], vi.fn())).rejects.toThrow(
      "requires 2-5 subjects"
    );
  });

  it("with 2 subjects calls onProgress with correct stages", async () => {
    const onProgress = vi.fn();
    mockRunAutoPipeline.mockResolvedValue({
      stage: "complete",
      investigation: MOCK_INVESTIGATION,
      synthesis: MOCK_SYNTHESIS,
      angleResults: [],
      currentAngle: null,
      completedAngles: [],
    } as ReturnType<typeof runAutoPipeline> extends Promise<infer R> ? R : never);

    mockGenerateText.mockResolvedValue("{}");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        synergies: [],
        tradeoffs: [],
        combinedOpportunities: [],
        recommendation: "Go for it",
      })
    );

    const result = await runComparativePipeline(["SubA", "SubB"], onProgress);

    expect(result.stage).toBe("complete");
    expect(mockRunAutoPipeline).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalled();
    // Check progress was called with processing stage
    const stages = onProgress.mock.calls.map((c) => c[0].stage);
    expect(stages).toContain("processing");
  });

  it("AbortSignal returns stage 'error' with abort message", async () => {
    const controller = new AbortController();
    controller.abort();

    const onProgress = vi.fn();
    const result = await runComparativePipeline(
      ["SubA", "SubB"],
      onProgress,
      undefined,
      controller.signal
    );

    expect(result.stage).toBe("error");
    expect(result.error).toContain("aborted");
  });

  it("subject pipeline failure returns error with subject name", async () => {
    mockRunAutoPipeline.mockResolvedValue({
      stage: "error",
      investigation: null,
      synthesis: undefined,
      angleResults: [],
      currentAngle: null,
      completedAngles: [],
    } as ReturnType<typeof runAutoPipeline> extends Promise<infer R> ? R : never);

    const onProgress = vi.fn();
    const result = await runComparativePipeline(["SubA", "SubB"], onProgress);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("SubA");
  });
});
