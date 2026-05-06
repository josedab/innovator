import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: (s: string) => s,
  sanitizeUserInput: (s: string) => s,
  wrapUserInput: (_label: string, val: string) => val,
}));

import {
  runWargaming,
  wargamingToMarkdown,
  getWargamingSession,
  listWargamingSessions,
  clearWargamingSessions,
} from "../wargaming/index.js";
import type { CompetitorPersona, WargamingRound } from "../wargaming/index.js";

const mockCompetitors: CompetitorPersona[] = [
  {
    name: "BigCorp",
    type: "incumbent",
    strengths: ["market share", "brand"],
    weaknesses: ["slow innovation"],
    likelyStrategy: "Acquire startups",
    resourceLevel: "massive",
  },
  {
    name: "NimbleStart",
    type: "startup",
    strengths: ["speed"],
    weaknesses: ["funding"],
    likelyStrategy: "Undercut pricing",
    resourceLevel: "low",
  },
];

function makeMockRound(roundNumber: number, resilience: number): WargamingRound {
  return {
    roundNumber,
    yourMove: {
      actor: "You",
      moveType: "offensive",
      description: `Strategic move round ${roundNumber}`,
      expectedImpact: "moderate",
      timeToExecute: "months",
    },
    competitorMoves: [
      {
        actor: "BigCorp",
        moveType: "defensive",
        description: `BigCorp responds round ${roundNumber}`,
        targetedWeakness: "market position",
        expectedImpact: "minor",
        timeToExecute: "quarters",
      },
    ],
    marketShiftDescription: `Market shifted in round ${roundNumber}`,
    resilienceAfterRound: resilience,
  };
}

const mockStrategicBrief = {
  overallResilienceScore: 72,
  vulnerabilities: ["Market saturation", "IP risk"],
  counterStrategies: [
    {
      title: "Patent defense",
      description: "Build patent portfolio",
      targetCompetitor: "BigCorp",
      priority: "high" as const,
      effort: "medium" as const,
      defensiveActions: ["File patents"],
      offensiveActions: ["Challenge competitor patents"],
    },
  ],
  strategicBrief: "The idea shows strong potential but faces headwinds.",
};

describe("wargaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWargamingSessions();
  });

  // Helper to set up mocked LLM responses for a full wargaming run
  function setupMocks(numRounds: number) {
    let callCount = 0;
    mockGenerateText.mockImplementation(() => {
      callCount++;
      // First call: generateCompetitors
      if (callCount === 1) {
        return Promise.resolve(JSON.stringify({ competitors: mockCompetitors }));
      }
      // Next N calls: simulateRound
      if (callCount <= 1 + numRounds) {
        const roundNum = callCount - 1;
        return Promise.resolve(JSON.stringify(makeMockRound(roundNum, 60 + roundNum * 5)));
      }
      // Last call: generateStrategicBrief
      return Promise.resolve(JSON.stringify(mockStrategicBrief));
    });
    mockExtractJson.mockImplementation((raw: string) => raw);
  }

  describe("runWargaming", () => {
    it("runs with 1 round", async () => {
      setupMocks(1);
      const result = await runWargaming("Test Idea", "Description", "AI sector", {
        rounds: 1,
      });

      expect(result.ideaTitle).toBe("Test Idea");
      expect(result.subject).toBe("AI sector");
      expect(result.competitors).toHaveLength(2);
      expect(result.rounds).toHaveLength(1);
      expect(result.overallResilienceScore).toBe(72);
      expect(result.vulnerabilities).toHaveLength(2);
      expect(result.counterStrategies).toHaveLength(1);
    });

    it("runs with 3 rounds", async () => {
      setupMocks(3);
      const result = await runWargaming("Multi-Round Idea", "Desc", "Tech");

      expect(result.rounds).toHaveLength(3);
      // 1 (competitors) + 3 (rounds) + 1 (brief) = 5 LLM calls
      expect(mockGenerateText).toHaveBeenCalledTimes(5);
    });

    it("uses provided competitors instead of generating them", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return Promise.resolve(JSON.stringify(makeMockRound(1, 75)));
        }
        return Promise.resolve(JSON.stringify(mockStrategicBrief));
      });
      mockExtractJson.mockImplementation((raw: string) => raw);

      const result = await runWargaming("Idea", "Desc", "Domain", {
        rounds: 1,
        competitors: mockCompetitors,
      });

      expect(result.competitors).toEqual(mockCompetitors);
      // Only 2 calls: 1 round + 1 brief (no competitor generation)
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });

    it("clamps rounds to 1-5 range", async () => {
      setupMocks(5);
      const result = await runWargaming("Idea", "Desc", "Domain", { rounds: 10 });
      expect(result.rounds).toHaveLength(5);
    });

    it("stores session for retrieval", async () => {
      setupMocks(1);
      await runWargaming("Stored Idea", "Desc", "Domain", { rounds: 1 });

      const session = getWargamingSession("Domain", "Stored Idea");
      expect(session).toBeDefined();
      expect(session?.ideaTitle).toBe("Stored Idea");
    });
  });

  describe("session storage", () => {
    it("getWargamingSession returns undefined for missing session", () => {
      expect(getWargamingSession("x", "y")).toBeUndefined();
    });

    it("listWargamingSessions returns all stored sessions", async () => {
      setupMocks(1);
      await runWargaming("Idea 1", "Desc", "Domain", { rounds: 1 });

      setupMocks(1);
      await runWargaming("Idea 2", "Desc", "Domain", { rounds: 1 });

      const sessions = listWargamingSessions();
      expect(sessions).toHaveLength(2);
    });

    it("clearWargamingSessions removes all sessions", async () => {
      setupMocks(1);
      await runWargaming("Idea", "Desc", "Domain", { rounds: 1 });
      clearWargamingSessions();
      expect(listWargamingSessions()).toHaveLength(0);
    });
  });

  describe("wargamingToMarkdown", () => {
    it("formats all sections", () => {
      const result = {
        ideaTitle: "Test Idea",
        subject: "AI",
        competitors: mockCompetitors,
        rounds: [makeMockRound(1, 75)],
        overallResilienceScore: 72,
        vulnerabilities: ["Vuln 1"],
        counterStrategies: mockStrategicBrief.counterStrategies,
        strategicBrief: "Good outlook.",
      };

      const md = wargamingToMarkdown(result);
      expect(md).toContain("# 🎯 Wargaming Report: Test Idea");
      expect(md).toContain("**Subject:** AI");
      expect(md).toContain("72/100");
      expect(md).toContain("## Competitors");
      expect(md).toContain("BigCorp");
      expect(md).toContain("## Wargaming Rounds");
      expect(md).toContain("Round 1");
      expect(md).toContain("## Vulnerabilities");
      expect(md).toContain("⚠️ Vuln 1");
      expect(md).toContain("## Counter-Strategies");
      expect(md).toContain("Patent defense");
      expect(md).toContain("## Strategic Brief");
      expect(md).toContain("Good outlook.");
    });

    it("handles empty rounds gracefully", () => {
      const result = {
        ideaTitle: "Empty",
        subject: "None",
        competitors: [],
        rounds: [],
        overallResilienceScore: 0,
        vulnerabilities: [],
        counterStrategies: [],
        strategicBrief: "",
      };

      const md = wargamingToMarkdown(result);
      expect(md).toContain("# 🎯 Wargaming Report: Empty");
      expect(md).toContain("## Competitors");
    });
  });
});
