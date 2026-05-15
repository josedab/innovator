import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  evaluateConditional,
  getConversationalTemplates,
  getConversationalTemplate,
  filterTemplatesByCategory,
  instantiateTemplate,
  composerDAGToText,
  CONVERSATIONAL_TEMPLATES,
  type Conditional,
  type ComposerDAG,
} from "../nl-pipeline/composer.js";

describe("nl-pipeline/composer", () => {
  describe("evaluateConditional", () => {
    it("always returns true for 'always' operator", () => {
      const cond: Conditional = { operator: "always" };
      expect(evaluateConditional(cond, {})).toBe(true);
    });

    it("evaluates score_above correctly", () => {
      const cond: Conditional = { operator: "score_above", threshold: 7 };
      expect(evaluateConditional(cond, { score: 8 })).toBe(true);
      expect(evaluateConditional(cond, { score: 5 })).toBe(false);
    });

    it("evaluates score_below correctly", () => {
      const cond: Conditional = { operator: "score_below", threshold: 5 };
      expect(evaluateConditional(cond, { score: 3 })).toBe(true);
      expect(evaluateConditional(cond, { score: 7 })).toBe(false);
    });

    it("evaluates has_ideas correctly", () => {
      const cond: Conditional = { operator: "has_ideas" };
      expect(evaluateConditional(cond, { ideas: ["idea1"] })).toBe(true);
      expect(evaluateConditional(cond, { ideas: [] })).toBe(false);
      expect(evaluateConditional(cond, {})).toBe(false);
    });

    it("evaluates idea_count_above correctly", () => {
      const cond: Conditional = { operator: "idea_count_above", threshold: 3 };
      expect(evaluateConditional(cond, { ideas: [1, 2, 3, 4] })).toBe(true);
      expect(evaluateConditional(cond, { ideas: [1, 2] })).toBe(false);
    });

    it("evaluates gauntlet_survival correctly", () => {
      const cond: Conditional = { operator: "gauntlet_survival", threshold: 0.7 };
      expect(evaluateConditional(cond, { survivalRate: 0.8 })).toBe(true);
      expect(evaluateConditional(cond, { survivalRate: 0.5 })).toBe(false);
    });

    it("uses averageScore as fallback for score operators", () => {
      const cond: Conditional = { operator: "score_above", threshold: 5 };
      expect(evaluateConditional(cond, { averageScore: 8 })).toBe(true);
    });
  });

  describe("conversational templates", () => {
    it("has at least 10 templates", () => {
      expect(CONVERSATIONAL_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    });

    it("returns all templates", () => {
      const templates = getConversationalTemplates();
      expect(templates.length).toBe(CONVERSATIONAL_TEMPLATES.length);
    });

    it("gets template by ID", () => {
      const template = getConversationalTemplate("deep-discovery");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Deep Discovery Pipeline");
    });

    it("returns undefined for unknown template", () => {
      expect(getConversationalTemplate("nonexistent")).toBeUndefined();
    });

    it("filters by category", () => {
      const rapid = filterTemplatesByCategory("rapid");
      expect(rapid.length).toBeGreaterThan(0);
      expect(rapid.every((t) => t.category === "rapid")).toBe(true);
    });

    it("instantiates template with subject", () => {
      const instruction = instantiateTemplate("rapid-brainstorm", "quantum computing");
      expect(instruction).toContain("quantum computing");
      expect(instruction).not.toContain("{subject}");
    });

    it("throws for unknown template on instantiation", () => {
      expect(() => instantiateTemplate("nonexistent", "test")).toThrow();
    });

    it("all templates have valid fields", () => {
      for (const t of CONVERSATIONAL_TEMPLATES) {
        expect(t.id.length).toBeGreaterThan(0);
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.instruction).toContain("{subject}");
        expect(t.estimatedMinutes).toBeGreaterThan(0);
      }
    });
  });

  describe("composerDAGToText", () => {
    it("renders a basic DAG", () => {
      const dag: ComposerDAG = {
        id: "test-dag",
        instruction: "test",
        subject: "Test Subject",
        steps: [
          { id: "s1", action: "investigate", label: "Investigate", dependsOn: [] },
          { id: "s2", action: "generate", label: "Generate", dependsOn: ["s1"] },
        ],
        createdAt: new Date().toISOString(),
        status: "pending",
      };
      const text = composerDAGToText(dag);
      expect(text).toContain("Test Subject");
      expect(text).toContain("investigate");
      expect(text).toContain("generate");
    });

    it("shows conditional and iteration info", () => {
      const dag: ComposerDAG = {
        id: "test-dag",
        instruction: "test",
        subject: "Test",
        steps: [
          {
            id: "s1",
            action: "evolve",
            label: "Evolve winner",
            dependsOn: [],
            conditional: { operator: "score_above", threshold: 7 },
            iterateCount: 3,
          },
        ],
        createdAt: new Date().toISOString(),
        status: "pending",
      };
      const text = composerDAGToText(dag);
      expect(text).toContain("score_above");
      expect(text).toContain("×3");
    });
  });
});
