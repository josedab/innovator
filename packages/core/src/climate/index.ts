/**
 * @module climate
 *
 * 12-dimension organizational innovation culture diagnostic with
 * AI-powered analysis, benchmarking, and intervention playbooks.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import {
  CLIMATE_DIMENSIONS,
  type ClimateDimension,
  type ClimateSurveyResponse,
  type ClimateAssessmentConfig,
  type ClimateAssessment,
  type DimensionScore,
  type BenchmarkComparison,
  type Intervention,
} from "./types.js";

export {
  CLIMATE_DIMENSIONS,
  ClimateDimensionSchema,
  DimensionScoreSchema,
  BenchmarkComparisonSchema,
  InterventionSchema,
  ClimateAssessmentSchema,
} from "./types.js";
export type {
  ClimateDimension,
  DimensionScore,
  BenchmarkComparison,
  Intervention,
  ClimateAssessment,
  ClimateSurveyResponse,
  ClimateAssessmentConfig,
} from "./types.js";

// ---- Survey Questions ----

const DIMENSION_QUESTIONS: Record<ClimateDimension, string[]> = {
  "psychological-safety": [
    "Team members feel safe to take risks and be vulnerable",
    "Mistakes are treated as learning opportunities, not failures",
    "People freely share ideas without fear of ridicule",
  ],
  "risk-tolerance": [
    "The organization actively encourages calculated risk-taking",
    "Failed experiments are recognized as valuable learning",
    "Budget is allocated for speculative innovation projects",
  ],
  "resource-availability": [
    "Adequate time is allocated for innovation activities",
    "Funding for innovation projects is readily available",
    "Tools and technology support innovation work",
  ],
  "leadership-support": [
    "Leaders actively champion innovation initiatives",
    "Senior management participates in innovation activities",
    "Innovation goals are part of leadership KPIs",
  ],
  collaboration: [
    "Cross-functional teams collaborate on innovation projects",
    "Knowledge sharing across departments is encouraged",
    "External partnerships enrich innovation efforts",
  ],
  autonomy: [
    "Employees have freedom to explore new ideas",
    "Teams can self-organize around innovation opportunities",
    "Bureaucratic barriers to experimentation are minimal",
  ],
  experimentation: [
    "Rapid prototyping and testing is standard practice",
    "There are formal processes for running experiments",
    "Data-driven decision-making is the norm",
  ],
  "diversity-inclusion": [
    "Diverse perspectives are actively sought in ideation",
    "Teams represent varied backgrounds and expertise",
    "Inclusive practices ensure all voices are heard",
  ],
  "learning-orientation": [
    "Continuous learning is embedded in the culture",
    "Post-mortems and retrospectives happen regularly",
    "External trends and research inform innovation strategy",
  ],
  "customer-centricity": [
    "Customer insights drive innovation priorities",
    "Users are involved in co-creation and testing",
    "Customer feedback loops are fast and actionable",
  ],
  "speed-agility": [
    "Time from idea to pilot is measured and optimized",
    "Agile methodologies are used for innovation delivery",
    "The organization can quickly pivot when needed",
  ],
  "vision-alignment": [
    "Innovation strategy aligns with organizational vision",
    "Employees understand how their innovation work contributes",
    "There is a clear innovation roadmap and priorities",
  ],
};

/** Get survey questions for all dimensions. */
export function getSurveyQuestions(): Array<{
  dimension: ClimateDimension;
  questions: string[];
}> {
  return CLIMATE_DIMENSIONS.map((d) => ({
    dimension: d,
    questions: DIMENSION_QUESTIONS[d],
  }));
}

// ---- Assessment Engine ----

function buildAssessmentPrompt(
  surveyData: ClimateSurveyResponse[],
  config: ClimateAssessmentConfig
): string {
  const byDimension = new Map<string, ClimateSurveyResponse[]>();
  for (const r of surveyData) {
    const existing = byDimension.get(r.dimension) ?? [];
    existing.push(r);
    byDimension.set(r.dimension, existing);
  }

  const summaries = Array.from(byDimension.entries()).map(([dim, responses]) => ({
    dimension: dim,
    avgScore: Math.round((responses.reduce((s, r) => s + r.score, 0) / responses.length) * 10) / 10,
    comments: responses
      .filter((r) => r.comment)
      .map((r) => r.comment)
      .slice(0, 3),
  }));

  return `You are an organizational innovation culture expert conducting a climate assessment.

${wrapUserInput("ORGANIZATION", config.organizationName)}
${wrapUserInput("INDUSTRY", config.industry)}

SURVEY RESULTS:
"""
${sanitizeLlmOutput(JSON.stringify(summaries, null, 2))}
"""

For each dimension, provide:
1. A maturity level assessment
2. Key strengths and gaps
3. Industry benchmark comparison (generate realistic benchmarks for ${config.industry})
4. Specific intervention recommendations

Respond with JSON only:
{
  "dimensionScores": [
    {
      "dimension": "dimension-id",
      "score": 1-10,
      "maturityLevel": "nascent|developing|established|advanced|leading",
      "strengths": ["..."],
      "gaps": ["..."],
      "evidence": ["..."]
    }
  ],
  "benchmarks": [
    {
      "dimension": "dimension-id",
      "orgScore": 1-10,
      "industryAverage": 1-10,
      "topQuartile": 1-10,
      "percentileRank": 0-100
    }
  ],
  "interventions": [
    {
      "dimension": "dimension-id",
      "title": "...",
      "description": "...",
      "effort": "low|medium|high",
      "impact": "low|medium|high",
      "timeframe": "weeks|months|quarters",
      "actions": ["action1", "action2"]
    }
  ],
  "summary": "Overall assessment summary",
  "topStrengths": ["strength1", "strength2"],
  "topGaps": ["gap1", "gap2"]
}`;
}

const AssessmentResponseSchema = z.object({
  dimensionScores: z.array(
    z.object({
      dimension: z.string().max(200),
      score: z.number().min(1).max(10),
      maturityLevel: z.enum(["nascent", "developing", "established", "advanced", "leading"]),
      strengths: z.array(z.string().max(500)).max(5).default([]),
      gaps: z.array(z.string().max(500)).max(5).default([]),
      evidence: z.array(z.string().max(500)).max(5).default([]),
    })
  ),
  benchmarks: z.array(
    z.object({
      dimension: z.string().max(200),
      orgScore: z.number().min(1).max(10),
      industryAverage: z.number().min(1).max(10),
      topQuartile: z.number().min(1).max(10),
      percentileRank: z.number().min(0).max(100),
    })
  ),
  interventions: z.array(
    z.object({
      dimension: z.string().max(200),
      title: z.string().max(500),
      description: z.string().max(2000),
      effort: z.enum(["low", "medium", "high"]),
      impact: z.enum(["low", "medium", "high"]),
      timeframe: z.enum(["weeks", "months", "quarters"]),
      actions: z.array(z.string().max(500)).max(10).default([]),
    })
  ),
  summary: z.string().max(5000),
  topStrengths: z.array(z.string().max(500)).max(5).default([]),
  topGaps: z.array(z.string().max(500)).max(5).default([]),
});

/**
 * Run a full innovation climate assessment from survey data.
 */
export async function assessClimate(
  surveyData: ClimateSurveyResponse[],
  config: ClimateAssessmentConfig
): Promise<ClimateAssessment> {
  if (surveyData.length === 0) {
    throw new Error("No survey data provided");
  }

  const prompt = buildAssessmentPrompt(surveyData, config);
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const jsonStr = extractJson(raw);
      return AssessmentResponseSchema.parse(JSON.parse(jsonStr));
    },
    { signal: config.signal }
  );

  const scores = parsed.dimensionScores as DimensionScore[];
  const overallScore =
    scores.length > 0
      ? Math.round((scores.reduce((s, d) => s + d.score, 0) / scores.length) * 10) / 10
      : 5;

  const overallMaturity: ClimateAssessment["overallMaturity"] =
    overallScore >= 9
      ? "leading"
      : overallScore >= 7
        ? "advanced"
        : overallScore >= 5
          ? "established"
          : overallScore >= 3
            ? "developing"
            : "nascent";

  return {
    id: randomUUID(),
    organizationName: config.organizationName,
    industry: config.industry,
    dimensionScores: scores,
    overallScore,
    overallMaturity,
    benchmarks: parsed.benchmarks as BenchmarkComparison[],
    interventions: parsed.interventions.map((i) => ({
      id: randomUUID(),
      ...i,
    })) as Intervention[],
    summary: parsed.summary,
    topStrengths: parsed.topStrengths,
    topGaps: parsed.topGaps,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a quick assessment from dimension scores alone (no LLM).
 */
export function quickAssess(
  scores: Record<ClimateDimension, number>,
  orgName: string = "Organization",
  industry: string = "Technology"
): ClimateAssessment {
  const dimensionScores: DimensionScore[] = CLIMATE_DIMENSIONS.map((dim) => {
    const score = Math.max(1, Math.min(10, scores[dim] ?? 5));
    return {
      dimension: dim,
      score,
      maturityLevel:
        score >= 9
          ? "leading"
          : score >= 7
            ? "advanced"
            : score >= 5
              ? "established"
              : score >= 3
                ? "developing"
                : "nascent",
      strengths: score >= 7 ? [`Strong performance in ${dim.replace(/-/g, " ")}`] : [],
      gaps: score < 5 ? [`Needs improvement in ${dim.replace(/-/g, " ")}`] : [],
      evidence: [],
    };
  });

  const overallScore =
    Math.round((dimensionScores.reduce((s, d) => s + d.score, 0) / dimensionScores.length) * 10) /
    10;

  return {
    id: randomUUID(),
    organizationName: orgName,
    industry,
    dimensionScores,
    overallScore,
    overallMaturity:
      overallScore >= 9
        ? "leading"
        : overallScore >= 7
          ? "advanced"
          : overallScore >= 5
            ? "established"
            : overallScore >= 3
              ? "developing"
              : "nascent",
    benchmarks: [],
    interventions: [],
    summary: `Innovation climate assessment for ${orgName}. Overall score: ${overallScore}/10.`,
    topStrengths: dimensionScores
      .filter((d) => d.score >= 7)
      .map((d) => d.dimension)
      .slice(0, 3),
    topGaps: dimensionScores
      .filter((d) => d.score < 5)
      .sort((a, b) => a.score - b.score)
      .map((d) => d.dimension)
      .slice(0, 3),
    createdAt: new Date().toISOString(),
  };
}

/** Format climate assessment as markdown. */
export function climateToMarkdown(assessment: ClimateAssessment): string {
  const lines: string[] = [
    `# Innovation Climate: ${assessment.organizationName}`,
    "",
    `**Industry:** ${assessment.industry}`,
    `**Overall Score:** ${assessment.overallScore}/10 (${assessment.overallMaturity})`,
    "",
    "## Dimension Scores",
    "",
  ];

  for (const d of assessment.dimensionScores.sort((a, b) => b.score - a.score)) {
    const bar = "█".repeat(Math.round(d.score)) + "░".repeat(10 - Math.round(d.score));
    lines.push(`**${d.dimension}**: ${bar} ${d.score}/10 (${d.maturityLevel})`);
  }

  if (assessment.topStrengths.length > 0) {
    lines.push("", "## Top Strengths", "");
    for (const s of assessment.topStrengths) lines.push(`- ✅ ${s}`);
  }

  if (assessment.topGaps.length > 0) {
    lines.push("", "## Top Gaps", "");
    for (const g of assessment.topGaps) lines.push(`- ⚠️ ${g}`);
  }

  if (assessment.interventions.length > 0) {
    lines.push("", "## Recommended Interventions", "");
    for (const i of assessment.interventions) {
      lines.push(`### ${i.title}`);
      lines.push(
        `**Effort:** ${i.effort} | **Impact:** ${i.impact} | **Timeframe:** ${i.timeframe}`
      );
      lines.push(i.description);
      if (i.actions.length > 0) {
        for (const a of i.actions) lines.push(`  - ${a}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
