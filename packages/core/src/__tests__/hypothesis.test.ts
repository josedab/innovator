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
  parseHypothesis,
  createHypothesisSession,
  getHypothesisSession,
  listHypothesisSessions,
  updateHypothesisStatus,
  attachAnalysis,
  clearHypothesisSessions,
} from "../hypothesis/index.js";
import type { HypothesisAnalysis } from "../hypothesis/index.js";

function makeAnalysis(): HypothesisAnalysis {
  return {
    parsedHypothesis: {
      statement: "If we add gamification, then user engagement increases.",
      independentVariable: "gamification features",
      dependentVariable: "user engagement",
      assumptions: ["Users are motivated by rewards"],
      domain: "Product Design",
      testability: "testable",
      confidence: 0.7,
    },
    experiments: [
      {
        id: "exp-1",
        title: "A/B test gamification",
        hypothesis: "Gamification increases daily active users by 20%",
        method: "Split users into control and treatment groups",
        metrics: ["DAU", "session length"],
        successCriteria: "20% increase in DAU",
        failureCriteria: "Less than 5% increase",
        duration: "4 weeks",
        resources: ["2 engineers", "analytics platform"],
        risks: ["Novelty effect"],
        expectedOutcome: "Moderate increase in engagement",
        priority: "high",
      },
    ],
    counterEvidence: [
      {
        claim: "Gamification can reduce intrinsic motivation",
        evidence: "Overjustification effect research",
        strength: "moderate",
        implication: "Long-term engagement may decrease",
      },
    ],
    alternativeHypotheses: [
      {
        statement: "Social features drive engagement more than gamification",
        rationale: "Social proof is a stronger motivator",
        differentiator: "Test social features vs gamification independently",
        testability: "testable",
      },
    ],
    pivotSuggestions: [
      {
        direction: "Focus on intrinsic motivation",
        rationale: "Self-determination theory suggests autonomy drives engagement",
        newHypothesis: "If we give users more autonomy, then engagement increases sustainably",
        effortEstimate: "moderate",
        riskLevel: "low",
      },
    ],
  };
}

describe("hypothesis", () => {
  beforeEach(() => {
    clearHypothesisSessions();
  });

  describe("parseHypothesis", () => {
    it("identifies well-formed if-then hypothesis", () => {
      const result = parseHypothesis("If we increase the price, then demand will decrease.");
      expect(result.isWellFormed).toBe(true);
      expect(result.suggestions).toHaveLength(0);
    });

    it("suggests improvements for poorly formed hypothesis", () => {
      const result = parseHypothesis("AI is good");
      expect(result.isWellFormed).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("handles empty input", () => {
      const result = parseHypothesis("");
      expect(result.isWellFormed).toBe(false);
      expect(result.suggestions).toContain("Hypothesis text cannot be empty.");
    });

    it("suggests if-then format when missing", () => {
      const result = parseHypothesis("Users want more features in the product.");
      expect(result.suggestions.some((s) => s.includes("If"))).toBe(true);
    });

    it("accepts causal language", () => {
      const result = parseHypothesis("Adding notifications causes increased user engagement.");
      expect(result.statement).toContain("notifications");
    });
  });

  describe("session management", () => {
    it("creates a session", () => {
      const session = createHypothesisSession("If X then Y.");
      expect(session.id).toBeTruthy();
      expect(session.status).toBe("draft");
      expect(session.originalText).toBe("If X then Y.");
    });

    it("retrieves a session by ID", () => {
      const session = createHypothesisSession("Test hypothesis");
      const retrieved = getHypothesisSession(session.id);
      expect(retrieved).toEqual(session);
    });

    it("lists all sessions", () => {
      createHypothesisSession("H1");
      createHypothesisSession("H2");
      expect(listHypothesisSessions()).toHaveLength(2);
    });

    it("updates session status", () => {
      const session = createHypothesisSession("H1");
      const updated = updateHypothesisStatus(session.id, "testing");
      expect(updated?.status).toBe("testing");
    });

    it("returns undefined for unknown session update", () => {
      expect(updateHypothesisStatus("unknown", "testing")).toBeUndefined();
    });

    it("attaches analysis to session", () => {
      const session = createHypothesisSession("H1");
      const analysis = makeAnalysis();
      const updated = attachAnalysis(session.id, analysis);
      expect(updated?.status).toBe("analyzed");
      expect(updated?.analysis).toBeDefined();
      expect(updated?.analysis?.experiments).toHaveLength(1);
    });

    it("clears all sessions", () => {
      createHypothesisSession("H1");
      createHypothesisSession("H2");
      clearHypothesisSessions();
      expect(listHypothesisSessions()).toHaveLength(0);
    });
  });
});
