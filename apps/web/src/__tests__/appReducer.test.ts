import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "../app/appReducer.js";
import type { AppState, AppAction } from "../app/appReducer.js";
import type { Investigation, AngleResult, Synthesis } from "@innovator/core/types";

const mockInvestigation: Investigation = {
  summary: "Test",
  keyAspects: [{ title: "A", description: "B" }],
  currentState: "Current",
  challenges: ["c1"],
  opportunities: ["o1"],
};

const mockAngleResult: AngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    { title: "Idea", description: "Desc", potentialImpact: "High", implementationHint: "Start" },
  ],
  reasoning: "Method applied",
};

const mockSynthesis: Synthesis = {
  topIdeas: [
    {
      title: "Top",
      description: "Desc",
      sourceAngle: "scamper",
      potentialImpact: "High",
      feasibility: "high",
    },
  ],
  themes: ["Innovation"],
  recommendation: "Go for it",
};

describe("appReducer", () => {
  it("START_INVESTIGATE → investigating stage with subject", () => {
    const state = appReducer(initialState, {
      type: "START_INVESTIGATE",
      subject: "AI ethics",
    });
    expect(state.stage).toBe("investigating");
    expect(state.subject).toBe("AI ethics");
    expect(state.error).toBeNull();
  });

  it("INVESTIGATION_SUCCESS → explored stage with investigation data", () => {
    const investigating: AppState = {
      ...initialState,
      stage: "investigating",
      subject: "test",
    };
    const state = appReducer(investigating, {
      type: "INVESTIGATION_SUCCESS",
      investigation: mockInvestigation,
    });
    expect(state.stage).toBe("explored");
    expect(state.investigation).toEqual(mockInvestigation);
    expect(state.error).toBeNull();
  });

  it("INVESTIGATION_ERROR → reverts to input with error", () => {
    const investigating: AppState = {
      ...initialState,
      stage: "investigating",
      subject: "test",
    };
    const state = appReducer(investigating, {
      type: "INVESTIGATION_ERROR",
      error: "Network timeout",
    });
    expect(state.stage).toBe("input");
    expect(state.error).toBe("Network timeout");
  });

  it("START_INNOVATE → innovating stage with selected angles", () => {
    const explored: AppState = {
      ...initialState,
      stage: "explored",
      subject: "test",
      investigation: mockInvestigation,
    };
    const state = appReducer(explored, {
      type: "START_INNOVATE",
      angles: ["scamper", "inversion"],
    });
    expect(state.stage).toBe("innovating");
    expect(state.selectedAngles).toEqual(["scamper", "inversion"]);
    expect(state.angleResults).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("INNOVATION_SUCCESS → results stage with ideas and synthesis", () => {
    const innovating: AppState = {
      ...initialState,
      stage: "innovating",
      subject: "test",
      selectedAngles: ["scamper"],
    };
    const state = appReducer(innovating, {
      type: "INNOVATION_SUCCESS",
      angleResults: [mockAngleResult],
      synthesis: mockSynthesis,
    });
    expect(state.stage).toBe("results");
    expect(state.angleResults).toHaveLength(1);
    expect(state.synthesis).toEqual(mockSynthesis);
  });

  it("INNOVATION_ERROR → reverts to explored with error", () => {
    const innovating: AppState = {
      ...initialState,
      stage: "innovating",
      subject: "test",
      investigation: mockInvestigation,
    };
    const state = appReducer(innovating, {
      type: "INNOVATION_ERROR",
      error: "Generation failed",
    });
    expect(state.stage).toBe("explored");
    expect(state.error).toBe("Generation failed");
  });

  it("START_AUTO → auto stage with subject", () => {
    const state = appReducer(initialState, {
      type: "START_AUTO",
      subject: "Quantum computing",
    });
    expect(state.stage).toBe("auto");
    expect(state.subject).toBe("Quantum computing");
  });

  it("AUTO_COMPLETE → results stage with data", () => {
    const auto: AppState = {
      ...initialState,
      stage: "auto",
      subject: "test",
    };
    const state = appReducer(auto, {
      type: "AUTO_COMPLETE",
      angleResults: [mockAngleResult],
      synthesis: mockSynthesis,
    });
    expect(state.stage).toBe("results");
    expect(state.angleResults).toEqual([mockAngleResult]);
    expect(state.synthesis).toEqual(mockSynthesis);
  });

  it("RESET → returns initialState", () => {
    const someState: AppState = {
      stage: "results",
      subject: "test",
      investigation: mockInvestigation,
      selectedAngles: ["scamper"],
      angleResults: [mockAngleResult],
      synthesis: mockSynthesis,
      error: null,
    };
    const state = appReducer(someState, { type: "RESET" });
    expect(state).toEqual(initialState);
  });

  it("unknown action → returns current state unchanged", () => {
    // TypeScript prevents truly unknown actions, but we can test the default branch
    const state = appReducer(initialState, { type: "UNKNOWN" } as unknown as AppAction);
    expect(state).toEqual(initialState);
  });

  // ---- Full flow tests ----

  it("full flow: input → investigating → explored → innovating → results", () => {
    let state = appReducer(initialState, { type: "START_INVESTIGATE", subject: "AI" });
    expect(state.stage).toBe("investigating");

    state = appReducer(state, { type: "INVESTIGATION_SUCCESS", investigation: mockInvestigation });
    expect(state.stage).toBe("explored");

    state = appReducer(state, { type: "START_INNOVATE", angles: ["scamper"] });
    expect(state.stage).toBe("innovating");

    state = appReducer(state, {
      type: "INNOVATION_SUCCESS",
      angleResults: [mockAngleResult],
      synthesis: mockSynthesis,
    });
    expect(state.stage).toBe("results");
  });

  it("auto flow: input → auto → results", () => {
    let state = appReducer(initialState, { type: "START_AUTO", subject: "AI" });
    expect(state.stage).toBe("auto");

    state = appReducer(state, {
      type: "AUTO_COMPLETE",
      angleResults: [mockAngleResult],
      synthesis: mockSynthesis,
    });
    expect(state.stage).toBe("results");
  });
});
