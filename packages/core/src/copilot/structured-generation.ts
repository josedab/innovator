import { extractJson, generateText, type GenerateOptions } from "./client.js";
import { withRetry, type RetryOptions } from "./retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";

/** Narrow text-generation dependency compatible with the Copilot client contract. */
export type TextGenerator = (options: GenerateOptions) => Promise<string>;

export type StructuredGenerationParseMode = "inside-retry" | "outside-retry";

export interface StructuredOutputSchema<T> {
  parse(value: unknown): T;
}

export interface StructuredGenerationOptions<T> {
  generateOptions: GenerateOptions;
  retryOptions: RetryOptions;
  /** Preserve callers that explicitly sanitize before extractJson's built-in sanitization. */
  sanitizeBeforeExtract: boolean;
  /** Override native JSON.parse failures with the caller's existing typed error. */
  createParseError?(json: string): Error;
  /** Defaults to inside-retry; use outside-retry only for callers that historically parsed later. */
  parseMode?: StructuredGenerationParseMode;
  /** Schema validation always runs after retry completes. */
  schema?: StructuredOutputSchema<T>;
  /** Parsed-value adaptation always runs after retry completes. */
  transformParsed?(value: unknown): T;
}

export async function generateStructured<T>(
  options: StructuredGenerationOptions<T>,
  textGenerator: TextGenerator = generateText
): Promise<T> {
  const parseJson = (json: string): unknown => {
    try {
      return JSON.parse(json) as unknown;
    } catch (error) {
      if (options.createParseError) {
        throw options.createParseError(json);
      }
      throw error;
    }
  };

  const generated = await withRetry(async () => {
    const raw = await textGenerator(options.generateOptions);
    const output = options.sanitizeBeforeExtract ? sanitizeLlmOutput(raw) : raw;
    const json = extractJson(output);
    return options.parseMode === "outside-retry" ? json : parseJson(json);
  }, options.retryOptions);
  const parsed = options.parseMode === "outside-retry" ? parseJson(generated as string) : generated;

  if (options.schema) {
    return options.schema.parse(parsed);
  }
  if (options.transformParsed) {
    return options.transformParsed(parsed);
  }
  return parsed as T;
}
