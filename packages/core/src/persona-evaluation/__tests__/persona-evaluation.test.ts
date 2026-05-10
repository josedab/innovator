import { vi } from "vitest";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue(JSON.stringify({
    overallScore: 75,
    dimensionScores: { feasibility: 80, innovation: 70, impact: 75 },
    strengths: ["Good approach"],
    concerns: ["Needs validation"],
    recommendation: "Proceed with caution",
    riskFlags: [],
  })),
  extractJson: vi.fn((s: string) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

import { describe, it, expect, beforeEach } from "vitest";
import {
  BUILT_IN_PERSONAS,
  createPersona,
  getPersona,
  listPersonas,
  detectConflicts,
  assessmentToMarkdown,
  evaluateWithPersona,
  evaluateWithMultiplePersonas,
  buildAlignmentMatrix,
  suggestMediation,
  generateStakeholderAssessment,
} from "../index.js";
import type { PersonaTemplate, PersonaScorecard, StakeholderAssessment } from "../index.js";

// ---- Helpers ----

function makePersona(overrides: Partial<PersonaTemplate> = {}): PersonaTemplate {
  return {
    id: "test-persona",
    name: "Test Persona",
    role: "Tester",
    priorities: ["quality"],
    riskTolerance: 5,
    domainExpertise: ["testing"],
    biases: ["none"],
    evaluationCriteria: ["accuracy"],
    ...overrides,
  };
}

function makeScorecard(overrides: Partial<PersonaScorecard> = {}): PersonaScorecard {
  return {
    personaId: "cto",
    ideaTitle: "Test Idea",
    overallScore: 75,
    dimensionScores: { feasibility: 80 },
    strengths: ["Good approach"],
    concerns: ["Needs validation"],
    recommendation: "Proceed with caution",
    riskFlags: [],
    ...overrides,
  };
}

// Reset custom personas between tests by re-creating module state
// We achieve this by creating a unique persona per test and relying on getPersona precedence.
// For proper isolation, we clear registrations via createPersona with known IDs.

describe("persona-evaluation", () => {
  // ---- BUILT_IN_PERSONAS ----

  describe("BUILT_IN_PERSONAS", () => {
    it("contains expected persona IDs", () => {
      const ids = BUILT_IN_PERSONAS.map((p) => p.id);
      expect(ids).toContain("cto");
      expect(ids).toContain("end-user");
      expect(ids).toContain("investor");
      expect(ids).toContain("regulator");
    });

    it("has exactly 4 built-in personas", () => {
      expect(BUILT_IN_PERSONAS).toHaveLength(4);
    });

    it("each persona has required fields", () => {
      for (const persona of BUILT_IN_PERSONAS) {
        expect(persona.id).toBeTruthy();
        expect(persona.name).toBeTruthy();
        expect(persona.role).toBeTruthy();
        expect(persona.priorities.length).toBeGreaterThan(0);
        expect(persona.riskTolerance).toBeGreaterThanOrEqual(1);
        expect(persona.riskTolerance).toBeLessThanOrEqual(10);
        expect(persona.evaluationCriteria.length).toBeGreaterThan(0);
      }
    });
  });

  // ---- createPersona / getPersona / listPersonas ----

  describe("createPersona", () => {
    it("creates and registers a custom persona", () => {
      const persona = createPersona(makePersona({ id: "custom-create-1" }));
      expect(persona.id).toBe("custom-create-1");
      expect(persona.name).toBe("Test Persona");
    });

    it("validates persona template", () => {
      expect(() =>
        createPersona({
          ...makePersona(),
          id: "", // invalid: min 1 char
        })
      ).toThrow();
    });

    it("validates riskTolerance bounds", () => {
      expect(() =>
        createPersona(makePersona({ id: "risk-low", riskTolerance: 0 }))
      ).toThrow();
      expect(() =>
        createPersona(makePersona({ id: "risk-high", riskTolerance: 11 }))
      ).toThrow();
    });

    it("validates priorities must not be empty", () => {
      expect(() =>
        createPersona(makePersona({ id: "no-priorities", priorities: [] }))
      ).toThrow();
    });

    it("validates evaluationCriteria must not be empty", () => {
      expect(() =>
        createPersona(makePersona({ id: "no-criteria", evaluationCriteria: [] }))
      ).toThrow();
    });
  });

  describe("getPersona", () => {
    it("retrieves a built-in persona by ID", () => {
      const cto = getPersona("cto");
      expect(cto).toBeDefined();
      expect(cto!.name).toBe("Chief Technology Officer");
    });

    it("retrieves a custom persona by ID", () => {
      createPersona(makePersona({ id: "custom-get-1", name: "Custom Get" }));
      const result = getPersona("custom-get-1");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Custom Get");
    });

    it("returns undefined for unknown persona ID", () => {
      expect(getPersona("nonexistent-persona-xyz")).toBeUndefined();
    });

    it("custom persona overrides built-in with same ID", () => {
      createPersona(makePersona({ id: "cto", name: "Custom CTO Override" }));
      const result = getPersona("cto");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Custom CTO Override");
      // Restore: re-register won't affect BUILT_IN_PERSONAS but customPersonas map takes precedence
    });
  });

  describe("listPersonas", () => {
    it("includes all built-in personas", () => {
      const all = listPersonas();
      const ids = all.map((p) => p.id);
      expect(ids).toContain("cto");
      expect(ids).toContain("end-user");
      expect(ids).toContain("investor");
      expect(ids).toContain("regulator");
    });

    it("includes custom personas", () => {
      createPersona(makePersona({ id: "custom-list-1" }));
      const all = listPersonas();
      const ids = all.map((p) => p.id);
      expect(ids).toContain("custom-list-1");
    });

    it("does not duplicate built-in IDs when custom uses same ID", () => {
      createPersona(makePersona({ id: "cto", name: "Dup CTO" }));
      const all = listPersonas();
      const ctoEntries = all.filter((p) => p.id === "cto");
      // Built-in is still listed (from BUILT_IN_PERSONAS), custom with same ID is filtered out
      expect(ctoEntries).toHaveLength(1);
    });
  });

  // ---- detectConflicts ----

  describe("detectConflicts", () => {
    it("detects conflict when score gap >= 30", () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 90 }),
        makeScorecard({ personaId: "regulator", overallScore: 40 }),
      ];
      const conflicts = detectConflicts(scorecards);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].personaA).toBe("cto");
      expect(conflicts[0].personaB).toBe("regulator");
      expect(conflicts[0].description).toContain("50 point gap");
    });

    it("returns no conflicts when scores are close", () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 70 }),
        makeScorecard({ personaId: "investor", overallScore: 65 }),
      ];
      const conflicts = detectConflicts(scorecards);
      expect(conflicts).toHaveLength(0);
    });

    it("detects multiple conflicts among many personas", () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 90 }),
        makeScorecard({ personaId: "regulator", overallScore: 30 }),
        makeScorecard({ personaId: "investor", overallScore: 20 }),
      ];
      const conflicts = detectConflicts(scorecards);
      // cto vs regulator (60), cto vs investor (70), regulator vs investor (10 - no conflict)
      expect(conflicts).toHaveLength(2);
    });

    it("handles empty scorecard list", () => {
      expect(detectConflicts([])).toHaveLength(0);
    });

    it("handles single scorecard", () => {
      const scorecards = [makeScorecard({ personaId: "cto", overallScore: 80 })];
      expect(detectConflicts(scorecards)).toHaveLength(0);
    });

    it("includes concerns in conflict description", () => {
      const scorecards = [
        makeScorecard({
          personaId: "cto",
          overallScore: 90,
          concerns: ["Too expensive"],
        }),
        makeScorecard({
          personaId: "regulator",
          overallScore: 30,
          concerns: ["Privacy risk", "Compliance gap"],
        }),
      ];
      const conflicts = detectConflicts(scorecards);
      expect(conflicts[0].description).toContain("Privacy risk");
    });

    it("boundary: exactly 30 point gap triggers conflict", () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 80 }),
        makeScorecard({ personaId: "regulator", overallScore: 50 }),
      ];
      const conflicts = detectConflicts(scorecards);
      expect(conflicts).toHaveLength(1);
    });

    it("boundary: 29 point gap does not trigger conflict", () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 80 }),
        makeScorecard({ personaId: "regulator", overallScore: 51 }),
      ];
      const conflicts = detectConflicts(scorecards);
      expect(conflicts).toHaveLength(0);
    });
  });

  // ---- assessmentToMarkdown ----

  describe("assessmentToMarkdown", () => {
    function makeAssessment(overrides: Partial<StakeholderAssessment> = {}): StakeholderAssessment {
      return {
        idea: "AI-powered widget",
        scorecards: [
          makeScorecard({ personaId: "cto", overallScore: 85 }),
        ],
        alignmentMatrix: {
          personas: ["cto"],
          ideas: ["AI-powered widget"],
          scores: [[85]],
          consensusIdeas: ["AI-powered widget"],
          divisiveIdeas: [],
          alignmentScore: 0.85,
        },
        mediationSuggestions: [],
        overallReadiness: "ready",
        riskFlags: [],
        executiveSummary: "The idea looks promising.",
        ...overrides,
      };
    }

    it("produces markdown with header and idea", () => {
      const md = assessmentToMarkdown(makeAssessment());
      expect(md).toContain("# Stakeholder Persona Assessment");
      expect(md).toContain("**Idea:** AI-powered widget");
    });

    it("includes overall readiness", () => {
      const md = assessmentToMarkdown(makeAssessment({ overallReadiness: "conditional" }));
      expect(md).toContain("**Overall Readiness:** conditional");
    });

    it("includes alignment score as percentage", () => {
      const md = assessmentToMarkdown(makeAssessment());
      expect(md).toContain("**Alignment Score:** 85%");
    });

    it("includes executive summary", () => {
      const md = assessmentToMarkdown(makeAssessment({ executiveSummary: "Summary text here." }));
      expect(md).toContain("Summary text here.");
    });

    it("includes scorecard details", () => {
      const md = assessmentToMarkdown(makeAssessment());
      expect(md).toContain("## Persona Scorecards");
      expect(md).toContain("**Overall Score:** 85/100");
      expect(md).toContain("Good approach");
      expect(md).toContain("Needs validation");
      expect(md).toContain("Proceed with caution");
    });

    it("includes dimension scores table", () => {
      const md = assessmentToMarkdown(makeAssessment());
      expect(md).toContain("| Criterion | Score |");
      expect(md).toContain("| feasibility | 80/100 |");
    });

    it("includes consensus ideas", () => {
      const md = assessmentToMarkdown(makeAssessment());
      expect(md).toContain("**Consensus Ideas:** AI-powered widget");
    });

    it("includes divisive ideas when present", () => {
      const assessment = makeAssessment({
        alignmentMatrix: {
          personas: ["cto", "regulator"],
          ideas: ["Risky Idea"],
          scores: [[90], [30]],
          consensusIdeas: [],
          divisiveIdeas: ["Risky Idea"],
          alignmentScore: 0.4,
        },
      });
      const md = assessmentToMarkdown(assessment);
      expect(md).toContain("**Divisive Ideas:** Risky Idea");
    });

    it("includes mediation suggestions when present", () => {
      const assessment = makeAssessment({
        mediationSuggestions: [
          {
            conflictDescription: "Big disagreement",
            personaA: "cto",
            personaB: "regulator",
            suggestedCompromise: "Meet in the middle",
            tradeoffs: ["Speed vs Safety"],
          },
        ],
      });
      const md = assessmentToMarkdown(assessment);
      expect(md).toContain("## Conflict Resolution");
      expect(md).toContain("cto vs regulator");
      expect(md).toContain("Meet in the middle");
      expect(md).toContain("Speed vs Safety");
    });

    it("includes risk flags when present", () => {
      const assessment = makeAssessment({
        riskFlags: ["Data breach potential", "Regulatory uncertainty"],
      });
      const md = assessmentToMarkdown(assessment);
      expect(md).toContain("## Risk Flags");
      expect(md).toContain("⚠️ Data breach potential");
      expect(md).toContain("⚠️ Regulatory uncertainty");
    });

    it("omits conflict resolution section when no mediations", () => {
      const md = assessmentToMarkdown(makeAssessment({ mediationSuggestions: [] }));
      expect(md).not.toContain("## Conflict Resolution");
    });

    it("omits risk flags section when no flags", () => {
      const md = assessmentToMarkdown(makeAssessment({ riskFlags: [] }));
      expect(md).not.toContain("## Risk Flags");
    });
  });

  // ---- LLM-dependent functions ----

  describe("evaluateWithPersona", () => {
    it("evaluates an idea with a known persona", async () => {
      const result = await evaluateWithPersona("Build a chatbot", "cto");
      expect(result.personaId).toBe("cto");
      expect(result.ideaTitle).toBe("Build a chatbot");
      expect(result.overallScore).toBe(75);
      expect(result.strengths).toContain("Good approach");
    });

    it("throws for unknown persona ID", async () => {
      await expect(
        evaluateWithPersona("Build a chatbot", "nonexistent-xyz")
      ).rejects.toThrow("Persona not found: nonexistent-xyz");
    });
  });

  describe("evaluateWithMultiplePersonas", () => {
    it("evaluates across multiple personas", async () => {
      const results = await evaluateWithMultiplePersonas("Build a chatbot", [
        "cto",
        "investor",
      ]);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.personaId)).toContain("cto");
      expect(results.map((r) => r.personaId)).toContain("investor");
    });

    it("skips unknown personas gracefully", async () => {
      const results = await evaluateWithMultiplePersonas("Build a chatbot", [
        "cto",
        "nonexistent-xyz",
      ]);
      // nonexistent throws, but allSettled filters it out
      expect(results).toHaveLength(1);
      expect(results[0].personaId).toBe("cto");
    });

    it("returns empty array for all-unknown personas", async () => {
      const results = await evaluateWithMultiplePersonas("Build a chatbot", [
        "unknown-a",
        "unknown-b",
      ]);
      expect(results).toHaveLength(0);
    });
  });

  describe("buildAlignmentMatrix", () => {
    it("builds matrix for single idea and multiple personas", async () => {
      const matrix = await buildAlignmentMatrix(
        ["AI Chatbot"],
        ["cto", "investor"]
      );
      expect(matrix.personas).toEqual(["cto", "investor"]);
      expect(matrix.ideas).toEqual(["AI Chatbot"]);
      expect(matrix.scores).toHaveLength(2); // 2 personas
      expect(matrix.scores[0]).toHaveLength(1); // 1 idea
      expect(matrix.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(matrix.alignmentScore).toBeLessThanOrEqual(1);
    });

    it("identifies consensus when scores are identical", async () => {
      // Mock returns same score for all personas, so spread = 0 < 15
      const matrix = await buildAlignmentMatrix(
        ["Consensus Idea"],
        ["cto", "investor"]
      );
      expect(matrix.consensusIdeas).toContain("Consensus Idea");
    });
  });

  describe("suggestMediation", () => {
    beforeEach(async () => {
      const { generateText } = vi.mocked(
        await import("../../copilot/client.js")
      );
      generateText.mockResolvedValue(
        JSON.stringify({
          suggestedCompromise: "Phase the rollout",
          tradeoffs: ["Slower launch", "Reduced risk"],
        })
      );
    });

    it("returns empty when no conflicts exist", async () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 70 }),
        makeScorecard({ personaId: "investor", overallScore: 72 }),
      ];
      const suggestions = await suggestMediation(scorecards);
      expect(suggestions).toHaveLength(0);
    });

    it("produces mediation for conflicting scorecards", async () => {
      const scorecards = [
        makeScorecard({ personaId: "cto", overallScore: 90 }),
        makeScorecard({ personaId: "regulator", overallScore: 30 }),
      ];
      const suggestions = await suggestMediation(scorecards);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].personaA).toBe("cto");
      expect(suggestions[0].personaB).toBe("regulator");
      expect(suggestions[0].suggestedCompromise).toBe("Phase the rollout");
    });
  });

  describe("generateStakeholderAssessment", () => {
    beforeEach(async () => {
      const { generateText } = vi.mocked(
        await import("../../copilot/client.js")
      );
      generateText.mockResolvedValue(
        JSON.stringify({
          overallScore: 75,
          dimensionScores: { feasibility: 80, innovation: 70, impact: 75 },
          strengths: ["Good approach"],
          concerns: ["Needs validation"],
          recommendation: "Proceed with caution",
          riskFlags: [],
        })
      );
    });

    it("generates a full assessment", async () => {
      const assessment = await generateStakeholderAssessment("Build a chatbot", [
        "cto",
        "investor",
      ]);
      expect(assessment.idea).toBe("Build a chatbot");
      expect(assessment.scorecards.length).toBeGreaterThan(0);
      expect(assessment.alignmentMatrix).toBeDefined();
      expect(["ready", "conditional", "not-ready"]).toContain(
        assessment.overallReadiness
      );
      expect(assessment.executiveSummary).toBeTruthy();
    });

    it("determines readiness based on average score", async () => {
      const assessment = await generateStakeholderAssessment("Build a chatbot", [
        "cto",
      ]);
      // Mock returns overallScore: 75, no risk flags → should be "ready"
      expect(assessment.overallReadiness).toBe("ready");
    });
  });
});
