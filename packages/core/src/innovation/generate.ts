import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import {
  buildScamperPrompt,
  buildFirstPrinciplesPrompt,
  buildCrossDomainPrompt,
  buildConstraintsPrompt,
  buildInversionPrompt,
  buildPerspectivesPrompt,
  buildWhatIfPrompt,
  buildTrendCollisionPrompt,
} from "../prompts/angles/index.js";
import { AngleResultSchema, type AngleId, type AngleResult, type Investigation } from "../types.js";

type PromptBuilder = (subject: string, investigation: Investigation) => string;

const ANGLE_PROMPT_MAP: Record<AngleId, PromptBuilder> = {
  scamper: buildScamperPrompt,
  "first-principles": buildFirstPrinciplesPrompt,
  "cross-domain": buildCrossDomainPrompt,
  constraints: buildConstraintsPrompt,
  inversion: buildInversionPrompt,
  perspectives: buildPerspectivesPrompt,
  "what-if": buildWhatIfPrompt,
  "trend-collision": buildTrendCollisionPrompt,
};

/**
 * Generate innovation ideas for a subject using a specific creativity angle.
 *
 * @param subject - The topic to innovate on
 * @param investigation - A previously generated {@link Investigation} providing context
 * @param angleId - The creativity angle to apply (e.g. `"scamper"`, `"inversion"`)
 * @param model - Optional LLM model override
 * @returns A validated {@link AngleResult} containing generated ideas and reasoning
 * @throws If the angle ID is unknown, the LLM call fails, or the response is unparseable
 *
 * @example
 * ```ts
 * const investigation = await investigate("home automation");
 * const result = await generateForAngle("home automation", investigation, "scamper");
 * for (const idea of result.ideas) {
 *   console.log(idea.title, idea.potentialImpact);
 * }
 * ```
 */
export async function generateForAngle(
  subject: string,
  investigation: Investigation,
  angleId: AngleId,
  model?: string,
  signal?: AbortSignal
): Promise<AngleResult> {
  const buildPrompt = ANGLE_PROMPT_MAP[angleId];
  if (!buildPrompt) {
    throw new Error(`Unknown angle: ${angleId}`);
  }

  const prompt = buildPrompt(subject, investigation);
  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }), {
    signal,
  });

  const jsonStr = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse ${angleId} response as JSON: ${jsonStr.slice(0, 200)}`);
  }
  return AngleResultSchema.parse(parsed);
}
