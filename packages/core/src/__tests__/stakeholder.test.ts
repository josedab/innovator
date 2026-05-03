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

describe("simulation/stakeholder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("simulatePersonaReaction", () => {
    it("calls LLM with persona-specific prompt", async () => {
      const persona = DEFAULT_PERSONAS[0]; // early-adopter
      const reactionJson = makeReactionJson(persona, 8);
      mockGenerateText.mockResolvedValue(reactionJson);
      mockExtractJson.mockReturnValue(reactionJson);

      const reaction = await simulatePersonaReaction(testIdea, persona);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.prompt).toContain(persona.name);
      expect(callArgs.prompt).toContain(persona.description);
      expect(callArgs.prompt).toContain(testIdea.title);
      expect(reaction.personaId).toBe("early-adopter");
      expect(reaction.enthusiasm).toBe(8);
    });

    it("includes persona priorities in prompt", async () => {
      const persona = DEFAULT_PERSONAS[1]; // enterprise-buyer
      const reactionJson = makeReactionJson(persona);
      mockGenerateText.mockResolvedValue(reactionJson);
      mockExtractJson.mockReturnValue(reactionJson);

      await simulatePersonaReaction(testIdea, persona);

      const prompt = mockGenerateText.mock.calls[0][0].prompt;
      for (const priority of persona.priorities) {
        expect(prompt).toContain(priority);
      }
    });

    it("includes risk tolerance in prompt", async () => {
      const persona = DEFAULT_PERSONAS[3]; // regulator, low risk
      const reactionJson = makeReactionJson(persona);
      mockGenerateText.mockResolvedValue(reactionJson);
      mockExtractJson.mockReturnValue(reactionJson);

      await simulatePersonaReaction(testIdea, persona);

      const prompt = mockGenerateText.mock.calls[0][0].prompt;
      expect(prompt).toContain(persona.riskTolerance);
    });

    it("passes model and signal through", async () => {
      const persona = DEFAULT_PERSONAS[0];
      const reactionJson = makeReactionJson(persona);
      mockGenerateText.mockResolvedValue(reactionJson);
      mockExtractJson.mockReturnValue(reactionJson);

      const controller = new AbortController();
      await simulatePersonaReaction(testIdea, persona, "gpt-4", controller.signal);

      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.model).toBe("gpt-4");
      expect(callArgs.signal).toBe(controller.signal);
    });
  });

  describe("simulateStakeholders", () => {
    it("runs all personas in parallel", async () => {
      for (const persona of DEFAULT_PERSONAS) {
        const json = makeReactionJson(persona);
        mockGenerateText.mockResolvedValueOnce(json);
        mockExtractJson.mockReturnValueOnce(json);
      }

      const result = await simulateStakeholders(testIdea);

      expect(result.reactions).toHaveLength(DEFAULT_PERSONAS.length);
      expect(result.ideaTitle).toBe(testIdea.title);
      expect(result.consensusScore).toBeGreaterThanOrEqual(1);
      expect(result.consensusScore).toBeLessThanOrEqual(10);
      expect(result.mostEnthusiastic).toBeTruthy();
      expect(result.mostConcerned).toBeTruthy();
    });

    it("uses fallback when one persona fails", async () => {
      // First persona succeeds, second fails, rest succeed
      const succeeding = DEFAULT_PERSONAS[0];
      const successJson = makeReactionJson(succeeding, 9);
      mockGenerateText.mockResolvedValueOnce(successJson);
      mockExtractJson.mockReturnValueOnce(successJson);

      // Second persona fails
      mockGenerateText.mockRejectedValueOnce(new Error("LLM error"));

      // Rest succeed
      for (let i = 2; i < DEFAULT_PERSONAS.length; i++) {
        const json = makeReactionJson(DEFAULT_PERSONAS[i]);
        mockGenerateText.mockResolvedValueOnce(json);
        mockExtractJson.mockReturnValueOnce(json);
      }

      const result = await simulateStakeholders(testIdea);

      expect(result.reactions).toHaveLength(DEFAULT_PERSONAS.length);
      // The failed persona should have fallback values
      const failedReaction = result.reactions[1];
      expect(failedReaction.enthusiasm).toBe(5);
      expect(failedReaction.concerns).toContain("Simulation unavailable");
      expect(failedReaction.likelyAction).toBe("Unable to assess");
    });

    it("accepts custom persona list", async () => {
      const customPersonas: StakeholderPersona[] = [
        {
          id: "custom-1",
          name: "Custom Persona",
          description: "A custom test persona",
          priorities: ["testing"],
          riskTolerance: "high",
        },
      ];

      const json = makeReactionJson(customPersonas[0]);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await simulateStakeholders(testIdea, customPersonas);
      expect(result.reactions).toHaveLength(1);
    });

    it("identifies key debates from contrasting reactions", async () => {
      const personas = [DEFAULT_PERSONAS[0], DEFAULT_PERSONAS[1]];

      // High enthusiasm for first, low for second
      const json1 = makeReactionJson(personas[0], 9);
      mockGenerateText.mockResolvedValueOnce(json1);
      mockExtractJson.mockReturnValueOnce(json1);

      const json2 = makeReactionJson(personas[1], 3);
      mockGenerateText.mockResolvedValueOnce(json2);
      mockExtractJson.mockReturnValueOnce(json2);

      const result = await simulateStakeholders(testIdea, personas);
      // Diff of 6 >= 4, so should have a debate
      expect(result.keyDebates.length).toBeGreaterThan(0);
    });
  });

  describe("simulateStakeholdersBatch", () => {
    it("processes multiple ideas sequentially", async () => {
      const ideas = [testIdea, { ...testIdea, title: "Second Idea" }];

      // Mock for both ideas × all personas
      for (let i = 0; i < ideas.length * DEFAULT_PERSONAS.length; i++) {
        const personaIdx = i % DEFAULT_PERSONAS.length;
        const json = makeReactionJson(DEFAULT_PERSONAS[personaIdx]);
        mockGenerateText.mockResolvedValueOnce(json);
        mockExtractJson.mockReturnValueOnce(json);
      }

      const results = await simulateStakeholdersBatch(ideas);
      expect(results).toHaveLength(2);
      expect(results[0].ideaTitle).toBe("AI Code Assistant");
      expect(results[1].ideaTitle).toBe("Second Idea");
    });

    it("respects AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      const results = await simulateStakeholdersBatch(
        [testIdea],
        undefined,
        undefined,
        controller.signal
      );
      expect(results).toHaveLength(0);
    });
  });
});
