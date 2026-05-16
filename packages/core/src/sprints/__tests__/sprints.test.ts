import { describe, it, expect } from "vitest";

import {
  getSprintTemplates,
  createSprint,
  advanceSprintPhase,
  completeSprint,
  getSprintRetrospective,
  SprintTemplateSchema,
  SprintSchema,
} from "../index.js";

describe("sprints", () => {
  describe("getSprintTemplates", () => {
    it("returns 4 built-in templates", () => {
      const templates = getSprintTemplates();
      expect(templates).toHaveLength(4);
    });

    it("all templates have valid schemas", () => {
      const templates = getSprintTemplates();
      for (const t of templates) {
        expect(() => SprintTemplateSchema.parse(t)).not.toThrow();
      }
    });

    it("includes all format types", () => {
      const templates = getSprintTemplates();
      const formats = new Set(templates.map((t) => t.format));
      expect(formats.has("lightning")).toBe(true);
      expect(formats.has("half-day")).toBe(true);
      expect(formats.has("full-day")).toBe(true);
      expect(formats.has("async")).toBe(true);
    });

    it("all templates have facilitation prompts", () => {
      const templates = getSprintTemplates();
      for (const t of templates) {
        for (const phase of t.phases) {
          expect(phase.facilitationPrompt.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("createSprint", () => {
    it("creates a sprint from a template", () => {
      const sprint = createSprint("AI in Healthcare", ["alice", "bob"]);
      expect(() => SprintSchema.parse(sprint)).not.toThrow();
      expect(sprint.status).toBe("ready");
      expect(sprint.participants).toEqual(["alice", "bob"]);
      expect(sprint.currentPhaseIndex).toBe(-1);
    });

    it("uses specified template", () => {
      const sprint = createSprint("Test", ["user1"], { templateId: "half-day-4h" });
      expect(sprint.templateId).toBe("half-day-4h");
      expect(sprint.phases.length).toBeGreaterThan(5);
    });

    it("throws for unknown template", () => {
      expect(() => createSprint("Test", ["user1"], { templateId: "nonexistent" })).toThrow();
    });
  });

  describe("advanceSprintPhase", () => {
    it("advances through phases sequentially", () => {
      const sprint = createSprint("Test Sprint", ["user1"]);
      const phase1 = advanceSprintPhase(sprint.id);
      expect(phase1.status).toBe("in-progress");
      expect(phase1.currentPhaseIndex).toBe(0);
      expect(phase1.phases[0].status).toBe("active");
    });

    it("completes the sprint after all phases", () => {
      const sprint = createSprint("Test", ["user1"]);
      let current = sprint;
      for (let i = 0; i <= current.phases.length; i++) {
        current = advanceSprintPhase(sprint.id);
      }
      expect(current.status).toBe("completed");
    });

    it("throws for non-existent sprint", () => {
      expect(() => advanceSprintPhase("fake-id")).toThrow();
    });
  });

  describe("completeSprint", () => {
    it("marks sprint and remaining phases as complete/skipped", () => {
      const sprint = createSprint("Test", ["user1"]);
      advanceSprintPhase(sprint.id);
      const completed = completeSprint(sprint.id);
      expect(completed.status).toBe("completed");
      expect(completed.phases[0].status).toBe("completed");
      expect(completed.phases.filter((p) => p.status === "skipped").length).toBeGreaterThan(0);
    });
  });

  describe("getSprintRetrospective", () => {
    it("generates retrospective for a completed sprint", () => {
      const sprint = createSprint("Retro Test", ["user1", "user2", "user3"]);
      advanceSprintPhase(sprint.id);
      completeSprint(sprint.id);
      const retro = getSprintRetrospective(sprint.id);
      expect(retro.sprintId).toBe(sprint.id);
      expect(retro.phaseCompletionRate).toBeGreaterThan(0);
      expect(retro.actionItems.length).toBeGreaterThan(0);
    });
  });
});
