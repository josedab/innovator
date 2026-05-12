import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  createSprint,
  getSprint,
  clearSprints,
  startSprint,
  advancePhase,
  canAdvancePhase,
  updateSprintData,
  generateRetrospective,
  getProgressionSuggestions,
  getPhasePrompt,
} from "../sprint/index.js";
import type { Investigation, AngleResult, Synthesis } from "../types.js";
import { withRetry } from "../copilot/retry.js";

const mockWithRetry = vi.mocked(withRetry);

function setupDivergeSprint(subject = "test subject") {
  const sprint = createSprint(subject);
  startSprint(sprint.id);
  updateSprintData(sprint.id, {
    investigation: { summary: "Investigation done" } as unknown as Investigation,
    angleResults: [
      { angleId: "a1", angleName: "A1", ideas: [{ title: "I1" }] },
    ] as unknown as AngleResult[],
  });
  return sprint;
}

function setupConvergeSprint(subject = "test subject") {
  const sprint = setupDivergeSprint(subject);
  const s = getSprint(sprint.id)!;
  s.currentPhase = "converge";
  updateSprintData(sprint.id, {
    synthesis: { themes: ["theme1"] } as unknown as Synthesis,
    selectedIdeas: ["Idea 1", "Idea 2"],
  });
  return sprint;
}

describe("sprint phase progression (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSprints();
  });

  describe("advancePhase transitions", () => {
    it("advances diverge → converge", async () => {
      const sprint = setupDivergeSprint();
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          summary: "Diverge completed",
          keyInsights: ["Insight 1"],
          metrics: { ideasGenerated: 5 },
        })
      );

      const updated = await advancePhase(sprint.id);
      expect(updated).toBeDefined();
      expect(updated!.currentPhase).toBe("converge");
      expect(updated!.checkpoints).toHaveLength(1);
      expect(updated!.checkpoints[0].phase).toBe("diverge");
    });

    it("advances converge → refine", async () => {
      const sprint = setupConvergeSprint();
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          summary: "Converge completed",
          keyInsights: ["Top ideas selected"],
        })
      );

      const updated = await advancePhase(sprint.id);
      expect(updated!.currentPhase).toBe("refine");
      expect(updated!.checkpoints).toHaveLength(1);
      expect(updated!.checkpoints[0].phase).toBe("converge");
    });

    it("throws when trying to advance from refine (final phase)", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";

      await expect(advancePhase(sprint.id)).rejects.toThrow("final phase");
    });

    it("throws when canAdvancePhase returns false (missing data)", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      // No investigation or angle results

      await expect(advancePhase(sprint.id)).rejects.toThrow();
    });
  });

  describe("canAdvancePhase edge cases", () => {
    it("returns false for not-started sprint", () => {
      const sprint = createSprint("test");
      const result = canAdvancePhase(sprint);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("not in progress");
    });

    it("returns false for paused sprint", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      s.status = "paused";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("not in progress");
    });

    it("returns false with missing investigation data", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("investigation");
    });

    it("returns false with empty angleResults array", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "done" } as unknown as Investigation,
        angleResults: [],
      });
      const s = getSprint(sprint.id)!;
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
    });
  });

  describe("generateRetrospective", () => {
    it("produces structured retrospective output", async () => {
      const sprint = createSprint("AI Innovation");
      startSprint(sprint.id);

      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          overallSummary: "Sprint completed with 3 breakthrough ideas",
          topIdeas: [
            {
              title: "AI Diagnostics",
              description: "Use AI for diagnostics",
              actionItems: ["Build prototype"],
            },
          ],
          lessonsLearned: ["Start with user interviews"],
          nextSteps: ["Validate with stakeholders"],
        })
      );

      const retro = await generateRetrospective(sprint.id);
      expect(retro).toMatchObject({
        overallSummary: expect.stringContaining("breakthrough"),
        topIdeas: expect.arrayContaining([
          expect.objectContaining({
            title: "AI Diagnostics",
            actionItems: expect.any(Array),
          }),
        ]),
        lessonsLearned: expect.any(Array),
        nextSteps: expect.any(Array),
      });
      expect(retro!.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("produces fallback for incomplete sprint (no checkpoints)", async () => {
      const sprint = createSprint("Test Sprint");
      startSprint(sprint.id);
      mockWithRetry.mockRejectedValue(new Error("LLM failure"));

      const retro = await generateRetrospective(sprint.id);
      expect(retro).toBeDefined();
      expect(retro!.overallSummary).toContain("Test Sprint");
      expect(retro!.topIdeas).toEqual([]);
      expect(retro!.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("returns undefined for non-existent sprint", async () => {
      const retro = await generateRetrospective("nonexistent");
      expect(retro).toBeUndefined();
    });

    it("sets sprint status to completed", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          overallSummary: "Done",
          topIdeas: [],
          lessonsLearned: [],
          nextSteps: [],
        })
      );

      await generateRetrospective(sprint.id);
      expect(getSprint(sprint.id)!.status).toBe("completed");
    });
  });

  describe("getProgressionSuggestions", () => {
    it("suggests investigation when no data in diverge phase", () => {
      const sprint = createSprint("test");
      const suggestions = getProgressionSuggestions(sprint);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.toLowerCase().includes("investigation"))).toBe(true);
    });

    it("suggests angle generation when investigation exists but no angles", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, {
        investigation: { summary: "done" } as unknown as Investigation,
      });
      const s = getSprint(sprint.id)!;
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("angle"))).toBe(true);
    });

    it("suggests advancing when diverge phase is complete", () => {
      const sprint = setupDivergeSprint();
      const s = getSprint(sprint.id)!;
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("converge"))).toBe(true);
    });

    it("suggests scoring in converge phase without synthesis", () => {
      const sprint = createSprint("test");
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const suggestions = getProgressionSuggestions(s);
      expect(
        suggestions.some(
          (s) => s.toLowerCase().includes("score") || s.toLowerCase().includes("rank")
        )
      ).toBe(true);
    });

    it("suggests plans in refine phase without plans", () => {
      const sprint = createSprint("test");
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      const suggestions = getProgressionSuggestions(s);
      expect(
        suggestions.some(
          (s) => s.toLowerCase().includes("implementation") || s.toLowerCase().includes("plan")
        )
      ).toBe(true);
    });

    it("suggests retrospective when refine has plans", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, { refinedPlans: [{ plan: "done" }] });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("retrospective"))).toBe(true);
    });
  });

  describe("checkpoint accumulation on phase transition", () => {
    it("accumulates checkpoints across multiple advances", async () => {
      const sprint = setupDivergeSprint();
      mockWithRetry.mockResolvedValue(
        JSON.stringify({
          summary: "Phase completed",
          keyInsights: ["Insight"],
        })
      );

      // Advance diverge → converge
      await advancePhase(sprint.id);

      // Set up for converge → refine
      updateSprintData(sprint.id, {
        synthesis: { themes: [] } as unknown as Synthesis,
        selectedIdeas: ["Idea 1"],
      });

      // Advance converge → refine
      const updated = await advancePhase(sprint.id);
      expect(updated!.checkpoints).toHaveLength(2);
      expect(updated!.checkpoints[0].phase).toBe("diverge");
      expect(updated!.checkpoints[1].phase).toBe("converge");
    });
  });

  describe("timestamp validation", () => {
    it("createdAt is valid ISO format", () => {
      const sprint = createSprint("test");
      expect(sprint.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("updatedAt is valid ISO format after start", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      expect(s.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("checkpoint completedAt is valid ISO format", async () => {
      const sprint = setupDivergeSprint();
      mockWithRetry.mockResolvedValue(JSON.stringify({ summary: "Done", keyInsights: [] }));
      const updated = await advancePhase(sprint.id);
      expect(updated!.checkpoints[0].completedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe("getPhasePrompt", () => {
    it("returns diverge prompt with subject", () => {
      const sprint = createSprint("Solar Energy");
      const prompt = getPhasePrompt(sprint);
      expect(prompt).toContain("DIVERGE");
      expect(prompt).toContain("Solar Energy");
    });

    it("returns converge prompt", () => {
      const sprint = createSprint("AI");
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const prompt = getPhasePrompt(s);
      expect(prompt).toContain("CONVERGE");
    });

    it("returns refine prompt", () => {
      const sprint = createSprint("AI");
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      const prompt = getPhasePrompt(s);
      expect(prompt).toContain("REFINE");
    });
  });

  describe("edge case: no subject", () => {
    it("creates sprint with empty subject", () => {
      const sprint = createSprint("");
      expect(sprint.subject).toBe("");
      expect(sprint.currentPhase).toBe("diverge");
    });
  });
});
