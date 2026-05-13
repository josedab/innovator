import { describe, it, expect } from "vitest";
import { stripAnsi, validateSubject, validateModel, MAX_SUBJECT_LENGTH } from "../utils.js";

describe("stripAnsi", () => {
  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("strips color codes", () => {
    expect(stripAnsi("\x1b[31mred text\x1b[0m")).toBe("red text");
  });

  it("strips bold/underline sequences", () => {
    expect(stripAnsi("\x1b[1mbold\x1b[22m")).toBe("bold");
  });

  it("strips multiple ANSI sequences", () => {
    expect(stripAnsi("\x1b[32mgreen\x1b[0m and \x1b[34mblue\x1b[0m")).toBe("green and blue");
  });

  it("strips OSC sequences (hyperlinks)", () => {
    expect(stripAnsi("\x1b]8;;https://example.com\x07link\x1b]8;;\x07")).toBe("link");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("strips compound SGR parameters", () => {
    expect(stripAnsi("\x1b[1;31;42mbold red on green\x1b[0m")).toBe("bold red on green");
  });

  it("handles string with no ANSI but special chars", () => {
    expect(stripAnsi("hello {world} [test]")).toBe("hello {world} [test]");
  });
});

describe("validateSubject", () => {
  it("returns true for valid short subject", () => {
    expect(validateSubject("AI innovation")).toBe(true);
  });

  it("returns true for subject at max length", () => {
    const subject = "a".repeat(MAX_SUBJECT_LENGTH);
    expect(validateSubject(subject)).toBe(true);
  });

  it("returns false for subject exceeding max length", () => {
    const subject = "a".repeat(MAX_SUBJECT_LENGTH + 1);
    expect(validateSubject(subject)).toBe(false);
  });

  it("returns true for empty string", () => {
    expect(validateSubject("")).toBe(true);
  });

  it("returns true for single character", () => {
    expect(validateSubject("x")).toBe(true);
  });
});

describe("validateModel", () => {
  const knownModels = ["gpt-4.1", "gpt-4.1-mini", "claude-sonnet-4"] as const;

  it("returns true when model is undefined", () => {
    expect(validateModel(undefined, knownModels)).toBe(true);
  });

  it("returns true for a known model", () => {
    expect(validateModel("gpt-4.1", knownModels)).toBe(true);
  });

  it("returns false for an unknown model", () => {
    expect(validateModel("gpt-99", knownModels)).toBe(false);
  });

  it("returns true for empty string model (treated as falsy by caller)", () => {
    expect(validateModel("", knownModels)).toBe(true);
  });

  it("returns false for model with extra whitespace", () => {
    expect(validateModel(" gpt-4.1 ", knownModels)).toBe(false);
  });

  it("is case-sensitive (uppercase rejected)", () => {
    expect(validateModel("GPT-4.1", knownModels)).toBe(false);
  });

  it("returns false for partial model name", () => {
    expect(validateModel("gpt", knownModels)).toBe(false);
  });

  it("returns true for all known models", () => {
    for (const m of knownModels) {
      expect(validateModel(m, knownModels)).toBe(true);
    }
  });

  it("returns false with empty knownModels list", () => {
    expect(validateModel("gpt-4.1", [])).toBe(false);
  });
});

describe("stripAnsi — additional edge cases", () => {
  it("strips cursor movement sequences", () => {
    expect(stripAnsi("\x1b[2Amoved up")).toBe("moved up");
  });

  it("handles mixed ANSI and unicode content", () => {
    expect(stripAnsi("\x1b[31m🚀 launch\x1b[0m")).toBe("🚀 launch");
  });

  it("handles newlines and tabs without stripping them", () => {
    expect(stripAnsi("line1\nline2\ttab")).toBe("line1\nline2\ttab");
  });
});

describe("validateSubject — additional edge cases", () => {
  it("handles subjects with special characters", () => {
    expect(validateSubject("AI & ML: testing <things>")).toBe(true);
  });

  it("handles subjects with unicode", () => {
    expect(validateSubject("🚀 innovation topic")).toBe(true);
  });
});
