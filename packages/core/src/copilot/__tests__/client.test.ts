import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { CopilotClient } from "@github/copilot-sdk";
import {
  generateTextStream,
  generateText,
  extractJson,
  resetCopilotClientIfIdle,
  stopCopilotClient,
} from "../client.js";

describe("copilot/client", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    // Reset client singleton between tests
    await stopCopilotClient().catch(() => {});
  });

  // ---- generateText abort ----

  describe("generateText abort handling", () => {
    it("throws on pre-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(generateText({ prompt: "test", signal: controller.signal })).rejects.toThrow(
        "Request was aborted"
      );
    });
  });

  // ---- generateTextStream abort ----

  describe("generateTextStream abort handling", () => {
    it("throws on pre-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        generateTextStream({ prompt: "test", signal: controller.signal }, () => {})
      ).rejects.toThrow("Request was aborted");
    });
  });

  describe("global LLM concurrency", () => {
    it("limits active Copilot sessions across concurrent requests", async () => {
      const pendingResponses: Array<() => void> = [];
      const createSession = vi.fn(async () => ({
        sessionId: `session-${createSession.mock.calls.length}`,
        sendAndWait: vi.fn(
          () =>
            new Promise<{ data: { content: string } }>((resolve) => {
              pendingResponses.push(() => resolve({ data: { content: "ok" } }));
            })
        ),
        disconnect: vi.fn().mockResolvedValue(undefined),
      }));
      const client = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        forceStop: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        createSession,
      };
      vi.mocked(CopilotClient).mockImplementation(function MockCopilotClient() {
        return client as never;
      });

      const requests = [
        generateText({ prompt: "one", timeoutMs: 5_000 }),
        generateText({ prompt: "two", timeoutMs: 5_000 }),
        generateText({ prompt: "three", timeoutMs: 5_000 }),
      ];

      try {
        await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
        await expect(resetCopilotClientIfIdle()).resolves.toBe(false);
        pendingResponses.shift()?.();
        await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(3));
        pendingResponses.splice(0).forEach((resolve) => resolve());

        await expect(Promise.all(requests)).resolves.toEqual(["ok", "ok", "ok"]);
        await expect(resetCopilotClientIfIdle()).resolves.toBe(true);
      } finally {
        pendingResponses.splice(0).forEach((resolve) => resolve());
      }
    });

    it("applies the request timeout while waiting for a permit", async () => {
      const pendingResponses: Array<() => void> = [];
      const createSession = vi.fn(async () => ({
        sessionId: `session-${createSession.mock.calls.length}`,
        sendAndWait: vi.fn(
          () =>
            new Promise<{ data: { content: string } }>((resolve) => {
              pendingResponses.push(() => resolve({ data: { content: "ok" } }));
            })
        ),
        disconnect: vi.fn().mockResolvedValue(undefined),
      }));
      const client = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        forceStop: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        createSession,
      };
      vi.mocked(CopilotClient).mockImplementation(function MockCopilotClient() {
        return client as never;
      });

      const activeRequests = [
        generateText({ prompt: "one", timeoutMs: 5_000 }),
        generateText({ prompt: "two", timeoutMs: 5_000 }),
      ];

      try {
        await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
        await expect(generateText({ prompt: "queued", timeoutMs: 10 })).rejects.toThrow(
          "timed out"
        );
        pendingResponses.splice(0).forEach((resolve) => resolve());
        await expect(Promise.all(activeRequests)).resolves.toEqual(["ok", "ok"]);
      } finally {
        pendingResponses.splice(0).forEach((resolve) => resolve());
      }
    });

    it("times out during session setup without sending the prompt", async () => {
      const sendAndWait = vi.fn().mockResolvedValue({ data: { content: "late" } });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const client = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        forceStop: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        createSession: vi.fn(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () => resolve({ sessionId: "delayed-session", sendAndWait, disconnect }),
                60
              );
            })
        ),
      };
      vi.mocked(CopilotClient).mockImplementation(function MockCopilotClient() {
        return client as never;
      });

      const startedAt = Date.now();
      await expect(generateText({ prompt: "setup", timeoutMs: 20 })).rejects.toThrow("timed out");
      expect(Date.now() - startedAt).toBeLessThan(55);

      await new Promise((resolve) => setTimeout(resolve, 70));
      expect(sendAndWait).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledOnce();
    });

    it("blocks new operations until timed-out setup reset completes", async () => {
      const setupResolvers: Array<
        (session: {
          sessionId: string;
          sendAndWait: ReturnType<typeof vi.fn>;
          disconnect: ReturnType<typeof vi.fn>;
        }) => void
      > = [];
      const disconnect = vi.fn().mockResolvedValue(undefined);
      let resolveForceStop: (() => void) | undefined;
      const client = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        forceStop: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveForceStop = resolve;
            })
        ),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        createSession: vi.fn(
          () =>
            new Promise((resolve) => {
              setupResolvers.push(resolve);
            })
        ),
      };
      vi.mocked(CopilotClient).mockImplementation(function MockCopilotClient() {
        return client as never;
      });

      const first = generateText({ prompt: "stuck-1", timeoutMs: 10 });
      const second = generateText({ prompt: "stuck-2", timeoutMs: 10 });
      const settledRequests = Promise.allSettled([first, second]);
      await vi.waitFor(() => expect(client.createSession).toHaveBeenCalledTimes(2));
      await expect(settledRequests).resolves.toEqual([
        expect.objectContaining({ status: "rejected" }),
        expect.objectContaining({ status: "rejected" }),
      ]);

      await vi.waitFor(() => expect(client.forceStop).toHaveBeenCalled());

      const recoveredRequest = generateText({ prompt: "recovered", timeoutMs: 1_000 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(client.createSession).toHaveBeenCalledTimes(2);

      resolveForceStop?.();
      await vi.waitFor(() => expect(client.createSession).toHaveBeenCalledTimes(3));

      setupResolvers.splice(0).forEach((resolve) =>
        resolve({
          sessionId: "pending-session",
          sendAndWait: vi.fn().mockResolvedValue({ data: { content: "recovered" } }),
          disconnect,
        })
      );
      await expect(recoveredRequest).resolves.toBe("recovered");
      await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(3));
    });
  });

  // ---- extractJson ----

  describe("extractJson", () => {
    it("extracts JSON from fenced code block", () => {
      const raw = '```json\n{"key": "value"}\n```';
      expect(JSON.parse(extractJson(raw))).toEqual({ key: "value" });
    });

    it("extracts JSON from unfenced code block", () => {
      const raw = '```\n{"key": "value"}\n```';
      expect(JSON.parse(extractJson(raw))).toEqual({ key: "value" });
    });

    it("extracts JSON from text with surrounding prose", () => {
      const raw = 'Here is the result: {"key": "value"} End of response.';
      expect(JSON.parse(extractJson(raw))).toEqual({ key: "value" });
    });

    it("handles nested braces", () => {
      const raw = '{"outer": {"inner": "value"}}';
      expect(JSON.parse(extractJson(raw))).toEqual({ outer: { inner: "value" } });
    });

    it("handles deeply nested objects", () => {
      const raw = '{"a": {"b": {"c": {"d": 42}}}}';
      const parsed = JSON.parse(extractJson(raw));
      expect(parsed.a.b.c.d).toBe(42);
    });

    it("handles strings with braces inside", () => {
      const raw = '{"text": "hello { world }"}';
      expect(JSON.parse(extractJson(raw))).toEqual({ text: "hello { world }" });
    });

    it("throws when no JSON found", () => {
      expect(() => extractJson("no json here")).toThrow("No JSON object found");
    });

    it("throws on unbalanced braces", () => {
      expect(() => extractJson('{"unclosed": "value"')).toThrow("Unbalanced JSON braces");
    });

    it("handles escaped quotes in strings", () => {
      const raw = '{"text": "he said \\"hello\\""}';
      const parsed = JSON.parse(extractJson(raw));
      expect(parsed.text).toContain("hello");
    });

    it("handles escaped backslashes before quotes", () => {
      const raw = '{"path": "C:\\\\Users\\\\test"}';
      const parsed = JSON.parse(extractJson(raw));
      expect(parsed.path).toContain("Users");
    });

    it("prefers fenced block over inline JSON", () => {
      const raw = 'before {"wrong": true} ```json\n{"right": true}\n``` after';
      const parsed = JSON.parse(extractJson(raw));
      expect(parsed.right).toBe(true);
    });

    it("handles arrays inside objects", () => {
      const raw = '{"items": [1, 2, 3], "name": "test"}';
      const parsed = JSON.parse(extractJson(raw));
      expect(parsed.items).toEqual([1, 2, 3]);
    });

    it("handles empty object", () => {
      const raw = "{}";
      expect(JSON.parse(extractJson(raw))).toEqual({});
    });

    it("handles JSON with newlines", () => {
      const raw = '{\n  "key": "value"\n}';
      expect(JSON.parse(extractJson(raw))).toEqual({ key: "value" });
    });

    it("throws for empty string input", () => {
      expect(() => extractJson("")).toThrow("No JSON object found");
    });
  });
});
