import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return raw.slice(start, end + 1);
  }),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, text: string) => `[${label}]: ${text}`),
  sanitizeLlmOutput: vi.fn((text: string) => text),
}));

import { generateText } from "../copilot/client.js";
import {
  startCoachSession,
  sendCoachMessage,
  getCoachSession,
  listCoachSessions,
  endCoachSession,
  clearCoachSessions,
} from "../coaching/coach-session.js";

const mockGenerateText = vi.mocked(generateText);

const MOCK_START_RESPONSE = JSON.stringify({
  message: "Welcome! Let's explore this subject. What specific problem are you trying to solve?",
  suggestedAngles: ["first-principles", "what-if"],
});

const MOCK_MESSAGE_RESPONSE = JSON.stringify({
  message: "That's an interesting perspective. Let's dig deeper.",
  suggestedAngles: ["scamper"],
  readyToInvestigate: false,
});

describe("coach-session", () => {
  beforeEach(() => {
    clearCoachSessions();
    vi.clearAllMocks();
  });

  describe("startCoachSession", () => {
    it("creates a session with system and coach messages", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      const session = await startCoachSession("AI in healthcare");
      expect(session.id).toBeDefined();
      expect(session.subject).toBe("AI in healthcare");
      expect(session.status).toBe("active");
      expect(session.messages).toHaveLength(2);
      expect(session.messages[0].role).toBe("system");
      expect(session.messages[1].role).toBe("coach");
      expect(session.suggestedAngles).toContain("first-principles");
    });

    it("detects healthcare domain", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      const session = await startCoachSession("patient health monitoring system");
      expect(session.domain).toBeDefined();
      expect(session.domain!.id).toBe("healthcare");
    });

    it("detects fintech domain", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      const session = await startCoachSession("mobile banking payment platform");
      expect(session.domain).toBeDefined();
      expect(session.domain!.id).toBe("fintech");
    });

    it("detects AI domain", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      const session = await startCoachSession("artificial intelligence model optimization");
      expect(session.domain).toBeDefined();
      expect(session.domain!.id).toBe("ai");
    });

    it("no domain for generic subject", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      const session = await startCoachSession("general productivity tools");
      expect(session.domain).toBeUndefined();
    });

    it("falls back to domain angles when LLM returns empty", async () => {
      mockGenerateText.mockResolvedValue(
        JSON.stringify({ message: "Welcome", suggestedAngles: [] })
      );

      const session = await startCoachSession("patient health monitoring");
      // Should use healthcare domain angles as fallback
      expect(session.suggestedAngles.length).toBeGreaterThan(0);
    });

    it("uses specified personality", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      await startCoachSession("test", { personality: "provocateur" });
      const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.prompt).toContain("provocative");
    });

    it("stores session for retrieval", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);

      const session = await startCoachSession("test");
      expect(getCoachSession(session.id)).toBe(session);
    });
  });

  describe("sendCoachMessage", () => {
    it("appends user and coach messages", async () => {
      mockGenerateText.mockResolvedValueOnce(MOCK_START_RESPONSE);
      const session = await startCoachSession("test");

      mockGenerateText.mockResolvedValueOnce(MOCK_MESSAGE_RESPONSE);
      const updated = await sendCoachMessage(session.id, "Tell me more");

      expect(updated).toBeDefined();
      // system + coach (start) + user + coach (reply)
      expect(updated!.messages).toHaveLength(4);
      expect(updated!.messages[2].role).toBe("user");
      expect(updated!.messages[2].content).toBe("Tell me more");
      expect(updated!.messages[3].role).toBe("coach");
    });

    it("updates suggestedAngles when LLM provides them", async () => {
      mockGenerateText.mockResolvedValueOnce(MOCK_START_RESPONSE);
      const session = await startCoachSession("test");

      mockGenerateText.mockResolvedValueOnce(MOCK_MESSAGE_RESPONSE);
      const updated = await sendCoachMessage(session.id, "msg");

      expect(updated!.suggestedAngles).toContain("scamper");
    });

    it("returns undefined for non-existent session", async () => {
      const result = await sendCoachMessage("nonexistent", "msg");
      expect(result).toBeUndefined();
    });

    it("returns undefined for completed session", async () => {
      mockGenerateText.mockResolvedValueOnce(MOCK_START_RESPONSE);
      const session = await startCoachSession("test");
      endCoachSession(session.id);

      const result = await sendCoachMessage(session.id, "msg");
      expect(result).toBeUndefined();
    });

    it("uses personality from config", async () => {
      mockGenerateText.mockResolvedValueOnce(MOCK_START_RESPONSE);
      const session = await startCoachSession("test");

      mockGenerateText.mockResolvedValueOnce(MOCK_MESSAGE_RESPONSE);
      await sendCoachMessage(session.id, "msg", { personality: "analytical" });

      const callArgs = mockGenerateText.mock.calls[1][0] as Record<string, unknown>;
      expect(callArgs.prompt).toContain("analytical");
    });
  });

  describe("getCoachSession", () => {
    it("returns undefined for non-existent", () => {
      expect(getCoachSession("bad-id")).toBeUndefined();
    });
  });

  describe("listCoachSessions", () => {
    it("returns sessions sorted by updatedAt descending", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);
      await startCoachSession("First");
      await startCoachSession("Second");

      const list = listCoachSessions();
      expect(list).toHaveLength(2);
      expect(list[0].updatedAt >= list[1].updatedAt).toBe(true);
    });

    it("returns empty when no sessions", () => {
      expect(listCoachSessions()).toHaveLength(0);
    });
  });

  describe("endCoachSession", () => {
    it("marks session as completed", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);
      const session = await startCoachSession("test");

      expect(endCoachSession(session.id)).toBe(true);
      expect(getCoachSession(session.id)!.status).toBe("completed");
    });

    it("stores feedback score clamped to 1-5", async () => {
      mockGenerateText.mockResolvedValue(MOCK_START_RESPONSE);
      const session = await startCoachSession("test");

      endCoachSession(session.id, 4);
      expect(getCoachSession(session.id)!.feedbackScore).toBe(4);
    });

    it("returns false for non-existent session", () => {
      expect(endCoachSession("bad-id")).toBe(false);
    });
  });
});
