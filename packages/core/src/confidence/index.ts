/**
 * @module confidence
 *
 * Investigation Confidence Scoring — scores investigation quality (0-100)
 * based on specificity, domain coverage, recency, and identifies knowledge gaps.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { Investigation } from "../types.js";
import { LlmParseError, ValidationError } from "../errors.js";

// ---- Schemas ----

export const ConfidenceDimensionSchema = z.object({
  name: z.string().max(200),
  score: z.number().min(0).max(100),
  explanation: z.string().max(500),
});

export type ConfidenceDimension = z.infer<typeof ConfidenceDimensionSchema>;

export const KnowledgeGapSchema = z.object({
  topic: z.string().max(500),
  importance: z.enum(["low", "medium", "high", "critical"]),
  suggestion: z.string().max(1000).describe("What to investigate to fill this gap"),
});

export type KnowledgeGap = z.infer<typeof KnowledgeGapSchema>;

export const ConfidenceScoreSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(ConfidenceDimensionSchema).max(10),
  gaps: z.array(KnowledgeGapSchema).max(10),
  recommendation: z.string().max(2000),
  readyForIdeation: z.boolean().describe("Whether the investigation quality is sufficient"),
});

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

// ---- Prompt ----

function buildConfidencePrompt(subject: string, investigation: Investigation): string {
  return `You are an expert at evaluating research quality and knowledge completeness.

${wrapUserInput("SUBJECT", subject)}

INVESTIGATION TO EVALUATE:
"""
Summary: ${sanitizeLlmOutput(investigation.summary)}
Key Aspects: ${investigation.keyAspects.map((a) => `${a.title}: ${a.description}`).join("; ")}
Current State: ${sanitizeLlmOutput(investigation.currentState)}
Challenges: ${investigation.challenges.join("; ")}
Opportunities: ${investigation.opportunities.join("; ")}
"""

Score this investigation's quality across these dimensions:
1. **Specificity** (0-100): How specific and detailed is the analysis? Vague generalizations score low.
2. **Domain Coverage** (0-100): How comprehensively does it cover the subject's key areas?
3. **Recency** (0-100): How up-to-date is the knowledge? References to current trends score high.
4. **Actionability** (0-100): How actionable are the challenges and opportunities identified?
5. **Depth** (0-100): How deep is the analysis? Surface-level observations score low.

Also identify knowledge gaps — areas that should be investigated further before generating ideas.

You MUST respond with valid JSON only.

{
  "overallScore": 72,
  "dimensions": [
    { "name": "Specificity", "score": 75, "explanation": "..." },
    { "name": "Domain Coverage", "score": 68, "explanation": "..." },
    { "name": "Recency", "score": 80, "explanation": "..." },
    { "name": "Actionability", "score": 70, "explanation": "..." },
    { "name": "Depth", "score": 65, "explanation": "..." }
  ],
  "gaps": [
    { "topic": "Sub-topic to investigate", "importance": "high", "suggestion": "You should investigate X for better results" }
  ],
  "recommendation": "Overall assessment and next steps",
  "readyForIdeation": true
}`;
}

// ---- Core Function ----

/**
 * Score investigation quality before generating ideas.
 *
 * @param subject - The investigated subject
 * @param investigation - The investigation result to score
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns ConfidenceScore with dimension breakdown and gap suggestions
 */
export async function scoreInvestigationQuality(
  subject: string,
  investigation: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<ConfidenceScore> {
  if (!subject || subject.trim().length === 0) {
    throw new ValidationError("Subject cannot be empty");
  }

  const prompt = buildConfidencePrompt(subject, investigation);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse confidence score as JSON: ${jsonStr.slice(0, 200)}`,
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

  return ConfidenceScoreSchema.parse(parsed);
}

/**
 * Get gap suggestions formatted as actionable items.
 */
export function formatGapSuggestions(score: ConfidenceScore): string[] {
  return score.gaps
    .filter((g) => g.importance === "high" || g.importance === "critical")
    .map((g) => `[${g.importance.toUpperCase()}] ${g.topic}: ${g.suggestion}`);
}

/**
 * Check if an investigation meets a minimum confidence threshold.
 */
export function meetsConfidenceThreshold(score: ConfidenceScore, minScore: number = 60): boolean {
  return score.overallScore >= minScore;
}
