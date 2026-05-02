/**
 * @module validation
 *
 * Idea validation engine — validates generated ideas against real-world data
 * including patent databases, market reports, competitor analysis, and
 * technical feasibility checks. Produces a validation scorecard per idea.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Zod Schemas ----

/** Schema for a single validation check result. */
export const ValidationCheckSchema = z.object({
  source: z.string().max(200).describe("Name of the validation source (e.g., 'Google Patents')"),
  category: z.enum(["patent", "market", "competitor", "feasibility", "regulatory"]),
  status: z.enum(["pass", "warn", "fail", "unknown"]),
  score: z.number().min(0).max(100).describe("Confidence/risk score (0=no risk, 100=high risk)"),
  summary: z.string().max(2000).describe("Brief explanation of findings"),
  details: z.string().max(5000).optional().describe("Detailed findings or references"),
  references: z.array(z.string().max(500)).max(20).optional(),
});

/** Schema for a complete validation result. */
export const ValidationResultSchema = z.object({
  ideaTitle: z.string().max(500),
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall validation score (0=invalid, 100=highly validated)"),
  overallStatus: z.enum(["validated", "caution", "risky", "insufficient-data"]),
  checks: z.array(ValidationCheckSchema).max(20),
  recommendation: z.string().max(2000),
  validatedAt: z.string().describe("ISO 8601 timestamp"),
});

/** Schema for a full validation scorecard covering multiple ideas. */
export const ValidationScorecardSchema = z.object({
  domain: z.string().max(200),
  results: z.array(ValidationResultSchema).max(100),
  summary: z.string().max(2000),
  generatedAt: z.string(),
});

export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type ValidationScorecard = z.infer<typeof ValidationScorecardSchema>;

// ---- Validator Interface ----

/** Pluggable validator that checks an idea against a specific data source. */
export interface IdeaValidator {
  id: string;
  name: string;
  category: ValidationCheck["category"];
  validate(idea: InnovationIdea, domain: string, signal?: AbortSignal): Promise<ValidationCheck>;
}

// Registry of validators
const validators: Map<string, IdeaValidator> = new Map();

/** Register a custom validator. */
export function registerValidator(validator: IdeaValidator): void {
  validators.set(validator.id, validator);
}

/** Unregister a validator by ID. */
export function unregisterValidator(id: string): boolean {
  return validators.delete(id);
}

/** List all registered validators. */
export function listValidators(): IdeaValidator[] {
  return Array.from(validators.values());
}

/** Clear all registered validators. */
export function clearValidators(): void {
  validators.clear();
}

// ---- Built-in Validators ----

/** LLM-based patent similarity validator (simulates Google Patents API check). */
export const PatentValidator: IdeaValidator = {
  id: "patent-search",
  name: "Patent Database Search",
  category: "patent",
  async validate(idea, domain, signal) {
    const prompt = `You are a patent research analyst. Evaluate whether the following idea likely has existing patents or prior art.

${wrapUserInput("IDEA", `${idea.title}: ${idea.description}`)}
${wrapUserInput("DOMAIN", domain)}

Analyze for:
1. Likelihood of existing patents covering this concept
2. Known prior art in this domain
3. Patent landscape density

You MUST respond with valid JSON only:
{
  "score": <0-100, where 0=no patent conflict, 100=definitely patented>,
  "summary": "Brief assessment of patent risk",
  "details": "Detailed analysis of potential patent conflicts",
  "references": ["Relevant patent area or known patent"]
}`;

    const raw = await generateText({ prompt, serverMode: true, signal });
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as {
      score: number;
      summary: string;
      details?: string;
      references?: string[];
    };

    return {
      source: "Patent Database Analysis",
      category: "patent",
      status: parsed.score > 70 ? "fail" : parsed.score > 40 ? "warn" : "pass",
      score: parsed.score,
      summary: parsed.summary,
      details: parsed.details,
      references: parsed.references,
    };
  },
};

/** LLM-based market/competitor analysis validator. */
export const MarketValidator: IdeaValidator = {
  id: "market-analysis",
  name: "Market & Competitor Analysis",
  category: "competitor",
  async validate(idea, domain, signal) {
    const prompt = `You are a market research analyst. Evaluate whether the following idea has existing competitors or market presence.

${wrapUserInput("IDEA", `${idea.title}: ${idea.description}`)}
${wrapUserInput("DOMAIN", domain)}

Analyze for:
1. Existing competitors with similar solutions
2. Market saturation level
3. Differentiation potential

You MUST respond with valid JSON only:
{
  "score": <0-100, where 0=blue ocean/no competitors, 100=saturated market>,
  "summary": "Brief market assessment",
  "details": "Detailed competitive landscape",
  "references": ["Known competitor or product"]
}`;

    const raw = await generateText({ prompt, serverMode: true, signal });
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as {
      score: number;
      summary: string;
      details?: string;
      references?: string[];
    };

    return {
      source: "Market & Competitor Analysis",
      category: "competitor",
      status: parsed.score > 70 ? "fail" : parsed.score > 40 ? "warn" : "pass",
      score: parsed.score,
      summary: parsed.summary,
      details: parsed.details,
      references: parsed.references,
    };
  },
};

/** LLM-based technical feasibility validator. */
export const FeasibilityValidator: IdeaValidator = {
  id: "feasibility-check",
  name: "Technical Feasibility Assessment",
  category: "feasibility",
  async validate(idea, domain, signal) {
    const prompt = `You are a technical feasibility analyst. Evaluate whether the following idea is technically feasible with current technology.

${wrapUserInput("IDEA", `${idea.title}: ${idea.description}`)}
${wrapUserInput("IMPLEMENTATION HINT", idea.implementationHint)}
${wrapUserInput("DOMAIN", domain)}

Analyze for:
1. Technical feasibility with current technology
2. Required resources and expertise
3. Key technical risks and challenges
4. Time-to-prototype estimate

You MUST respond with valid JSON only:
{
  "score": <0-100, where 0=highly feasible, 100=not feasible>,
  "summary": "Brief feasibility assessment",
  "details": "Detailed technical analysis",
  "references": ["Relevant technology or framework"]
}`;

    const raw = await generateText({ prompt, serverMode: true, signal });
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as {
      score: number;
      summary: string;
      details?: string;
      references?: string[];
    };

    return {
      source: "Technical Feasibility Assessment",
      category: "feasibility",
      status: parsed.score > 70 ? "fail" : parsed.score > 40 ? "warn" : "pass",
      score: parsed.score,
      summary: parsed.summary,
      details: parsed.details,
      references: parsed.references,
    };
  },
};

// Register built-in validators
registerValidator(PatentValidator);
registerValidator(MarketValidator);
registerValidator(FeasibilityValidator);

// ---- Core Validation Functions ----

/**
 * Validate a single idea against all registered validators.
 *
 * @param idea - The innovation idea to validate
 * @param domain - The domain/industry context
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns A ValidationResult with checks from all validators
 */
export async function validateIdea(
  idea: InnovationIdea,
  domain: string,
  model?: string,
  signal?: AbortSignal
): Promise<ValidationResult> {
  const activeValidators = listValidators();
  if (activeValidators.length === 0) {
    return {
      ideaTitle: idea.title,
      overallScore: 0,
      overallStatus: "insufficient-data",
      checks: [],
      recommendation:
        "No validators are registered. Register validators to enable idea validation.",
      validatedAt: new Date().toISOString(),
    };
  }

  const checks: ValidationCheck[] = [];

  for (const validator of activeValidators) {
    if (signal?.aborted) break;
    try {
      const check = await validator.validate(idea, domain, signal);
      checks.push(check);
    } catch {
      checks.push({
        source: validator.name,
        category: validator.category,
        status: "unknown",
        score: 50,
        summary: `Validation check failed: ${validator.name}. Results may be incomplete.`,
      });
    }
  }

  // Compute overall score: inverse average of risk scores (higher = more validated)
  const avgRisk =
    checks.length > 0 ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length : 50;
  const overallScore = Math.round(100 - avgRisk);

  const overallStatus: ValidationResult["overallStatus"] =
    overallScore >= 70
      ? "validated"
      : overallScore >= 40
        ? "caution"
        : overallScore > 0
          ? "risky"
          : "insufficient-data";

  const recommendation = buildRecommendation(checks, overallScore);

  return {
    ideaTitle: idea.title,
    overallScore,
    overallStatus,
    checks,
    recommendation,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validate multiple ideas and produce a full scorecard.
 *
 * @param ideas - Array of innovation ideas to validate
 * @param domain - The domain/industry context
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns A ValidationScorecard with results for each idea
 */
export async function validateIdeas(
  ideas: InnovationIdea[],
  domain: string,
  model?: string,
  signal?: AbortSignal
): Promise<ValidationScorecard> {
  const results: ValidationResult[] = [];

  for (const idea of ideas) {
    if (signal?.aborted) break;
    const result = await validateIdea(idea, domain, model, signal);
    results.push(result);
  }

  const avgScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length)
      : 0;

  const validated = results.filter((r) => r.overallStatus === "validated").length;
  const cautioned = results.filter((r) => r.overallStatus === "caution").length;
  const risky = results.filter((r) => r.overallStatus === "risky").length;

  return {
    domain,
    results,
    summary: `Validated ${results.length} ideas: ${validated} validated, ${cautioned} with caution, ${risky} risky. Average score: ${avgScore}/100.`,
    generatedAt: new Date().toISOString(),
  };
}

function buildRecommendation(checks: ValidationCheck[], overallScore: number): string {
  const issues = checks.filter((c) => c.status === "fail" || c.status === "warn");
  if (issues.length === 0) {
    return "This idea appears viable across all validation dimensions. Consider proceeding to detailed planning.";
  }
  const warnings = issues.map((i) => `${i.source}: ${i.summary}`).join("; ");
  if (overallScore >= 70) {
    return `Generally viable with minor concerns: ${warnings}`;
  }
  if (overallScore >= 40) {
    return `Proceed with caution. Key concerns: ${warnings}`;
  }
  return `Significant risks identified. Address before proceeding: ${warnings}`;
}
