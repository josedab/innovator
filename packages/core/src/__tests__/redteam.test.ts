import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  clearRedTeamSessions,
  listRedTeamSessions,
  getRedTeamSession,
  countSevereFindings,
  defenseEffectiveness,
} from "../redteam/index.js";
import type { RedTeamAttack, DefenseRound } from "../redteam/index.js";

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
});
