/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  runStakeholderSimulation,
  stakeholderSimToMarkdown,
  detectCoalitions,
  STAKEHOLDER_PROFILES,
} from "../stakeholder-sim/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("stakeholder-sim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("STAKEHOLDER_PROFILES", () => {
    it("should define 12 stakeholder roles", () => {
      expect(Object.keys(STAKEHOLDER_PROFILES)).toHaveLength(12);
    });

    it("each profile should have priorities and risk tolerance", () => {
      for (const profile of Object.values(STAKEHOLDER_PROFILES)) {
        expect(profile.title).toBeTruthy();
        expect(profile.priorities.length).toBeGreaterThan(0);
        expect(["low", "medium", "high"]).toContain(profile.riskTolerance);
      }
    });
  });

  describe("runStakeholderSimulation", () => {
    it("should simulate stakeholder reactions", async () => {
      const reactionResponse = JSON.stringify({
        sentiment: "support",
        score: 7,
        reaction: "This aligns with our strategic direction",
        keyQuestions: ["What's the timeline?"],
        conditions: ["Need budget approval"],
        politicalImplications: "Could strengthen tech team influence",
      });

      const debateResponse = JSON.stringify({
        statement: "I agree with the CEO on this",
        respondingTo: "ceo",
        stance: "support",
      });

      let callIdx = 0;
      mockGenerateText.mockImplementation(async () => {
        callIdx++;
        if (callIdx <= 3) return reactionResponse;
        return debateResponse;
      });

      const result = await runStakeholderSimulation(
        "New AI Feature",
        "An AI-powered feature for our platform",
        { roles: ["ceo", "cto", "cfo"], debateRounds: 1 }
      );

      expect(result.ideaTitle).toBe("New AI Feature");
      expect(result.reactions.length).toBe(3);
      expect(result.politicalFeasibilityScore).toBeGreaterThan(0);
      expect(result.supportCoalition.length).toBeGreaterThan(0);
    });
  });

  describe("stakeholderSimToMarkdown", () => {
    it("should produce markdown report", () => {
      const md = stakeholderSimToMarkdown({
        ideaTitle: "Test Feature",
        ideaDescription: "A test feature",
        reactions: [
          {
            role: "ceo",
            sentiment: "support",
            score: 8,
            reaction: "Looks promising",
            keyQuestions: ["ROI?"],
            conditions: ["Board approval"],
            politicalImplications: "Strengthens innovation culture",
          },
        ],
        debate: [],
        politicalFeasibilityScore: 0.75,
        supportCoalition: ["ceo"],
        oppositionCoalition: [],
        criticalConditions: ["Board approval"],
        recommendation: "Proceed with confidence",
      });

      expect(md).toContain("Stakeholder Simulation Report");
      expect(md).toContain("Test Feature");
      expect(md).toContain("75%");
    });
  });

  describe("detectCoalitions", () => {
    it("should detect support coalition", () => {
      const reactions: any[] = [
        {
          role: "ceo",
          sentiment: "support",
          score: 8,
          reaction: "Good",
          keyQuestions: [],
          conditions: [],
          politicalImplications: "",
        },
        {
          role: "cto",
          sentiment: "support",
          score: 7,
          reaction: "Feasible",
          keyQuestions: [],
          conditions: [],
          politicalImplications: "",
        },
        {
          role: "cfo",
          sentiment: "opposed",
          score: 3,
          reaction: "Too expensive",
          keyQuestions: [],
          conditions: [],
          politicalImplications: "",
        },
      ];
      const coalitions = detectCoalitions(reactions, []);
      const proCoalition = coalitions.find((c: { alignment: string }) =>
        c.alignment.includes("Support")
      );
      expect(proCoalition).toBeDefined();
      expect(proCoalition!.members).toContain("ceo");
      expect(proCoalition!.members).toContain("cto");
    });
  });
});
