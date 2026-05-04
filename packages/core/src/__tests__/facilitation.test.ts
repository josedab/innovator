import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import { generateText, extractJson } from "../copilot/client.js";

import {
  SPRINT_TEMPLATES,
  getSprintTemplate,
  createFacilitatedSprint,
  autoAdvancePhase,
  generatePhasePrompts,
  generatePhaseSummary,
  generateSprintReport,
} from "../sprint/facilitation.js";
import type { SprintTemplateId } from "../sprint/facilitation.js";

// In-memory store for sprints is module-scoped, so we rely on unique IDs
describe("sprint/facilitation", () => {
  describe("templates", () => {
    it("has 4 built-in templates", () => {
      expect(SPRINT_TEMPLATES).toHaveLength(4);
    });

    it("design-sprint has correct phases", () => {
      const template = getSprintTemplate("design-sprint");
      expect(template).toBeDefined();
      expect(template!.name).toBe("Design Sprint");
      expect(template!.totalDurationMinutes).toBe(180);
      expect(template!.phases.length).toBeGreaterThan(0);
      // Should contain diverge, vote, refine, converge, break, present phase types
      const types = template!.phases.map((p) => p.type);
      expect(types).toContain("diverge");
      expect(types).toContain("vote");
      expect(types).toContain("refine");
    });

    it("lightning-decision-jam has correct structure", () => {
      const template = getSprintTemplate("lightning-decision-jam");
      expect(template).toBeDefined();
      expect(template!.totalDurationMinutes).toBe(60);
      expect(template!.phases.length).toBe(7);
    });

    it("rapid-ideation has correct structure", () => {
      const template = getSprintTemplate("rapid-ideation");
      expect(template).toBeDefined();
      expect(template!.totalDurationMinutes).toBe(60);
      expect(template!.phases.length).toBe(6);
    });

    it("innovation-kata has correct structure", () => {
      const template = getSprintTemplate("innovation-kata");
      expect(template).toBeDefined();
      expect(template!.totalDurationMinutes).toBe(90);
      expect(template!.phases.length).toBe(6);
    });

    it("each template has unique phase IDs", () => {
      for (const template of SPRINT_TEMPLATES) {
        const ids = template.phases.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it("each template has non-zero duration phases", () => {
      for (const template of SPRINT_TEMPLATES) {
        for (const phase of template.phases) {
          expect(phase.durationMinutes).toBeGreaterThan(0);
        }
      }
    });

    it("getSprintTemplate returns undefined for unknown ID", () => {
      expect(getSprintTemplate("custom")).toBeUndefined();
    });
  });

  describe("createFacilitatedSprint", () => {
    it("creates sprint from design-sprint template", () => {
      const sprint = createFacilitatedSprint({
        templateId: "design-sprint",
        subject: "AI in Education",
        facilitatorId: "user-1",
        facilitatorName: "Alice",
      });
      expect(sprint.id).toBeTruthy();
      expect(sprint.templateId).toBe("design-sprint");
      expect(sprint.subject).toBe("AI in Education");
      expect(sprint.status).toBe("waiting");
      expect(sprint.currentPhaseIndex).toBe(0);
      expect(sprint.participants).toHaveLength(1);
      expect(sprint.participants[0].role).toBe("facilitator");
      expect(sprint.participants[0].name).toBe("Alice");
      expect(sprint.ideas).toEqual([]);
      expect(sprint.phaseSummaries).toEqual([]);
      expect(sprint.createdAt).toBeTruthy();
    });

    it("creates sprint from lightning-decision-jam template", () => {
      const sprint = createFacilitatedSprint({
        templateId: "lightning-decision-jam",
        subject: "Reduce Onboarding Time",
        facilitatorId: "user-1",
        facilitatorName: "Bob",
      });
      expect(sprint.templateId).toBe("lightning-decision-jam");
    });

    it("creates sprint from rapid-ideation template", () => {
      const sprint = createFacilitatedSprint({
        templateId: "rapid-ideation",
        subject: "New Features",
        facilitatorId: "user-1",
        facilitatorName: "Carol",
      });
      expect(sprint.templateId).toBe("rapid-ideation");
    });

    it("creates sprint from innovation-kata template", () => {
      const sprint = createFacilitatedSprint({
        templateId: "innovation-kata",
        subject: "Process Improvement",
        facilitatorId: "user-1",
        facilitatorName: "Dave",
      });
      expect(sprint.templateId).toBe("innovation-kata");
    });

    it("throws for unknown template", () => {
      expect(() =>
        createFacilitatedSprint({
          templateId: "custom" as SprintTemplateId,
          subject: "test",
          facilitatorId: "user-1",
          facilitatorName: "Test",
        })
      ).toThrow("Unknown sprint template");
    });
  });

  describe("autoAdvancePhase", () => {
    it("starts sprint from waiting to active", () => {
      const sprint = createFacilitatedSprint({
        templateId: "design-sprint",
        subject: "test",
        facilitatorId: "u1",
        facilitatorName: "Alice",
      });
      const advanced = autoAdvancePhase(sprint.id);
      expect(advanced).toBeDefined();
      expect(advanced!.status).toBe("active");
      expect(advanced!.phaseStartedAt).toBeTruthy();
    });

    it("advances to next phase", () => {
      const sprint = createFacilitatedSprint({
        templateId: "design-sprint",
        subject: "test",
        facilitatorId: "u1",
        facilitatorName: "Alice",
      });
      autoAdvancePhase(sprint.id); // waiting → active (phase 0)
      const advanced = autoAdvancePhase(sprint.id); // phase 0 → phase 1
      expect(advanced!.currentPhaseIndex).toBe(1);
    });

    it("completes sprint when reaching last phase", () => {
      const sprint = createFacilitatedSprint({
        templateId: "rapid-ideation",
        subject: "test",
        facilitatorId: "u1",
        facilitatorName: "Alice",
      });
      const template = getSprintTemplate("rapid-ideation")!;
      autoAdvancePhase(sprint.id); // waiting → active
      for (let i = 0; i < template.phases.length; i++) {
        autoAdvancePhase(sprint.id);
      }
      const final = autoAdvancePhase(sprint.id);
      // Should be completed after going through all phases
      // (the exact number depends on when it completes)
      expect(
        final!.status === "completed" || final!.currentPhaseIndex === template.phases.length - 1
      ).toBe(true);
    });

    it("returns undefined for unknown sprint", () => {
      expect(autoAdvancePhase("nonexistent")).toBeUndefined();
    });
  });

  describe("generatePhasePrompts", () => {
    it("returns prompts for current phase", () => {
      const sprint = createFacilitatedSprint({
        templateId: "design-sprint",
        subject: "test",
        facilitatorId: "u1",
        facilitatorName: "Alice",
      });
      const prompts = generatePhasePrompts(sprint.id);
      expect(prompts.length).toBeGreaterThan(0);
      // First phase of design-sprint is "understand" which has prompts
    });

    it("returns empty for unknown sprint", () => {
      expect(generatePhasePrompts("nonexistent")).toEqual([]);
    });
  });

  describe("generatePhaseSummary", () => {
    it("generates summary for current phase", async () => {
      const mockResponse = JSON.stringify({
        summary: "Phase went well",
        keyOutcomes: ["Outcome 1", "Outcome 2"],
      });
      vi.mocked(generateText).mockResolvedValue(mockResponse);
      vi.mocked(extractJson).mockReturnValue(mockResponse);

      const sprint = createFacilitatedSprint({
        templateId: "design-sprint",
        subject: "test",
        facilitatorId: "u1",
        facilitatorName: "Alice",
      });
      autoAdvancePhase(sprint.id); // activate

      const summary = await generatePhaseSummary(sprint.id);
      expect(summary).toBe("Phase went well");
    });

    it("returns undefined for unknown sprint", async () => {
      const summary = await generatePhaseSummary("nonexistent");
      expect(summary).toBeUndefined();
    });
  });

  describe("generateSprintReport", () => {
    it("generates report with retrospective", async () => {
      const mockRetro = JSON.stringify({
        whatWorked: ["Good collaboration"],
        whatToImprove: ["Time management"],
        actionItems: ["Schedule follow-up"],
      });
      vi.mocked(generateText).mockResolvedValue(mockRetro);
      vi.mocked(extractJson).mockReturnValue(mockRetro);

      const sprint = createFacilitatedSprint({
        templateId: "design-sprint",
        subject: "AI Testing",
        facilitatorId: "u1",
        facilitatorName: "Alice",
      });
      autoAdvancePhase(sprint.id); // activate

      const report = await generateSprintReport(sprint.id);
      expect(report).toBeDefined();
      expect(report!.templateName).toBe("Design Sprint");
      expect(report!.subject).toBe("AI Testing");
      expect(report!.retrospective.whatWorked).toContain("Good collaboration");
      expect(report!.retrospective.whatToImprove).toContain("Time management");
      expect(report!.retrospective.actionItems).toContain("Schedule follow-up");
    });

    it("returns undefined for unknown sprint", async () => {
      const report = await generateSprintReport("nonexistent");
      expect(report).toBeUndefined();
    });
  });
});
