import { generateText, extractJson } from "../copilot/client.js";
import { buildInvestigationPrompt } from "../prompts/investigation.js";
import { InvestigationSchema, type Investigation } from "../types.js";

/**
 * Investigate a subject using AI to identify key aspects, challenges, and opportunities.
 *
 * @param subject - The topic or domain to investigate
 * @param model - Optional LLM model override (defaults to `INNOVATOR_DEFAULT_MODEL` or `"gpt-4.1"`)
 * @returns A validated {@link Investigation} with summary, key aspects, current state, challenges, and opportunities
 * @throws If the LLM call fails or the response cannot be parsed as valid JSON
 *
 * @example
 * ```ts
 * const result = await investigate("code review processes");
 * console.log(result.summary);
 * console.log(result.challenges);
 * ```
 */
export async function investigate(subject: string, model?: string): Promise<Investigation> {
  const prompt = buildInvestigationPrompt(subject);
  const raw = await generateText({ prompt, model, serverMode: true });

  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);
  return InvestigationSchema.parse(parsed);
}
