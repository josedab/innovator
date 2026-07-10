import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

vi.mock("../client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client.js")>();
  return {
    ...actual,
    generateText: vi.fn(),
    extractJson: vi.fn(actual.extractJson),
  };
});

import { generateText, extractJson } from "../client.js";
import { generateStructured, type TextGenerator } from "../structured-generation.js";
import { AbortError, LlmParseError } from "../../errors.js";

const ValueSchema = z.object({ value: z.number() });

function generateValue(
  overrides: Partial<Parameters<typeof generateStructured<z.infer<typeof ValueSchema>>>[0]> = {},
  textGenerator?: TextGenerator
) {
  return generateStructured(
    {
      generateOptions: {
        prompt: "structured prompt",
        model: "test-model",
        serverMode: true,
        signal: undefined,
      },
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 0,
        maxDelayMs: 0,
        signal: undefined,
      },
      schema: ValueSchema,
      sanitizeBeforeExtract: true,
      createParseError: (json) =>
        new LlmParseError("Failed to parse test response as JSON", json.slice(0, 200)),
      ...overrides,
    },
    textGenerator
  );
}

describe("generateStructured", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(extractJson).mockClear();
  });

  it("extracts and validates fenced JSON", async () => {
    vi.mocked(generateText).mockResolvedValue('Response:\n```json\n{"value": 42}\n```\nDone.');

    await expect(generateValue()).resolves.toEqual({ value: 42 });
    expect(generateText).toHaveBeenCalledWith({
      prompt: "structured prompt",
      model: "test-model",
      serverMode: true,
      signal: undefined,
    });
  });

  it("uses an injected text generator instead of Copilot", async () => {
    const textGenerator = vi.fn<TextGenerator>().mockResolvedValue('{"value": 13}');

    await expect(generateValue({}, textGenerator)).resolves.toEqual({ value: 13 });

    expect(textGenerator).toHaveBeenCalledWith({
      prompt: "structured prompt",
      model: "test-model",
      serverMode: true,
      signal: undefined,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("extracts JSON embedded in surrounding text", async () => {
    vi.mocked(generateText).mockResolvedValue('Result: {"value": 7} trailing text');

    await expect(generateValue()).resolves.toEqual({ value: 7 });
  });

  it("retries malformed JSON and preserves exhaustion details", async () => {
    const malformed = '{"value": }';
    vi.mocked(generateText).mockResolvedValue(malformed);

    await expect(
      generateValue({
        retryOptions: {
          maxAttempts: 2,
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
      })
    ).rejects.toMatchObject({
      name: "RetryExhaustedError",
      attempts: 2,
      cause: {
        name: "LlmParseError",
        message: "Failed to parse test response as JSON",
        rawOutput: malformed,
      },
    });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("retries extraction errors and preserves the extraction failure", async () => {
    vi.mocked(generateText).mockResolvedValue("no structured data");

    await expect(
      generateValue({
        retryOptions: {
          maxAttempts: 2,
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
      })
    ).rejects.toMatchObject({
      name: "RetryExhaustedError",
      attempts: 2,
      cause: {
        name: "LlmParseError",
        message: "No JSON object found in response",
        rawOutput: "no structured data",
      },
    });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("honors an already-aborted retry signal without generating", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateValue({
        generateOptions: {
          prompt: "structured prompt",
          model: "test-model",
          serverMode: true,
          signal: controller.signal,
        },
        retryOptions: {
          signal: controller.signal,
        },
      })
    ).rejects.toEqual(new AbortError("Retry aborted"));
    expect(generateText).not.toHaveBeenCalled();
  });

  it("validates the schema outside retry", async () => {
    vi.mocked(generateText).mockResolvedValue('{"value": "invalid"}');

    await expect(generateValue()).rejects.toMatchObject({ name: "ZodError" });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("transforms parsed JSON outside retry", async () => {
    const transformParsed = vi.fn(() => {
      throw new Error("transform failed");
    });
    vi.mocked(generateText).mockResolvedValue('{"value": 1}');

    await expect(
      generateStructured({
        generateOptions: { prompt: "structured prompt" },
        retryOptions: {
          maxAttempts: 3,
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
        sanitizeBeforeExtract: true,
        createParseError: (json) => new LlmParseError("parse failed", json),
        transformParsed,
      })
    ).rejects.toThrow("transform failed");
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(transformParsed).toHaveBeenCalledWith({ value: 1 });
  });

  it("can preserve JSON parsing outside retry", async () => {
    const malformed = '{"value": }';
    vi.mocked(generateText).mockResolvedValue(malformed);

    await expect(
      generateValue({
        parseMode: "outside-retry",
        retryOptions: {
          maxAttempts: 3,
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
      })
    ).rejects.toMatchObject({
      name: "LlmParseError",
      message: "Failed to parse test response as JSON",
      rawOutput: malformed,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("uses caller-provided parse error wording and raw-output truncation", async () => {
    const malformed = "x".repeat(250);
    vi.mocked(generateText).mockResolvedValue(`{${malformed}}`);

    await expect(
      generateValue({
        retryOptions: { maxAttempts: 1 },
        createParseError: (json) =>
          new LlmParseError(`Caller wording: ${json.slice(0, 20)}`, json.slice(0, 200)),
      })
    ).rejects.toMatchObject({
      cause: {
        name: "LlmParseError",
        message: `Caller wording: {${malformed.slice(0, 19)}`,
        rawOutput: `{${malformed.slice(0, 199)}`,
      },
    });
  });

  it("applies the caller-selected pre-extraction sanitization policy", async () => {
    const raw = '\u200B{"value": 9}';
    vi.mocked(generateText).mockResolvedValue(raw);

    await generateValue();
    await generateValue({ sanitizeBeforeExtract: false });

    expect(extractJson).toHaveBeenNthCalledWith(1, '{"value": 9}');
    expect(extractJson).toHaveBeenNthCalledWith(2, raw);
  });
});
