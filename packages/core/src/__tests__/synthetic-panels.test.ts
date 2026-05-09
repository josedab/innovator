import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { runPanel, panelToMarkdown } from "../synthetic-panels/index.js";
import { ARCHETYPE_PROFILES } from "../synthetic-panels/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("synthetic-panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ARCHETYPE_PROFILES", () => {
    it("should define 12 archetypes", () => {
      expect(Object.keys(ARCHETYPE_PROFILES)).toHaveLength(12);
    });

    it("each archetype should have description, priorities, and objectionStyle", () => {
      for (const profile of Object.values(ARCHETYPE_PROFILES)) {
        expect(profile.description).toBeTruthy();
        expect(profile.priorities.length).toBeGreaterThan(0);
        expect(profile.objectionStyle).toBeTruthy();
      }
    });
  });

  describe("runPanel", () => {
    it("should evaluate an idea with multiple personas", async () => {
      const evalResponse = JSON.stringify({
        verdict: "positive",
        score: 7,
        reasoning: "Good idea with potential",
        objections: ["Pricing unclear"],
        suggestions: ["Add enterprise tier"],
        wouldBuy: true,
        willingnessToPayRange: "$10-$50/month",
      });

      const debateResponse = JSON.stringify({
        statement: "I think this has legs",
        respondingTo: "",
        sentiment: "agree",
      });

      const consensusResponse = JSON.stringify({
        overallScore: 7.5,
        verdict: "yes",
        consensusStrength: 0.7,
        topObjections: ["Price sensitivity"],
        topStrengths: ["Strong value prop"],
        recommendation: "Proceed with pricing research",
        splitVote: {
          enthusiastic: 1,
          positive: 2,
          neutral: 1,
          skeptical: 1,
          opposed: 0,
        },
      });

      let callIdx = 0;
      mockGenerateText.mockImplementation(async () => {
        callIdx++;
        if (callIdx <= 3) return evalResponse;
        if (callIdx <= 6) return debateResponse;
        return consensusResponse;
      });

      const result = await runPanel("AI Assistant", "An AI-powered assistant", {
        panelSize: 3,
        archetypes: ["early-adopter", "enterprise-buyer", "price-sensitive"],
      });

      expect(result.ideaTitle).toBe("AI Assistant");
      expect(result.evaluations.length).toBe(3);
      expect(result.consensus.verdict).toBe("yes");
      expect(result.personas.length).toBe(3);
    });
  });

  describe("panelToMarkdown", () => {
    it("should produce markdown report", () => {
      const md = panelToMarkdown({
        ideaTitle: "Test Idea",
        ideaDescription: "Test description",
        personas: [],
        evaluations: [
          {
            personaId: "p1",
            personaName: "Alex",
            archetype: "early-adopter",
            verdict: "enthusiastic",
            score: 9,
            reasoning: "Love it",
            objections: [],
            suggestions: [],
            wouldBuy: true,
          },
        ],
        debate: [],
        consensus: {
          overallScore: 8,
          verdict: "yes",
          consensusStrength: 0.8,
          topObjections: [],
          topStrengths: ["Innovation"],
          recommendation: "Go for it",
        },
      });

      expect(md).toContain("Synthetic User Panel Report");
      expect(md).toContain("Test Idea");
      expect(md).toContain("Alex");
    });
  });
});
