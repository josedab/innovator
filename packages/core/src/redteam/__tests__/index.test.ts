import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: (_label: string, val: string) => val,
  sanitizeLlmOutput: (val: string) => val,
}));

import {
  attackIdea,
  defendIdea,
  runRedTeamSession,
  getRedTeamSession,
  listRedTeamSessions,
  clearRedTeamSessions,
  countSevereFindings,
  defenseEffectiveness,
  type RedTeamAttack,
  type DefenseRound,
} from "../index.js";
import type { InnovationIdea } from "../../types.js";

const idea: InnovationIdea = {
  title: "AI Platform",
  description: "An AI-powered platform for analytics",
  potentialImpact: "High",
  implementationHint: "Use ML models",
};

function makeAttackResponse(overrides: Partial<RedTeamAttack> = {}): RedTeamAttack {
  return {
    ideaTitle: "AI Platform",
    overallVulnerability: "moderate",
    findings: [
      {
        category: "fatal-flaw",
        severity: "critical",
        title: "Data dependency",
        description: "Relies on specific data",
        evidence: "Historical patterns",
        mitigationSuggestion: "Diversify sources",
      },
      {
        category: "market-risk",
        severity: "high",
        title: "Market saturation",
        description: "Many competitors",
        evidence: "Market data",
        mitigationSuggestion: "Differentiate",
      },
      {
        category: "edge-case",
        severity: "medium",
        title: "Edge case handling",
        description: "Edge cases in data",
        evidence: "Testing",
        mitigationSuggestion: "More tests",
      },
    ],
    hiddenAssumptions: ["Users have data", "Market is ready"],
    stressTestResults: [
      { scenario: "10x scale", outcome: "degrades", explanation: "Performance drops" },
    ],
    survivalScore: 6,
    recommendation: "proceed-with-caution",
    ...overrides,
  };
}

function makeDefenseResponse(overrides: Partial<DefenseRound> = {}): DefenseRound {
  return {
    ideaTitle: "AI Platform",
    rebuttals: [
      {
        findingTitle: "Data dependency",
        rebuttal: "We can diversify",
        mitigationPlan: "Add multiple sources",
        residualRisk: "reduced",
        confidence: 0.8,
      },
      {
        findingTitle: "Market saturation",
        rebuttal: "We have unique features",
        mitigationPlan: "Focus on niche",
        residualRisk: "eliminated",
        confidence: 0.9,
      },
    ],
    overallDefenseStrength: "moderate",
    revisedSurvivalScore: 7.5,
    recommendation: "Proceed with caution",
    ...overrides,
  };
}

describe("redteam", () => {
  beforeEach(() => {
    clearRedTeamSessions();
    vi.clearAllMocks();
  });

  describe("attackIdea", () => {
    it("returns attack findings across categories with severity", async () => {
      const response = makeAttackResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(response));

      const result = await attackIdea(idea);
      expect(result.ideaTitle).toBe("AI Platform");
      expect(result.findings.length).toBe(3);
      expect(result.findings[0].category).toBe("fatal-flaw");
      expect(result.findings[0].severity).toBe("critical");
      expect(result.survivalScore).toBe(6);
    });

    it("validates response against schema", async () => {
      const invalid = { ideaTitle: "test" }; // missing required fields
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(invalid));

      await expect(attackIdea(idea)).rejects.toThrow();
    });
  });

  describe("defendIdea", () => {
    it("returns rebuttals referencing specific findings", async () => {
      const attack = makeAttackResponse();
      const defense = makeDefenseResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(defense));

      const result = await defendIdea(idea, attack);
      expect(result.rebuttals.length).toBe(2);
      expect(result.rebuttals[0].findingTitle).toBe("Data dependency");
      expect(result.overallDefenseStrength).toBe("moderate");
    });
  });

  describe("countSevereFindings", () => {
    it("counts critical and high severity findings", () => {
      const attack = makeAttackResponse();
      expect(countSevereFindings(attack)).toBe(2); // 1 critical + 1 high
    });

    it("returns 0 when no severe findings", () => {
      const attack = makeAttackResponse({
        findings: [
          {
            category: "edge-case",
            severity: "low",
            title: "Minor",
            description: "d",
            evidence: "e",
            mitigationSuggestion: "m",
          },
        ],
      });
      expect(countSevereFindings(attack)).toBe(0);
    });
  });

  describe("defenseEffectiveness", () => {
    it("calculates percentage of mitigated findings", () => {
      const defense = makeDefenseResponse();
      // 2 rebuttals: 1 reduced + 1 eliminated = 100% effective
      expect(defenseEffectiveness(defense)).toBe(1);
    });

    it("returns 0 for empty rebuttals", () => {
      const defense = makeDefenseResponse({ rebuttals: [] });
      expect(defenseEffectiveness(defense)).toBe(0);
    });

    it("calculates partial effectiveness", () => {
      const defense = makeDefenseResponse({
        rebuttals: [
          {
            findingTitle: "A",
            rebuttal: "r",
            mitigationPlan: "p",
            residualRisk: "eliminated",
            confidence: 0.9,
          },
          {
            findingTitle: "B",
            rebuttal: "r",
            mitigationPlan: "p",
            residualRisk: "unmitigable",
            confidence: 0.3,
          },
        ],
      });
      expect(defenseEffectiveness(defense)).toBe(0.5);
    });
  });

  describe("runRedTeamSession", () => {
    it("runs multiple rounds respecting maxRounds", async () => {
      const attack = makeAttackResponse({ survivalScore: 6 });
      const defense = makeDefenseResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson
        .mockReturnValueOnce(JSON.stringify(attack))
        .mockReturnValueOnce(JSON.stringify(defense))
        .mockReturnValueOnce(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 2 });
      expect(session.rounds).toHaveLength(2);
      expect(session.rounds[0].defense).toBeDefined(); // defense in non-last rounds
      expect(session.rounds[1].defense).toBeUndefined(); // no defense in last round
    });

    it("caps rounds at 5", async () => {
      const attack = makeAttackResponse({ survivalScore: 8 });
      const defense = makeDefenseResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));
      // For the defense rounds
      let callCount = 0;
      mockExtractJson.mockImplementation(() => {
        callCount++;
        return callCount % 2 === 1 ? JSON.stringify(attack) : JSON.stringify(defense);
      });

      const session = await runRedTeamSession(idea, undefined, { rounds: 10 });
      expect(session.rounds.length).toBeLessThanOrEqual(5);
    });

    it("verdict: validated when survivalScore >= 7", async () => {
      const attack = makeAttackResponse({ survivalScore: 8 });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("validated");
    });

    it("verdict: conditionally-validated when survivalScore >= 5", async () => {
      const attack = makeAttackResponse({ survivalScore: 5.5 });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("conditionally-validated");
    });

    it("verdict: needs-pivot when survivalScore >= 3", async () => {
      const attack = makeAttackResponse({ survivalScore: 3.5 });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("needs-pivot");
    });

    it("verdict: rejected when survivalScore < 3", async () => {
      const attack = makeAttackResponse({ survivalScore: 2 });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("rejected");
    });

    it("calls onRoundComplete callback", async () => {
      const attack = makeAttackResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const onRoundComplete = vi.fn();
      await runRedTeamSession(idea, undefined, { rounds: 1, onRoundComplete });
      expect(onRoundComplete).toHaveBeenCalledOnce();
      expect(onRoundComplete).toHaveBeenCalledWith(1, expect.any(Object), undefined);
    });

    it("respects AbortSignal cancellation", async () => {
      const controller = new AbortController();
      controller.abort();
      const attack = makeAttackResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, {
        rounds: 3,
        signal: controller.signal,
      });
      expect(session.rounds).toHaveLength(0);
    });

    it("auto-validates with 0 findings", async () => {
      const attack = makeAttackResponse({ findings: [], survivalScore: 9 });
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("validated");
    });
  });

  describe("CRUD operations", () => {
    it("getRedTeamSession returns session by id", async () => {
      const attack = makeAttackResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      const session = await runRedTeamSession(idea, undefined, { rounds: 1 });
      const retrieved = getRedTeamSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
    });

    it("getRedTeamSession returns undefined for unknown id", () => {
      expect(getRedTeamSession("nonexistent")).toBeUndefined();
    });

    it("listRedTeamSessions returns all sessions", async () => {
      const attack = makeAttackResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      await runRedTeamSession(idea, undefined, { rounds: 1 });
      await runRedTeamSession(idea, undefined, { rounds: 1 });
      expect(listRedTeamSessions()).toHaveLength(2);
    });

    it("clearRedTeamSessions empties all sessions", async () => {
      const attack = makeAttackResponse();
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(attack));

      await runRedTeamSession(idea, undefined, { rounds: 1 });
      clearRedTeamSessions();
      expect(listRedTeamSessions()).toHaveLength(0);
    });
  });
});
