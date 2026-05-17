/**
 * Pure utility functions for CLI input validation and sanitization.
 */

/** Maximum number of characters allowed for a CLI subject argument. */
export const MAX_SUBJECT_LENGTH = 500;

/** Strip ANSI escape sequences from untrusted LLM output */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "");
}

/** Validate that the subject is non-empty and within the maximum length */
export function validateSubject(subject: string): boolean {
  const trimmed = subject.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SUBJECT_LENGTH;
}

/** Validate that the model (if provided) is in the known list */
export function validateModel(model: string | undefined, knownModels: readonly string[]): boolean {
  if (!model) return true;
  return knownModels.includes(model);
}
