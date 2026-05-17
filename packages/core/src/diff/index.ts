/**
 * @module diff
 *
 * Innovation Diff — Before/After Analyzer.
 * Compares two snapshots of a subject and generates a structured diff:
 * what changed, new opportunities, obsoleted ideas, and emerging gaps.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import { LlmParseError, ValidationError } from "../errors.js";

// ---- Schemas ----

export const DiffItemSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  significance: z.enum(["low", "medium", "high"]),
});

export type DiffItem = z.infer<typeof DiffItemSchema>;

export const DiffResultSchema = z.object({
  subjectA: z.string().max(500),
  subjectB: z.string().max(500),
  changed: z.array(DiffItemSchema).max(20).describe("What changed between the two snapshots"),
  newOpportunities: z
    .array(DiffItemSchema)
    .max(20)
    .describe("New opportunities created by the changes"),
  obsoleted: z.array(DiffItemSchema).max(20).describe("Ideas or approaches that are now obsolete"),
  emergingGaps: z.array(DiffItemSchema).max(20).describe("Emerging gaps and unaddressed needs"),
  summary: z.string().max(3000).describe("Executive summary of the diff"),
});

export type DiffResult = z.infer<typeof DiffResultSchema>;

// ---- Prompt ----

export function buildDiffPrompt(subjectA: string, subjectB: string): string {
  return `You are an expert innovation analyst specializing in temporal and comparative analysis.

Compare these two snapshots of a subject and produce a structured innovation diff.

${wrapUserInput("SNAPSHOT A", subjectA)}

${wrapUserInput("SNAPSHOT B", subjectB)}

Analyze the evolution between snapshot A and snapshot B. Identify:
1. **Changed**: What fundamentally changed between the two snapshots
2. **New Opportunities**: What new opportunities were created by the changes
3. **Obsoleted**: What ideas, approaches, or assumptions are now obsolete
4. **Emerging Gaps**: What gaps or unmet needs have emerged

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "subjectA": "Brief label for snapshot A",
  "subjectB": "Brief label for snapshot B",
  "changed": [
    { "title": "Change title", "description": "What changed and why it matters", "significance": "high" }
  ],
  "newOpportunities": [
    { "title": "Opportunity", "description": "Description", "significance": "medium" }
  ],
  "obsoleted": [
    { "title": "Obsolete idea", "description": "Why it's no longer relevant", "significance": "low" }
  ],
  "emergingGaps": [
    { "title": "Gap", "description": "What's missing now", "significance": "high" }
  ],
  "summary": "Executive summary of key changes and their innovation implications"
}

Provide 3-7 items per category. Be specific and actionable.`;
}

// ---- Core Function ----

/**
 * Run an innovation diff comparing two snapshots of a subject.
 *
 * @param subjectA - First snapshot (e.g., "remote work in 2020")
 * @param subjectB - Second snapshot (e.g., "remote work in 2026")
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Structured DiffResult
 */
export async function runInnovationDiff(
  subjectA: string,
  subjectB: string,
  model?: string,
  signal?: AbortSignal
): Promise<DiffResult> {
  if (!subjectA || subjectA.trim().length === 0) {
    throw new ValidationError("Snapshot A cannot be empty");
  }
  if (!subjectB || subjectB.trim().length === 0) {
    throw new ValidationError("Snapshot B cannot be empty");
  }
  if (subjectA.length > 2000 || subjectB.length > 2000) {
    throw new ValidationError("Snapshot descriptions must be under 2000 characters");
  }

  const prompt = buildDiffPrompt(subjectA, subjectB);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse diff response as JSON: ${jsonStr.slice(0, 200)}`,
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

  return DiffResultSchema.parse(parsed);
}
