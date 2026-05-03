import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- Mocks must be declared before imports ----

const { mockStart, mockStop, mockCreateSession } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockCreateSession: vi.fn(),
}));

vi.mock("@github/copilot-sdk", () => {
  class MockCopilotClient {
    start = mockStart;
    stop = mockStop;
    createSession = mockCreateSession;
  }
  return { CopilotClient: MockCopilotClient };
});

import {
  getCopilotClient,
  stopCopilotClient,
  generateText,
  generateTextStream,
  extractJson,
} from "../copilot/client.js";

describe("copilot/client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests
    return stopCopilotClient().catch(() => {});
  });

  afterEach(async () => {
    await stopCopilotClient().catch(() => {});
  });

  // ---- extractJson ----

  describe("extractJson", () => {
    it("extracts JSON from fenced code block", () => {
      const raw = '```json\n{"key": "value"}\n```';
      expect(extractJson(raw)).toBe('{"key": "value"}');
    });

    it("extracts JSON from fenced block without language tag", () => {
      const raw = '```\n{"key": "value"}\n```';
      expect(extractJson(raw)).toBe('{"key": "value"}');
    });

    it("extracts brace-balanced JSON from plain text", () => {
      const raw = 'Some text {"key": "value"} more text';
      expect(extractJson(raw)).toBe('{"key": "value"}');
    });

    it("handles nested objects", () => {
      const raw = 'prefix {"outer": {"inner": "val"}} suffix';
      expect(extractJson(raw)).toBe('{"outer": {"inner": "val"}}');
    });

    it("handles escaped quotes inside strings", () => {
      const raw = '{"key": "value with \\"quotes\\""}';
      expect(extractJson(raw)).toBe('{"key": "value with \\"quotes\\""}');
    });

    it("handles braces inside string values", () => {
      const raw = '{"msg": "use {brackets} here"}';
      expect(extractJson(raw)).toBe('{"msg": "use {brackets} here"}');
    });

    it("throws when no JSON object found", () => {
      expect(() => extractJson("no json here")).toThrow("No JSON object found");
    });

    it("throws on unbalanced braces", () => {
      expect(() => extractJson('{"key": "value"')).toThrow("Unbalanced JSON braces");
    });

    it("prefers fenced block over bare JSON", () => {
      const raw = '{"ignore": true}\n```json\n{"use": "this"}\n```';
      expect(extractJson(raw)).toBe('{"use": "this"}');
    });

    it("falls back to brace-balanced when fenced block has no object", () => {
      const raw = '```json\n[1, 2, 3]\n```\n{"fallback": true}';
      expect(extractJson(raw)).toBe('{"fallback": true}');
    });
  });

  // ---- getCopilotClient / singleton ----

  describe("getCopilotClient", () => {
    it("returns a client after start()", async () => {
      mockStart.mockResolvedValue(undefined);
      const client = await getCopilotClient();
      expect(client).toBeDefined();
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("caches the client on subsequent calls", async () => {
      mockStart.mockResolvedValue(undefined);
      const client1 = await getCopilotClient();
      const client2 = await getCopilotClient();
      expect(client1).toBe(client2);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("retries when start() fails on first attempt", async () => {
      mockStart.mockRejectedValueOnce(new Error("auth failed"));
      await expect(getCopilotClient()).rejects.toThrow("auth failed");

      // Subsequent call should retry (cached promise cleared)
      mockStart.mockResolvedValue(undefined);
      const client = await getCopilotClient();
      expect(client).toBeDefined();
      expect(mockStart).toHaveBeenCalledTimes(2);
    });
  });

  // ---- stopCopilotClient ----

  describe("stopCopilotClient", () => {
    it("stops the client and clears the cache", async () => {
      mockStart.mockResolvedValue(undefined);
      mockStop.mockResolvedValue(undefined);

      await getCopilotClient();
      await stopCopilotClient();

      expect(mockStop).toHaveBeenCalledTimes(1);

      // Next getCopilotClient should create a new instance
      await getCopilotClient();
      expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it("is safe to call when no client exists", async () => {
      await expect(stopCopilotClient()).resolves.toBeUndefined();
    });

    it("clears cache even if stop() throws", async () => {
      mockStart.mockResolvedValue(undefined);
      mockStop.mockRejectedValue(new Error("stop failed"));

      await getCopilotClient();
      await expect(stopCopilotClient()).rejects.toThrow("stop failed");

      // Cache should be cleared so next call creates new client
      mockStop.mockResolvedValue(undefined);
      await getCopilotClient();
      expect(mockStart).toHaveBeenCalledTimes(2);
    });
  });

  // ---- generateText ----

  describe("generateText", () => {
    const mockSendAndWait = vi.fn();
    const mockDisconnect = vi.fn();

    beforeEach(() => {
      mockStart.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);
      mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        disconnect: mockDisconnect,
      });
    });

    it("sends a prompt and returns content", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "Hello world" } });

      const result = await generateText({ prompt: "test" });

      expect(result).toBe("Hello world");
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: "test" });
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("returns empty string when response has no content", async () => {
      mockSendAndWait.mockResolvedValue({ data: {} });

      const result = await generateText({ prompt: "test" });
      expect(result).toBe("");
    });

    it("returns empty string when response is null", async () => {
      mockSendAndWait.mockResolvedValue(null);

      const result = await generateText({ prompt: "test" });
      expect(result).toBe("");
    });

    it("throws immediately when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(generateText({ prompt: "test", signal: controller.signal }))
        .rejects.toThrow("Request was aborted");
    });

    it("uses server permission handler when serverMode is true", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await generateText({ prompt: "test", serverMode: true });

      const sessionArgs = mockCreateSession.mock.calls[0][0];
      // Server mode should use permission handler that approves reads and denies writes
      const readResult = sessionArgs.onPermissionRequest({ kind: "read" });
      expect(readResult.kind).toBe("approved");

      const writeResult = sessionArgs.onPermissionRequest({ kind: "write" });
      expect(writeResult.kind).toBe("denied-by-rules");
    });

    it("uses CLI permission handler when serverMode is false", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await generateText({ prompt: "test", serverMode: false });

      const sessionArgs = mockCreateSession.mock.calls[0][0];
      const readResult = sessionArgs.onPermissionRequest({ kind: "read" });
      expect(readResult.kind).toBe("approved");

      const shellResult = sessionArgs.onPermissionRequest({ kind: "shell" });
      expect(shellResult.kind).toBe("denied-by-rules");
    });

    it("times out when LLM takes too long", async () => {
      mockSendAndWait.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10_000))
      );

      await expect(
        generateText({ prompt: "test", timeoutMs: 50 })
      ).rejects.toThrow("LLM request timed out");
    });

    it("uses custom model when specified", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await generateText({ prompt: "test", model: "gpt-5" });

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-5" })
      );
    });

    it("disconnects session even on error", async () => {
      mockSendAndWait.mockRejectedValue(new Error("LLM error"));

      await expect(generateText({ prompt: "test" })).rejects.toThrow("LLM error");
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("removes abort event listener after completion", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });
      const controller = new AbortController();
      const addSpy = vi.spyOn(controller.signal, "addEventListener");
      const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

      await generateText({ prompt: "test", signal: controller.signal });

      expect(addSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
      expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    });
  });

  // ---- generateTextStream ----

  describe("generateTextStream", () => {
    const mockSend = vi.fn();
    const mockDisconnect = vi.fn();
    const mockOn = vi.fn();

    beforeEach(() => {
      mockStart.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);

      // Capture event listeners for manual triggering
      const listeners: Record<string, Function> = {};
      mockOn.mockImplementation((event: string, handler: Function) => {
        listeners[event] = handler;
        return vi.fn(); // unsubscribe function
      });

      mockSend.mockImplementation(async () => {
        // Simulate events after send
        setTimeout(() => {
          listeners["assistant.message_delta"]?.({ data: { deltaContent: "Hello " } });
          listeners["assistant.message_delta"]?.({ data: { deltaContent: "world" } });
          listeners["session.idle"]?.();
        }, 10);
      });

      mockCreateSession.mockResolvedValue({
        send: mockSend,
        disconnect: mockDisconnect,
        on: mockOn,
      });
    });

    it("streams chunks and returns full text", async () => {
      const chunks: string[] = [];

      const result = await generateTextStream(
        { prompt: "test" },
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toEqual(["Hello ", "world"]);
      expect(result).toBe("Hello world");
    });

    it("throws immediately when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        generateTextStream({ prompt: "test", signal: controller.signal }, () => {})
      ).rejects.toThrow("Request was aborted");
    });

    it("unsubscribes event listeners in finally block", async () => {
      const unsubDelta = vi.fn();
      const unsubIdle = vi.fn();
      const unsubError = vi.fn();

      let callCount = 0;
      mockOn.mockImplementation((event: string, handler: Function) => {
        const unsubs = [unsubDelta, unsubIdle, unsubError];
        const unsub = unsubs[callCount++] || vi.fn();

        if (event === "session.idle") {
          setTimeout(() => {
            handler();
          }, 10);
        }

        return unsub;
      });

      mockSend.mockResolvedValue(undefined);

      await generateTextStream({ prompt: "test" }, () => {});

      expect(unsubDelta).toHaveBeenCalled();
      expect(unsubIdle).toHaveBeenCalled();
      expect(unsubError).toHaveBeenCalled();
    });
  });
});
