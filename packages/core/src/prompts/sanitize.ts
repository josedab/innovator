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

  // Strip zero-width, invisible characters, and null bytes
  sanitized = sanitized.replace(/[\u0000\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, "");

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

/** Maximum allowed length (in characters) for an innovation subject. */
const MAX_SUBJECT_LENGTH = 500;

/** Minimum allowed length (in characters) for an innovation subject after trimming. */
const MIN_SUBJECT_LENGTH = 2;

/** Result of subject validation. */
export interface SubjectValidationResult {
  /** Whether the subject is valid. */
  valid: boolean;
  /** Sanitized subject string (trimmed and cleaned). Only set when valid. */
  sanitized?: string;
  /** Human-readable error message. Only set when invalid. */
  error?: string;
}

/**
 * Validate and sanitize an innovation subject string.
 *
 * Checks for:
 * - Non-empty / non-whitespace content
 * - Minimum length (2 characters after trimming)
 * - Maximum length (500 characters)
 * - Applies prompt-injection sanitization
 *
 * @param subject - Raw user-provided subject string
 * @returns A {@link SubjectValidationResult} with sanitized subject or error message
 *
 * @example
 * ```ts
 * const result = validateSubject("solar energy");
 * if (result.valid) {
 *   await investigate(result.sanitized);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateSubject(subject: unknown): SubjectValidationResult {
  if (typeof subject !== "string") {
    return { valid: false, error: "Subject must be a string" };
  }

  const trimmed = subject.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Subject must not be empty" };
  }

  if (trimmed.length < MIN_SUBJECT_LENGTH) {
    return {
      valid: false,
      error: `Subject must be at least ${MIN_SUBJECT_LENGTH} characters`,
    };
  }

  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    return {
      valid: false,
      error: `Subject must not exceed ${MAX_SUBJECT_LENGTH} characters`,
    };
  }

  const sanitized = sanitizeUserInput(trimmed);

  if (sanitized.length < MIN_SUBJECT_LENGTH) {
    return {
      valid: false,
      error: "Subject contains only invalid characters after sanitization",
    };
  }

  return { valid: true, sanitized };
}

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
