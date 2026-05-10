import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((_label: string, value: string) => value),
}));

import {
  createPersona,
  getPersona,
  listPersonas,
  evaluateWithPersona,
  evaluateWithMultiplePersonas,
  buildAlignmentMatrix,
  detectConflicts,
  generateStakeholderAssessment,
  assessmentToMarkdown,
  clearCustomPersonas,
  BUILT_IN_PERSONAS,
  type PersonaScorecard,
  type PersonaTemplate,
} from "../index.js";
import { generateText } from "../../copilot/client.js";

function mockScorecardResponse(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    overallScore: 75,
    dimensionScores: { feasibility: 80, scalability: 70 },
    strengths: ["Strong concept"],
    concerns: ["Cost concerns"],
    recommendation: "Proceed with caution",
    riskFlags: ["Budget risk"],
    ...overrides,
  });
}

describe("persona-evaluation", () => {
  beforeEach(() => {
    clearCustomPersonas();
    vi.clearAllMocks();
  });

  // ---- Persona Registry ----

  describe("createPersona", () => {
    it("creates and retrieves a custom persona", () => {
      const persona = createPersona({
        id: "custom-1",
        name: "Custom Persona",
        role: "Analyst",
        priorities: ["data accuracy"],
        riskTolerance: 5,
        domainExpertise: ["analytics"],
        biases: ["data-driven"],
        evaluationCriteria: ["accuracy", "reliability"],
      });
      expect(persona.id).toBe("custom-1");
      expect(getPersona("custom-1")).toEqual(persona);
    });

    it("validates persona template", () => {
      expect(() =>
        createPersona({
          id: "",
          name: "Bad",
          role: "Role",
          priorities: [],
          riskTolerance: 5,
          domainExpertise: [],
          biases: [],
          evaluationCriteria: ["c1"],
        })
      ).toThrow();
    });
  });

  describe("getPersona", () => {
    it("returns built-in personas by ID", () => {
      const cto = getPersona("cto");
      expect(cto).toBeDefined();
      expect(cto!.role).toBe("CTO");
    });

    it("returns undefined for unknown ID", () => {
      expect(getPersona("nonexistent")).toBeUndefined();
    });

    it("custom persona overrides built-in", () => {
      createPersona({
        id: "cto",
        name: "Custom CTO",
        role: "CTO Override",
        priorities: ["custom"],
        riskTolerance: 3,
        domainExpertise: [],
        biases: [],
        evaluationCriteria: ["custom"],
      });
      const p = getPersona("cto");
      expect(p!.name).toBe("Custom CTO");
    });
  });

  describe("listPersonas", () => {
    it("returns all built-in personas", () => {
      const personas = listPersonas();
      expect(personas.length).toBe(BUILT_IN_PERSONAS.length);
    });

    it("includes custom personas", () => {
      createPersona({
        id: "custom-x",
        name: "Custom X",
        role: "X",
        priorities: ["p"],
        riskTolerance: 5,
        domainExpertise: [],
        biases: [],
        evaluationCriteria: ["c"],
      });
      const personas = listPersonas();
      expect(personas.length).toBe(BUILT_IN_PERSONAS.length + 1);
      expect(personas.find((p) => p.id === "custom-x")).toBeDefined();
    });
  });

  // ---- evaluateWithPersona ----

  describe("evaluateWithPersona", () => {
    it("returns a valid PersonaScorecard (0-100)", async () => {
      vi.mocked(generateText).mockResolvedValue(mockScorecardResponse());

      const scorecard = await evaluateWithPersona("Build an AI app", "cto");
      expect(scorecard.personaId).toBe("cto");
      expect(scorecard.ideaTitle).toBe("Build an AI app");
      expect(scorecard.overallScore).toBeGreaterThanOrEqual(0);
      expect(scorecard.overallScore).toBeLessThanOrEqual(100);
      expect(scorecard.strengths).toBeInstanceOf(Array);
      expect(scorecard.concerns).toBeInstanceOf(Array);
      expect(scorecard.recommendation).toBeTruthy();
    });

    it("throws on empty idea", async () => {
      await expect(evaluateWithPersona("", "cto")).rejects.toThrow("empty");
    });

    it("throws on whitespace-only idea", async () => {
      await expect(evaluateWithPersona("   ", "cto")).rejects.toThrow("empty");
    });

    it("throws for unknown persona", async () => {
      await expect(evaluateWithPersona("idea", "nonexistent")).rejects.toThrow("not found");
    });

    it("includes dimensionScores matching evaluation criteria", async () => {
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({
          dimensionScores: { "technical feasibility": 85, scalability: 70 },
        })
      );

      const scorecard = await evaluateWithPersona("idea", "cto");
      expect(Object.keys(scorecard.dimensionScores).length).toBeGreaterThan(0);
    });

    it("works with custom persona including customPromptContext", async () => {
      createPersona({
        id: "custom",
        name: "Custom",
        role: "Custom Role",
        priorities: ["speed"],
        riskTolerance: 8,
        domainExpertise: ["testing"],
        biases: [],
        evaluationCriteria: ["speed", "quality"],
        customPromptContext: "Focus on rapid prototyping",
      });

      vi.mocked(generateText).mockResolvedValue(mockScorecardResponse());
      const scorecard = await evaluateWithPersona("idea", "custom");
      expect(scorecard.personaId).toBe("custom");
    });
  });

  // ---- evaluateWithMultiplePersonas ----

  describe("evaluateWithMultiplePersonas", () => {
    it("evaluates with multiple personas in parallel", async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 80 }))
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 60 }));

      const scorecards = await evaluateWithMultiplePersonas("AI app", ["cto", "investor"]);
      expect(scorecards).toHaveLength(2);
      expect(scorecards.find((s) => s.personaId === "cto")).toBeDefined();
      expect(scorecards.find((s) => s.personaId === "investor")).toBeDefined();
    });

    it("throws on empty idea", async () => {
      await expect(evaluateWithMultiplePersonas("", ["cto"])).rejects.toThrow("empty");
    });

    it("throws on empty personaIds", async () => {
      await expect(evaluateWithMultiplePersonas("idea", [])).rejects.toThrow("At least one");
    });

    it("returns only successful evaluations", async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce(mockScorecardResponse())
        .mockRejectedValueOnce(new Error("LLM failed"));

      const scorecards = await evaluateWithMultiplePersonas("idea", ["cto", "investor"]);
      expect(scorecards.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- buildAlignmentMatrix ----

  describe("buildAlignmentMatrix", () => {
    it("identifies consensus ideas (spread <= 15 points)", async () => {
      // Both personas give similar scores
      vi.mocked(generateText)
        // Idea 1, persona 1
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 70 }))
        // Idea 1, persona 2
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 75 }));

      const matrix = await buildAlignmentMatrix(["consensus idea"], ["cto", "investor"]);
      expect(matrix.personas).toEqual(["cto", "investor"]);
      expect(matrix.ideas).toEqual(["consensus idea"]);
      expect(matrix.consensusIdeas).toContain("consensus idea");
      expect(matrix.divisiveIdeas).not.toContain("consensus idea");
    });

    it("identifies divisive ideas (spread >= 30 points)", async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 90 }))
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 40 }));

      const matrix = await buildAlignmentMatrix(["divisive idea"], ["cto", "regulator"]);
      expect(matrix.divisiveIdeas).toContain("divisive idea");
      expect(matrix.consensusIdeas).not.toContain("divisive idea");
    });

    it("computes alignment score between 0 and 1", async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 80 }))
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 60 }));

      const matrix = await buildAlignmentMatrix(["idea"], ["cto", "investor"]);
      expect(matrix.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(matrix.alignmentScore).toBeLessThanOrEqual(1);
    });

    it("returns perfect alignment when all scores match", async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 75 }))
        .mockResolvedValueOnce(mockScorecardResponse({ overallScore: 75 }));

      const matrix = await buildAlignmentMatrix(["idea"], ["cto", "investor"]);
      expect(matrix.alignmentScore).toBe(1);
    });

    it("scores matrix has correct dimensions (personas x ideas)", async () => {
      vi.mocked(generateText).mockResolvedValue(mockScorecardResponse({ overallScore: 70 }));

      const matrix = await buildAlignmentMatrix(["idea1", "idea2"], ["cto", "investor"]);
      expect(matrix.scores).toHaveLength(2); // 2 personas
      expect(matrix.scores[0]).toHaveLength(2); // 2 ideas
    });
  });

  // ---- detectConflicts ----

  describe("detectConflicts", () => {
    it("detects conflict when score gap >= 30", () => {
      const scorecards: PersonaScorecard[] = [
        {
          personaId: "cto",
          ideaTitle: "AI Tool",
          overallScore: 90,
          dimensionScores: {},
          strengths: [],
          concerns: ["none"],
          recommendation: "Go",
          riskFlags: [],
        },
        {
          personaId: "regulator",
          ideaTitle: "AI Tool",
          overallScore: 40,
          dimensionScores: {},
          strengths: [],
          concerns: ["compliance"],
          recommendation: "Stop",
          riskFlags: [],
        },
      ];

      const conflicts = detectConflicts(scorecards);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].personaA).toBe("cto");
      expect(conflicts[0].personaB).toBe("regulator");
      expect(conflicts[0].description).toContain("90");
      expect(conflicts[0].description).toContain("40");
    });

    it("returns empty when scores are close", () => {
      const scorecards: PersonaScorecard[] = [
        {
          personaId: "cto",
          ideaTitle: "Idea",
          overallScore: 70,
          dimensionScores: {},
          strengths: [],
          concerns: [],
          recommendation: "Ok",
          riskFlags: [],
        },
        {
          personaId: "investor",
          ideaTitle: "Idea",
          overallScore: 65,
          dimensionScores: {},
          strengths: [],
          concerns: [],
          recommendation: "Ok",
          riskFlags: [],
        },
      ];

      expect(detectConflicts(scorecards)).toEqual([]);
    });

    it("detects multiple conflicts with 3+ personas", () => {
      const scorecards: PersonaScorecard[] = [
        {
          personaId: "a",
          ideaTitle: "I",
          overallScore: 95,
          dimensionScores: {},
          strengths: [],
          concerns: ["x"],
          recommendation: "R",
          riskFlags: [],
        },
        {
          personaId: "b",
          ideaTitle: "I",
          overallScore: 30,
          dimensionScores: {},
          strengths: [],
          concerns: ["y"],
          recommendation: "R",
          riskFlags: [],
        },
        {
          personaId: "c",
          ideaTitle: "I",
          overallScore: 20,
          dimensionScores: {},
          strengths: [],
          concerns: ["z"],
          recommendation: "R",
          riskFlags: [],
        },
      ];

      const conflicts = detectConflicts(scorecards);
      expect(conflicts.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty for single scorecard", () => {
      const scorecards: PersonaScorecard[] = [
        {
          personaId: "cto",
          ideaTitle: "I",
          overallScore: 80,
          dimensionScores: {},
          strengths: [],
          concerns: [],
          recommendation: "R",
          riskFlags: [],
        },
      ];
      expect(detectConflicts(scorecards)).toEqual([]);
    });

    it("returns empty for empty array", () => {
      expect(detectConflicts([])).toEqual([]);
    });
  });

  // ---- generateStakeholderAssessment ----

  describe("generateStakeholderAssessment", () => {
    it("returns a complete assessment with readiness decision", async () => {
      // evaluateWithMultiplePersonas (2 calls) + buildAlignmentMatrix (2 calls)
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({ overallScore: 80, riskFlags: [] })
      );

      const assessment = await generateStakeholderAssessment("AI App", ["cto", "investor"]);
      expect(assessment.idea).toBe("AI App");
      expect(assessment.scorecards.length).toBeGreaterThanOrEqual(1);
      expect(["ready", "conditional", "not-ready"]).toContain(assessment.overallReadiness);
      expect(assessment.executiveSummary).toBeTruthy();
      expect(assessment.alignmentMatrix.personas).toEqual(["cto", "investor"]);
    });

    it("returns 'ready' when avg score >= 70 and no high risk", async () => {
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({ overallScore: 85, riskFlags: [] })
      );

      const assessment = await generateStakeholderAssessment("Good Idea", ["cto"]);
      expect(assessment.overallReadiness).toBe("ready");
    });

    it("returns 'not-ready' when avg score < 30 with risk", async () => {
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({
          overallScore: 20,
          riskFlags: ["r1", "r2", "r3", "r4", "r5"],
        })
      );

      const assessment = await generateStakeholderAssessment("Bad Idea", ["cto"]);
      expect(assessment.overallReadiness).toBe("not-ready");
    });

    it("executive summary includes persona count and avg score", async () => {
      vi.mocked(generateText).mockResolvedValue(mockScorecardResponse({ overallScore: 60 }));

      const assessment = await generateStakeholderAssessment("Test", ["cto", "investor"]);
      expect(assessment.executiveSummary).toContain("2 stakeholder");
    });
  });

  // ---- assessmentToMarkdown ----

  describe("assessmentToMarkdown", () => {
    it("produces markdown with all sections", async () => {
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({
          overallScore: 75,
          dimensionScores: { innovation: 80 },
        })
      );

      const assessment = await generateStakeholderAssessment("Test Idea", ["cto"]);
      const md = assessmentToMarkdown(assessment);

      expect(md).toContain("# Stakeholder Persona Assessment");
      expect(md).toContain("**Idea:** Test Idea");
      expect(md).toContain("**Overall Readiness:**");
      expect(md).toContain("## Executive Summary");
      expect(md).toContain("## Persona Scorecards");
      expect(md).toContain("**Overall Score:**");
    });

    it("includes dimension scores table", async () => {
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({
          dimensionScores: { feasibility: 80, scalability: 70 },
        })
      );

      const assessment = await generateStakeholderAssessment("Idea", ["cto"]);
      const md = assessmentToMarkdown(assessment);
      expect(md).toContain("| Criterion | Score |");
      expect(md).toContain("feasibility");
    });

    it("includes risk flags section when flags exist", async () => {
      vi.mocked(generateText).mockResolvedValue(
        mockScorecardResponse({ riskFlags: ["Security concern", "Scalability"] })
      );

      const assessment = await generateStakeholderAssessment("Idea", ["cto"]);
      const md = assessmentToMarkdown(assessment);
      expect(md).toContain("## Risk Flags");
      expect(md).toContain("⚠️");
    });
  });

  // ---- clearCustomPersonas ----

  describe("clearCustomPersonas", () => {
    it("clears custom personas but preserves built-in", () => {
      createPersona({
        id: "custom",
        name: "Custom",
        role: "C",
        priorities: ["p"],
        riskTolerance: 5,
        domainExpertise: [],
        biases: [],
        evaluationCriteria: ["c"],
      });
      clearCustomPersonas();
      expect(getPersona("custom")).toBeUndefined();
      expect(getPersona("cto")).toBeDefined();
    });
  });
});
