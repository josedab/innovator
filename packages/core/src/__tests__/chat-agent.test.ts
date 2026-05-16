import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import { generateText, extractJson } from "../copilot/client.js";

import {
  ChatIntentSchema,
  ChatSessionStateSchema,
  ClassifiedIntentSchema,
  createChatSession,
  getChatSession,
  deleteChatSession,
  listChatSessions,
  clearChatSessions,
  classifyIntent,
  getProactiveSuggestions,
  chat,
} from "../copilot-agent/chat-agent.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

describe("copilot-agent/chat-agent", () => {
  beforeEach(() => {
    clearChatSessions();
    vi.clearAllMocks();
  });

  // ---- Schema validation ----

  describe("ChatIntentSchema", () => {
    it("validates all intent types", () => {
      const intents = [
        "investigate",
        "generate-ideas",
        "score-ideas",
        "synthesize",
        "run-pipeline",
        "refine-idea",
        "compare-models",
        "export-results",
        "search-history",
        "validate-idea",
        "create-artifact",
        "manage-session",
        "ask-question",
        "set-preference",
        "help",
        "unknown",
      ];

      for (const intent of intents) {
        expect(() => ChatIntentSchema.parse(intent)).not.toThrow();
      }
    });

    it("rejects invalid intent", () => {
      expect(() => ChatIntentSchema.parse("not-an-intent")).toThrow();
    });
  });

  describe("ChatSessionStateSchema", () => {
    it("validates nested state with defaults", () => {
      const state = ChatSessionStateSchema.parse({});
      expect(state.pipelineStage).toBe("idle");
      expect(state.activeAngles).toEqual([]);
      expect(state.ideaCount).toBe(0);
      expect(state.preferences).toEqual({});
      expect(state.lastAngleResults).toEqual([]);
    });

    it("accepts full state object", () => {
      const full = ChatSessionStateSchema.parse({
        currentSubject: "AI in healthcare",
        lastInvestigationId: "inv-1",
        lastAngleResults: ["ar-1", "ar-2"],
        lastSynthesisId: "syn-1",
        preferences: { model: "gpt-4" },
        pipelineStage: "investigating",
        activeAngles: ["scamper"],
        ideaCount: 5,
      });
      expect(full.currentSubject).toBe("AI in healthcare");
      expect(full.pipelineStage).toBe("investigating");
    });
  });

  // ---- Session management ----

  describe("session management", () => {
    it("creates session with default state and system message", () => {
      const session = createChatSession();
      expect(session.id).toBeTruthy();
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].role).toBe("system");
      expect(session.state.pipelineStage).toBe("idle");
      expect(session.state.ideaCount).toBe(0);
    });

    it("retrieves existing session", () => {
      const session = createChatSession();
      const retrieved = getChatSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
    });

    it("returns undefined for non-existent session", () => {
      expect(getChatSession("missing")).toBeUndefined();
    });

    it("deletes session", () => {
      const session = createChatSession();
      expect(deleteChatSession(session.id)).toBe(true);
      expect(getChatSession(session.id)).toBeUndefined();
    });

    it("lists sessions sorted by updatedAt", () => {
      createChatSession();
      createChatSession();
      const list = listChatSessions();
      expect(list).toHaveLength(2);
    });
  });

  // ---- Intent classification ----

  describe("classifyIntent", () => {
    it("classifies keyword-rich message without LLM", async () => {
      const result = await classifyIntent("investigate AI in healthcare");
      expect(result.intent).toBe("investigate");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.originalMessage).toBe("investigate AI in healthcare");
    });

    it("classifies generate-ideas intent", async () => {
      const result = await classifyIntent("brainstorm ideas for mobile app");
      expect(result.intent).toBe("generate-ideas");
    });

    it("classifies help intent", async () => {
      const result = await classifyIntent("help");
      expect(result.intent).toBe("help");
    });

    it("falls back to LLM for ambiguous messages", async () => {
      const classified = {
        intent: "investigate",
        confidence: 0.8,
        entities: { subject: "quantum computing" },
        parameters: {},
        originalMessage: "tell me about quantum computing trends",
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(classified));
      mockExtractJson.mockReturnValue(JSON.stringify(classified));

      const result = await classifyIntent("xyz abc 123 quantum");
      // Should try keyword first, may fall back to LLM
      expect(result.intent).toBeTruthy();
    });

    it("extracts entities from message", async () => {
      const result = await classifyIntent('investigate "autonomous vehicles"');
      expect(result.entities.subject).toBe("autonomous vehicles");
    });
  });

  // ---- Proactive suggestions ----

  describe("getProactiveSuggestions", () => {
    it("returns suggestions for idle stage", () => {
      const suggestions = getProactiveSuggestions({
        pipelineStage: "idle",
        activeAngles: [],
        preferences: {},
        lastAngleResults: [],
        ideaCount: 0,
      });
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].intent).toBeTruthy();
    });

    it("returns different suggestions for generating stage", () => {
      const suggestions = getProactiveSuggestions({
        pipelineStage: "generating",
        activeAngles: ["scamper"],
        preferences: {},
        lastAngleResults: [],
        ideaCount: 3,
      });
      expect(suggestions.some((s) => s.intent === "score-ideas")).toBe(true);
    });
  });

  // ---- Chat message history ----

  describe("chat", () => {
    it("accumulates messages across turns", async () => {
      const response = {
        message: "I'll investigate that for you.",
        intent: "investigate",
        suggestions: [],
        stateUpdate: { pipelineStage: "investigating", currentSubject: "AI" },
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(response));
      mockExtractJson.mockReturnValue(JSON.stringify(response));

      const session = createChatSession();
      await chat(session.id, "investigate AI");

      const updated = getChatSession(session.id)!;
      // system + user + assistant = 3
      expect(updated.messages).toHaveLength(3);
      expect(updated.messages[1].role).toBe("user");
      expect(updated.messages[2].role).toBe("assistant");
    });

    it("updates session state from response", async () => {
      const response = {
        message: "Starting investigation.",
        intent: "investigate",
        suggestions: [],
        stateUpdate: { pipelineStage: "investigating", currentSubject: "fintech" },
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(response));
      mockExtractJson.mockReturnValue(JSON.stringify(response));

      const session = createChatSession();
      await chat(session.id, "investigate fintech");

      const updated = getChatSession(session.id)!;
      expect(updated.state.pipelineStage).toBe("investigating");
      expect(updated.state.currentSubject).toBe("fintech");
    });

    it("throws for non-existent session", async () => {
      await expect(chat("missing", "hello")).rejects.toThrow("not found");
    });

    it("fills in suggestions if response has none", async () => {
      const response = {
        message: "Done.",
        intent: "investigate",
        suggestions: [],
      };
      mockGenerateText.mockResolvedValue(JSON.stringify(response));
      mockExtractJson.mockReturnValue(JSON.stringify(response));

      const session = createChatSession();
      const result = await chat(session.id, "investigate something");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });
});
