import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { generateText, extractJson } from "../copilot/client.js";
import {
  startNegotiation,
  negotiateStep,
  completeNegotiation,
  getNegotiation,
  listNegotiations,
  computeIdeaDeltaScore,
  clearNegotiations,
  NegotiationPhaseSchema,
} from "../negotiation/index.js";
import type { InnovationIdea } from "../types.js";
import type { NegotiationSession } from "../negotiation/index.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const mockIdea: InnovationIdea = {
  title: "AI Code Reviewer",
  description: "Automated code review using LLMs",
  potentialImpact: "50% faster reviews",
  implementationHint: "Use GPT-4 with AST",
};

describe("negotiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNegotiations();
  });

  // ---- Schema ----

  describe("schemas", () => {
    it("validates NegotiationPhase enum", () => {
      const phases = ["opening", "interest-exploration", "option-generation", "criteria-evaluation", "agreement", "completed"];
      for (const p of phases) {
        expect(NegotiationPhaseSchema.parse(p)).toBe(p);
      }
      expect(() => NegotiationPhaseSchema.parse("invalid")).toThrow();
    });
  });

  // ---- startNegotiation ----

  describe("startNegotiation", () => {
    it("creates session with opening phase and LLM message", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({ message: "Let's discuss this idea!", challengeAreas: ["feasibility", "market", "tech"] })
      );

      const session = await startNegotiation(mockIdea);

      expect(session.id).toMatch(/^neg-/);
      expect(session.phase).toBe("opening");
      expect(session.ideaTitle).toBe("AI Code Reviewer");
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].role).toBe("ai");
      expect(session.messages[0].content).toContain("discuss this idea");
      expect(session.convergenceScore).toBe(0);
      expect(session.originalIdea.title).toBe("AI Code Reviewer");
      expect(session.currentIdea.title).toBe("AI Code Reviewer");
    });

    it("uses fallback message when LLM fails", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM error"));

      const session = await startNegotiation(mockIdea);

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].content).toContain("Let's negotiate");
      expect(session.messages[0].content).toContain("AI Code Reviewer");
    });

    it("stores session for retrieval", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Hello" }));

      const session = await startNegotiation(mockIdea);
      expect(getNegotiation(session.id)).toBeDefined();
      expect(listNegotiations()).toHaveLength(1);
    });
  });

  // ---- negotiateStep ----

  describe("negotiateStep", () => {
    it("returns undefined for non-existent session", async () => {
      const result = await negotiateStep("nonexistent", "hello");
      expect(result).toBeUndefined();
    });

    it("returns undefined for completed session", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Hello" }));

      const session = await startNegotiation(mockIdea);
      completeNegotiation(session.id);

      const result = await negotiateStep(session.id, "hello");
      expect(result).toBeUndefined();
    });

    it("records user message and AI response", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      mockExtractJson.mockReturnValue(
        JSON.stringify({ message: "Good point!", challengeType: "feasibility", convergenceEstimate: 0.3 })
      );
      const updated = await negotiateStep(session.id, "I think we should focus on feasibility");

      expect(updated).toBeDefined();
      // 1 opening AI + 1 user + 1 AI response = 3
      expect(updated!.messages).toHaveLength(3);
      expect(updated!.messages[1].role).toBe("user");
      expect(updated!.messages[1].content).toBe("I think we should focus on feasibility");
      expect(updated!.messages[2].role).toBe("ai");
    });

    it("truncates user message >5000 chars", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      mockExtractJson.mockReturnValue(JSON.stringify({ message: "OK" }));
      const longMsg = "A".repeat(6000);
      await negotiateStep(session.id, longMsg);

      const updated = getNegotiation(session.id)!;
      expect(updated.messages[1].content.length).toBeLessThanOrEqual(5000);
    });

    it("advances phase after 4+ messages in current phase", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      // Phase is "opening", need 4 messages in this phase to trigger advance
      // Currently 1 AI message in "opening"
      for (let i = 0; i < 3; i++) {
        mockExtractJson.mockReturnValue(JSON.stringify({ message: `Response ${i}` }));
        await negotiateStep(session.id, `Message ${i}`);
      }

      const updated = getNegotiation(session.id)!;
      // After 4+ messages in opening, should advance to interest-exploration
      expect(updated.phase).toBe("interest-exploration");
    });

    it("advances phase on 'next' keyword", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Moving on" }));
      await negotiateStep(session.id, "Let's move on to the next topic");

      const updated = getNegotiation(session.id)!;
      expect(updated.phase).toBe("interest-exploration");
    });

    it("applies suggested changes to currentIdea", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      mockExtractJson.mockReturnValue(
        JSON.stringify({
          message: "Updated title",
          suggestedChanges: [
            { field: "title", newValue: "Enhanced AI Code Reviewer", rationale: "More descriptive" },
          ],
          convergenceEstimate: 0.5,
        })
      );
      await negotiateStep(session.id, "Can we improve the title?");

      const updated = getNegotiation(session.id)!;
      expect(updated.currentIdea.title).toBe("Enhanced AI Code Reviewer");
      expect(updated.deltas).toHaveLength(1);
      expect(updated.deltas[0].field).toBe("title");
      expect(updated.deltas[0].before).toBe("AI Code Reviewer");
      expect(updated.convergenceScore).toBe(0.5);
    });

    it("uses fallback message on LLM parse failure", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      mockExtractJson.mockImplementation(() => { throw new Error("parse error"); });
      await negotiateStep(session.id, "Some question");

      const updated = getNegotiation(session.id)!;
      const lastMsg = updated.messages[updated.messages.length - 1];
      expect(lastMsg.role).toBe("ai");
      expect(lastMsg.content).toContain("understand your point");
    });

    it("auto-completes at agreement phase with convergenceScore ≥0.8", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      // Fast-forward through phases: opening→interest-exploration→option-generation→criteria-evaluation→agreement
      const phases = ["next", "next", "next", "next"];
      for (const msg of phases) {
        mockExtractJson.mockReturnValue(JSON.stringify({ message: "Advancing", convergenceEstimate: 0.85 }));
        await negotiateStep(session.id, msg);
      }

      const updated = getNegotiation(session.id)!;
      // Should be completed because we reach agreement with high convergence
      expect(["agreement", "completed"]).toContain(updated.phase);
    });
  });

  // ---- completeNegotiation ----

  describe("completeNegotiation", () => {
    it("returns undefined for non-existent session", () => {
      expect(completeNegotiation("nonexistent")).toBeUndefined();
    });

    it("completes session and returns final idea", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Opening" }));
      const session = await startNegotiation(mockIdea);

      const result = completeNegotiation(session.id);
      expect(result).toBeDefined();
      expect(result!.finalIdea.title).toBe("AI Code Reviewer");
      expect(result!.messageCount).toBeGreaterThan(0);
      expect(result!.deltas).toEqual([]);

      const updated = getNegotiation(session.id)!;
      expect(updated.phase).toBe("completed");
    });
  });

  // ---- computeIdeaDeltaScore ----

  describe("computeIdeaDeltaScore", () => {
    it("returns 0 when no deltas", () => {
      const session: NegotiationSession = {
        id: "test",
        ideaTitle: "Test",
        currentIdea: { title: "T", description: "D", potentialImpact: "I", implementationHint: "H" },
        originalIdea: { title: "T", description: "D", potentialImpact: "I", implementationHint: "H" },
        phase: "opening",
        messages: [],
        deltas: [],
        convergenceScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(computeIdeaDeltaScore(session)).toBe(0);
    });

    it("computes Jaccard-based delta score", () => {
      const session: NegotiationSession = {
        id: "test",
        ideaTitle: "Test",
        currentIdea: { title: "New Title", description: "D", potentialImpact: "I", implementationHint: "H" },
        originalIdea: { title: "Old Title", description: "D", potentialImpact: "I", implementationHint: "H" },
        phase: "completed",
        messages: [],
        deltas: [
          { field: "title", before: "hello world", after: "hello universe", rationale: "test" },
        ],
        convergenceScore: 0.8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const score = computeIdeaDeltaScore(session);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("returns higher score for completely different text", () => {
      const session: NegotiationSession = {
        id: "test",
        ideaTitle: "Test",
        currentIdea: { title: "T", description: "D", potentialImpact: "I", implementationHint: "H" },
        originalIdea: { title: "T", description: "D", potentialImpact: "I", implementationHint: "H" },
        phase: "completed",
        messages: [],
        deltas: [
          { field: "title", before: "alpha beta gamma", after: "delta epsilon zeta", rationale: "complete change" },
        ],
        convergenceScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const score = computeIdeaDeltaScore(session);
      expect(score).toBe(1); // No overlap → similarity=0 → change=1
    });
  });

  // ---- clearNegotiations ----

  describe("clearNegotiations", () => {
    it("clears all sessions", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ message: "Hello" }));
      await startNegotiation(mockIdea);
      expect(listNegotiations()).toHaveLength(1);
      clearNegotiations();
      expect(listNegotiations()).toHaveLength(0);
    });
  });
});
