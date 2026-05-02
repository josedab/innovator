/**
 * @module sustainability
 *
 * Ethical & Sustainability Impact Assessment — scores ideas across 3 ESG
 * dimensions (Environmental, Social, Governance) with traffic-light indicators,
 * risk flags, and improvement suggestions.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

/** Traffic light indicator for ESG scoring. */
export const TrafficLightSchema = z.enum(["green", "yellow", "red"]);

/** Environmental impact assessment. */
export const EnvironmentalScoreSchema = z.object({
  carbonImpact: z.number().min(0).max(10),
  wasteGeneration: z.number().min(0).max(10),
  resourceUse: z.number().min(0).max(10),
  overallScore: z.number().min(0).max(10),
  indicator: TrafficLightSchema,
  details: z.string().max(1000),
});

/** Social impact assessment. */
export const SocialScoreSchema = z.object({
  accessibility: z.number().min(0).max(10),
  inclusion: z.number().min(0).max(10),
  displacement: z.number().min(0).max(10),
  overallScore: z.number().min(0).max(10),
  indicator: TrafficLightSchema,
  details: z.string().max(1000),
});

/** Governance impact assessment. */
export const GovernanceScoreSchema = z.object({
  transparency: z.number().min(0).max(10),
  accountability: z.number().min(0).max(10),
  overallScore: z.number().min(0).max(10),
  indicator: TrafficLightSchema,
  details: z.string().max(1000),
});

/** A risk flag identified during assessment. */
export const ESGRiskFlagSchema = z.object({
  dimension: z.enum(["environmental", "social", "governance"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().max(500),
  mitigation: z.string().max(500),
});

/** An improvement suggestion. */
export const ImprovementSuggestionSchema = z.object({
  dimension: z.enum(["environmental", "social", "governance"]),
  suggestion: z.string().max(500),
  effort: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
});

/** Full sustainability scorecard for a single idea. */
export const SustainabilityScorecardSchema = z.object({
  ideaTitle: z.string().max(500),
  environmental: EnvironmentalScoreSchema,
  social: SocialScoreSchema,
  governance: GovernanceScoreSchema,
  overallScore: z.number().min(0).max(10),
  overallIndicator: TrafficLightSchema,
  riskFlags: z.array(ESGRiskFlagSchema).max(20),
  improvements: z.array(ImprovementSuggestionSchema).max(20),
  summary: z.string().max(2000),
});

/** Portfolio-level sustainability summary. */
export const PortfolioSustainabilitySchema = z.object({
  totalIdeas: z.number(),
  averageScore: z.number().min(0).max(10),
  distribution: z.object({
    green: z.number(),
    yellow: z.number(),
    red: z.number(),
  }),
  topRisks: z.array(ESGRiskFlagSchema).max(10),
  topImprovements: z.array(ImprovementSuggestionSchema).max(10),
  scorecards: z.array(SustainabilityScorecardSchema).max(100),
});

// ---- Types ----

export type TrafficLight = z.infer<typeof TrafficLightSchema>;
export type EnvironmentalScore = z.infer<typeof EnvironmentalScoreSchema>;
export type SocialScore = z.infer<typeof SocialScoreSchema>;
export type GovernanceScore = z.infer<typeof GovernanceScoreSchema>;
export type ESGRiskFlag = z.infer<typeof ESGRiskFlagSchema>;
export type ImprovementSuggestion = z.infer<typeof ImprovementSuggestionSchema>;
export type SustainabilityScorecard = z.infer<typeof SustainabilityScorecardSchema>;
export type PortfolioSustainability = z.infer<typeof PortfolioSustainabilitySchema>;

// ---- Core Functions ----

/**
 * Score a single idea across all 3 ESG dimensions.
 *
 * @param idea - The innovation idea to assess
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Full sustainability scorecard
 */
export async function scoreSustainability(
  idea: InnovationIdea,
  model?: string,
  signal?: AbortSignal
): Promise<SustainabilityScorecard> {
  const prompt = `You are an ESG (Environmental, Social, Governance) sustainability expert.

${wrapUserInput("IDEA", `${idea.title}\n${idea.description}\nPotential Impact: ${idea.potentialImpact}\nImplementation: ${idea.implementationHint}`)}

Assess this idea across 3 ESG dimensions. Score each factor 0-10 (10 = most positive/sustainable).

ENVIRONMENTAL:
- carbonImpact (10=carbon negative, 1=high emissions)
- wasteGeneration (10=zero waste, 1=high waste)
- resourceUse (10=minimal resources, 1=resource intensive)

SOCIAL:
- accessibility (10=universally accessible, 1=exclusionary)
- inclusion (10=highly inclusive, 1=discriminatory)
- displacement (10=creates jobs, 1=displaces many workers)

GOVERNANCE:
- transparency (10=fully transparent, 1=opaque)
- accountability (10=clear accountability, 1=no accountability)

For each dimension: compute overallScore as average, set indicator (green≥7, yellow≥4, red<4).
Identify risk flags with severity and mitigation.
Suggest improvements with effort and impact levels.

Return valid JSON only:
{
  "ideaTitle": "${sanitizeLlmOutput(idea.title)}",
  "environmental": { "carbonImpact": 7, "wasteGeneration": 8, "resourceUse": 6, "overallScore": 7, "indicator": "green", "details": "..." },
  "social": { "accessibility": 8, "inclusion": 7, "displacement": 5, "overallScore": 6.7, "indicator": "yellow", "details": "..." },
  "governance": { "transparency": 6, "accountability": 7, "overallScore": 6.5, "indicator": "yellow", "details": "..." },
  "overallScore": 6.7,
  "overallIndicator": "yellow",
  "riskFlags": [{ "dimension": "social", "severity": "medium", "description": "...", "mitigation": "..." }],
  "improvements": [{ "dimension": "environmental", "suggestion": "...", "effort": "low", "impact": "high" }],
  "summary": "Brief overall assessment"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse sustainability score: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
    }
  );

  return SustainabilityScorecardSchema.parse(parsed);
}

/**
 * Score multiple ideas and generate portfolio-level sustainability assessment.
 *
 * @param ideas - Array of ideas to assess
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Portfolio sustainability summary
 */
export async function scorePortfolioSustainability(
  ideas: InnovationIdea[],
  model?: string,
  signal?: AbortSignal
): Promise<PortfolioSustainability> {
  const scorecards: SustainabilityScorecard[] = [];

  for (const idea of ideas) {
    if (signal?.aborted) break;
    try {
      const scorecard = await scoreSustainability(idea, model, signal);
      scorecards.push(scorecard);
    } catch {
      // Skip failed assessments
    }
  }

  const avgScore =
    scorecards.length > 0
      ? scorecards.reduce((sum, sc) => sum + sc.overallScore, 0) / scorecards.length
      : 0;

  const distribution = {
    green: scorecards.filter((sc) => sc.overallIndicator === "green").length,
    yellow: scorecards.filter((sc) => sc.overallIndicator === "yellow").length,
    red: scorecards.filter((sc) => sc.overallIndicator === "red").length,
  };

  // Collect top risks (highest severity first)
  const allRisks = scorecards.flatMap((sc) => sc.riskFlags);
  const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  allRisks.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));

  // Collect top improvements (highest impact + lowest effort first)
  const allImprovements = scorecards.flatMap((sc) => sc.improvements);
  const impactOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const effortOrder: Record<string, number> = { low: 3, medium: 2, high: 1 };
  allImprovements.sort(
    (a, b) =>
      (impactOrder[b.impact] ?? 0) +
      (effortOrder[b.effort] ?? 0) -
      ((impactOrder[a.impact] ?? 0) + (effortOrder[a.effort] ?? 0))
  );

  return {
    totalIdeas: scorecards.length,
    averageScore: Math.round(avgScore * 100) / 100,
    distribution,
    topRisks: allRisks.slice(0, 10),
    topImprovements: allImprovements.slice(0, 10),
    scorecards,
  };
}

/**
 * Get the traffic light indicator for a numeric score.
 *
 * @param score - Score from 0-10
 * @returns Traffic light color
 */
export function getIndicator(score: number): TrafficLight {
  if (score >= 7) return "green";
  if (score >= 4) return "yellow";
  return "red";
}

/**
 * Export a sustainability scorecard as Markdown.
 *
 * @param scorecard - The scorecard to export
 * @returns Markdown string
 */
export function sustainabilityToMarkdown(scorecard: SustainabilityScorecard): string {
  const indicator = (i: TrafficLight) => (i === "green" ? "🟢" : i === "yellow" ? "🟡" : "🔴");

  const lines: string[] = [
    `# Sustainability Assessment: ${scorecard.ideaTitle}`,
    "",
    `**Overall Score:** ${scorecard.overallScore}/10 ${indicator(scorecard.overallIndicator)}`,
    "",
    "## Environmental",
    `${indicator(scorecard.environmental.indicator)} Score: ${scorecard.environmental.overallScore}/10`,
    `- Carbon Impact: ${scorecard.environmental.carbonImpact}/10`,
    `- Waste Generation: ${scorecard.environmental.wasteGeneration}/10`,
    `- Resource Use: ${scorecard.environmental.resourceUse}/10`,
    `- ${scorecard.environmental.details}`,
    "",
    "## Social",
    `${indicator(scorecard.social.indicator)} Score: ${scorecard.social.overallScore}/10`,
    `- Accessibility: ${scorecard.social.accessibility}/10`,
    `- Inclusion: ${scorecard.social.inclusion}/10`,
    `- Displacement: ${scorecard.social.displacement}/10`,
    `- ${scorecard.social.details}`,
    "",
    "## Governance",
    `${indicator(scorecard.governance.indicator)} Score: ${scorecard.governance.overallScore}/10`,
    `- Transparency: ${scorecard.governance.transparency}/10`,
    `- Accountability: ${scorecard.governance.accountability}/10`,
    `- ${scorecard.governance.details}`,
    "",
  ];

  if (scorecard.riskFlags.length > 0) {
    lines.push("## Risk Flags");
    lines.push("");
    for (const flag of scorecard.riskFlags) {
      const severity =
        flag.severity === "critical"
          ? "🔴"
          : flag.severity === "high"
            ? "🟠"
            : flag.severity === "medium"
              ? "🟡"
              : "🟢";
      lines.push(`- ${severity} **[${flag.dimension}]** ${flag.description}`);
      lines.push(`  - Mitigation: ${flag.mitigation}`);
    }
    lines.push("");
  }

  if (scorecard.improvements.length > 0) {
    lines.push("## Improvement Suggestions");
    lines.push("");
    for (const imp of scorecard.improvements) {
      lines.push(
        `- **[${imp.dimension}]** ${imp.suggestion} (effort: ${imp.effort}, impact: ${imp.impact})`
      );
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(scorecard.summary);

  return lines.join("\n");
}
