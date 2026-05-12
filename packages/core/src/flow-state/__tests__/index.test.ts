import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  assessFlowState,
  selectIntervention,
  recordFlowEntry,
  getFlowTimeline,
  getInterventionLibrary,
  clearFlowData,
  type CognitiveLoadIndicators,
  type FlowState,
} from "../index.js";

// Mock LLM dependencies at top level for generateCustomIntervention
vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue(
    JSON.stringify({
      type: "perspective-shift",
      title: "Custom Intervention",
      description: "Try thinking about it differently",
      urgency: "medium",
      estimatedDurationMinutes: 5,
    })
  ),
  extractJson: vi.fn((s: string) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
}));

// ---- Helpers ----

function makeIndicators(overrides: Partial<CognitiveLoadIndicators> = {}): CognitiveLoadIndicators {
  return {
    sessionDurationMinutes: 30,
    ideasGenerated: 5,
    anglesExplored: 3,
    timeSinceLastIdeaMinutes: 2,
    ideaQualityTrend: "stable",
    repetitionRate: 0.1,
    avgIdeaLengthTrend: "stable",
    userInteractionFrequency: "normal",
    ...overrides,
  };
}

describe("flow-state", () => {
  beforeEach(() => {
    clearFlowData();
  });

  // ---- assessFlowState ----
  describe("assessFlowState", () => {
    it("detects warm-up for short sessions (<5 min)", () => {
      const state = assessFlowState(makeIndicators({ sessionDurationMinutes: 3 }));
      expect(state.state).toBe("warm-up");
      expect(state.recommendation).toContain("warm-up");
    });

    it("detects flow state with good metrics", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 20,
          ideasGenerated: 10,
          timeSinceLastIdeaMinutes: 1,
          ideaQualityTrend: "improving",
          repetitionRate: 0.05,
          userInteractionFrequency: "high",
        })
      );
      expect(state.state).toBe("flow");
    });

    it("detects fatigue for long sessions with high cognitive load", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 110,
          timeSinceLastIdeaMinutes: 14,
          repetitionRate: 0.8,
          userInteractionFrequency: "normal",
        })
      );
      expect(state.state).toBe("fatigued");
    });

    it("detects disengagement when idle", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 30,
          timeSinceLastIdeaMinutes: 12,
          userInteractionFrequency: "idle",
        })
      );
      expect(state.state).toBe("disengaged");
    });

    it("detects blocked state with high repetition and declining quality", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 30,
          ideasGenerated: 5,
          timeSinceLastIdeaMinutes: 3,
          ideaQualityTrend: "declining",
          repetitionRate: 0.6,
          userInteractionFrequency: "normal",
        })
      );
      expect(state.state).toBe("blocked");
    });

    it("returns productive for moderate metrics", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 30,
          ideasGenerated: 3,
          timeSinceLastIdeaMinutes: 3,
          ideaQualityTrend: "stable",
          repetitionRate: 0.15,
          userInteractionFrequency: "normal",
        })
      );
      expect(state.state).toBe("productive");
    });

    it("cognitiveLoad is between 0 and 1", () => {
      const state = assessFlowState(makeIndicators());
      expect(state.cognitiveLoad).toBeGreaterThanOrEqual(0);
      expect(state.cognitiveLoad).toBeLessThanOrEqual(1);
    });

    it("creativeEnergy is between 0 and 1", () => {
      const state = assessFlowState(makeIndicators());
      expect(state.creativeEnergy).toBeGreaterThanOrEqual(0);
      expect(state.creativeEnergy).toBeLessThanOrEqual(1);
    });

    it("focusLevel is between 0 and 1", () => {
      const state = assessFlowState(makeIndicators());
      expect(state.focusLevel).toBeGreaterThanOrEqual(0);
      expect(state.focusLevel).toBeLessThanOrEqual(1);
    });

    it("always includes a recommendation", () => {
      const state = assessFlowState(makeIndicators());
      expect(state.recommendation.length).toBeGreaterThan(0);
    });

    it("handles first assessment (all zeros)", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 0,
          ideasGenerated: 0,
          anglesExplored: 0,
          timeSinceLastIdeaMinutes: 0,
          repetitionRate: 0,
        })
      );
      expect(state.state).toBe("warm-up");
    });

    it("handles all identical quality scores (stable trend)", () => {
      const state = assessFlowState(
        makeIndicators({
          ideaQualityTrend: "stable",
          sessionDurationMinutes: 40,
        })
      );
      expect(["flow", "productive"]).toContain(state.state);
    });

    it("handles extremely long session (>4h)", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 250,
          timeSinceLastIdeaMinutes: 10,
          repetitionRate: 0.5,
        })
      );
      // High cognitive load should trigger fatigued
      expect(state.cognitiveLoad).toBeGreaterThan(0.5);
    });
  });

  // ---- selectIntervention ----
  describe("selectIntervention", () => {
    it("returns break suggestion for fatigued state", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 110,
          timeSinceLastIdeaMinutes: 14,
          repetitionRate: 0.8,
        })
      );
      const intervention = selectIntervention(state);
      expect(intervention.type).toBe("break-suggestion");
    });

    it("returns encouragement for flow state", () => {
      const state: FlowState = {
        state: "flow",
        cognitiveLoad: 0.3,
        creativeEnergy: 0.8,
        focusLevel: 0.9,
        recommendation: "Keep going",
        confidence: 0.7,
      };
      const intervention = selectIntervention(state);
      expect(intervention.type).toBe("encouragement");
    });

    it("returns palate-cleanser or perspective-shift or wild-card for blocked state", () => {
      const state: FlowState = {
        state: "blocked",
        cognitiveLoad: 0.6,
        creativeEnergy: 0.3,
        focusLevel: 0.4,
        recommendation: "Try something new",
        confidence: 0.7,
      };
      const intervention = selectIntervention(state);
      expect(["palate-cleanser", "perspective-shift", "wild-card"]).toContain(intervention.type);
    });

    it("returns valid intervention for every state", () => {
      const states: FlowState["state"][] = [
        "warm-up",
        "flow",
        "productive",
        "fatigued",
        "blocked",
        "disengaged",
      ];
      for (const s of states) {
        const state: FlowState = {
          state: s,
          cognitiveLoad: 0.5,
          creativeEnergy: 0.5,
          focusLevel: 0.5,
          recommendation: "Test",
          confidence: 0.7,
        };
        const intervention = selectIntervention(state);
        expect(intervention).toBeDefined();
        expect(intervention.title.length).toBeGreaterThan(0);
        expect(intervention.description.length).toBeGreaterThan(0);
        expect([
          "perspective-shift",
          "break-suggestion",
          "palate-cleanser",
          "angle-switch",
          "constraint-challenge",
          "encouragement",
          "synthesis-prompt",
          "wild-card",
        ]).toContain(intervention.type);
      }
    });

    it("intervention has required fields with correct types", () => {
      const state: FlowState = {
        state: "productive",
        cognitiveLoad: 0.4,
        creativeEnergy: 0.6,
        focusLevel: 0.6,
        recommendation: "Test",
        confidence: 0.7,
      };
      const intervention = selectIntervention(state);
      expect([
        "perspective-shift",
        "break-suggestion",
        "palate-cleanser",
        "angle-switch",
        "constraint-challenge",
        "encouragement",
        "synthesis-prompt",
        "wild-card",
      ]).toContain(intervention.type);
      expect(intervention.title.length).toBeGreaterThan(0);
      expect(intervention.description.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(intervention.urgency);
      expect(intervention.estimatedDurationMinutes).toBeGreaterThan(0);
    });
  });

  // ---- recordFlowEntry / getFlowTimeline ----
  describe("timeline", () => {
    it("records flow entries", () => {
      recordFlowEntry("sess-1", "flow", 0.3, "Started well");
      recordFlowEntry("sess-1", "productive", 0.5, "Good pace");

      const timeline = getFlowTimeline("sess-1");
      expect(timeline).toHaveLength(2);
      expect(timeline[0].state).toBe("flow");
      expect(timeline[0].cognitiveLoad).toBe(0.3);
      expect(timeline[0].event).toBe("Started well");
      expect(timeline[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("records entries with interventions", () => {
      const intervention = getInterventionLibrary()[0];
      recordFlowEntry("sess-1", "fatigued", 0.8, "Break needed", intervention);

      const timeline = getFlowTimeline("sess-1");
      expect(timeline[0].intervention).toBeDefined();
      expect(timeline[0].intervention!.type).toBe(intervention.type);
    });

    it("returns empty timeline for unknown session", () => {
      expect(getFlowTimeline("unknown")).toEqual([]);
    });

    it("different sessions have separate timelines", () => {
      recordFlowEntry("sess-1", "flow", 0.3);
      recordFlowEntry("sess-2", "fatigued", 0.8);

      expect(getFlowTimeline("sess-1")).toHaveLength(1);
      expect(getFlowTimeline("sess-2")).toHaveLength(1);
    });

    it("clearFlowData removes all timelines", () => {
      recordFlowEntry("sess-1", "flow", 0.3);
      clearFlowData();
      expect(getFlowTimeline("sess-1")).toEqual([]);
    });
  });

  // ---- getInterventionLibrary ----
  describe("getInterventionLibrary", () => {
    it("returns all 12 intervention types", () => {
      const library = getInterventionLibrary();
      expect(library).toHaveLength(12);
    });

    it("returns a copy (not reference)", () => {
      const lib1 = getInterventionLibrary();
      const lib2 = getInterventionLibrary();
      expect(lib1).not.toBe(lib2);
      expect(lib1).toEqual(lib2);
    });

    it("all interventions have required fields", () => {
      for (const i of getInterventionLibrary()) {
        expect(i.type.length).toBeGreaterThan(0);
        expect(i.title.length).toBeGreaterThan(0);
        expect(i.description.length).toBeGreaterThan(0);
        expect(["low", "medium", "high"]).toContain(i.urgency);
        expect(i.estimatedDurationMinutes).toBeGreaterThan(0);
      }
    });

    it("covers all intervention types", () => {
      const types = new Set(getInterventionLibrary().map((i) => i.type));
      expect(types).toContain("perspective-shift");
      expect(types).toContain("break-suggestion");
      expect(types).toContain("palate-cleanser");
      expect(types).toContain("angle-switch");
      expect(types).toContain("constraint-challenge");
      expect(types).toContain("encouragement");
      expect(types).toContain("synthesis-prompt");
      expect(types).toContain("wild-card");
    });
  });

  // ---- generateCustomIntervention (mocked) ----
  describe("generateCustomIntervention", () => {
    it("generates intervention via LLM mock", async () => {
      const { generateCustomIntervention } = await import("../index.js");
      const state: FlowState = {
        state: "blocked",
        cognitiveLoad: 0.6,
        creativeEnergy: 0.3,
        focusLevel: 0.4,
        recommendation: "Try something new",
        confidence: 0.7,
      };

      const intervention = await generateCustomIntervention("AI tools", state, ["idea1"]);
      expect(intervention.type).toBe("perspective-shift");
      expect(intervention.title).toBe("Custom Intervention");
    });
  });

  // ---- Edge cases ----
  describe("edge cases", () => {
    it("assessFlowState at exact 120 min fatigue boundary", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 120,
          timeSinceLastIdeaMinutes: 14,
          repetitionRate: 0.8,
        })
      );
      // At boundary, should detect fatigue
      expect(state.cognitiveLoad).toBeGreaterThan(0.5);
    });

    it("assessFlowState at exact 0.5 repetitionRate boundary for blocked", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 30,
          ideasGenerated: 5,
          timeSinceLastIdeaMinutes: 3,
          ideaQualityTrend: "declining",
          repetitionRate: 0.5,
          userInteractionFrequency: "normal",
        })
      );
      // At boundary, should be blocked or productive
      expect(["blocked", "productive"]).toContain(state.state);
    });

    it("assessFlowState with zero-duration session", () => {
      const state = assessFlowState(
        makeIndicators({
          sessionDurationMinutes: 0,
          ideasGenerated: 0,
          anglesExplored: 0,
          timeSinceLastIdeaMinutes: 0,
          repetitionRate: 0,
        })
      );
      expect(state.state).toBe("warm-up");
      expect(state.cognitiveLoad).toBeGreaterThanOrEqual(0);
      expect(state.cognitiveLoad).toBeLessThanOrEqual(1);
    });

    it("recommendation contains meaningful text for each state", () => {
      const states: FlowState["state"][] = [
        "warm-up",
        "flow",
        "productive",
        "fatigued",
        "blocked",
        "disengaged",
      ];
      for (const s of states) {
        const indicators =
          s === "warm-up"
            ? makeIndicators({ sessionDurationMinutes: 2 })
            : s === "fatigued"
              ? makeIndicators({
                  sessionDurationMinutes: 120,
                  timeSinceLastIdeaMinutes: 14,
                  repetitionRate: 0.8,
                })
              : s === "disengaged"
                ? makeIndicators({
                    sessionDurationMinutes: 30,
                    timeSinceLastIdeaMinutes: 12,
                    userInteractionFrequency: "idle",
                  })
                : s === "blocked"
                  ? makeIndicators({
                      sessionDurationMinutes: 30,
                      ideaQualityTrend: "declining",
                      repetitionRate: 0.6,
                    })
                  : s === "flow"
                    ? makeIndicators({
                        sessionDurationMinutes: 20,
                        ideasGenerated: 10,
                        timeSinceLastIdeaMinutes: 1,
                        ideaQualityTrend: "improving",
                        repetitionRate: 0.05,
                        userInteractionFrequency: "high",
                      })
                    : makeIndicators({ sessionDurationMinutes: 30 });
        const state = assessFlowState(indicators);
        expect(state.recommendation.length).toBeGreaterThan(5);
      }
    });
  });
});
