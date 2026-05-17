import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { generateTextStream, generateText, extractJson, stopCopilotClient } from "../client.js";

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
