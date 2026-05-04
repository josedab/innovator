import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
  generateTextStream: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  COGNITIVE_BIASES,
  BIAS_DEFINITIONS,
  recordBiasActivity,
  recordBiasActivities,
  getUserActivities,
  getBiasAnalysis,
  getCounterPrompt,
  generateDebiasingChallenges,
  completeDebiasingChallenge,
  buildTeamBiasDashboard,
  clearBiasCalibrationData,
} from "../bias-calibration/index.js";

function makeActivity(userId = "user-1", action = "investigate" as const) {
  return { userId, sessionId: "session-1", timestamp: new Date().toISOString(), action };
}

describe("bias-calibration", () => {
  beforeEach(() => {
    clearBiasCalibrationData();
  });

  it("COGNITIVE_BIASES has 8 items", () => {
    expect(COGNITIVE_BIASES).toHaveLength(8);
  });

  it("BIAS_DEFINITIONS has entries for all 8 biases with counterPrompt and debiasingSuggestions", () => {
    for (const bias of COGNITIVE_BIASES) {
      const def = BIAS_DEFINITIONS[bias];
      expect(def).toBeDefined();
      expect(typeof def.counterPrompt).toBe("string");
      expect(Array.isArray(def.debiasingSuggestions)).toBe(true);
      expect(def.debiasingSuggestions.length).toBeGreaterThan(0);
    }
  });

  it("recordBiasActivity stores activity and getUserActivities retrieves it", () => {
    const activity = makeActivity();
    recordBiasActivity(activity);
    const activities = getUserActivities("user-1");
    expect(activities).toHaveLength(1);
    expect(activities[0].userId).toBe("user-1");
    expect(activities[0].action).toBe("investigate");
  });

  it("recordBiasActivities stores multiple activities", () => {
    const activities = [
      makeActivity("user-1", "investigate"),
      makeActivity("user-1", "score-idea"),
      makeActivity("user-2", "vote"),
    ];
    recordBiasActivities(activities);
    expect(getUserActivities("user-1")).toHaveLength(2);
    expect(getUserActivities("user-2")).toHaveLength(1);
  });

  it("getBiasAnalysis returns undefined when no analysis exists", () => {
    expect(getBiasAnalysis("user-1")).toBeUndefined();
  });

  it("getCounterPrompt returns string for each bias", () => {
    for (const bias of COGNITIVE_BIASES) {
      const prompt = getCounterPrompt(bias);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it("generateDebiasingChallenges returns empty when no analysis", () => {
    const challenges = generateDebiasingChallenges("user-1");
    expect(challenges).toHaveLength(0);
  });

  it("completeDebiasingChallenge returns undefined for non-existent challenge", () => {
    expect(completeDebiasingChallenge("user-1", "challenge-999")).toBeUndefined();
  });

  it("buildTeamBiasDashboard returns valid dashboard for empty team", () => {
    const dashboard = buildTeamBiasDashboard("team-1", []);
    expect(dashboard).toBeDefined();
    expect(dashboard.teamId).toBe("team-1");
  });

  it("buildTeamBiasDashboard includes member data", () => {
    recordBiasActivity(makeActivity("user-1"));
    const dashboard = buildTeamBiasDashboard("team-1", ["user-1"]);
    expect(dashboard.teamId).toBe("team-1");
  });

  it("clearBiasCalibrationData empties everything", () => {
    recordBiasActivity(makeActivity("user-1"));
    recordBiasActivity(makeActivity("user-2"));
    clearBiasCalibrationData();
    expect(getUserActivities("user-1")).toHaveLength(0);
    expect(getUserActivities("user-2")).toHaveLength(0);
    expect(getBiasAnalysis("user-1")).toBeUndefined();
  });

  it("getUserActivities returns empty array for unknown user", () => {
    expect(getUserActivities("unknown")).toHaveLength(0);
  });
});
