import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import { extractJson } from "../copilot/client.js";

describe("extractJson", () => {
  it("extracts a plain JSON object", () => {
    const input = '{"key": "value"}';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Here is the result: {"name": "test", "count": 3} end of response';
    expect(JSON.parse(extractJson(input))).toEqual({ name: "test", count: 3 });
  });

  it("extracts JSON from fenced code block", () => {
    const input = '```json\n{"title": "hello"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ title: "hello" });
  });

  it("extracts JSON from fenced block without language tag", () => {
    const input = '```\n{"a": 1}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ a: 1 });
  });

  it("handles nested objects correctly", () => {
    const input = '{"outer": {"inner": {"deep": true}}, "arr": [1, 2]}';
    const result = JSON.parse(extractJson(input));
    expect(result.outer.inner.deep).toBe(true);
    expect(result.arr).toEqual([1, 2]);
  });

  it("handles strings containing braces", () => {
    const input = '{"text": "a { b } c", "ok": true}';
    const result = JSON.parse(extractJson(input));
    expect(result.text).toBe("a { b } c");
    expect(result.ok).toBe(true);
  });

  it("handles escaped quotes in strings", () => {
    const input = '{"msg": "say \\"hello\\""}';
    const result = JSON.parse(extractJson(input));
    expect(result.msg).toBe('say "hello"');
  });

  it("throws on input without JSON", () => {
    expect(() => extractJson("no json here")).toThrow("No JSON object found");
  });

  it("throws on unbalanced braces", () => {
    expect(() => extractJson('{"open": true')).toThrow("Unbalanced JSON braces");
  });

  it("prefers fenced block over inline JSON", () => {
    const input = 'prefix {"ignore": true} ```json\n{"use": "this"}\n``` suffix';
    expect(JSON.parse(extractJson(input))).toEqual({ use: "this" });
  });
});
