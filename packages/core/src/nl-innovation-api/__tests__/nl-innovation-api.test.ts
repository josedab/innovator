import { vi } from "vitest";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue(JSON.stringify({
    steps: [
      { type: "investigate", description: "Research the topic", params: { subject: "test" }, order: 1 },
      { type: "generate", description: "Generate ideas", params: { angleId: "scamper" }, order: 2 },
    ],
  })),
  extractJson: vi.fn((s) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

import { describe, it, expect, beforeEach } from "vitest";
import {
  ConversationSession,
  conversationToMarkdown,
  ConversationMessageSchema,
  ExecutionStepSchema,
  ExecutionPlanSchema,
} from "../index.js";

describe("nl-innovation-api", () => {
  // ---- Zod Schemas ----

  describe("Zod schemas", () => {
    it("validates a ConversationMessage", () => {
      const result = ConversationMessageSchema.safeParse({
        role: "user",
        content: "hello",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid ConversationMessage role", () => {
      const result = ConversationMessageSchema.safeParse({
        role: "invalid",
        content: "hello",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it("validates an ExecutionStep with defaults", () => {
      const result = ExecutionStepSchema.safeParse({
        id: "step-1",
        type: "investigate",
        description: "Research topic",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("pending");
        expect(result.data.params).toEqual({});
      }
    });

    it("validates an ExecutionPlan", () => {
      const result = ExecutionPlanSchema.safeParse({
        id: "plan-1",
        prompt: "test prompt",
        steps: [
          { id: "s1", type: "investigate", description: "step 1" },
        ],
        createdAt: Date.now(),
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("pending");
      }
    });

    it("rejects invalid step type", () => {
      const result = ExecutionStepSchema.safeParse({
        id: "step-1",
        type: "nonexistent",
        description: "bad step",
      });
      expect(result.success).toBe(false);
    });
  });

  // ---- ConversationSession ----

  describe("ConversationSession", () => {
    let session: ConversationSession;

    beforeEach(() => {
      session = new ConversationSession();
    });

    it("constructor assigns unique id and createdAt", () => {
      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe("string");
      expect(session.createdAt).toBeDefined();
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it("two sessions have different ids", () => {
      const session2 = new ConversationSession();
      expect(session.id).not.toBe(session2.id);
    });

    it("accepts optional model parameter", () => {
      const s = new ConversationSession("gpt-4");
      expect(s.id).toBeDefined();
    });

    describe("addMessage", () => {
      it("adds a user message", () => {
        session.addMessage("user", "hello");
        const history = session.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].role).toBe("user");
        expect(history[0].content).toBe("hello");
        expect(history[0].timestamp).toBeDefined();
      });

      it("adds an assistant message", () => {
        session.addMessage("assistant", "hi there");
        const history = session.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].role).toBe("assistant");
      });

      it("adds a system message", () => {
        session.addMessage("system", "system init");
        const history = session.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].role).toBe("system");
      });

      it("maintains order of multiple messages", () => {
        session.addMessage("user", "first");
        session.addMessage("assistant", "second");
        session.addMessage("user", "third");
        const history = session.getHistory();
        expect(history).toHaveLength(3);
        expect(history[0].content).toBe("first");
        expect(history[1].content).toBe("second");
        expect(history[2].content).toBe("third");
      });
    });

    describe("getHistory", () => {
      it("returns empty array for new session", () => {
        expect(session.getHistory()).toEqual([]);
      });

      it("returns a copy (not a reference)", () => {
        session.addMessage("user", "test");
        const h1 = session.getHistory();
        const h2 = session.getHistory();
        expect(h1).toEqual(h2);
        expect(h1).not.toBe(h2);
      });
    });

    describe("getCurrentPlan", () => {
      it("returns null for new session", () => {
        expect(session.getCurrentPlan()).toBeNull();
      });
    });

    describe("getResults", () => {
      it("returns empty object for new session", () => {
        expect(session.getResults()).toEqual({});
      });

      it("returns a copy (not a reference)", () => {
        const r1 = session.getResults();
        const r2 = session.getResults();
        expect(r1).toEqual(r2);
        expect(r1).not.toBe(r2);
      });
    });

    describe("toState", () => {
      it("returns full session state for new session", () => {
        const state = session.toState();
        expect(state.id).toBe(session.id);
        expect(state.messages).toEqual([]);
        expect(state.currentPlan).toBeNull();
        expect(state.subject).toBeNull();
        expect(state.investigation).toBeNull();
        expect(state.results).toEqual({});
        expect(state.createdAt).toBe(session.createdAt);
      });

      it("includes messages after addMessage", () => {
        session.addMessage("user", "test message");
        session.addMessage("assistant", "response");
        const state = session.toState();
        expect(state.messages).toHaveLength(2);
        expect(state.messages[0].content).toBe("test message");
        expect(state.messages[1].content).toBe("response");
      });

      it("state matches ConversationSessionSchema shape", () => {
        session.addMessage("user", "hello");
        const state = session.toState();
        expect(state).toHaveProperty("id");
        expect(state).toHaveProperty("messages");
        expect(state).toHaveProperty("currentPlan");
        expect(state).toHaveProperty("subject");
        expect(state).toHaveProperty("investigation");
        expect(state).toHaveProperty("results");
        expect(state).toHaveProperty("createdAt");
      });
    });
  });

  // ---- conversationToMarkdown ----

  describe("conversationToMarkdown", () => {
    it("produces formatted markdown for empty session", () => {
      const session = new ConversationSession();
      const md = conversationToMarkdown(session);
      expect(md).toContain("# Innovation Conversation");
      expect(md).toContain(`**Session:** ${session.id}`);
      expect(md).toContain("**Created:**");
      expect(md).toContain("## Conversation");
    });

    it("does not include Subject line when subject is null", () => {
      const session = new ConversationSession();
      const md = conversationToMarkdown(session);
      expect(md).not.toContain("**Subject:**");
    });

    it("includes user messages with label", () => {
      const session = new ConversationSession();
      session.addMessage("user", "Explore AI in healthcare");
      const md = conversationToMarkdown(session);
      expect(md).toContain("🧑 User");
      expect(md).toContain("Explore AI in healthcare");
    });

    it("includes assistant messages with label", () => {
      const session = new ConversationSession();
      session.addMessage("assistant", "Here are the results");
      const md = conversationToMarkdown(session);
      expect(md).toContain("🤖 Assistant");
      expect(md).toContain("Here are the results");
    });

    it("includes system messages with label", () => {
      const session = new ConversationSession();
      session.addMessage("system", "System initialized");
      const md = conversationToMarkdown(session);
      expect(md).toContain("⚙️ System");
      expect(md).toContain("System initialized");
    });

    it("renders multiple messages in order", () => {
      const session = new ConversationSession();
      session.addMessage("user", "Message one");
      session.addMessage("assistant", "Message two");
      session.addMessage("user", "Message three");
      const md = conversationToMarkdown(session);
      const posOne = md.indexOf("Message one");
      const posTwo = md.indexOf("Message two");
      const posThree = md.indexOf("Message three");
      expect(posOne).toBeLessThan(posTwo);
      expect(posTwo).toBeLessThan(posThree);
    });

    it("does not include Execution Plan section when no plan exists", () => {
      const session = new ConversationSession();
      session.addMessage("user", "hello");
      const md = conversationToMarkdown(session);
      expect(md).not.toContain("## Execution Plan");
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles empty string message content", () => {
      const session = new ConversationSession();
      session.addMessage("user", "");
      const history = session.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe("");
    });

    it("handles very long prompt content", () => {
      const session = new ConversationSession();
      const longContent = "innovation ".repeat(1000);
      session.addMessage("user", longContent);
      const history = session.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe(longContent);
    });

    it("conversationToMarkdown handles session with empty messages", () => {
      const session = new ConversationSession();
      session.addMessage("user", "");
      const md = conversationToMarkdown(session);
      expect(md).toContain("🧑 User");
    });

    it("conversationToMarkdown with very long content does not crash", () => {
      const session = new ConversationSession();
      const longContent = "A".repeat(10000);
      session.addMessage("user", longContent);
      const md = conversationToMarkdown(session);
      expect(md).toContain(longContent);
    });

    it("multiple sessions maintain independent state", () => {
      const s1 = new ConversationSession();
      const s2 = new ConversationSession();
      s1.addMessage("user", "s1 message");
      s2.addMessage("user", "s2 message");
      expect(s1.getHistory()).toHaveLength(1);
      expect(s2.getHistory()).toHaveLength(1);
      expect(s1.getHistory()[0].content).toBe("s1 message");
      expect(s2.getHistory()[0].content).toBe("s2 message");
    });

    it("toState is a snapshot that does not change after further mutations", () => {
      const session = new ConversationSession();
      session.addMessage("user", "before snapshot");
      const snapshot = session.toState();
      session.addMessage("user", "after snapshot");
      expect(snapshot.messages).toHaveLength(1);
      expect(session.getHistory()).toHaveLength(2);
    });
  });
});
