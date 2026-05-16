import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  classifyIntent,
  recordMemory,
  getSessionMemory,
  recordFeedback,
  generateProactiveSuggestions,
  getMemoryStats,
  enrichSessionContext,
  recordClassificationOutcome,
  getClassificationAccuracy,
  clearMemoryStore,
} from "../nl-innovation-api/context-memory.js";

describe("nl-innovation-api/context-memory", () => {
  beforeEach(() => {
    clearMemoryStore();
  });

  describe("classifyIntent", () => {
    it("classifies investigation intents", () => {
      const result = classifyIntent("Investigate renewable energy trends");
      expect(result.category).toBe("investigate");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("classifies generation intents", () => {
      const result = classifyIntent("Generate ideas for a new mobile app using SCAMPER");
      expect(result.category).toBe("generate");
      expect(result.entities.angles).toContain("scamper");
    });

    it("classifies comparison intents", () => {
      const result = classifyIntent("Compare my last 3 sessions side by side");
      expect(result.category).toBe("compare");
    });

    it("extracts subject entities", () => {
      const result = classifyIntent("Investigate ideas about blockchain supply chains");
      expect(result.entities.subject).toBeDefined();
    });

    it("extracts model entity", () => {
      const result = classifyIntent("Generate ideas using gpt-4.1");
      expect(result.entities.model).toBe("gpt-4.1");
    });

    it("returns unknown for unrecognized inputs", () => {
      const result = classifyIntent("xyzzy");
      expect(result.category).toBe("unknown");
      expect(result.confidence).toBe(0);
    });
  });

  describe("session memory", () => {
    it("records and retrieves memory entries", () => {
      const intent = classifyIntent("Investigate AI in healthcare");
      recordMemory({ sessionId: "s1", intent });
      const memory = getSessionMemory("s1");
      expect(memory).toHaveLength(1);
      expect(memory[0].intent.category).toBe("investigate");
    });

    it("records feedback", () => {
      const intent = classifyIntent("Generate ideas for robotics");
      const entry = recordMemory({ sessionId: "s1", intent });
      const ok = recordFeedback("s1", entry.id, "positive");
      expect(ok).toBe(true);
      const memory = getSessionMemory("s1");
      expect(memory[0].feedback).toBe("positive");
    });

    it("returns empty for unknown session", () => {
      expect(getSessionMemory("nonexistent")).toEqual([]);
    });
  });

  describe("proactive suggestions", () => {
    it("suggests getting started for new sessions", () => {
      const suggestions = generateProactiveSuggestions("new-session");
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe("learn");
    });

    it("suggests generation after investigation", () => {
      const intent = classifyIntent("Investigate renewable energy");
      recordMemory({ sessionId: "s1", intent });
      const suggestions = generateProactiveSuggestions("s1");
      expect(suggestions.some((s) => s.type === "continue")).toBe(true);
    });

    it("suggests scoring after generation", () => {
      recordMemory({
        sessionId: "s1",
        intent: classifyIntent("Generate ideas for fintech"),
      });
      const suggestions = generateProactiveSuggestions("s1");
      expect(suggestions.some((s) => s.text.toLowerCase().includes("score"))).toBe(true);
    });
  });

  describe("memory stats", () => {
    it("returns empty stats for no data", () => {
      const stats = getMemoryStats("nonexistent");
      expect(stats.totalInteractions).toBe(0);
    });

    it("computes stats correctly", () => {
      recordMemory({ sessionId: "s1", intent: classifyIntent("Investigate AI") });
      recordMemory({ sessionId: "s1", intent: classifyIntent("Generate ideas") });
      recordMemory({ sessionId: "s1", intent: classifyIntent("Investigate biotech") });

      const stats = getMemoryStats("s1");
      expect(stats.totalInteractions).toBe(3);
      expect(stats.topCategory).toBe("investigate");
    });
  });

  describe("enrichSessionContext", () => {
    it("enriches context with past sessions", () => {
      recordMemory({
        sessionId: "s1",
        intent: classifyIntent("Investigate about renewable energy"),
      });

      const context = enrichSessionContext("s1", {
        pastSessions: [
          {
            id: "old-1",
            subject: "Renewable energy policy",
            createdAt: "2025-01-01",
            angleResults: [{ angleId: "scamper" }],
          },
        ],
      });
      expect(context.recurringSessions.length).toBeGreaterThan(0);
      expect(context.suggestedAngles.length).toBeGreaterThan(0);
    });

    it("includes temporal concepts", () => {
      recordMemory({ sessionId: "s2", intent: classifyIntent("Investigate AI") });
      const context = enrichSessionContext("s2", {
        temporalConcepts: [
          { label: "machine-learning", weight: 0.9 },
          { label: "deep-learning", weight: 0.7 },
        ],
      });
      expect(context.relatedConcepts).toContain("machine-learning");
      expect(context.temporalInsights.length).toBeGreaterThan(0);
    });

    it("works without past data", () => {
      const context = enrichSessionContext("empty-session");
      expect(context.recentSubjects).toEqual([]);
      expect(context.recurringSessions).toEqual([]);
    });
  });

  describe("classification accuracy", () => {
    it("tracks accuracy metrics", () => {
      recordClassificationOutcome("investigate", "investigate");
      recordClassificationOutcome("generate", "generate");
      recordClassificationOutcome("investigate", "generate");
      recordClassificationOutcome("investigate", "investigate");

      const acc = getClassificationAccuracy();
      expect(acc.totalClassifications).toBe(4);
      expect(acc.correctClassifications).toBe(3);
      expect(acc.accuracy).toBe(0.75);
      expect(acc.meetsTarget).toBe(false);
    });

    it("reports meeting target at 80%+", () => {
      for (let i = 0; i < 8; i++) {
        recordClassificationOutcome("investigate", "investigate");
      }
      recordClassificationOutcome("investigate", "generate");
      recordClassificationOutcome("generate", "generate");

      const acc = getClassificationAccuracy();
      expect(acc.accuracy).toBe(0.9);
      expect(acc.meetsTarget).toBe(true);
    });

    it("returns per-category breakdown", () => {
      recordClassificationOutcome("investigate", "investigate");
      recordClassificationOutcome("generate", "generate");
      recordClassificationOutcome("investigate", "generate");

      const acc = getClassificationAccuracy();
      expect(acc.byCategory["investigate"]).toBeDefined();
      expect(acc.byCategory["generate"]).toBeDefined();
    });
  });
});
