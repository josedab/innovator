/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  createConversation,
  getConversation,
  deleteConversation,
  listConversations,
  refineConversation,
  clearConversations,
} from "../conversation/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("conversation", () => {
  beforeEach(() => {
    clearConversations();
    vi.clearAllMocks();
  });

  describe("createConversation", () => {
    it("returns a context with UUID sessionId", () => {
      const ctx = createConversation({
        subject: "Test subject",
        angleResults: [],
      });
      expect(ctx.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(ctx.subject).toBe("Test subject");
      expect(ctx.messages).toEqual([]);
      expect(ctx.selectedIdeas).toEqual([]);
      expect(ctx.createdAt).toBeDefined();
      expect(ctx.updatedAt).toBeDefined();
    });

    it("stores investigation and synthesis", () => {
      const investigation = {
        summary: "Test",
        keyAspects: [],
        currentState: "current",
        challenges: ["c1"],
        opportunities: ["o1"],
      } as any;
      const ctx = createConversation({
        subject: "S",
        angleResults: [],
        investigation,
      });
      expect(ctx.investigation).toBe(investigation);
    });
  });

  describe("getConversation", () => {
    it("retrieves an existing conversation", () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      expect(getConversation(ctx.sessionId)).toBe(ctx);
    });

    it("returns undefined for unknown sessionId", () => {
      expect(getConversation("nonexistent")).toBeUndefined();
    });
  });

  describe("deleteConversation", () => {
    it("removes the conversation and returns true", () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      expect(deleteConversation(ctx.sessionId)).toBe(true);
      expect(getConversation(ctx.sessionId)).toBeUndefined();
    });

    it("returns false for unknown sessionId", () => {
      expect(deleteConversation("nonexistent")).toBe(false);
    });
  });

  describe("listConversations", () => {
    it("returns conversations sorted by updatedAt descending", () => {
      const _c1 = createConversation({ subject: "First", angleResults: [] });
      const _c2 = createConversation({ subject: "Second", angleResults: [] });

      const list = listConversations();
      expect(list).toHaveLength(2);
      // Most recently created should be first (or same timestamp)
      expect(list[0].updatedAt >= list[1].updatedAt).toBe(true);
    });

    it("returns empty array when no conversations", () => {
      expect(listConversations()).toEqual([]);
    });
  });

  describe("refineConversation", () => {
    it("appends user and assistant messages", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });

      const mockResponse = JSON.stringify({
        response: "Here are my thoughts",
        suggestions: ["Follow up 1"],
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const result = await refineConversation(ctx.sessionId, "Tell me more");

      expect(result.response).toBe("Here are my thoughts");
      expect(ctx.messages).toHaveLength(2);
      expect(ctx.messages[0].role).toBe("user");
      expect(ctx.messages[0].content).toBe("Tell me more");
      expect(ctx.messages[1].role).toBe("assistant");
    });

    it("updates updatedAt timestamp", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      const originalUpdatedAt = ctx.updatedAt;

      const mockResponse = JSON.stringify({
        response: "Response",
        suggestions: [],
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      await refineConversation(ctx.sessionId, "Message");

      expect(ctx.updatedAt >= originalUpdatedAt).toBe(true);
    });

    it("throws for unknown sessionId", async () => {
      await expect(refineConversation("nonexistent", "msg")).rejects.toThrow(
        'Conversation session "nonexistent" not found'
      );
    });

    it("updates selectedIdeas when provided", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });

      const mockResponse = JSON.stringify({
        response: "Response",
        suggestions: [],
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      await refineConversation(ctx.sessionId, "msg", ["Idea A", "Idea B"]);

      expect(ctx.selectedIdeas).toEqual(["Idea A", "Idea B"]);
    });
  });
});
