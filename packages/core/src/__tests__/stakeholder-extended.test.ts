import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

import {
  simulatePersonaReaction,
  simulateStakeholders,
  simulateStakeholdersBatch,
  DEFAULT_PERSONAS,
  StakeholderReactionSchema,
  StakeholderSimulationSchema,
  StakeholderPersonaSchema,
} from "../simulation/stakeholder.js";
import type { StakeholderPersona } from "../simulation/stakeholder.js";
import type { InnovationIdea } from "../types.js";

const testIdea: InnovationIdea = {
  title: "AI Code Assistant",
  description: "An AI tool that helps developers write code faster",
  potentialImpact: "2x developer productivity",
  implementationHint: "Use LLMs fine-tuned on code",
};

function makeReactionJson(persona: StakeholderPersona, enthusiasm = 7) {
  return JSON.stringify({
    personaId: persona.id,
    personaName: persona.name,
    enthusiasm,
    concerns: ["Cost concern"],
    opportunities: ["Productivity boost"],
    likelyAction: "Adopt with caution",
    quote: "Interesting concept",
  });
}

describe("simulation/stakeholder (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEFAULT_PERSONAS completeness", () => {
    it("has 6 default personas", () => {
      expect(DEFAULT_PERSONAS).toHaveLength(6);
    });

    it("each persona validates against StakeholderPersonaSchema", () => {
      for (const persona of DEFAULT_PERSONAS) {
        expect(() => StakeholderPersonaSchema.parse(persona)).not.toThrow();
      }
    });

    it("includes all expected persona IDs", () => {
      const ids = DEFAULT_PERSONAS.map((p) => p.id);
      expect(ids).toContain("early-adopter");
      expect(ids).toContain("enterprise-buyer");
      expect(ids).toContain("investor");
      expect(ids).toContain("regulator");
      expect(ids).toContain("competitor");
      expect(ids).toContain("end-user");
    });

    it("each persona has at least one priority", () => {
      for (const persona of DEFAULT_PERSONAS) {
        expect(persona.priorities.length).toBeGreaterThan(0);
      }
    });

    it("risk tolerance values are valid", () => {
      for (const persona of DEFAULT_PERSONAS) {
        expect(["low", "medium", "high"]).toContain(persona.riskTolerance);
      }
    });
  });

  describe("simulatePersonaReaction schema validation", () => {
    it("returns valid StakeholderReactionSchema", async () => {
      const persona = DEFAULT_PERSONAS[0];
      const json = makeReactionJson(persona, 8);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const reaction = await simulatePersonaReaction(testIdea, persona);

      expect(() => StakeholderReactionSchema.parse(reaction)).not.toThrow();
      expect(reaction.enthusiasm).toBeGreaterThanOrEqual(1);
      expect(reaction.enthusiasm).toBeLessThanOrEqual(10);
      expect(reaction.concerns).toBeInstanceOf(Array);
      expect(reaction.opportunities).toBeInstanceOf(Array);
      expect(reaction.likelyAction).toBeTruthy();
    });
  });

  describe("simulateStakeholders consensus scoring", () => {
    it("consensus score is average enthusiasm", async () => {
      const personas = [DEFAULT_PERSONAS[0], DEFAULT_PERSONAS[1]];

      const json1 = makeReactionJson(personas[0], 8);
      mockGenerateText.mockResolvedValueOnce(json1);
      mockExtractJson.mockReturnValueOnce(json1);

      const json2 = makeReactionJson(personas[1], 4);
      mockGenerateText.mockResolvedValueOnce(json2);
      mockExtractJson.mockReturnValueOnce(json2);

      const result = await simulateStakeholders(testIdea, personas);

      // Average of 8 and 4 = 6
      expect(result.consensusScore).toBe(6);
    });

    it("mostEnthusiastic is persona with highest enthusiasm", async () => {
      const personas = [DEFAULT_PERSONAS[0], DEFAULT_PERSONAS[1], DEFAULT_PERSONAS[2]];

      const json1 = makeReactionJson(personas[0], 3);
      mockGenerateText.mockResolvedValueOnce(json1);
      mockExtractJson.mockReturnValueOnce(json1);

      const json2 = makeReactionJson(personas[1], 9);
      mockGenerateText.mockResolvedValueOnce(json2);
      mockExtractJson.mockReturnValueOnce(json2);

      const json3 = makeReactionJson(personas[2], 5);
      mockGenerateText.mockResolvedValueOnce(json3);
      mockExtractJson.mockReturnValueOnce(json3);

      const result = await simulateStakeholders(testIdea, personas);

      expect(result.mostEnthusiastic).toBe(personas[1].name);
    });

    it("mostConcerned is persona with lowest enthusiasm", async () => {
      const personas = [DEFAULT_PERSONAS[0], DEFAULT_PERSONAS[1]];

      const json1 = makeReactionJson(personas[0], 9);
      mockGenerateText.mockResolvedValueOnce(json1);
      mockExtractJson.mockReturnValueOnce(json1);

      const json2 = makeReactionJson(personas[1], 2);
      mockGenerateText.mockResolvedValueOnce(json2);
      mockExtractJson.mockReturnValueOnce(json2);

      const result = await simulateStakeholders(testIdea, personas);

      expect(result.mostConcerned).toBe(personas[1].name);
    });

    it("validates against StakeholderSimulationSchema", async () => {
      const personas = [DEFAULT_PERSONAS[0]];
      const json = makeReactionJson(personas[0]);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await simulateStakeholders(testIdea, personas);

      expect(() => StakeholderSimulationSchema.parse(result)).not.toThrow();
    });
  });

  describe("simulateStakeholdersBatch", () => {
    it("processes multiple ideas and returns results for each", async () => {
      const ideas = [
        testIdea,
        { ...testIdea, title: "Idea B" },
        { ...testIdea, title: "Idea C" },
      ];
      const persona = DEFAULT_PERSONAS[0];

      for (let i = 0; i < ideas.length; i++) {
        const json = makeReactionJson(persona);
        mockGenerateText.mockResolvedValueOnce(json);
        mockExtractJson.mockReturnValueOnce(json);
      }

      const results = await simulateStakeholdersBatch(ideas, [persona]);

      expect(results).toHaveLength(3);
      expect(results[0].ideaTitle).toBe("AI Code Assistant");
      expect(results[1].ideaTitle).toBe("Idea B");
      expect(results[2].ideaTitle).toBe("Idea C");
    });

    it("single persona failure doesn't crash batch", async () => {
      // Even if one persona in a simulation fails, the batch continues
      const ideas = [testIdea, { ...testIdea, title: "Idea 2" }];

      // First idea: all fail
      mockGenerateText.mockRejectedValueOnce(new Error("Fail 1"));

      // Second idea: succeeds
      const json = makeReactionJson(DEFAULT_PERSONAS[0]);
      mockGenerateText.mockResolvedValueOnce(json);
      mockExtractJson.mockReturnValueOnce(json);

      const results = await simulateStakeholdersBatch(ideas, [DEFAULT_PERSONAS[0]]);

      // Both should return results (first with fallback)
      expect(results).toHaveLength(2);
      expect(results[0].reactions[0].enthusiasm).toBe(5); // fallback
      expect(results[1].reactions[0].enthusiasm).toBe(7); // success
    });

    it("stops batch when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const results = await simulateStakeholdersBatch(
        [testIdea, testIdea],
        DEFAULT_PERSONAS,
        undefined,
        controller.signal
      );

      expect(results).toHaveLength(0);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("handles reaction without optional quote field", async () => {
      const persona = DEFAULT_PERSONAS[0];
      const json = JSON.stringify({
        personaId: persona.id,
        personaName: persona.name,
        enthusiasm: 7,
        concerns: ["Concern"],
        opportunities: ["Opp"],
        likelyAction: "Adopt",
      });
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const reaction = await simulatePersonaReaction(testIdea, persona);
      expect(reaction.quote).toBeUndefined();
    });
  });
});
