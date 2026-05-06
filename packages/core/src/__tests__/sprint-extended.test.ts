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
  pauseSprint,
  advancePhase,
  canAdvancePhase,
  updateSprintData,
  generateRetrospective,
  getProgressionSuggestions,
  deleteSprint,
} from "../sprint/index.js";
import { generateText, extractJson } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

describe("sprint (extended coverage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSprints();
  });

  describe("phase transition: diverge→converge requires synthesis + selectedIdeas", () => {
    it("cannot advance from converge without synthesis", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("synthesize");
    });

    it("cannot advance from converge without selectedIdeas", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, { synthesis: { themes: [] } as unknown });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
    });

    it("cannot advance from converge with empty selectedIdeas", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        synthesis: { themes: [] } as unknown,
        selectedIdeas: [],
      });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
    });

    it("can advance from converge with synthesis and selectedIdeas.length > 0", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        synthesis: { themes: ["theme1"] } as unknown,
        selectedIdeas: ["Idea 1"],
      });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(true);
    });
  });

  describe("advance from refine (final phase)", () => {
    it("returns canAdvance=false with 'final phase' reason", () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      const result = canAdvancePhase(s);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("final phase");
    });

    it("advancePhase throws when in final phase", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      await expect(advancePhase(sprint.id)).rejects.toThrow();
    });
  });

  describe("advancePhase with generateCheckpoint", () => {
    it("LLM success path produces checkpoint with summary and keyInsights", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "Investigation done" } as unknown,
        angleResults: [{ angleId: "a1", angleName: "A1", ideas: [{ title: "I1" }] }] as unknown,
      });

      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue("json");
      // withRetry returns the fn result; we mock generateText to produce parseable JSON
      const { withRetry } = await import("../copilot/retry.js");
      vi.mocked(withRetry).mockImplementation(async (fn) => {
        // Simulate the inner function returning parseable JSON
        return JSON.stringify({
          summary: "Diverge phase completed successfully",
          keyInsights: ["Key insight 1", "Key insight 2"],
          metrics: { ideasGenerated: 5 },
        });
      });

      const updated = await advancePhase(sprint.id);
      expect(updated).toBeDefined();
      expect(updated!.currentPhase).toBe("converge");
      expect(updated!.checkpoints).toHaveLength(1);
      expect(updated!.checkpoints[0].phase).toBe("diverge");
    });

    it("generateCheckpoint falls back on parse failure", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);
      updateSprintData(sprint.id, {
        investigation: { summary: "test" } as unknown,
        angleResults: [{ angleId: "a1", angleName: "A1", ideas: [] }] as unknown,
      });

      const { withRetry } = await import("../copilot/retry.js");
      vi.mocked(withRetry).mockRejectedValue(new Error("Parse failed"));

      const updated = await advancePhase(sprint.id);
      expect(updated).toBeDefined();
      expect(updated!.checkpoints).toHaveLength(1);
      expect(updated!.checkpoints[0].summary).toContain("Completed diverge phase");
      expect(updated!.checkpoints[0].keyInsights).toEqual([]);
    });
  });

  describe("generateRetrospective", () => {
    it("sets status=completed and records completedAt timestamp on success", async () => {
      const sprint = createSprint("test");
      startSprint(sprint.id);

      const { withRetry } = await import("../copilot/retry.js");
      vi.mocked(withRetry).mockResolvedValue(
        JSON.stringify({
          overallSummary: "Sprint completed successfully",
          topIdeas: [{ title: "Idea 1", description: "Desc", actionItems: ["Do X"] }],
          lessonsLearned: ["Lesson 1"],
          nextSteps: ["Next step 1"],
        })
      );

      const retro = await generateRetrospective(sprint.id);
      expect(retro).toBeDefined();
      expect(retro!.overallSummary).toBe("Sprint completed successfully");
      expect(retro!.generatedAt).toBeTruthy();

      const s = getSprint(sprint.id)!;
      expect(s.status).toBe("completed");
      expect(s.retrospective).toBeDefined();
    });

    it("returns fallback retrospective on LLM failure", async () => {
      const sprint = createSprint("My Subject");
      startSprint(sprint.id);

      const { withRetry } = await import("../copilot/retry.js");
      vi.mocked(withRetry).mockRejectedValue(new Error("LLM failure"));

      const retro = await generateRetrospective(sprint.id);
      expect(retro).toBeDefined();
      expect(retro!.overallSummary).toContain("My Subject");
      expect(retro!.topIdeas).toEqual([]);
    });

    it("returns undefined for non-existent sprint", async () => {
      const retro = await generateRetrospective("nonexistent");
      expect(retro).toBeUndefined();
    });
  });

  describe("getProgressionSuggestions", () => {
    it("diverge phase without investigation suggests running investigation", () => {
      const sprint = createSprint("test");
      const suggestions = getProgressionSuggestions(sprint);
      expect(suggestions.some((s) => s.toLowerCase().includes("investigation"))).toBe(true);
    });

    it("diverge phase with investigation but no angleResults suggests generating ideas", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, { investigation: { summary: "done" } as unknown });
      const s = getSprint(sprint.id)!;
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("angle"))).toBe(true);
    });

    it("diverge phase with investigation and angleResults suggests advancing", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, {
        investigation: { summary: "done" } as unknown,
        angleResults: [{ angleId: "a1" }] as unknown,
      });
      const s = getSprint(sprint.id)!;
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("converge"))).toBe(true);
    });

    it("converge phase without synthesis suggests scoring", () => {
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

    it("converge phase with synthesis but no selectedIdeas suggests selecting", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, { synthesis: { themes: [] } as unknown });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("select"))).toBe(true);
    });

    it("converge phase ready to advance", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, {
        synthesis: { themes: [] } as unknown,
        selectedIdeas: ["Idea 1"],
      });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "converge";
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("refine"))).toBe(true);
    });

    it("refine phase without plans suggests creating them", () => {
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

    it("refine phase with plans suggests retrospective", () => {
      const sprint = createSprint("test");
      updateSprintData(sprint.id, { refinedPlans: [{ plan: "done" }] });
      const s = getSprint(sprint.id)!;
      s.currentPhase = "refine";
      const suggestions = getProgressionSuggestions(s);
      expect(suggestions.some((s) => s.toLowerCase().includes("retrospective"))).toBe(true);
    });
  });

  describe("status transitions", () => {
    it("not-started → in-progress → paused → in-progress → completed", async () => {
      const sprint = createSprint("test");
      expect(sprint.status).toBe("not-started");

      startSprint(sprint.id);
      expect(getSprint(sprint.id)!.status).toBe("in-progress");

      pauseSprint(sprint.id);
      expect(getSprint(sprint.id)!.status).toBe("paused");

      startSprint(sprint.id);
      expect(getSprint(sprint.id)!.status).toBe("in-progress");

      // Complete via retrospective
      const { withRetry } = await import("../copilot/retry.js");
      vi.mocked(withRetry).mockResolvedValue(
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

  describe("deleteSprint", () => {
    it("removes a sprint and returns true", () => {
      const sprint = createSprint("test");
      expect(deleteSprint(sprint.id)).toBe(true);
      expect(getSprint(sprint.id)).toBeUndefined();
    });

    it("returns false for non-existent sprint", () => {
      expect(deleteSprint("nonexistent")).toBe(false);
    });
  });
});
