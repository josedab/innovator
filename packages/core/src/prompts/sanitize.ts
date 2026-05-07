/**
 * Sanitize user-supplied text before interpolation into LLM prompts.
 * Strips patterns commonly used in prompt-injection attacks while
 * preserving legitimate content.
 * @param {string} input - Raw user-supplied text to sanitize.
 * @returns {string} Sanitized text with injection patterns and invisible characters removed.
 */
export function sanitizeUserInput(input: string): string {
  // Normalize Unicode to NFC to prevent homoglyph bypass
  let sanitized = input.normalize("NFC");

  // Strip zero-width and invisible characters
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, "");

  // Normalize unicode whitespace to regular spaces
  sanitized = sanitized.replace(/\p{Zs}/gu, " ");

  // Strip attempts to override system/role instructions
  sanitized = sanitized.replace(
    /\b(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|context)\b/gi,
    ""
  );
  // Strip role-assumption patterns
  sanitized = sanitized.replace(
    /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|new\s+instructions?)\b/gi,
    ""
  );
  // Strip markdown/XML-style tags that could mimic system delimiters
  sanitized = sanitized.replace(/<\/?(?:system|assistant|user|prompt|instructions?)>/gi, "");

  return sanitized.trim();
}

/**
 * Wrap user-supplied text in clear delimiters so the LLM can distinguish
 * user content from system instructions.
 * @param {string} label - Descriptive label prefixed before the wrapped value.
 * @param {string} value - Raw user-supplied text to sanitize and wrap.
 * @returns {string} Formatted string in the form `label: """sanitized_value"""`.
 */
export function wrapUserInput(label: string, value: string): string {
  let sanitized = sanitizeUserInput(value);
  // Strip triple-quote delimiters to prevent delimiter injection
  sanitized = sanitized.replace(/"{3,}/g, '"');
  return `${label}: """${sanitized}"""`;
}

/** Maximum allowed length (in characters) for LLM output before truncation. */
const MAX_LLM_OUTPUT_LENGTH = 50_000;

/**
 * Sanitize LLM-generated output before re-inclusion in subsequent prompts.
 * Prevents multi-hop prompt injection by stripping injection patterns and
 * truncating overly long outputs.
 * @param {string} output - Raw LLM-generated output text.
 * @returns {string} Sanitized and potentially truncated output (max 50,000 characters).
 */
export function sanitizeLlmOutput(output: string): string {
  let sanitized = sanitizeUserInput(output);
  if (sanitized.length > MAX_LLM_OUTPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_LLM_OUTPUT_LENGTH) + "\n[truncated]";
  }
  return sanitized;
}
