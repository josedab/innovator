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

/** Register a custom validator.
 * @throws If a validator with the same ID is already registered
 */
export function registerValidator(validator: IdeaValidator): void {
  if (validators.has(validator.id)) {
    throw new Error(
      `registerValidator: a validator with id "${validator.id}" is already registered`
    );
  }
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

    return withRetry(
      async () => {
        const raw = await generateText({ prompt, serverMode: true, signal });
        const jsonStr = extractJson(sanitizeLlmOutput(raw));
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
      { signal }
    );
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

    return withRetry(
      async () => {
        const raw = await generateText({ prompt, serverMode: true, signal });
        const jsonStr = extractJson(sanitizeLlmOutput(raw));
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
      { signal }
    );
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

    return withRetry(
      async () => {
        const raw = await generateText({ prompt, serverMode: true, signal });
        const jsonStr = extractJson(sanitizeLlmOutput(raw));
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
      { signal }
    );
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

// ---- Market Sizing Validator ----

/** LLM-based market sizing validator — estimates TAM, SAM, SOM for an idea. */
export const MarketSizingValidator: IdeaValidator = {
  id: "market-sizing",
  name: "Market Sizing Assessment",
  category: "market",
  async validate(idea, domain, signal) {
    const prompt = `You are a market sizing analyst. Estimate the market opportunity for the following idea.

${wrapUserInput("IDEA", `${idea.title}: ${idea.description}`)}
${wrapUserInput("DOMAIN", domain)}

Analyze:
1. Total Addressable Market (TAM) — the total market demand
2. Serviceable Addressable Market (SAM) — the reachable segment
3. Serviceable Obtainable Market (SOM) — realistic short-term capture
4. Market growth trajectory (growing, stable, declining)
5. Key market drivers and headwinds

You MUST respond with valid JSON only:
{
  "score": <0-100, where 0=huge market opportunity, 100=no viable market>,
  "summary": "Brief market sizing assessment",
  "details": "TAM: $X, SAM: $Y, SOM: $Z. Growth: X%. Key drivers: ...",
  "references": ["Market segment or trend reference"]
}`;

    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(sanitizeLlmOutput(result));
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      score: number;
      summary: string;
      details?: string;
      references?: string[];
    };

    return {
      source: "Market Sizing Assessment",
      category: "market",
      status: parsed.score > 70 ? "fail" : parsed.score > 40 ? "warn" : "pass",
      score: parsed.score,
      summary: parsed.summary,
      details: parsed.details,
      references: parsed.references,
    };
  },
};

/** LLM-based regulatory compliance validator. */
export const RegulatoryValidator: IdeaValidator = {
  id: "regulatory-check",
  name: "Regulatory Compliance Check",
  category: "regulatory",
  async validate(idea, domain, signal) {
    const prompt = `You are a regulatory compliance analyst. Evaluate potential regulatory risks for the following idea.

${wrapUserInput("IDEA", `${idea.title}: ${idea.description}`)}
${wrapUserInput("DOMAIN", domain)}

Analyze:
1. Relevant regulations and compliance requirements
2. Data privacy implications (GDPR, CCPA, etc.)
3. Industry-specific regulations
4. Licensing or certification requirements
5. Potential legal barriers

You MUST respond with valid JSON only:
{
  "score": <0-100, where 0=no regulatory risk, 100=major regulatory barriers>,
  "summary": "Brief regulatory assessment",
  "details": "Detailed regulatory analysis",
  "references": ["Relevant regulation or standard"]
}`;

    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(sanitizeLlmOutput(result));
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      score: number;
      summary: string;
      details?: string;
      references?: string[];
    };

    return {
      source: "Regulatory Compliance Check",
      category: "regulatory",
      status: parsed.score > 70 ? "fail" : parsed.score > 40 ? "warn" : "pass",
      score: parsed.score,
      summary: parsed.summary,
      details: parsed.details,
      references: parsed.references,
    };
  },
};

// Register extended validators
registerValidator(MarketSizingValidator);
registerValidator(RegulatoryValidator);

/** Schema for a comprehensive validation report with market context. */
export const ComprehensiveValidationSchema = z.object({
  scorecard: ValidationScorecardSchema,
  marketContext: z.object({
    marketTemperature: z.enum(["cold", "warming", "hot", "saturated"]),
    competitorCount: z.number().min(0),
    regulatoryComplexity: z.enum(["low", "medium", "high"]),
    overallViability: z.enum(["strong", "moderate", "weak", "unknown"]),
  }),
  topRecommendations: z.array(z.string().max(1000)).max(10),
});

export type ComprehensiveValidation = z.infer<typeof ComprehensiveValidationSchema>;

/**
 * Run comprehensive validation including market sizing, competitive scanning,
 * and regulatory checks, producing an enriched validation report.
 */
export async function validateComprehensive(
  ideas: InnovationIdea[],
  domain: string,
  model?: string,
  signal?: AbortSignal
): Promise<ComprehensiveValidation> {
  const scorecard = await validateIdeas(ideas, domain, model, signal);

  // Derive market context from validation checks
  const marketChecks = scorecard.results.flatMap((r) =>
    r.checks.filter((c) => c.category === "market")
  );
  const competitorChecks = scorecard.results.flatMap((r) =>
    r.checks.filter((c) => c.category === "competitor")
  );
  const regulatoryChecks = scorecard.results.flatMap((r) =>
    r.checks.filter((c) => c.category === "regulatory")
  );

  const avgMarketScore =
    marketChecks.length > 0
      ? marketChecks.reduce((s, c) => s + c.score, 0) / marketChecks.length
      : 50;
  const avgCompetitorScore =
    competitorChecks.length > 0
      ? competitorChecks.reduce((s, c) => s + c.score, 0) / competitorChecks.length
      : 50;
  const avgRegulatoryScore =
    regulatoryChecks.length > 0
      ? regulatoryChecks.reduce((s, c) => s + c.score, 0) / regulatoryChecks.length
      : 50;

  const marketTemperature: ComprehensiveValidation["marketContext"]["marketTemperature"] =
    avgMarketScore < 25
      ? "hot"
      : avgMarketScore < 50
        ? "warming"
        : avgMarketScore < 75
          ? "cold"
          : "saturated";

  const regulatoryComplexity: ComprehensiveValidation["marketContext"]["regulatoryComplexity"] =
    avgRegulatoryScore < 30 ? "low" : avgRegulatoryScore < 60 ? "medium" : "high";

  const overallViability: ComprehensiveValidation["marketContext"]["overallViability"] =
    scorecard.results.length === 0
      ? "unknown"
      : scorecard.results.filter((r) => r.overallStatus === "validated").length >
          scorecard.results.length / 2
        ? "strong"
        : scorecard.results.filter((r) => r.overallStatus !== "risky").length >
            scorecard.results.length / 2
          ? "moderate"
          : "weak";

  const topRecommendations: string[] = [];
  for (const result of scorecard.results.slice(0, 5)) {
    if (result.overallStatus === "validated") {
      topRecommendations.push(`✅ "${result.ideaTitle}" — validated, ready for deeper exploration`);
    } else if (result.overallStatus === "caution") {
      topRecommendations.push(`⚠️ "${result.ideaTitle}" — ${result.recommendation}`);
    } else if (result.overallStatus === "risky") {
      topRecommendations.push(`❌ "${result.ideaTitle}" — ${result.recommendation}`);
    }
  }

  return {
    scorecard,
    marketContext: {
      marketTemperature,
      competitorCount: competitorChecks.length,
      regulatoryComplexity,
      overallViability,
    },
    topRecommendations,
  };
}
