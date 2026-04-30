import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "../appReducer";
import type { AppState, AppAction } from "../appReducer";
import type { Investigation, AngleResult, Synthesis } from "@innovator/core/types";

const mockInvestigation: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect 1", description: "Description 1" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

const mockAngleResults: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Idea 1",
        description: "Desc",
        potentialImpact: "High",
        implementationHint: "Start here",
      },
    ],
    reasoning: "Applied SCAMPER",
  },
];

const mockSynthesis: Synthesis = {
  topIdeas: [
    {
      title: "Top idea",
      description: "Best idea",
      sourceAngle: "scamper",
      potentialImpact: "High",
      feasibility: "high",
    },
  ],
  themes: ["Innovation"],
  recommendation: "Go for it",
};

describe("appReducer", () => {
  it("returns initial state by default", () => {
    const result = appReducer(initialState, { type: "RESET" });
    expect(result).toEqual(initialState);
  });

  it("returns current state for unknown action type", () => {
    const state = { ...initialState, subject: "test" };
    const result = appReducer(state, { type: "UNKNOWN" } as unknown as AppAction);
    expect(result).toBe(state);
  });

  describe("START_INVESTIGATE", () => {
    it("resets to initial state with investigating stage and subject", () => {
      const state: AppState = {
        ...initialState,
        stage: "results",
        subject: "old",
        error: "old error",
      };
      const result = appReducer(state, { type: "START_INVESTIGATE", subject: "new topic" });
      expect(result.stage).toBe("investigating");
      expect(result.subject).toBe("new topic");
      expect(result.error).toBeNull();
      expect(result.investigation).toBeNull();
      expect(result.angleResults).toEqual([]);
    });
  });

  describe("INVESTIGATION_SUCCESS", () => {
    it("sets explored stage and stores investigation", () => {
      const state: AppState = { ...initialState, stage: "investigating", subject: "test" };
      const result = appReducer(state, {
        type: "INVESTIGATION_SUCCESS",
        investigation: mockInvestigation,
      });
      expect(result.stage).toBe("explored");
      expect(result.investigation).toBe(mockInvestigation);
      expect(result.error).toBeNull();
    });

    it("clears any previous error", () => {
      const state: AppState = {
        ...initialState,
        stage: "investigating",
        subject: "test",
        error: "previous error",
      };
      const result = appReducer(state, {
        type: "INVESTIGATION_SUCCESS",
        investigation: mockInvestigation,
      });
      expect(result.error).toBeNull();
    });
  });

  describe("INVESTIGATION_ERROR", () => {
    it("reverts to input stage with error", () => {
      const state: AppState = { ...initialState, stage: "investigating", subject: "test" };
      const result = appReducer(state, {
        type: "INVESTIGATION_ERROR",
        error: "Network error",
      });
      expect(result.stage).toBe("input");
      expect(result.error).toBe("Network error");
    });
  });

  describe("START_INNOVATE", () => {
    it("sets innovating stage with selected angles", () => {
      const state: AppState = {
        ...initialState,
        stage: "explored",
        subject: "test",
        investigation: mockInvestigation,
      };
      const result = appReducer(state, {
        type: "START_INNOVATE",
        angles: ["scamper", "inversion"],
      });
      expect(result.stage).toBe("innovating");
      expect(result.selectedAngles).toEqual(["scamper", "inversion"]);
      expect(result.angleResults).toEqual([]);
      expect(result.error).toBeNull();
    });

    it("clears previous angle results", () => {
      const state: AppState = {
        ...initialState,
        stage: "explored",
        angleResults: mockAngleResults,
      };
      const result = appReducer(state, {
        type: "START_INNOVATE",
        angles: ["scamper"],
      });
      expect(result.angleResults).toEqual([]);
    });
  });

  describe("INNOVATION_SUCCESS", () => {
    it("sets results stage with angle results and synthesis", () => {
      const state: AppState = {
        ...initialState,
        stage: "innovating",
        subject: "test",
        selectedAngles: ["scamper"],
      };
      const result = appReducer(state, {
        type: "INNOVATION_SUCCESS",
        angleResults: mockAngleResults,
        synthesis: mockSynthesis,
      });
      expect(result.stage).toBe("results");
      expect(result.angleResults).toBe(mockAngleResults);
      expect(result.synthesis).toBe(mockSynthesis);
    });

    it("handles null synthesis", () => {
      const state: AppState = { ...initialState, stage: "innovating" };
      const result = appReducer(state, {
        type: "INNOVATION_SUCCESS",
        angleResults: mockAngleResults,
        synthesis: null,
      });
      expect(result.synthesis).toBeNull();
    });
  });

  describe("INNOVATION_ERROR", () => {
    it("reverts to explored stage with error", () => {
      const state: AppState = {
        ...initialState,
        stage: "innovating",
        subject: "test",
        investigation: mockInvestigation,
      };
      const result = appReducer(state, {
        type: "INNOVATION_ERROR",
        error: "API timeout",
      });
      expect(result.stage).toBe("explored");
      expect(result.error).toBe("API timeout");
    });
  });

  describe("START_AUTO", () => {
    it("resets to initial state with auto stage and subject", () => {
      const state: AppState = {
        ...initialState,
        stage: "results",
        angleResults: mockAngleResults,
      };
      const result = appReducer(state, { type: "START_AUTO", subject: "auto topic" });
      expect(result.stage).toBe("auto");
      expect(result.subject).toBe("auto topic");
      expect(result.angleResults).toEqual([]);
      expect(result.investigation).toBeNull();
    });
  });

  describe("AUTO_COMPLETE", () => {
    it("sets results stage with angle results and synthesis", () => {
      const state: AppState = { ...initialState, stage: "auto", subject: "test" };
      const result = appReducer(state, {
        type: "AUTO_COMPLETE",
        angleResults: mockAngleResults,
        synthesis: mockSynthesis,
      });
      expect(result.stage).toBe("results");
      expect(result.angleResults).toBe(mockAngleResults);
      expect(result.synthesis).toBe(mockSynthesis);
    });
  });

  describe("RESET", () => {
    it("returns to initial state from any state", () => {
      const state: AppState = {
        stage: "results",
        subject: "test",
        investigation: mockInvestigation,
        selectedAngles: ["scamper"],
        angleResults: mockAngleResults,
        synthesis: mockSynthesis,
        error: null,
      };
      const result = appReducer(state, { type: "RESET" });
      expect(result).toEqual(initialState);
    });
  });
});
