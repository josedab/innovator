import type { Investigation } from "../types.js";
import { wrapUserInput, sanitizeLlmOutput, sanitizeUserInput } from "./sanitize.js";

/**
 * Build the LLM prompt for investigating a subject.
 *
 * @param subject - The topic to investigate
 * @returns A formatted prompt string requesting structured JSON analysis
 *
 * @example
 * ```ts
 * const prompt = buildInvestigationPrompt("home automation");
 * const raw = await generateText({ prompt });
 * ```
 */
export function buildInvestigationPrompt(subject: string, contextDocuments?: string): string {
  const contextBlock = contextDocuments
    ? `\n${sanitizeLlmOutput(contextDocuments)}\n\nUse the knowledge base context above to ground your analysis with specific, relevant details.\n`
    : "";

  return `You are an expert innovation analyst. Investigate the following subject thoroughly.

${wrapUserInput("SUBJECT", subject)}${contextBlock}

Analyze the subject above and provide a structured investigation. You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

Respond with this exact JSON structure:
{
  "summary": "A concise 2-3 sentence summary of the subject",
  "keyAspects": [
    { "title": "Aspect name", "description": "Brief description" }
  ],
  "currentState": "Description of the current state of the art or practice",
  "challenges": ["Challenge 1", "Challenge 2", "Challenge 3"],
  "opportunities": ["Opportunity 1", "Opportunity 2", "Opportunity 3"]
}

Provide 4-6 key aspects, 3-5 challenges, and 3-5 opportunities. Be specific, insightful, and actionable.`;
}

/** Maximum character length for the formatted investigation context included in prompts. */
const MAX_CONTEXT_LENGTH = 10_000;

/**
 * Format the investigation context for inclusion in angle and synthesis LLM prompts.
 *
 * Used by all angle prompt builders to provide the LLM with structured context
 * about the subject and its investigation results.
 *
 * @param subject - The original topic being investigated
 * @param investigation - The structured investigation result (summary, aspects, challenges, etc.)
 * @returns A formatted string containing the subject and investigation context,
 *          truncated to {@link MAX_CONTEXT_LENGTH} characters with a `[truncated]` marker if exceeded
 */
function investigationContext(subject: string, investigation: Investigation): string {
  const raw = `${wrapUserInput("SUBJECT", subject)}

INVESTIGATION CONTEXT:
Summary: ${sanitizeUserInput(investigation.summary)}
Key Aspects: ${investigation.keyAspects.map((a) => `${sanitizeUserInput(a.title)}: ${sanitizeUserInput(a.description)}`).join("; ")}
Current State: ${sanitizeUserInput(investigation.currentState)}
Challenges: ${investigation.challenges.map((c) => sanitizeUserInput(c)).join("; ")}
Opportunities: ${investigation.opportunities.map((o) => sanitizeUserInput(o)).join("; ")}`;
  if (raw.length > MAX_CONTEXT_LENGTH) {
    return raw.slice(0, MAX_CONTEXT_LENGTH) + "\n[truncated]";
  }
  return raw;
}

/**
 * Build the LLM prompt for synthesizing results from multiple innovation angles.
 *
 * @param subject - The original topic
 * @param investigation - The investigation context
 * @param angleResultsJson - JSON-serialized array of angle results
 * @returns A formatted prompt string requesting a synthesis JSON response
 *
 * @example
 * ```ts
 * const prompt = buildSynthesisPrompt(subject, investigation, JSON.stringify(results));
 * const raw = await generateText({ prompt });
 * ```
 */
export function buildSynthesisPrompt(
  subject: string,
  investigation: Investigation,
  angleResultsJson: string
): string {
  return `You are a strategic innovation synthesizer. Review all innovation ideas generated across multiple angles and produce a synthesis.

${investigationContext(subject, investigation)}

ANGLE RESULTS:
"""
${sanitizeLlmOutput(angleResultsJson)}
"""

Synthesize these results. You MUST respond with valid JSON only.

Respond with this exact JSON structure:
{
  "topIdeas": [
    {
      "title": "Idea title",
      "description": "Full description",
      "sourceAngle": "Which angle this came from",
      "potentialImpact": "Impact description",
      "feasibility": "low" | "medium" | "high"
    }
  ],
  "themes": ["Cross-cutting theme 1", "Theme 2"],
  "recommendation": "Overall strategic recommendation based on all ideas"
}

Select the top 5-7 most promising ideas, identify 3-5 cross-cutting themes, and provide an actionable recommendation.`;
}

export { investigationContext };
