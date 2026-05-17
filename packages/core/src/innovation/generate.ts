import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { LlmParseError, ValidationError } from "../errors.js";
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
import { investigationContext } from "../prompts/investigation.js";
import {
  AngleResultSchema,
  type AngleId,
  type AngleResult,
  type Investigation,
  type CustomAngle,
} from "../types.js";
import { buildCustomAnglePrompt, getCustomAngle } from "./custom-angles.js";

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
  angleId: AngleId | string,
  model?: string,
  signal?: AbortSignal
): Promise<AngleResult> {
  const buildPrompt = ANGLE_PROMPT_MAP[angleId as AngleId];

  let prompt: string;
  if (buildPrompt) {
    prompt = buildPrompt(subject, investigation);
  } else {
    // Check custom angles
    const customAngle = getCustomAngle(angleId);
    if (!customAngle) {
      throw new ValidationError(`Unknown angle: ${angleId}`);
    }
    const context = investigationContext(subject, investigation);
    prompt = buildCustomAnglePrompt(customAngle, subject, context);
  }
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse ${angleId} response as JSON`,
          jsonStr.slice(0, 200)
        );
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
  return AngleResultSchema.parse(parsed);
}
