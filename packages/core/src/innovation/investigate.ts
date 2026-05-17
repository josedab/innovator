import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { LlmParseError, ValidationError } from "../errors.js";
import { getEventBus } from "../events/emitter.js";
import { buildInvestigationPrompt } from "../prompts/investigation.js";
import { validateSubject, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { InvestigationSchema, type Investigation } from "../types.js";

/**
 * Investigate a subject using AI to identify key aspects, challenges, and opportunities.
 *
 * @param subject - The topic or domain to investigate
 * @param model - Optional LLM model override (defaults to `INNOVATOR_DEFAULT_MODEL` or `"gpt-4.1"`)
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
export async function investigate(
  subject: string,
  model?: string,
  signal?: AbortSignal
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
    const parsed = await withRetry(
      async () => {
        const raw = await generateText({ prompt, model, serverMode: true, signal });
        const jsonStr = extractJson(sanitizeLlmOutput(raw));
        try {
          return JSON.parse(jsonStr) as unknown;
        } catch {
          throw new LlmParseError(
            "Failed to parse investigation response as JSON",
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
    result = InvestigationSchema.parse(parsed);
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
