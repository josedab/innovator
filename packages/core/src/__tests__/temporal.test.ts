import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock copilot at the path the temporal module imports from
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return raw.slice(start, end + 1);
  }),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, text: string) => `[${label}]: ${text}`),
  sanitizeLlmOutput: vi.fn((text: string) => text),
}));

import {
  buildTemporalPrompt,
  getHorizonConfig,
  TimeHorizonSchema,
  generateForHorizon,
  runTemporalLens,
} from "../prompts/temporal/index.js";
import { generateText } from "../copilot/client.js";
import type { GenerateOptions } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("temporal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates time horizon schema", () => {
    expect(TimeHorizonSchema.parse("near")).toBe("near");
    expect(TimeHorizonSchema.parse("mid")).toBe("mid");
    expect(TimeHorizonSchema.parse("far")).toBe("far");
    expect(() => TimeHorizonSchema.parse("invalid")).toThrow();
  });

  it("returns horizon configs with correct labels", () => {
    const near = getHorizonConfig("near");
    expect(near.label).toBe("Near-Term");
    expect(near.yearRange).toBe("0-1 years");

    const mid = getHorizonConfig("mid");
    expect(mid.label).toBe("Mid-Term");

    const far = getHorizonConfig("far");
    expect(far.label).toBe("Far-Future");
  });

  it("builds temporal prompt with subject and horizon", () => {
    const prompt = buildTemporalPrompt("AI in education", "near");
    expect(prompt).toContain("AI in education");
    expect(prompt).toContain("Near-Term");
    expect(prompt).toContain("0-1 years");
    expect(prompt).toContain("near");
  });

  it("builds temporal prompt with investigation context", () => {
    const investigation = {
      summary: "AI is transforming education",
      keyAspects: [],
      currentState: "Early adoption",
      challenges: ["Cost", "Access"],
      opportunities: ["Personalization"],
    };
    const prompt = buildTemporalPrompt("AI in education", "mid", investigation);
    expect(prompt).toContain("AI is transforming education");
    expect(prompt).toContain("Cost");
  });

  it("respects ideasPerHorizon parameter", () => {
    const prompt = buildTemporalPrompt("AI", "far", undefined, 7);
    expect(prompt).toContain("7");
  });

  describe("generateForHorizon", () => {
    const MOCK_HORIZON_RESULT = JSON.stringify({
      horizon: "near",
      label: "Near-Term",
      yearRange: "0-1 years",
      ideas: [
        {
          title: "Quick Win",
          description: "A near-term improvement",
          potentialImpact: "Moderate efficiency gain",
          implementationHint: "Start with existing tools",
          horizon: "near",
          enablers: ["Current APIs"],
          constraints: ["Budget limits"],
          probability: 0.85,
        },
      ],
      eraContext: "Current technology landscape allows for incremental improvements.",
    });

    it("generates ideas for a single horizon", async () => {
      mockGenerateText.mockResolvedValue(MOCK_HORIZON_RESULT);

      const result = await generateForHorizon("AI tools", "near");
      expect(result.horizon).toBe("near");
      expect(result.label).toBe("Near-Term");
      expect(result.ideas).toHaveLength(1);
      expect(result.ideas[0].enablers).toContain("Current APIs");
      expect(result.eraContext).toBeDefined();
    });

    it("passes model config to generateText", async () => {
      mockGenerateText.mockResolvedValue(MOCK_HORIZON_RESULT);

      await generateForHorizon("AI", "near", undefined, { model: "gpt-5" });
      // withRetry wraps the generateText call; model is inside the prompt call
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.model).toBe("gpt-5");
    });

    it("passes AbortSignal", async () => {
      mockGenerateText.mockResolvedValue(MOCK_HORIZON_RESULT);
      const ac = new AbortController();

      await generateForHorizon("AI", "near", undefined, {}, ac.signal);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.signal).toBe(ac.signal);
    });
  });

  describe("runTemporalLens", () => {
    function makeMockHorizonResult(horizon: string, label: string, yearRange: string) {
      return JSON.stringify({
        horizon,
        label,
        yearRange,
        ideas: [
          {
            title: `${label} Idea`,
            description: "D",
            potentialImpact: "P",
            implementationHint: "H",
            horizon,
            enablers: ["E"],
            constraints: ["C"],
            probability: 0.7,
          },
        ],
        eraContext: `${label} context`,
      });
    }

    it("orchestrates all 3 horizons and returns combined result", async () => {
      mockGenerateText
        .mockResolvedValueOnce(makeMockHorizonResult("near", "Near-Term", "0-1 years"))
        .mockResolvedValueOnce(makeMockHorizonResult("mid", "Mid-Term", "2-5 years"))
        .mockResolvedValueOnce(makeMockHorizonResult("far", "Far-Future", "10-20 years"))
        .mockResolvedValueOnce("A narrative connecting all horizons."); // narrative call

      const result = await runTemporalLens("AI innovation");
      expect(result.subject).toBe("AI innovation");
      expect(result.horizons).toHaveLength(3);
      expect(result.horizons[0].horizon).toBe("near");
      expect(result.horizons[1].horizon).toBe("mid");
      expect(result.horizons[2].horizon).toBe("far");
      expect(result.timelineNarrative).toBeDefined();
    });

    it("respects custom horizons config", async () => {
      mockGenerateText.mockResolvedValue(makeMockHorizonResult("near", "Near-Term", "0-1 years"));

      const result = await runTemporalLens("AI", undefined, { horizons: ["near"] });
      expect(result.horizons).toHaveLength(1);
    });

    it("stops on AbortSignal", async () => {
      const ac = new AbortController();
      ac.abort();

      const result = await runTemporalLens("AI", undefined, {}, ac.signal);
      expect(result.horizons).toHaveLength(0);
    });

    it("uses fallback narrative when narrative generation fails", async () => {
      mockGenerateText
        .mockResolvedValueOnce(makeMockHorizonResult("near", "Near-Term", "0-1 years"))
        .mockResolvedValueOnce(makeMockHorizonResult("mid", "Mid-Term", "2-5 years"))
        .mockRejectedValueOnce(new Error("narrative failed")); // narrative call fails

      const result = await runTemporalLens("AI", undefined, { horizons: ["near", "mid"] });
      expect(result.horizons).toHaveLength(2);
      // Should have fallback narrative
      expect(result.timelineNarrative).toBeDefined();
    });

    it("single horizon skips narrative generation", async () => {
      mockGenerateText.mockResolvedValue(makeMockHorizonResult("near", "Near-Term", "0-1 years"));

      const result = await runTemporalLens("AI", undefined, { horizons: ["near"] });
      expect(result.timelineNarrative).toContain("immediate improvements");
    });
  });
});
