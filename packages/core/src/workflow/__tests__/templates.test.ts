import { describe, it, expect } from "vitest";
import {
  listWorkflowTemplates,
  getWorkflowTemplate,
  getTemplatesByCategory,
  WORKFLOW_TEMPLATES,
} from "../templates.js";
import { WorkflowConfigSchema } from "../index.js";

describe("workflow/templates", () => {
  describe("WORKFLOW_TEMPLATES", () => {
    it("should have exactly 5 templates", () => {
      expect(WORKFLOW_TEMPLATES).toHaveLength(5);
    });

    it("should have unique IDs", () => {
      const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should have valid configs that pass Zod validation", () => {
      for (const template of WORKFLOW_TEMPLATES) {
        const result = WorkflowConfigSchema.safeParse(template.config);
        expect(
          result.success,
          `Template "${template.id}" config failed validation: ${JSON.stringify(result.error?.errors)}`
        ).toBe(true);
      }
    });

    it("should have non-empty required fields", () => {
      for (const template of WORKFLOW_TEMPLATES) {
        expect(template.name.length).toBeGreaterThan(0);
        expect(template.description.length).toBeGreaterThan(0);
        expect(template.category.length).toBeGreaterThan(0);
        expect(template.config.stages.length).toBeGreaterThan(0);
      }
    });
  });

  describe("listWorkflowTemplates", () => {
    it("should return all templates", () => {
      const templates = listWorkflowTemplates();
      expect(templates).toHaveLength(5);
    });
  });

  describe("getWorkflowTemplate", () => {
    it("should return template by ID", () => {
      const template = getWorkflowTemplate("quick-ideation");
      expect(template).toBeTruthy();
      expect(template!.name).toBe("Quick Ideation Sprint");
    });

    it("should return undefined for unknown ID", () => {
      expect(getWorkflowTemplate("nonexistent")).toBeUndefined();
    });
  });

  describe("getTemplatesByCategory", () => {
    it("should return templates filtered by category", () => {
      const ideation = getTemplatesByCategory("ideation");
      expect(ideation.length).toBeGreaterThan(0);
      expect(ideation.every((t) => t.category === "ideation")).toBe(true);
    });

    it("should return empty array for unknown category", () => {
      expect(getTemplatesByCategory("nonexistent")).toHaveLength(0);
    });
  });

  describe("template coverage", () => {
    it("should cover expected categories", () => {
      const categories = new Set(WORKFLOW_TEMPLATES.map((t) => t.category));
      expect(categories.has("ideation")).toBe(true);
      expect(categories.has("research")).toBe(true);
      expect(categories.has("strategy")).toBe(true);
      expect(categories.has("product")).toBe(true);
      expect(categories.has("moonshot")).toBe(true);
    });

    it("every template should have at least one investigate stage", () => {
      for (const template of WORKFLOW_TEMPLATES) {
        const hasInvestigate = template.config.stages.some((s) => s.type === "investigate");
        expect(hasInvestigate, `Template "${template.id}" missing investigate stage`).toBe(true);
      }
    });

    it("every template should have at least one synthesize stage", () => {
      for (const template of WORKFLOW_TEMPLATES) {
        const hasSynthesize = template.config.stages.some((s) => s.type === "synthesize");
        expect(hasSynthesize, `Template "${template.id}" missing synthesize stage`).toBe(true);
      }
    });
  });
});
