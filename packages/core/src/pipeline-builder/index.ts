/**
 * @module pipeline-builder
 *
 * Natural Language Pipeline Builder — lets users describe custom pipelines
 * in plain English and parses them into a structured PipelineConfig.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import { ANGLE_IDS, type AngleId } from "../types.js";

// ---- PipelineConfig Schema ----

/** Which pipeline phases to include/skip. */
export const PipelinePhaseSchema = z.enum([
  "investigate",
  "generate",
  "synthesize",
  "score",
  "validate",
]);

export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;

/** Output format for the pipeline results. */
export const OutputFormatSchema = z.enum([
  "markdown",
  "json",
  "pitch-deck",
  "executive-summary",
  "technical-brief",
]);

export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/** Full pipeline configuration derived from natural language or direct specification. */
export const PipelineConfigSchema = z.object({
  subject: z.string().max(2000).describe("The subject to innovate on"),
  phases: z.array(PipelinePhaseSchema).min(1).max(5).describe("Which phases to run, in order"),
  angles: z
    .array(z.string().max(100))
    .max(20)
    .optional()
    .describe("Specific angles to use (defaults to all)"),
  skipPhases: z.array(PipelinePhaseSchema).optional().describe("Phases to explicitly skip"),
  outputFormat: OutputFormatSchema.optional().describe("Desired output format"),
  model: z.string().max(100).optional().describe("LLM model override"),
  maxIdeas: z.number().int().min(1).max(100).optional().describe("Maximum ideas to return"),
  focusArea: z.string().max(500).optional().describe("Specific area to focus innovation on"),
  constraints: z.array(z.string().max(500)).max(20).optional().describe("Constraints to apply"),
  depth: z.enum(["shallow", "standard", "deep"]).optional().describe("Investigation depth"),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// ---- Prompt Builder ----

function buildParsePrompt(naturalLanguage: string): string {
  return `You are a pipeline configuration parser for an AI innovation tool.

The user describes what they want in plain English. Parse their request into a structured pipeline configuration.

Available phases: investigate, generate, synthesize, score, validate
Available angles: ${ANGLE_IDS.join(", ")}
Available output formats: markdown, json, pitch-deck, executive-summary, technical-brief
Available depths: shallow, standard, deep

${wrapUserInput("USER REQUEST", naturalLanguage)}

Parse the request above into a pipeline configuration. Extract:
- subject: What they want to innovate on
- phases: Which phases to run (default: ["investigate", "generate", "synthesize"])
- angles: Specific angles requested (omit for all angles)
- skipPhases: Any phases explicitly skipped
- outputFormat: Desired output format if mentioned
- maxIdeas: Max ideas if mentioned
- focusArea: Specific focus area if mentioned
- constraints: Any constraints mentioned
- depth: shallow/standard/deep if mentioned

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "subject": "extracted subject",
  "phases": ["investigate", "generate", "synthesize"],
  "angles": ["scamper", "first-principles"],
  "outputFormat": "markdown",
  "maxIdeas": 10,
  "focusArea": "mobile apps",
  "constraints": ["budget under 50K"],
  "depth": "standard"
}

Only include optional fields if the user explicitly mentioned them.`;
}

// ---- Parser ----

/**
 * Parse a natural language pipeline description into a structured PipelineConfig.
 *
 * @param naturalLanguage - Plain English description of the desired pipeline
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns A validated PipelineConfig
 */
export async function parsePipelineRequest(
  naturalLanguage: string,
  model?: string,
  signal?: AbortSignal
): Promise<PipelineConfig> {
  if (!naturalLanguage || naturalLanguage.trim().length === 0) {
    throw new Error("Pipeline request cannot be empty");
  }

  if (naturalLanguage.length > 5000) {
    throw new Error("Pipeline request too long (max 5000 characters)");
  }

  const prompt = buildParsePrompt(naturalLanguage);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse pipeline config as JSON: ${jsonStr.slice(0, 200)}`);
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

  return PipelineConfigSchema.parse(parsed);
}

/**
 * Resolve a PipelineConfig into the effective phases to run,
 * applying skipPhases and defaults.
 */
export function resolvePhases(config: PipelineConfig): PipelinePhase[] {
  const skipSet = new Set(config.skipPhases ?? []);
  return config.phases.filter((p) => !skipSet.has(p));
}

/**
 * Resolve the effective angles from a PipelineConfig.
 * Returns validated AngleId array or all angles if none specified.
 */
export function resolveAngles(config: PipelineConfig): AngleId[] {
  if (!config.angles || config.angles.length === 0) {
    return [...ANGLE_IDS];
  }
  const validAngles = config.angles.filter((a) => (ANGLE_IDS as readonly string[]).includes(a));
  return (validAngles.length > 0 ? validAngles : [...ANGLE_IDS]) as AngleId[];
}
