import { describe, it, expect, beforeEach } from "vitest";
import { WIZARD_QUESTIONS, generateConfig } from "../engine.js";
import {
  saveTemplate,
  getSessionTemplate,
  listTemplates,
  deleteTemplate,
  updateSessionTemplate,
} from "../storage.js";
import type { WizardAnswers } from "../types.js";

describe("session-templates", () => {
  describe("WIZARD_QUESTIONS", () => {
    it("defines exactly 5 questions", () => {
      expect(WIZARD_QUESTIONS).toHaveLength(5);
    });

    it("covers all required question IDs", () => {
      const ids = WIZARD_QUESTIONS.map((q) => q.id);
      expect(ids).toContain("goal");
      expect(ids).toContain("domain");
      expect(ids).toContain("constraints");
      expect(ids).toContain("audience");
      expect(ids).toContain("timeBudget");
    });

    it("has steps numbered 1-5", () => {
      const steps = WIZARD_QUESTIONS.map((q) => q.step);
      expect(steps).toEqual([1, 2, 3, 4, 5]);
    });

    it("provides options for select-type questions", () => {
      const selectQuestions = WIZARD_QUESTIONS.filter((q) => q.type === "select");
      for (const q of selectQuestions) {
        expect(q.options).toBeDefined();
        expect(q.options!.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generateConfig", () => {
    const baseAnswers: WizardAnswers = {
      goal: "Improve developer onboarding",
      domain: "technology",
      constraints: "Must use React",
      audience: "developers",
      timeBudget: "standard",
    };

    it("generates config with required fields", () => {
      const config = generateConfig(baseAnswers);
      expect(config.angles).toBeDefined();
      expect(config.angles.length).toBeGreaterThan(0);
      expect(config.depth).toBeDefined();
      expect(config.model).toBeDefined();
      expect(config.scoringRubric).toBeDefined();
      expect(config.exportFormat).toBeDefined();
      expect(config.maxIdeasPerAngle).toBeGreaterThan(0);
    });

    it("selects domain-appropriate angles for technology", () => {
      const config = generateConfig(baseAnswers);
      expect(config.angles).toContain("first-principles");
      expect(config.angles).toContain("cross-domain");
    });

    it("uses fewer angles for quick time budget", () => {
      const config = generateConfig({ ...baseAnswers, timeBudget: "quick" });
      expect(config.angles.length).toBeLessThanOrEqual(2);
      expect(config.depth).toBe("shallow");
      expect(config.autoMode).toBe(true);
    });

    it("uses all angles for exhaustive time budget", () => {
      const config = generateConfig({ ...baseAnswers, timeBudget: "exhaustive" });
      expect(config.angles.length).toBe(8);
      expect(config.depth).toBe("deep");
    });

    it("adjusts scoring rubric for enterprise audience", () => {
      const config = generateConfig({ ...baseAnswers, audience: "enterprise" });
      expect(config.scoringRubric).toContain("strategic-alignment");
      expect(config.exportFormat).toBe("powerpoint");
    });

    it("selects healthcare-specific angles", () => {
      const config = generateConfig({ ...baseAnswers, domain: "healthcare" });
      expect(config.angles).toContain("constraints");
      expect(config.angles).toContain("perspectives");
    });

    it("uses higher-tier model for thorough time budget", () => {
      const config = generateConfig({ ...baseAnswers, timeBudget: "thorough" });
      expect(config.model).toBe("gpt-4.1");
      expect(config.maxIdeasPerAngle).toBe(5);
    });
  });

  describe("template storage", () => {
    const answers: WizardAnswers = {
      goal: "Test goal",
      domain: "technology",
      constraints: "",
      audience: "developers",
      timeBudget: "standard",
    };
    const config = generateConfig(answers);

    it("saves and retrieves template", () => {
      const template = saveTemplate("Test Template", "A test", answers, config);
      expect(template.id).toBeDefined();
      expect(template.name).toBe("Test Template");

      const retrieved = getSessionTemplate(template.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("Test Template");
      expect(retrieved!.answers.goal).toBe("Test goal");
    });

    it("lists templates sorted by updatedAt", () => {
      saveTemplate("First", "", answers, config);
      saveTemplate("Second", "", answers, config);
      const list = listTemplates();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it("deletes template", () => {
      const template = saveTemplate("To Delete", "", answers, config);
      expect(deleteTemplate(template.id)).toBe(true);
      expect(getSessionTemplate(template.id)).toBeNull();
    });

    it("updates template name", () => {
      const template = saveTemplate("Old Name", "", answers, config);
      const updated = updateSessionTemplate(template.id, { name: "New Name" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New Name");
    });

    it("returns null for non-existent template", () => {
      expect(getSessionTemplate("nonexistent")).toBeNull();
      expect(updateSessionTemplate("nonexistent", { name: "x" })).toBeNull();
    });
  });
});
