# ADR-0011: Prompt Injection Defense Layer

## Status

Accepted

## Context

Innovator interpolates user-provided text (subjects, custom angle descriptions, refinement messages) directly into LLM prompts. This creates a prompt injection attack surface: a malicious user could craft input that overrides system instructions, extracts sensitive context, or causes the LLM to produce harmful output.

Additionally, in multi-step pipelines, LLM output from one stage is injected into prompts for subsequent stages (e.g., investigation results feed into angle generation prompts). This creates a **multi-hop injection** risk where the LLM's own output could contain injection payloads.

The team needed a defense strategy that mitigates these risks without being so aggressive that it strips legitimate user content.

## Decision

We implement a **defense-in-depth sanitization layer** in `packages/core/src/prompts/sanitize.ts` with three functions:

### `sanitizeUserInput(input: string)`

Applied to all user-provided text before prompt interpolation:

1. **Unicode normalization** — NFC normalization to prevent homoglyph bypass.
2. **Invisible character removal** — Strips zero-width spaces, joiners, and other invisible Unicode characters that could hide injection payloads.
3. **Whitespace normalization** — Converts unicode whitespace variants to regular spaces.
4. **Instruction override stripping** — Removes patterns like "ignore all previous instructions", "disregard prior context", "forget the rules above".
5. **Role assumption stripping** — Removes patterns like "you are now", "act as", "pretend to be", "new instructions".
6. **Delimiter stripping** — Removes XML/markdown-style tags (`<system>`, `<assistant>`, `<prompt>`) that could mimic system delimiters.

### `wrapUserInput(label: string, value: string)`

Wraps sanitized user text in triple-quote delimiters with a label, creating clear boundaries the LLM can use to distinguish user content from system instructions:

```
Subject: """user's sanitized input here"""
```

Triple-quote sequences within the input are collapsed to prevent delimiter injection.

### `sanitizeLlmOutput(output: string)`

Applied to LLM output before re-inclusion in subsequent prompts (multi-hop defense):

1. Runs the same sanitization as user input.
2. Truncates output at 50,000 characters to prevent context window stuffing.

## Consequences

**Positive:**

- **Multi-layer defense** — Input sanitization, output sanitization, and delimiter wrapping each address different attack vectors independently.
- **Transparent to users** — Legitimate innovation subjects ("How to improve solar panels") pass through unchanged. Only adversarial patterns are stripped.
- **Multi-hop protection** — Sanitizing LLM output before re-injection prevents the model's own hallucinated "instructions" from hijacking subsequent pipeline stages.
- **Unicode-aware** — Defends against homoglyph and invisible character attacks, not just ASCII patterns.

**Negative:**

- **Regex-based detection** — Pattern matching is inherently an arms race. Novel injection techniques that don't match the current patterns will bypass the filter. This is a mitigation, not a complete solution.
- **False positives possible** — A legitimate subject like "How to ignore previous constraints in manufacturing" would have "ignore previous" stripped. The impact is low (the rest of the subject provides sufficient context) but not zero.
- **No semantic analysis** — The sanitizer operates on string patterns, not meaning. It cannot detect semantically equivalent injections expressed differently.
- **Maintenance burden** — As new injection techniques emerge, the regex patterns need updating. The team should monitor LLM security research for new vectors.
