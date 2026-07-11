import { generateStructured, type TextGenerator } from "../copilot/structured-generation.js";
import { LlmParseError, ValidationError } from "../errors.js";
import { getEventBus } from "../events/emitter.js";
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
import { validateSubject } from "../prompts/sanitize.js";
import { AngleResultSchema, type AngleId, type AngleResult, type Investigation } from "../types.js";
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
 * @param signal - Optional AbortSignal for cancellation
 * @param textGenerator - Optional text-generation dependency (defaults to Copilot)
 * @returns A validated {@link AngleResult} containing generated ideas and reasoning
 * @throws {ValidationError} If the subject is invalid or the angle ID is unknown
 * @throws If the LLM call fails or the response is unparseable
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
export function generateForAngle(
  subject: string,
  investigation: Investigation,
  angleId: AngleId | string,
  model?: string,
  signal?: AbortSignal,
  textGenerator?: TextGenerator
): Promise<AngleResult>;
export async function generateForAngle(
  subject: string,
  investigation: Investigation,
  angleId: AngleId | string,
  model?: string,
  signal?: AbortSignal,
  ...[textGenerator]: [TextGenerator?]
): Promise<AngleResult> {
  const validation = validateSubject(subject);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }
  const sanitizedSubject = validation.sanitized!;
  const bus = getEventBus();
  const start = Date.now();

  const buildPrompt = ANGLE_PROMPT_MAP[angleId as AngleId];

  let prompt: string;
  if (buildPrompt) {
    prompt = buildPrompt(sanitizedSubject, investigation);
  } else {
    // Check custom angles
    const customAngle = getCustomAngle(angleId);
    if (!customAngle) {
      throw new ValidationError(`Unknown angle: ${angleId}`);
    }
    const context = investigationContext(sanitizedSubject, investigation);
    prompt = buildCustomAnglePrompt(customAngle, sanitizedSubject, context);
  }

  bus.emit("generation.started", { subject: sanitizedSubject, angleId }).catch(() => {});

  let result: AngleResult;
  try {
    result = await generateStructured(
      {
        generateOptions: { prompt, model, serverMode: true, signal },
        retryOptions: { signal },
        schema: AngleResultSchema,
        sanitizeBeforeExtract: true,
        createParseError: (jsonStr) => {
          return new LlmParseError(
            `Failed to parse ${angleId} response as JSON`,
            jsonStr.slice(0, 200)
          );
        },
      },
      textGenerator
    );
  } catch (err) {
    bus
      .emit("generation.failed", {
        subject: sanitizedSubject,
        angleId,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      })
      .catch(() => {});
    throw err;
  }

  bus
    .emit("generation.completed", {
      subject: sanitizedSubject,
      angleId,
      ideaCount: result.ideas.length,
      durationMs: Date.now() - start,
    })
    .catch(() => {});
  return result;
}
