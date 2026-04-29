import type { Investigation } from "../types.js";

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
export function buildInvestigationPrompt(subject: string): string {
  return `You are an expert innovation analyst. Investigate the following subject thoroughly.

SUBJECT: "${subject}"

Analyze this subject and provide a structured investigation. You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

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

function investigationContext(subject: string, investigation: Investigation): string {
  return `SUBJECT: "${subject}"

INVESTIGATION CONTEXT:
Summary: ${investigation.summary}
Key Aspects: ${investigation.keyAspects.map((a) => `${a.title}: ${a.description}`).join("; ")}
Current State: ${investigation.currentState}
Challenges: ${investigation.challenges.join("; ")}
Opportunities: ${investigation.opportunities.join("; ")}`;
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
${angleResultsJson}

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
