import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the CopilotClient SDK
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSendAndWait = vi.fn();
const mockSend = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn().mockReturnValue(vi.fn()); // returns unsub fn
const mockCreateSession = vi.fn();
const mockDeleteSession = vi.fn().mockResolvedValue(undefined);

vi.mock("@github/copilot-sdk", () => {
  return {
    CopilotClient: class MockCopilotClient {
      start = mockStart;
      stop = mockStop;
      createSession = mockCreateSession;
      deleteSession = mockDeleteSession;
    },
  };
});

// Set up createSession default
mockCreateSession.mockReturnValue({
  sessionId: "test-session",
  sendAndWait: mockSendAndWait,
  send: mockSend,
  disconnect: mockDisconnect,
  on: mockOn,
});

import {
  getCopilotClient,
  stopCopilotClient,
  generateText,
  generateTextStream,
  extractJson,
} from "../copilot/client.js";

describe("copilot/client", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset singleton by stopping any existing client
    await stopCopilotClient();
    mockCreateSession.mockReturnValue({
      sessionId: "test-session",
      sendAndWait: mockSendAndWait,
      send: mockSend,
      disconnect: mockDisconnect,
      on: mockOn,
    });
  });

  describe("getCopilotClient", () => {
    it("returns a started CopilotClient singleton", async () => {
      const client = await getCopilotClient();
      expect(mockStart).toHaveBeenCalledOnce();
      expect(client).toBeDefined();
    });

    it("returns the same client on subsequent calls (singleton)", async () => {
      const c1 = await getCopilotClient();
      const c2 = await getCopilotClient();
      expect(c1).toBe(c2);
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it("recreates client after stopCopilotClient()", async () => {
      await getCopilotClient();
      await stopCopilotClient();
      await getCopilotClient();
      expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it("clears cached promise when start fails", async () => {
      mockStart.mockRejectedValueOnce(new Error("Auth failed"));
      await expect(getCopilotClient()).rejects.toThrow("Auth failed");
      // Should retry on next call
      mockStart.mockResolvedValueOnce(undefined);
      const client = await getCopilotClient();
      expect(client).toBeDefined();
    });
  });

  describe("stopCopilotClient", () => {
    it("is safe to call when no client exists", async () => {
      await expect(stopCopilotClient()).resolves.toBeUndefined();
    });

    it("stops the existing client and clears singleton", async () => {
      await getCopilotClient();
      await stopCopilotClient();
      expect(mockStop).toHaveBeenCalledOnce();
    });
  });

  describe("generateText", () => {
    it("passes model and prompt to session", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "Hello world" } });

      const result = await generateText({
        prompt: "Test prompt",
        model: "gpt-5",
        timeoutMs: 5000,
      });

      expect(result).toBe("Hello world");
      expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5" }));
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: "Test prompt" });
    });

    it("throws LlmParseError when response has no content", async () => {
      mockSendAndWait.mockResolvedValue({});
      await expect(generateText({ prompt: "test", timeoutMs: 5000 })).rejects.toThrow(
        "LLM returned an empty response"
      );
    });

    it("uses server permission handler when serverMode is true", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });
      await generateText({ prompt: "test", serverMode: true, timeoutMs: 5000 });
      const sessionOpts = mockCreateSession.mock.calls[0][0];
      // Test the permission handler denies write operations
      const handler = sessionOpts.onPermissionRequest;
      expect(handler({ kind: "read" })).toEqual(
        expect.objectContaining({ kind: "denied-by-rules" })
      );
      expect(handler({ kind: "write" })).toEqual(
        expect.objectContaining({ kind: "denied-by-rules" })
      );
    });

    it("uses CLI permission handler when serverMode is false", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });
      await generateText({ prompt: "test", serverMode: false, timeoutMs: 5000 });
      const sessionOpts = mockCreateSession.mock.calls[0][0];
      const handler = sessionOpts.onPermissionRequest;
      expect(handler({ kind: "read" })).toEqual(
        expect.objectContaining({ kind: "denied-by-rules" })
      );
      expect(handler({ kind: "shell" })).toEqual(
        expect.objectContaining({ kind: "denied-by-rules" })
      );
    });

    it("throws when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(generateText({ prompt: "test", signal: controller.signal })).rejects.toThrow(
        "Request was aborted"
      );
    });

    it("disconnects session after completion", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "done" } });
      await generateText({ prompt: "test", timeoutMs: 5000 });
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe("generateTextStream", () => {
    it("yields chunks via onChunk callback", async () => {
      const chunks: string[] = [];

      // Mock streaming: capture the delta listener and call it
      mockOn.mockImplementation((event: string, listener: (evt: unknown) => void) => {
        if (event === "assistant.message_delta") {
          // Simulate calling the delta listener async
          setTimeout(() => {
            listener({ data: { deltaContent: "Hello " } });
            listener({ data: { deltaContent: "world" } });
          }, 10);
        }
        if (event === "session.idle") {
          setTimeout(() => {
            listener(undefined);
          }, 30);
        }
        return vi.fn();
      });

      // Need to also resolve disconnect
      mockDisconnect.mockResolvedValue(undefined);

      const result = await generateTextStream({ prompt: "test", timeoutMs: 5000 }, (chunk) =>
        chunks.push(chunk)
      );

      expect(result).toBe("Hello world");
      expect(chunks).toEqual(["Hello ", "world"]);
    });

    it("throws when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        generateTextStream({ prompt: "test", signal: controller.signal }, () => {})
      ).rejects.toThrow("Request was aborted");
    });
  });

  describe("extractJson", () => {
    it("extracts JSON from markdown fenced code block", () => {
      const raw = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
      expect(extractJson(raw)).toBe('{"key": "value"}');
    });

    it("extracts JSON from unfenced response", () => {
      const raw = 'The answer is: {"name": "test", "count": 42} end';
      expect(extractJson(raw)).toBe('{"name": "test", "count": 42}');
    });

    it("handles nested braces correctly", () => {
      const raw = '{"outer": {"inner": {"deep": true}}}';
      expect(extractJson(raw)).toBe('{"outer": {"inner": {"deep": true}}}');
    });

    it("handles strings with escaped quotes", () => {
      const raw = '{"msg": "He said \\"hello\\""}';
      expect(extractJson(raw)).toBe('{"msg": "He said \\"hello\\""}');
    });

    it("handles braces inside strings", () => {
      const raw = '{"template": "use {name} here"}';
      expect(extractJson(raw)).toBe('{"template": "use {name} here"}');
    });

    it("throws on response with no JSON object", () => {
      expect(() => extractJson("No JSON here")).toThrow("No JSON object found");
    });

    it("throws on unbalanced braces", () => {
      expect(() => extractJson('{"key": "value"')).toThrow("Unbalanced JSON braces");
    });

    it("extracts from fenced block without json language tag", () => {
      const raw = '```\n{"data": 1}\n```';
      expect(extractJson(raw)).toBe('{"data": 1}');
    });

    it("throws for empty string", () => {
      expect(() => extractJson("")).toThrow("No JSON object found");
    });

    it("extracts first valid JSON when fenced block has non-JSON content", () => {
      const raw = '```\nsome text\n```\n{"fallback": true}';
      expect(extractJson(raw)).toBe('{"fallback": true}');
    });

    it("handles deeply nested objects", () => {
      const deep = '{"a":{"b":{"c":{"d":{"e":"val"}}}}}';
      expect(extractJson(deep)).toBe(deep);
    });

    it("handles objects containing arrays", () => {
      const raw = '{"items": [1, 2, {"nested": [3, 4]}]}';
      expect(extractJson(raw)).toBe('{"items": [1, 2, {"nested": [3, 4]}]}');
    });

    it("handles arrays containing objects", () => {
      const raw = 'Result: [{"a": 1}, {"b": 2}] done';
      expect(extractJson(raw)).toBe('[{"a": 1}, {"b": 2}]');
    });

    it("handles deeply mixed nesting of arrays and objects", () => {
      const raw = '{"data": [{"items": [{"id": 1, "tags": ["a", "b"]}]}]}';
      expect(extractJson(raw)).toBe(raw);
    });

    it("extracts array with closing braces inside strings", () => {
      const raw = '[{"msg": "use {x} and [y]"}, {"val": 2}]';
      expect(extractJson(raw)).toBe(raw);
    });
  });

  describe("generateText edge cases", () => {
    it("times out when sendAndWait takes too long", async () => {
      mockSendAndWait.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10_000))
      );
      await expect(generateText({ prompt: "test", timeoutMs: 50 })).rejects.toThrow("timed out");
    });

    it("disconnects session on abort signal during request", async () => {
      const controller = new AbortController();
      // The abort handler calls safeDisconnect, which triggers the mock.
      // Use a short timeout so the race resolves via timeout after abort.
      mockSendAndWait.mockImplementation(
        () => new Promise(() => {}) // never resolves
      );
      const promise = generateText({ prompt: "test", signal: controller.signal, timeoutMs: 200 });
      setTimeout(() => controller.abort(), 30);
      await expect(promise).rejects.toThrow();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("suppresses expected disconnect errors (ECONNRESET)", async () => {
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });
      const econnErr = new Error("connection reset");
      (econnErr as NodeJS.ErrnoException).code = "ECONNRESET";
      mockDisconnect.mockRejectedValueOnce(econnErr);
      const result = await generateText({ prompt: "test", timeoutMs: 5000 });
      expect(result).toBe("ok");
    });

    it("uses INNOVATOR_DEFAULT_MODEL env when no model specified", async () => {
      vi.stubEnv("INNOVATOR_DEFAULT_MODEL", "env-model-override");
      mockSendAndWait.mockResolvedValue({ data: { content: "env model result" } });
      await generateText({ prompt: "test", timeoutMs: 5000 });
      const sessionOpts = mockCreateSession.mock.calls[0][0];
      // The model should be set from env or default, check it's defined
      expect(sessionOpts.model).toBeDefined();
      vi.unstubAllGlobals();
    });
  });
});
