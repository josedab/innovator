import { z } from "zod";
import { KNOWN_MODELS } from "@innovator/core/types";
import { logger } from "./logger";
import { validateProductionRuntime } from "./runtime-policy";

/** Re-exported list of known LLM model identifiers from `@innovator/core`. */
export { KNOWN_MODELS };

const envSchema = z.object({
  INNOVATOR_DEFAULT_MODEL: z
    .string()
    .optional()
    .refine((val) => !val || KNOWN_MODELS.includes(val as (typeof KNOWN_MODELS)[number]), {
      message:
        `Unknown model (not in known list). Known models: ${KNOWN_MODELS.join(", ")}. ` +
        `This may still work if the model is supported by your Copilot subscription.`,
    }),
});

/** Inferred environment variable types after Zod validation. */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables at startup.
 * Logs warnings for unknown model names but does not throw.
 */
export function validateEnv(): Env {
  validateProductionRuntime();
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    for (const issue of result.error.issues) {
      // Only log the message, not the raw value, to avoid leaking secrets
      const path = issue.path.length ? issue.path.join(".") : "unknown";
      logger.warn(`ENV validation issue`, { field: path, message: issue.message });
    }
    // Return raw values anyway — unknown models may still work
    return { INNOVATOR_DEFAULT_MODEL: process.env.INNOVATOR_DEFAULT_MODEL };
  }

  return result.data;
}
