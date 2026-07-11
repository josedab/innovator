import { generateStructured, type TextGenerator } from "../copilot/structured-generation.js";
import { LlmParseError, ValidationError } from "../errors.js";
import { getEventBus } from "../events/emitter.js";
import { buildInvestigationPrompt } from "../prompts/investigation.js";
import { validateSubject } from "../prompts/sanitize.js";
import { InvestigationSchema, type Investigation } from "../types.js";

/**
 * Investigate a subject using AI to identify key aspects, challenges, and opportunities.
 *
 * @param subject - The topic or domain to investigate
 * @param model - Optional LLM model override (defaults to `INNOVATOR_DEFAULT_MODEL` or `"gpt-4.1"`)
 * @param signal - Optional AbortSignal for cancellation
 * @param textGenerator - Optional text-generation dependency (defaults to Copilot)
 * @returns A validated {@link Investigation} with summary, key aspects, current state, challenges, and opportunities
 * @throws {ValidationError} If the subject is empty, too short, too long, or contains only unsafe characters
 * @throws If the LLM call fails or the response cannot be parsed as valid JSON
 *
 * @example
 * ```ts
 * const result = await investigate("code review processes");
 * console.log(result.summary);
 * console.log(result.challenges);
 * ```
 */
export function investigate(
  subject: string,
  model?: string,
  signal?: AbortSignal,
  textGenerator?: TextGenerator
): Promise<Investigation>;
export async function investigate(
  subject: string,
  model?: string,
  signal?: AbortSignal,
  ...[textGenerator]: [TextGenerator?]
): Promise<Investigation> {
  const validation = validateSubject(subject);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }
  const bus = getEventBus();
  const start = Date.now();
  bus.emit("investigation.started", { subject: validation.sanitized! }).catch(() => {});

  let result: Investigation;
  try {
    const prompt = buildInvestigationPrompt(validation.sanitized!);
    result = await generateStructured(
      {
        generateOptions: { prompt, model, serverMode: true, signal },
        retryOptions: { signal },
        schema: InvestigationSchema,
        sanitizeBeforeExtract: true,
        createParseError: (jsonStr) => {
          return new LlmParseError(
            "Failed to parse investigation response as JSON",
            jsonStr.slice(0, 200)
          );
        },
      },
      textGenerator
    );
  } catch (err) {
    bus
      .emit("investigation.failed", {
        subject: validation.sanitized!,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      })
      .catch(() => {});
    throw err;
  }

  bus
    .emit("investigation.completed", {
      subject: validation.sanitized!,
      durationMs: Date.now() - start,
    })
    .catch(() => {});
  return result;
}
