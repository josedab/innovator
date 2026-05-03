import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

import {
  clearRedTeamSessions,
  listRedTeamSessions,
  getRedTeamSession,
  countSevereFindings,
  defenseEffectiveness,
  attackIdea,
  defendIdea,
  runRedTeamSession,
} from "../redteam/index.js";
import type { RedTeamAttack, DefenseRound } from "../redteam/index.js";
import type { InnovationIdea } from "../types.js";

function makeAttack(overrides: Partial<RedTeamAttack> = {}): RedTeamAttack {
  return {
    ideaTitle: "Test Idea",
    overallVulnerability: "moderate",
    findings: [
      {
        category: "technical-risk",
        severity: "high",
        title: "Scalability concern",
        description: "May not scale beyond 1000 users",
        evidence: "Current architecture is single-threaded",
        mitigationSuggestion: "Use distributed architecture",
      },
      {
        category: "market-risk",
        severity: "low",
        title: "Small TAM",
        description: "Total addressable market is limited",
        evidence: "Only 10K potential users",
        mitigationSuggestion: "Expand to adjacent markets",
      },
    ],
    hiddenAssumptions: ["Users have stable internet"],
    stressTestResults: [
      {
        scenario: "10x scale",
        outcome: "degrades",
        explanation: "Performance drops significantly",
      },
    ],
    survivalScore: 6.5,
    recommendation: "proceed-with-caution",
    ...overrides,
  };
}

function makeDefense(overrides: Partial<DefenseRound> = {}): DefenseRound {
  return {
    ideaTitle: "Test Idea",
    rebuttals: [
      {
        findingTitle: "Scalability concern",
        rebuttal: "We planned for horizontal scaling",
        mitigationPlan: "Implement microservices architecture",
        residualRisk: "reduced",
        confidence: 0.8,
      },
      {
        findingTitle: "Small TAM",
        rebuttal: "TAM is actually larger when including adjacent segments",
        mitigationPlan: "Target enterprise segment",
        residualRisk: "eliminated",
        confidence: 0.9,
      },
    ],
    overallDefenseStrength: "moderate",
    revisedSurvivalScore: 7.5,
    recommendation: "Proceed with mitigation plan",
    ...overrides,
  };
}

describe("redteam", () => {
  beforeEach(() => {
    clearRedTeamSessions();
    vi.clearAllMocks();
  });

  describe("session store", () => {
    it("starts with empty sessions", () => {
      expect(listRedTeamSessions()).toHaveLength(0);
    });

    it("returns undefined for unknown session", () => {
      expect(getRedTeamSession("unknown")).toBeUndefined();
    });
  });

  describe("countSevereFindings", () => {
    it("counts critical and high severity findings", () => {
      const attack = makeAttack();
      expect(countSevereFindings(attack)).toBe(1);
    });

    it("returns 0 when no severe findings", () => {
      const attack = makeAttack({
        findings: [
          {
            category: "edge-case",
            severity: "low",
            title: "Minor edge case",
            description: "desc",
            evidence: "ev",
            mitigationSuggestion: "fix",
          },
        ],
      });
      expect(countSevereFindings(attack)).toBe(0);
    });

    it("counts all critical findings", () => {
      const attack = makeAttack({
        findings: [
          {
            category: "fatal-flaw",
            severity: "critical",
            title: "f1",
            description: "d",
            evidence: "e",
            mitigationSuggestion: "m",
          },
          {
            category: "fatal-flaw",
            severity: "critical",
            title: "f2",
            description: "d",
            evidence: "e",
            mitigationSuggestion: "m",
          },
        ],
      });
      expect(countSevereFindings(attack)).toBe(2);
    });
  });

  describe("defenseEffectiveness", () => {
    it("calculates percentage of mitigated findings", () => {
      const defense = makeDefense();
      expect(defenseEffectiveness(defense)).toBe(1.0);
    });

    it("returns 0 for empty rebuttals", () => {
      const defense = makeDefense({ rebuttals: [] });
      expect(defenseEffectiveness(defense)).toBe(0);
    });

    it("handles partial mitigation", () => {
      const defense = makeDefense({
        rebuttals: [
          {
            findingTitle: "f1",
            rebuttal: "r",
            mitigationPlan: "m",
            residualRisk: "eliminated",
            confidence: 0.9,
          },
          {
            findingTitle: "f2",
            rebuttal: "r",
            mitigationPlan: "m",
            residualRisk: "unmitigable",
            confidence: 0.3,
          },
        ],
      });
      expect(defenseEffectiveness(defense)).toBe(0.5);
    });
  });

  describe("attackIdea", () => {
    const testIdea: InnovationIdea = {
      title: "AI Assistant",
      description: "An AI-powered productivity tool",
      potentialImpact: "10x productivity",
      implementationHint: "Use LLMs",
    };

    it("calls LLM and parses attack result", async () => {
      const attackJson = JSON.stringify(makeAttack());
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      const result = await attackIdea(testIdea);
      expect(result.ideaTitle).toBe("Test Idea");
      expect(result.findings).toHaveLength(2);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it("includes idea details in prompt", async () => {
      const attackJson = JSON.stringify(makeAttack());
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      await attackIdea(testIdea);
      const prompt = mockGenerateText.mock.calls[0][0].prompt;
      expect(prompt).toContain(testIdea.title);
      expect(prompt).toContain(testIdea.description);
    });
  });

  describe("defendIdea", () => {
    const testIdea: InnovationIdea = {
      title: "AI Assistant",
      description: "An AI-powered productivity tool",
      potentialImpact: "10x productivity",
      implementationHint: "Use LLMs",
    };

    it("calls LLM and parses defense result", async () => {
      const defenseJson = JSON.stringify(makeDefense());
      mockGenerateText.mockResolvedValue(defenseJson);
      mockExtractJson.mockReturnValue(defenseJson);

      const attack = makeAttack();
      const result = await defendIdea(testIdea, attack);
      expect(result.rebuttals).toHaveLength(2);
      expect(result.overallDefenseStrength).toBe("moderate");
    });

    it("includes attack findings in defense prompt", async () => {
      const defenseJson = JSON.stringify(makeDefense());
      mockGenerateText.mockResolvedValue(defenseJson);
      mockExtractJson.mockReturnValue(defenseJson);

      const attack = makeAttack();
      await defendIdea(testIdea, attack);
      const prompt = mockGenerateText.mock.calls[0][0].prompt;
      expect(prompt).toContain("RED TEAM FINDINGS");
      expect(prompt).toContain(testIdea.title);
    });
  });

  describe("runRedTeamSession", () => {
    const testIdea: InnovationIdea = {
      title: "AI Assistant",
      description: "An AI-powered productivity tool",
      potentialImpact: "10x productivity",
      implementationHint: "Use LLMs",
    };

    it("runs multiple attack/defense rounds", async () => {
      const attackJson = JSON.stringify(makeAttack());
      const defenseJson = JSON.stringify(makeDefense());

      // Round 1: attack + defense, Round 2: attack only
      mockGenerateText
        .mockResolvedValueOnce(attackJson)
        .mockResolvedValueOnce(defenseJson)
        .mockResolvedValueOnce(attackJson);
      mockExtractJson
        .mockReturnValueOnce(attackJson)
        .mockReturnValueOnce(defenseJson)
        .mockReturnValueOnce(attackJson);

      const session = await runRedTeamSession(testIdea, undefined, { rounds: 2 });
      expect(session.rounds).toHaveLength(2);
      expect(session.rounds[0].defense).toBeTruthy();
      expect(session.rounds[1].defense).toBeUndefined(); // Last round has no defense
    });

    it("invokes onRoundComplete callback", async () => {
      const attackJson = JSON.stringify(makeAttack());
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      const onRoundComplete = vi.fn();
      await runRedTeamSession(testIdea, undefined, { rounds: 1, onRoundComplete });
      expect(onRoundComplete).toHaveBeenCalledTimes(1);
      expect(onRoundComplete).toHaveBeenCalledWith(1, expect.any(Object), undefined);
    });

    it("stores session and sets final verdict", async () => {
      const attackJson = JSON.stringify(makeAttack({ survivalScore: 7 }));
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      const session = await runRedTeamSession(testIdea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("validated");
      expect(getRedTeamSession(session.id)).toBeTruthy();
    });

    it("sets conditionally-validated for score 5-6.9", async () => {
      const attackJson = JSON.stringify(makeAttack({ survivalScore: 5 }));
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      const session = await runRedTeamSession(testIdea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("conditionally-validated");
    });

    it("sets needs-pivot for score 3-4.9", async () => {
      const attackJson = JSON.stringify(makeAttack({ survivalScore: 3 }));
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      const session = await runRedTeamSession(testIdea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("needs-pivot");
    });

    it("sets rejected for score < 3", async () => {
      const attackJson = JSON.stringify(makeAttack({ survivalScore: 2 }));
      mockGenerateText.mockResolvedValue(attackJson);
      mockExtractJson.mockReturnValue(attackJson);

      const session = await runRedTeamSession(testIdea, undefined, { rounds: 1 });
      expect(session.finalVerdict).toBe("rejected");
    });

    it("respects AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      const session = await runRedTeamSession(testIdea, undefined, {
        rounds: 3,
        signal: controller.signal,
      });
      expect(session.rounds).toHaveLength(0);
    });
  });
});
