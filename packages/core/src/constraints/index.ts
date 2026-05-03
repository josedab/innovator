/**
 * @module constraints
 *
 * Constraint Satisfaction Optimizer — define hard constraints and soft preferences,
 * then re-rank and filter ideas using structured LLM evaluation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, InnovationIdea } from "../types.js";

// ---- Schemas ----

export const ConstraintTypeSchema = z.enum(["hard", "soft"]);
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;

export const ConstraintOperatorSchema = z.enum([
  "less-than",
  "greater-than",
  "equals",
  "not-equals",
  "contains",
  "excludes",
]);
export type ConstraintOperator = z.infer<typeof ConstraintOperatorSchema>;

export const ConstraintSchema = z.object({
  type: ConstraintTypeSchema,
  dimension: z.string().min(1).max(200).describe("What this constraint applies to (e.g., 'budget', 'timeline', 'platform')"),
  operator: ConstraintOperatorSchema,
  value: z.string().min(1).max(500).describe("The constraint value (e.g., '50K', '3 months', 'mobile')"),
  weight: z.number().min(0).max(1).optional().describe("Importance weight for soft constraints (0-1)"),
});

export type Constraint = z.infer<typeof ConstraintSchema>;

export const ConstraintEvaluationSchema = z.object({
  ideaTitle: z.string().max(500),
  passes: z.boolean().describe("Whether the idea passes all hard constraints"),
  score: z.number().min(0).max(100).describe("Overall constraint satisfaction score (0-100)"),
  constraintResults: z.array(
    z.object({
      dimension: z.string().max(200),
      satisfied: z.boolean(),
      explanation: z.string().max(500),
    })
  ).max(50),
  recommendation: z.string().max(1000).optional(),
});

export type ConstraintEvaluation = z.infer<typeof ConstraintEvaluationSchema>;

export const ConstraintResultSchema = z.object({
  evaluations: z.array(ConstraintEvaluationSchema).max(200),
  filteredIdeas: z.array(z.string().max(500)).describe("Ideas that pass all hard constraints"),
  rankedIdeas: z.array(z.string().max(500)).describe("Ideas ranked by constraint satisfaction"),
  summary: z.string().max(2000),
});

export type ConstraintResult = z.infer<typeof ConstraintResultSchema>;

// ---- Prompt ----

function buildConstraintPrompt(
  ideas: { title: string; description: string }[],
  constraints: Constraint[]
): string {
  const hardConstraints = constraints.filter((c) => c.type === "hard");
  const softConstraints = constraints.filter((c) => c.type === "soft");

  return `You are an expert at evaluating innovation ideas against constraints.

IDEAS TO EVALUATE:
"""
${sanitizeLlmOutput(JSON.stringify(ideas.map((i) => ({ title: i.title, description: i.description })), null, 2))}
"""

HARD CONSTRAINTS (must pass ALL):
${hardConstraints.length > 0 ? hardConstraints.map((c) => `- ${c.dimension} ${c.operator} ${c.value}`).join("\n") : "None"}

SOFT PREFERENCES (prefer but not required):
${softConstraints.length > 0 ? softConstraints.map((c) => `- ${c.dimension} ${c.operator} ${c.value} (weight: ${c.weight ?? 0.5})`).join("\n") : "None"}

Evaluate EVERY idea against ALL constraints. For each idea:
1. Check if it passes all hard constraints
2. Score it 0-100 on overall constraint satisfaction
3. Provide per-constraint results

You MUST respond with valid JSON only.

{
  "evaluations": [
    {
      "ideaTitle": "Exact title",
      "passes": true,
      "score": 85,
      "constraintResults": [
        { "dimension": "budget", "satisfied": true, "explanation": "Estimated cost $30K, under $50K limit" }
      ],
      "recommendation": "Proceed with mobile-first approach"
    }
  ],
  "filteredIdeas": ["Ideas that pass all hard constraints"],
  "rankedIdeas": ["Ideas ranked by score, highest first"],
  "summary": "Overview of constraint evaluation results"
}`;
}

// ---- Core Function ----

/**
 * Evaluate ideas against hard constraints and soft preferences.
 *
 * @param ideas - Ideas to evaluate (from AngleResult or flat list)
 * @param constraints - Hard and soft constraints
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns ConstraintResult with evaluations, filtered list, and rankings
 */
export async function evaluateConstraints(
  ideas: { title: string; description: string }[],
  constraints: Constraint[],
  model?: string,
  signal?: AbortSignal
): Promise<ConstraintResult> {
  if (ideas.length === 0) {
    return {
      evaluations: [],
      filteredIdeas: [],
      rankedIdeas: [],
      summary: "No ideas to evaluate.",
    };
  }

  if (constraints.length === 0) {
    return {
      evaluations: ideas.map((i) => ({
        ideaTitle: i.title,
        passes: true,
        score: 100,
        constraintResults: [],
      })),
      filteredIdeas: ideas.map((i) => i.title),
      rankedIdeas: ideas.map((i) => i.title),
      summary: "No constraints applied. All ideas pass.",
    };
  }

  // Validate constraints
  for (const c of constraints) {
    ConstraintSchema.parse(c);
  }

  const prompt = buildConstraintPrompt(ideas, constraints);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse constraint evaluation as JSON: ${jsonStr.slice(0, 200)}`);
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

  return ConstraintResultSchema.parse(parsed);
}

/**
 * Extract flat idea list from angle results for constraint evaluation.
 */
export function flattenIdeas(angleResults: AngleResult[]): { title: string; description: string }[] {
  return angleResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({
      title: idea.title,
      description: idea.description,
    }))
  );
}

/**
 * Parse a CLI constraint string like "budget<50K" into a Constraint.
 */
export function parseConstraintString(str: string): Constraint {
  const operators: [string, ConstraintOperator][] = [
    ["!=", "not-equals"],
    ["<=", "less-than"],
    [">=", "greater-than"],
    ["<", "less-than"],
    [">", "greater-than"],
    ["=", "equals"],
    ["~", "contains"],
    ["!", "excludes"],
  ];

  for (const [symbol, operator] of operators) {
    const idx = str.indexOf(symbol);
    if (idx > 0) {
      const dimension = str.slice(0, idx).trim();
      const value = str.slice(idx + symbol.length).trim();
      if (dimension && value) {
        return { type: "hard", dimension, operator, value };
      }
    }
  }

  throw new Error(`Cannot parse constraint: "${str}". Use format: dimension<value, dimension=value, etc.`);
}
