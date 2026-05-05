import { describe, it, expect, vi, beforeEach } from "vitest";

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
  runParallelInvestigation,
} from "../innovation/comparative.js";
import { runAutoPipeline } from "../innovation/pipeline.js";
import { investigate } from "../innovation/investigate.js";
import { generateText, extractJson } from "../copilot/client.js";
import type { Investigation, Synthesis } from "../types.js";

const mockRunAutoPipeline = vi.mocked(runAutoPipeline);
const mockInvestigate = vi.mocked(investigate);
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
      totalAngles: 0,
    } as unknown as Awaited<ReturnType<typeof runAutoPipeline>>);

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
      totalAngles: 0,
    } as unknown as Awaited<ReturnType<typeof runAutoPipeline>>);

    const onProgress = vi.fn();
    const result = await runComparativePipeline(["SubA", "SubB"], onProgress);

    expect(result.stage).toBe("error");
    expect(result.error).toContain("SubA");
  });
});

// ---- Parallel Investigation ----

describe("runParallelInvestigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvestigate.mockResolvedValue(MOCK_INVESTIGATION);
    mockGenerateText.mockResolvedValue("{}");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        synergies: [],
        tradeoffs: [],
        combinedOpportunities: [],
        recommendation: "Strategic recommendation",
      })
    );
  });

  it("rejects fewer than 2 subjects", async () => {
    await expect(runParallelInvestigation(["only-one"])).rejects.toThrow("requires 2-10 subjects");
  });

  it("rejects more than 10 subjects", async () => {
    const subjects = Array.from({ length: 11 }, (_, i) => `Subject ${i}`);
    await expect(runParallelInvestigation(subjects)).rejects.toThrow("requires 2-10 subjects");
  });

  it("investigates 2 subjects and produces synthesis", async () => {
    const result = await runParallelInvestigation(["SubA", "SubB"]);

    expect(result.stage).toBe("completed");
    expect(result.investigations).toHaveLength(2);
    expect(result.investigations.every((i) => i.status === "completed")).toBe(true);
    expect(mockInvestigate).toHaveBeenCalledTimes(2);
  });

  it("calls onProgress callback with correct counts", async () => {
    const onProgress = vi.fn();
    await runParallelInvestigation(["SubA", "SubB", "SubC"], { onProgress });

    expect(onProgress).toHaveBeenCalled();
    const calls = onProgress.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe(3);
    expect(lastCall[1]).toBe(3);
  });

  it("returns partial when some subjects fail", async () => {
    mockInvestigate
      .mockResolvedValueOnce(MOCK_INVESTIGATION)
      .mockRejectedValueOnce(new Error("LLM error"))
      .mockResolvedValueOnce(MOCK_INVESTIGATION);

    const result = await runParallelInvestigation(["SubA", "SubB", "SubC"]);

    expect(result.stage).toBe("partial");
    const failed = result.investigations.filter((i) => i.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain("LLM error");
  });

  it("returns failed when fewer than 2 subjects succeed", async () => {
    mockInvestigate
      .mockResolvedValueOnce(MOCK_INVESTIGATION)
      .mockRejectedValueOnce(new Error("fail"));

    const result = await runParallelInvestigation(["SubA", "SubB"]);
    expect(result.stage).toBe("failed");
  });

  it("includes competitive map when requested", async () => {
    mockExtractJson
      .mockReturnValueOnce(
        JSON.stringify({
          synergies: [],
          tradeoffs: [],
          combinedOpportunities: [],
          recommendation: "rec",
        })
      )
      .mockReturnValueOnce(
        JSON.stringify({
          subjects: [],
          overlapAreas: [],
          differentiators: [],
          recommendation: "compete",
        })
      );

    const result = await runParallelInvestigation(["SubA", "SubB"], {
      includeCompetitiveMap: true,
    });

    expect(result.stage).toBe("completed");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("handles 5 subjects (mid-range)", async () => {
    const subjects = ["A", "B", "C", "D", "E"];
    const result = await runParallelInvestigation(subjects);

    expect(result.stage).toBe("completed");
    expect(result.investigations).toHaveLength(5);
    expect(mockInvestigate).toHaveBeenCalledTimes(5);
  });

  it("handles 10 subjects (upper boundary)", async () => {
    const subjects = Array.from({ length: 10 }, (_, i) => `Subject ${i}`);
    const result = await runParallelInvestigation(subjects);

    expect(result.stage).toBe("completed");
    expect(result.investigations).toHaveLength(10);
  });
});
