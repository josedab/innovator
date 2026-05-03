/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  runDebate,
  debateIdeas,
  debateToMarkdown,
  DEFAULT_PRO_PERSONA,
  DEFAULT_CON_PERSONA,
  DebateResultSchema,
} from "../debate/index.js";
import { generateText } from "../copilot/client.js";
import type { DebateResult } from "../debate/index.js";

const mockGenerateText = vi.mocked(generateText);

const TEST_IDEA = {
  title: "AI Widget",
  description: "An AI-powered widget for productivity",
  potentialImpact: "High",
  implementationHint: "Start with MVP",
};

function mockDebateResponses() {
  // Pro arguments
  mockGenerateText.mockResolvedValueOnce(
    JSON.stringify({
      arguments: [{ point: "Pro point 1", evidence: "Evidence 1", strength: 8 }],
    })
  );
  // Con arguments
  mockGenerateText.mockResolvedValueOnce(
    JSON.stringify({
      arguments: [{ point: "Con point 1", evidence: "Counter evidence 1", strength: 7 }],
    })
  );
  // Second round pro
  mockGenerateText.mockResolvedValueOnce(
    JSON.stringify({
      arguments: [{ point: "Pro point 2", evidence: "Evidence 2", strength: 9 }],
      rebuttal: "Pro rebuttal text",
    })
  );
  // Second round con
  mockGenerateText.mockResolvedValueOnce(
    JSON.stringify({
      arguments: [{ point: "Con point 2", evidence: "Counter evidence 2", strength: 6 }],
      rebuttal: "Con rebuttal text",
    })
  );
  // Verdict
  mockGenerateText.mockResolvedValueOnce(
    JSON.stringify({
      verdict: {
        winner: "pro",
        confidence: 0.75,
        summary: "Pro arguments were stronger",
        keyInsight: "The market opportunity is significant",
        conditions: ["If competitor launches first"],
      },
      quality: {
        argumentDepth: 7,
        evidenceQuality: 6,
        balanceScore: 8,
        insightNovelty: 7,
        overall: 7,
      },
    })
  );
}

describe("debate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runDebate", () => {
    it("validates rounds must be 1-5", async () => {
      await expect(runDebate(TEST_IDEA, undefined, { rounds: 0 })).rejects.toThrow(
        "Debate rounds must be between 1 and 5"
      );

      await expect(runDebate(TEST_IDEA, undefined, { rounds: 6 })).rejects.toThrow(
        "Debate rounds must be between 1 and 5"
      );
    });

    it("produces correct DebateResult with parallel pro/con", async () => {
      mockDebateResponses();

      const result = await runDebate(TEST_IDEA, undefined, { rounds: 2 });

      expect(result.idea).toBe("AI Widget");
      expect(result.rounds).toHaveLength(2);
      expect(result.totalRounds).toBe(2);
      expect(result.verdict.winner).toBe("pro");
      expect(result.verdict.confidence).toBe(0.75);
      expect(result.quality.overall).toBe(7);
    });

    it("passes previous round context for multi-round debates", async () => {
      mockDebateResponses();

      await runDebate(TEST_IDEA, undefined, { rounds: 2 });

      // generateText should have been called for 2 rounds (2 calls each) + verdict = 5
      expect(mockGenerateText).toHaveBeenCalledTimes(5);
    });

    it("runs with investigation context", async () => {
      const investigation = {
        summary: "Research summary",
        keyAspects: [],
        currentState: "Current state",
        challenges: ["Challenge 1"],
        opportunities: ["Opportunity 1"],
      } as any;

      mockDebateResponses();

      const result = await runDebate(TEST_IDEA, investigation, { rounds: 2 });
      expect(result.rounds).toHaveLength(2);
    });
  });

  describe("debateIdeas", () => {
    it("sorts results by verdict confidence", async () => {
      // First idea debate
      mockGenerateText
        .mockResolvedValueOnce(
          JSON.stringify({ arguments: [{ point: "P", evidence: "E", strength: 5 }] })
        )
        .mockResolvedValueOnce(
          JSON.stringify({ arguments: [{ point: "C", evidence: "E", strength: 5 }] })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            verdict: {
              winner: "pro",
              confidence: 0.5,
              summary: "S",
              keyInsight: "K",
              conditions: [],
            },
            quality: {
              argumentDepth: 5,
              evidenceQuality: 5,
              balanceScore: 5,
              insightNovelty: 5,
              overall: 5,
            },
          })
        );

      // Second idea debate
      mockGenerateText
        .mockResolvedValueOnce(
          JSON.stringify({ arguments: [{ point: "P", evidence: "E", strength: 5 }] })
        )
        .mockResolvedValueOnce(
          JSON.stringify({ arguments: [{ point: "C", evidence: "E", strength: 5 }] })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            verdict: {
              winner: "con",
              confidence: 0.9,
              summary: "S",
              keyInsight: "K",
              conditions: [],
            },
            quality: {
              argumentDepth: 5,
              evidenceQuality: 5,
              balanceScore: 5,
              insightNovelty: 5,
              overall: 5,
            },
          })
        );

      const results = await debateIdeas(
        [
          { ...TEST_IDEA, title: "Idea A" },
          { ...TEST_IDEA, title: "Idea B" },
        ],
        undefined,
        { rounds: 1 }
      );

      expect(results).toHaveLength(2);
      expect(results[0].verdict.confidence).toBeGreaterThanOrEqual(results[1].verdict.confidence);
    });
  });

  describe("debateToMarkdown", () => {
    it("produces valid markdown with rounds, verdict, and quality scores", () => {
      const result: DebateResult = {
        idea: "Test Idea",
        rounds: [
          {
            round: 1,
            proArguments: [{ point: "Pro 1", evidence: "Ev 1", strength: 8 }],
            conArguments: [{ point: "Con 1", evidence: "Ev 2", strength: 7 }],
            proRebuttal: "Pro rebuttal",
            conRebuttal: "Con rebuttal",
          },
        ],
        verdict: {
          winner: "nuanced",
          confidence: 0.6,
          summary: "Balanced view",
          keyInsight: "Both sides have merit",
          conditions: ["Market conditions"],
        },
        quality: {
          argumentDepth: 7,
          evidenceQuality: 6,
          balanceScore: 9,
          insightNovelty: 5,
          overall: 7,
        },
        totalRounds: 1,
      };

      const md = debateToMarkdown(result);

      expect(md).toContain("# Debate: Test Idea");
      expect(md).toContain("## Round 1");
      expect(md).toContain("### Pro Arguments");
      expect(md).toContain("### Con Arguments");
      expect(md).toContain("Pro 1");
      expect(md).toContain("(strength: 8/10)");
      expect(md).toContain("*Pro Rebuttal:*");
      expect(md).toContain("*Con Rebuttal:*");
      expect(md).toContain("## Verdict");
      expect(md).toContain("nuanced");
      expect(md).toContain("60%");
      expect(md).toContain("## Quality Scores");
      expect(md).toContain("Argument Depth: 7/10");
      expect(md).toContain("Market conditions");
    });
  });

  describe("default personas", () => {
    it("has correct bias values", () => {
      expect(DEFAULT_PRO_PERSONA.bias).toBe("pro");
      expect(DEFAULT_CON_PERSONA.bias).toBe("con");
      expect(DEFAULT_PRO_PERSONA.name).toBeDefined();
      expect(DEFAULT_CON_PERSONA.name).toBeDefined();
    });
  });

  describe("DebateResultSchema", () => {
    it("validates a correct data shape", () => {
      const valid = {
        idea: "Test",
        rounds: [
          {
            round: 1,
            proArguments: [{ point: "P", evidence: "E", strength: 5 }],
            conArguments: [{ point: "C", evidence: "E", strength: 5 }],
          },
        ],
        verdict: {
          winner: "pro",
          confidence: 0.8,
          summary: "S",
          keyInsight: "K",
          conditions: [],
        },
        quality: {
          argumentDepth: 5,
          evidenceQuality: 5,
          balanceScore: 5,
          insightNovelty: 5,
          overall: 5,
        },
        totalRounds: 1,
      };
      expect(() => DebateResultSchema.parse(valid)).not.toThrow();
    });

    it("rejects incorrect data shapes", () => {
      expect(() => DebateResultSchema.parse({})).toThrow();
      expect(() =>
        DebateResultSchema.parse({
          idea: "Test",
          rounds: [],
          verdict: {},
          quality: {},
          totalRounds: 0,
        })
      ).toThrow();
    });
  });
});
