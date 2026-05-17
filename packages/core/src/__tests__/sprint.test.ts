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
  createSprint,
  getSprint,
  listSprints,
  clearSprints,
  startSprint,
  pauseSprint,
  canAdvancePhase,
  updateSprintData,
  SPRINT_PHASES,
  SprintSchema,
} from "../sprint/index.js";
import type { Investigation, AngleResult, Synthesis } from "../types.js";

describe("sprint", () => {
  beforeEach(() => {
    clearSprints();
  });

  describe("phase order", () => {
    it("defines phases as diverge → converge → refine", () => {
      expect(SPRINT_PHASES).toEqual(["diverge", "converge", "refine"]);
    });

    it("creates sprint starting in diverge phase", () => {
      const sprint = createSprint("test subject");
      expect(sprint.currentPhase).toBe("diverge");
    });
  });

  describe("CRUD operations", () => {
    it("creates a sprint with correct initial values", () => {
      const sprint = createSprint("Innovation topic");
      expect(sprint.id).toBeTruthy();
      expect(sprint.subject).toBe("Innovation topic");
      expect(sprint.status).toBe("not-started");
      expect(sprint.currentPhase).toBe("diverge");
      expect(sprint.checkpoints).toEqual([]);
      expect(sprint.createdAt).toBeTruthy();
      expect(sprint.updatedAt).toBeTruthy();
    });

    it("getSprint returns sprint by ID", () => {
      const sprint = createSprint("test");
      expect(getSprint(sprint.id)).toEqual(sprint);
    });

    it("getSprint returns undefined for unknown ID", () => {
      expect(getSprint("nonexistent")).toBeUndefined();
    });

    it("listSprints returns all sprints sorted by createdAt desc", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      createSprint("First");
      vi.setSystemTime(new Date("2025-01-01T00:01:00Z"));
      createSprint("Second");
      const all = listSprints();
      expect(all).toHaveLength(2);
      expect(all[0].subject).toBe("Second");
      vi.useRealTimers();
    });

    it("clearSprints removes all sprints", () => {
      createSprint("A");
      createSprint("B");
      clearSprints();
      expect(listSprints()).toHaveLength(0);
    });
  });

  describe("status transitions", () => {
    it("startSprint sets status to in-progress", () => {
      const sprint = createSprint("test");
      const started = startSprint(sprint.id);
      expect(started?.status).toBe("in-progress");
    });

    it("startSprint returns undefined for unknown sprint", () => {
      expect(startSprint("nonexistent")).toBeUndefined();
    });

    it("pauseSprint sets status to paused", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const paused = pauseSprint(sprint.id);
      expect(paused?.status).toBe("paused");
    });

    it("pauseSprint returns undefined for unknown sprint", () => {
      expect(pauseSprint("nonexistent")).toBeUndefined();
    });

    it("updates updatedAt on status change", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const sprint = createSprint("test");
      vi.setSystemTime(new Date("2025-01-01T00:01:00Z"));
      startSprint(sprint.id);
      const updated = getSprint(sprint.id);
      expect(updated?.updatedAt).not.toBe(sprint.createdAt);
      vi.useRealTimers();
    });
  });

  describe("canAdvancePhase", () => {
    it("cannot advance when sprint is not in progress", () => {
      const sprint = createSprint("test");
      const result = canAdvancePhase(sprint);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("not in progress");
    });

    it("cannot advance from diverge without investigation", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const current = getSprint(sprint.id)!;
      const result = canAdvancePhase(current);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("investigation");
    });

    it("cannot advance from diverge without angle results", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "test" } as unknown as Investigation,
      });
      const current = getSprint(sprint.id)!;
      const result = canAdvancePhase(current);
      expect(result.canAdvance).toBe(false);
    });

    it("can advance from diverge with investigation and angle results", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "test" } as unknown as Investigation,
        angleResults: [{ angleId: "a1", angleName: "A1", ideas: [] }] as unknown as AngleResult[],
      });
      const current = getSprint(sprint.id)!;
      const result = canAdvancePhase(current);
      expect(result.canAdvance).toBe(true);
    });

    it("cannot advance from converge without synthesis and selected ideas", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "test" } as unknown as Investigation,
        angleResults: [{ angleId: "a1", angleName: "A1", ideas: [] }] as unknown as AngleResult[],
      });
      // Manually move to converge phase
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("synthesize");
    });

    it("can advance from converge with synthesis and selected ideas", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "test" } as unknown as Investigation,
        angleResults: [{ angleId: "a1", angleName: "A1", ideas: [] }] as unknown as AngleResult[],
        synthesis: { themes: [] } as unknown as Synthesis,
        selectedIdeas: ["Idea 1"],
      });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(true);
    });

    it("cannot advance from refine (final phase)", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("final phase");
    });
  });

  describe("updateSprintData", () => {
    it("merges partial data without overwriting other fields", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, {
        investigation: { summary: "inv" } as unknown as Investigation,
      });
      updateSprintData(sprint.id, { selectedIdeas: ["Idea 1"] });
      const s = getSprint(sprint.id)!;
      expect(s.investigation).toEqual({ summary: "inv" });
      expect(s.selectedIdeas).toEqual(["Idea 1"]);
    });

    it("returns undefined for unknown sprint", () => {
      expect(updateSprintData("nonexistent", {})).toBeUndefined();
    });

    it("updates updatedAt timestamp", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const sprint = createSprint("test");
      vi.setSystemTime(new Date("2025-01-01T00:01:00Z"));
      updateSprintData(sprint.id, { selectedIdeas: ["test"] });
      expect(getSprint(sprint.id)?.updatedAt).not.toBe(sprint.createdAt);
      vi.useRealTimers();
    });

    it("can update angleResults", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, {
        angleResults: [{ angleId: "a1", angleName: "test", ideas: [] }] as unknown as AngleResult[],
      });
      const s = getSprint(sprint.id)!;
      expect(s.angleResults).toHaveLength(1);
    });

    it("can update refinedPlans", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, { refinedPlans: [{ plan: "test" }] });
      const s = getSprint(sprint.id)!;
      expect(s.refinedPlans).toHaveLength(1);
    });
  });

  describe("SprintSchema validation", () => {
    it("validates a minimal sprint object", () => {
      const sprint = createSprint("test");
      expect(() => SprintSchema.parse(sprint)).not.toThrow();
    });

    it("validates sprint with optional fields set to undefined", () => {
      const sprint = {
        id: "sprint-1",
        subject: "test",
        currentPhase: "diverge" as const,
        status: "not-started" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checkpoints: [],
        investigation: undefined,
        angleResults: undefined,
        synthesis: undefined,
        selectedIdeas: undefined,
        refinedPlans: undefined,
        retrospective: undefined,
        metadata: undefined,
      };
      expect(() => SprintSchema.parse(sprint)).not.toThrow();
    });

    it("validates sprint with nullable fields populated", () => {
      const sprint = {
        id: "sprint-1",
        subject: "test",
        currentPhase: "converge" as const,
        status: "in-progress" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checkpoints: [],
        investigation: { summary: "test" },
        angleResults: [],
        synthesis: { themes: [] },
        selectedIdeas: ["Idea 1"],
        refinedPlans: [],
        metadata: { key: "value" },
      };
      expect(() => SprintSchema.parse(sprint)).not.toThrow();
    });

    it("rejects invalid phase", () => {
      const sprint = createSprint("test");
      expect(() => SprintSchema.parse({ ...sprint, currentPhase: "invalid" })).toThrow();
    });

    it("rejects invalid status", () => {
      const sprint = createSprint("test");
      expect(() => SprintSchema.parse({ ...sprint, status: "invalid" })).toThrow();
    });
  });
});
