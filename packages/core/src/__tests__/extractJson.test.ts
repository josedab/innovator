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

  // --- JSON Array support ---

  it("extracts a plain JSON array", () => {
    const input = '[1, 2, 3]';
    expect(JSON.parse(extractJson(input))).toEqual([1, 2, 3]);
  });

  it("extracts a JSON array from surrounding text", () => {
    const input = 'Here are the results: [{"name": "a"}, {"name": "b"}] done';
    expect(JSON.parse(extractJson(input))).toEqual([{ name: "a" }, { name: "b" }]);
  });

  it("extracts a JSON array from a fenced code block", () => {
    const input = '```json\n[{"id": 1}, {"id": 2}]\n```';
    expect(JSON.parse(extractJson(input))).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("prefers object when it appears before array", () => {
    const input = '{"key": "val"} and then [1, 2]';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "val" });
  });

  it("prefers array when it appears before object", () => {
    const input = 'result: [1, 2, 3] and {"key": "val"}';
    expect(JSON.parse(extractJson(input))).toEqual([1, 2, 3]);
  });

  it("handles nested arrays correctly", () => {
    const input = '[[1, 2], [3, [4, 5]]]';
    expect(JSON.parse(extractJson(input))).toEqual([[1, 2], [3, [4, 5]]]);
  });

  it("throws on unbalanced brackets in array", () => {
    expect(() => extractJson("[1, 2, 3")).toThrow("Unbalanced JSON braces");
  });
});
