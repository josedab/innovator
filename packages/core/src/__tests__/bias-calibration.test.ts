import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return raw.slice(start, end + 1);
  }),
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
  analyzeBiases,
} from "../bias-calibration/index.js";
import type { UserActivity } from "../bias-calibration/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

function makeActivity(userId = "user-1", action: UserActivity["action"] = "investigate") {
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

  describe("analyzeBiases", () => {
    it("returns low-risk analysis for zero activities", async () => {
      const result = await analyzeBiases("user-empty");
      expect(result.activityCount).toBe(0);
      expect(result.riskLevel).toBe("low");
      expect(result.overallBiasRisk).toBe(0);
      expect(result.recommendations).toHaveLength(1);
    });

    it("analyzes activities with mocked LLM and stores result", async () => {
      recordBiasActivities([
        makeActivity("user-1", "investigate"),
        makeActivity("user-1", "score-idea"),
        makeActivity("user-1", "select-angle"),
      ]);

      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [
            {
              biasId: "confirmation",
              biasName: "Confirmation Bias",
              confidence: 0.7,
              evidence: ["Repeatedly selects same angles"],
              severity: "medium",
            },
          ],
          overallBiasRisk: 45,
          recommendations: ["Try different angles"],
        })
      );

      const result = await analyzeBiases("user-1");
      expect(result.userId).toBe("user-1");
      expect(result.activityCount).toBe(3);
      expect(result.sessionCount).toBe(1);
      expect(result.detectedBiases).toHaveLength(1);
      expect(result.detectedBiases[0].biasId).toBe("confirmation");
      expect(result.overallBiasRisk).toBe(45);
      expect(result.riskLevel).toBe("moderate");

      // Should be stored
      expect(getBiasAnalysis("user-1")).toBeDefined();
    });

    it("maps risk levels correctly", async () => {
      recordBiasActivity(makeActivity("user-high"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({ detectedBiases: [], overallBiasRisk: 80, recommendations: [] })
      );
      const high = await analyzeBiases("user-high");
      expect(high.riskLevel).toBe("critical");

      clearBiasCalibrationData();
      recordBiasActivity(makeActivity("user-med"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({ detectedBiases: [], overallBiasRisk: 55, recommendations: [] })
      );
      const med = await analyzeBiases("user-med");
      expect(med.riskLevel).toBe("high");
    });
  });

  describe("activity log bounding", () => {
    it("bounds activities to 5000 per user", () => {
      for (let i = 0; i < 5010; i++) {
        recordBiasActivity(makeActivity("user-bound", "investigate"));
      }
      const activities = getUserActivities("user-bound");
      expect(activities).toHaveLength(5000);
    });
  });

  describe("generateDebiasingChallenges with analysis", () => {
    it("generates challenges targeting detected biases", async () => {
      recordBiasActivity(makeActivity("user-ch"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [
            { biasId: "anchoring", confidence: 0.8, evidence: ["E"], severity: "high" },
          ],
          overallBiasRisk: 60,
          recommendations: [],
        })
      );
      await analyzeBiases("user-ch");

      const challenges = generateDebiasingChallenges("user-ch");
      expect(challenges.length).toBeGreaterThan(0);
      expect(challenges[0].biasId).toBe("anchoring");
      expect(challenges[0].status).toBe("available");
      expect(challenges[0].points).toBe(100); // high severity
    });
  });

  describe("completeDebiasingChallenge status transitions", () => {
    it("marks challenge as completed with timestamp", async () => {
      recordBiasActivity(makeActivity("user-comp"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [
            { biasId: "confirmation", confidence: 0.6, evidence: [], severity: "medium" },
          ],
          overallBiasRisk: 30,
          recommendations: [],
        })
      );
      await analyzeBiases("user-comp");
      const challenges = generateDebiasingChallenges("user-comp");
      expect(challenges.length).toBeGreaterThan(0);

      const completed = completeDebiasingChallenge("user-comp", challenges[0].id);
      expect(completed).toBeDefined();
      expect(completed!.status).toBe("completed");
      expect(completed!.completedAt).toBeDefined();
    });

    it("returns undefined for already-completed challenge", async () => {
      recordBiasActivity(makeActivity("user-done"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [
            { biasId: "groupthink", confidence: 0.5, evidence: [], severity: "low" },
          ],
          overallBiasRisk: 20,
          recommendations: [],
        })
      );
      await analyzeBiases("user-done");
      const challenges = generateDebiasingChallenges("user-done");

      completeDebiasingChallenge("user-done", challenges[0].id);
      const second = completeDebiasingChallenge("user-done", challenges[0].id);
      expect(second).toBeUndefined();
    });
  });

  describe("buildTeamBiasDashboard with analysis data", () => {
    it("aggregates team bias profile from multiple users", async () => {
      recordBiasActivity(makeActivity("u1"));
      recordBiasActivity(makeActivity("u2"));

      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [
            { biasId: "confirmation", confidence: 0.8, evidence: [], severity: "high" },
          ],
          overallBiasRisk: 60,
          recommendations: [],
        })
      );
      await analyzeBiases("u1");
      await analyzeBiases("u2");

      const dashboard = buildTeamBiasDashboard("team-1", ["u1", "u2"]);
      expect(dashboard.memberAnalyses).toHaveLength(2);
      expect(dashboard.teamRiskScore).toBe(60);

      const confirmBias = dashboard.teamBiasProfile.find((b) => b.biasId === "confirmation");
      expect(confirmBias).toBeDefined();
      expect(confirmBias!.prevalence).toBe(1.0); // both users
      expect(confirmBias!.avgConfidence).toBe(0.8);
    });

    it("includes team recommendations for high prevalence", async () => {
      recordBiasActivity(makeActivity("u3"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [
            { biasId: "anchoring", confidence: 0.9, evidence: [], severity: "high" },
          ],
          overallBiasRisk: 70,
          recommendations: [],
        })
      );
      await analyzeBiases("u3");

      const dashboard = buildTeamBiasDashboard("team-2", ["u3"]);
      expect(dashboard.teamRecommendations.length).toBeGreaterThan(0);
    });

    it("single user dashboard works", async () => {
      recordBiasActivity(makeActivity("solo"));
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          detectedBiases: [],
          overallBiasRisk: 10,
          recommendations: [],
        })
      );
      await analyzeBiases("solo");

      const dashboard = buildTeamBiasDashboard("team-solo", ["solo"]);
      expect(dashboard.memberAnalyses).toHaveLength(1);
      expect(dashboard.teamRiskScore).toBe(10);
    });
  });
});
