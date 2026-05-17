/**
 * @module audience
 *
 * Audience-adaptive output transformation — generates results tailored
 * to specific audiences: executive summary, technical spec, pitch deck,
 * or research brief.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { Synthesis, Investigation } from "../types.js";
import {
  OUTPUT_MODES,
  OUTPUT_MODE_DEFINITIONS,
  OUTPUT_MODE_PROMPTS,
  OutputModeSchema,
  type OutputMode,
  type OutputModeDefinition,
  getOutputMode,
} from "../prompts/output-modes/index.js";

// Re-export types and definitions
export {
  OUTPUT_MODES,
  OUTPUT_MODE_DEFINITIONS,
  OutputModeSchema,
  type OutputMode,
  type OutputModeDefinition,
  getOutputMode,
};

/** Schema for an audience-adapted output. */
export const AudienceOutputSchema = z.object({
  mode: OutputModeSchema,
  modeName: z.string(),
  audience: z.string(),
  content: z.unknown().describe("Mode-specific structured content"),
  subject: z.string(),
  generatedAt: z.string(),
});

export type AudienceOutput = z.infer<typeof AudienceOutputSchema>;

/**
 * Transform a synthesis result into an audience-specific format.
 *
 * @param synthesis - The innovation synthesis to transform
 * @param mode - The target audience output mode
 * @param subject - The original subject
 * @param investigation - Optional investigation context
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns An AudienceOutput with mode-specific structured content
 */
export async function transformForAudience(
  synthesis: Synthesis,
  mode: OutputMode,
  subject: string,
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<AudienceOutput> {
  const modeDef = getOutputMode(mode);
  if (!modeDef) {
    throw new Error(`Unknown output mode: ${mode}. Valid modes: ${OUTPUT_MODES.join(", ")}`);
  }

  const buildPrompt = OUTPUT_MODE_PROMPTS[mode];
  const synthesisJson = sanitizeLlmOutput(JSON.stringify(synthesis, null, 2));
  const prompt = buildPrompt(synthesisJson, subject);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse ${mode} output as JSON: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  return {
    mode,
    modeName: modeDef.name,
    audience: modeDef.audience,
    content: parsed,
    subject,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Transform a synthesis into all available audience formats.
 *
 * @param synthesis - The innovation synthesis
 * @param subject - The original subject
 * @param investigation - Optional investigation context
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of AudienceOutput for each mode
 */
export async function transformForAllAudiences(
  synthesis: Synthesis,
  subject: string,
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<AudienceOutput[]> {
  const results: AudienceOutput[] = [];
  for (const mode of OUTPUT_MODES) {
    if (signal?.aborted) break;
    try {
      const output = await transformForAudience(
        synthesis,
        mode,
        subject,
        investigation,
        model,
        signal
      );
      results.push(output);
    } catch {
      // Skip failed modes, continue with others
    }
  }
  return results;
}
