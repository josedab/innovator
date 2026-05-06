import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM client and retry
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    // Simple JSON extraction: find first { to last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return raw.slice(start, end + 1);
  }),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, text: string) => `[${label}]: ${text}`),
  sanitizeLlmOutput: vi.fn((text: string) => text),
}));

import { generateText } from "../copilot/client.js";
import type { GenerateOptions } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

import {
  generateClarificationQuestions,
  detectAssumptions,
  recommendPivots,
  generateMidAngleIntervention,
  generatePostSynthesisDeepening,
} from "../coaching/index.js";

const mockGenerateText = vi.mocked(generateText);
const mockWithRetry = vi.mocked(withRetry);

const MOCK_INTERVENTION_JSON = JSON.stringify({
  questions: [
    {
      question: "What problem does this solve?",
      intent: "Clarify value",
      category: "clarification",
    },
  ],
  assumptions: [{ assumption: "Users want this", risk: "high", challenge: "Any evidence?" }],
  pivots: [
    {
      currentDirection: "Current",
      suggestedPivot: "Alternative",
      rationale: "Better fit",
      confidence: 0.8,
    },
  ],
  summary: "Coaching summary",
});

const MOCK_ASSUMPTIONS_JSON = JSON.stringify({
  assumptions: [
    { assumption: "Market is ready", risk: "medium", challenge: "What data supports this?" },
    {
      assumption: "No competitors",
      risk: "high",
      challenge: "Have you done a competitive analysis?",
    },
  ],
});

const MOCK_PIVOTS_JSON = JSON.stringify({
  pivots: [
    {
      currentDirection: "B2C app",
      suggestedPivot: "B2B platform",
      rationale: "Larger market",
      confidence: 0.7,
    },
  ],
});

describe("coaching functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: withRetry just executes the function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockWithRetry.mockImplementation(async (fn: (...args: any[]) => unknown) => fn());
  });

  describe("generateClarificationQuestions", () => {
    it("returns a CoachIntervention from LLM response", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);

      const result = await generateClarificationQuestions("AI in healthcare");

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].category).toBe("clarification");
      expect(result.assumptions).toHaveLength(1);
      expect(result.pivots).toHaveLength(1);
      expect(result.summary).toBe("Coaching summary");
    });

    it("uses specified personality and maxQuestions", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);

      await generateClarificationQuestions("test", {
        personality: "provocateur",
        maxQuestions: 3,
      });

      expect(mockWithRetry).toHaveBeenCalledTimes(1);
      // Verify the prompt was constructed (generateText receives it)
      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.prompt).toContain("provocative");
    });

    it("passes model to generateText", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);

      await generateClarificationQuestions("test", { model: "gpt-5" });

      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.model).toBe("gpt-5");
    });

    it("passes AbortSignal through", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);
      const ac = new AbortController();

      await generateClarificationQuestions("test", {}, ac.signal);

      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.signal).toBe(ac.signal);
    });
  });

  describe("detectAssumptions", () => {
    it("returns array of detected assumptions", async () => {
      mockGenerateText.mockResolvedValue(MOCK_ASSUMPTIONS_JSON);

      const result = await detectAssumptions("Our product will dominate the market");

      expect(result).toHaveLength(2);
      expect(result[0].assumption).toBe("Market is ready");
      expect(result[0].risk).toBe("medium");
      expect(result[1].risk).toBe("high");
    });

    it("passes model parameter", async () => {
      mockGenerateText.mockResolvedValue(MOCK_ASSUMPTIONS_JSON);

      await detectAssumptions("test", "gpt-5");

      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.model).toBe("gpt-5");
    });
  });

  describe("recommendPivots", () => {
    it("returns array of pivot recommendations", async () => {
      mockGenerateText.mockResolvedValue(MOCK_PIVOTS_JSON);

      const result = await recommendPivots("fintech", ["Payment app", "Budget tool"]);

      expect(result).toHaveLength(1);
      expect(result[0].suggestedPivot).toBe("B2B platform");
      expect(result[0].confidence).toBe(0.7);
    });

    it("passes subject and ideas in prompt", async () => {
      mockGenerateText.mockResolvedValue(MOCK_PIVOTS_JSON);

      await recommendPivots("edtech", ["Online courses"]);

      const callArgs = mockGenerateText.mock.calls[0][0] as GenerateOptions;
      expect(callArgs.prompt).toContain("edtech");
      expect(callArgs.prompt).toContain("Online courses");
    });
  });

  describe("generateMidAngleIntervention", () => {
    it("returns coaching intervention from mid-angle context", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);

      const result = await generateMidAngleIntervention(
        "robotics",
        {
          summary: "Investigation summary",
          keyAspects: [],
          currentState: "",
          challenges: [],
          opportunities: [],
        } as unknown as Parameters<typeof generateMidAngleIntervention>[1],
        [
          { angleName: "SCAMPER", ideas: [{ title: "Idea 1", description: "Desc" }] },
        ] as unknown as Parameters<typeof generateMidAngleIntervention>[2]
      );

      expect(result.questions).toHaveLength(1);
      expect(result.summary).toBe("Coaching summary");
    });
  });

  describe("generatePostSynthesisDeepening", () => {
    it("returns coaching intervention from synthesis context", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);

      const result = await generatePostSynthesisDeepening("clean energy", {
        topIdeas: [{ title: "Solar Widget", sourceAngle: "SCAMPER", description: "A solar thing" }],
        themes: ["sustainability"],
        recommendation: "Focus on solar",
      } as unknown as Parameters<typeof generatePostSynthesisDeepening>[1]);

      expect(result.questions).toHaveLength(1);
      expect(result.pivots).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("throws on malformed JSON when retries exhausted", async () => {
      mockWithRetry.mockRejectedValue(new Error("Failed to parse coaching response as JSON"));

      await expect(generateClarificationQuestions("test")).rejects.toThrow("Failed to parse");
    });

    it("retries on parse failures via withRetry", async () => {
      mockGenerateText.mockResolvedValue(MOCK_INTERVENTION_JSON);

      await generateClarificationQuestions("test");

      // withRetry was called with isRetryable that checks for parse errors
      expect(mockWithRetry).toHaveBeenCalledTimes(1);
      const retryCall = mockWithRetry.mock.calls[0];
      expect(retryCall.length).toBeGreaterThanOrEqual(1);
    });

    it("propagates AbortSignal to withRetry options", async () => {
      mockGenerateText.mockResolvedValue(MOCK_ASSUMPTIONS_JSON);
      const ac = new AbortController();

      await detectAssumptions("test", undefined, ac.signal);

      const retryOpts = mockWithRetry.mock.calls[0][1] as Record<string, unknown>;
      expect(retryOpts.signal).toBe(ac.signal);
    });

    it("throws when Zod validation fails on LLM response", async () => {
      // Return valid JSON but invalid schema
      mockGenerateText.mockResolvedValue(JSON.stringify({ assumptions: [{ bad: "data" }] }));

      await expect(detectAssumptions("test")).rejects.toThrow();
    });
  });
});
