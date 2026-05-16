/**
 * @module innovation-cicd
 *
 * Innovation CI/CD Pipeline — score PRs for innovation alignment,
 * generate badges, and track innovation trends over time.
 * Extends the existing GitHub Action infrastructure.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const InnovationScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  dimensions: z.object({
    novelty: z.number().min(0).max(100),
    impact: z.number().min(0).max(100),
    feasibility: z.number().min(0).max(100),
    alignment: z.number().min(0).max(100),
    techDebt: z.number().min(0).max(100),
  }),
  grade: z.enum(["A+", "A", "B+", "B", "C+", "C", "D", "F"]),
  highlights: z.array(z.string().max(500)).max(5),
  concerns: z.array(z.string().max(500)).max(5),
  suggestions: z.array(z.string().max(500)).max(3),
});

export type InnovationScore = z.infer<typeof InnovationScoreSchema>;

export const PRScoreResultSchema = z.object({
  id: z.string().max(100),
  prNumber: z.number().int().min(1),
  prTitle: z.string().max(500),
  repository: z.string().max(500),
  score: InnovationScoreSchema,
  badgeUrl: z.string().max(2000),
  badgeMarkdown: z.string().max(500),
  summary: z.string().max(2000),
  scoredAt: z.string(),
});

export type PRScoreResult = z.infer<typeof PRScoreResultSchema>;

export const TrendPointSchema = z.object({
  date: z.string(),
  prNumber: z.number().int(),
  score: z.number().min(0).max(100),
  grade: z.string(),
});

export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const InnovationTrendSchema = z.object({
  repository: z.string().max(500),
  dataPoints: z.array(TrendPointSchema),
  averageScore: z.number().min(0).max(100),
  trend: z.enum(["improving", "stable", "declining"]),
  trendSlope: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export type InnovationTrend = z.infer<typeof InnovationTrendSchema>;

// ---- In-Memory Store ----

const scoreHistory: PRScoreResult[] = [];

// ---- Helpers ----

function calculateGrade(score: number): InnovationScore["grade"] {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "C+";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function generateBadgeUrl(score: number, grade: string): string {
  const color =
    score >= 85
      ? "brightgreen"
      : score >= 70
        ? "green"
        : score >= 55
          ? "yellow"
          : score >= 40
            ? "orange"
            : "red";
  return `https://img.shields.io/badge/${encodeURIComponent("innovation")}-${encodeURIComponent(`${grade} (${score})`)}-${color}`;
}

export function generateBadgeMarkdown(score: number, grade: string): string {
  return `![Innovation Score](${generateBadgeUrl(score, grade)})`;
}

// ---- PR Scoring ----

const PRScoreLLMResponseSchema = z.object({
  novelty: z.number().min(0).max(100),
  impact: z.number().min(0).max(100),
  feasibility: z.number().min(0).max(100),
  alignment: z.number().min(0).max(100),
  techDebt: z.number().min(0).max(100),
  highlights: z.array(z.string()).max(5),
  concerns: z.array(z.string()).max(5),
  suggestions: z.array(z.string()).max(3),
  summary: z.string(),
});

/**
 * Score a PR's innovation alignment using LLM analysis.
 */
export async function scorePRInnovation(
  prTitle: string,
  prBody: string,
  diffSummary: string,
  repository: string,
  prNumber: number,
  config?: { model?: string; signal?: AbortSignal; innovationGoals?: string[] }
): Promise<PRScoreResult> {
  const goalsContext = config?.innovationGoals?.length
    ? `\nInnovation Goals:\n${config.innovationGoals.map((g) => `- ${g}`).join("\n")}`
    : "";

  const prompt = `You are an innovation alignment evaluator for software PRs.

PR Title: ${wrapUserInput("TITLE", prTitle)}
PR Description: ${wrapUserInput("BODY", prBody.slice(0, 3000))}
Diff Summary: ${wrapUserInput("DIFF", diffSummary.slice(0, 3000))}
${goalsContext}

Score 0-100 each: novelty, impact, feasibility, alignment, techDebt (higher=less debt).

Respond in JSON:
{
  "novelty": 0-100, "impact": 0-100, "feasibility": 0-100,
  "alignment": 0-100, "techDebt": 0-100,
  "highlights": ["..."], "concerns": ["..."],
  "suggestions": ["..."], "summary": "..."
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config?.model, signal: config?.signal });
      return PRScoreLLMResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
    },
    { signal: config?.signal }
  );

  const overall = Math.round(
    result.novelty * 0.25 +
      result.impact * 0.25 +
      result.feasibility * 0.2 +
      result.alignment * 0.2 +
      result.techDebt * 0.1
  );
  const grade = calculateGrade(overall);

  const prScore: PRScoreResult = {
    id: `prscore-${randomUUID().slice(0, 8)}`,
    prNumber,
    prTitle,
    repository,
    score: {
      overall,
      dimensions: {
        novelty: result.novelty,
        impact: result.impact,
        feasibility: result.feasibility,
        alignment: result.alignment,
        techDebt: result.techDebt,
      },
      grade,
      highlights: result.highlights.slice(0, 5).map((h) => String(h).slice(0, 500)),
      concerns: result.concerns.slice(0, 5).map((c) => String(c).slice(0, 500)),
      suggestions: result.suggestions.slice(0, 3).map((s) => String(s).slice(0, 500)),
    },
    badgeUrl: generateBadgeUrl(overall, grade),
    badgeMarkdown: generateBadgeMarkdown(overall, grade),
    summary: String(result.summary).slice(0, 2000),
    scoredAt: new Date().toISOString(),
  };

  scoreHistory.push(prScore);
  return prScore;
}

// ---- Trend Tracking ----

export function getInnovationTrend(repository: string): InnovationTrend {
  const repoScores = scoreHistory
    .filter((s) => s.repository === repository)
    .sort((a, b) => a.scoredAt.localeCompare(b.scoredAt));

  const dataPoints: TrendPoint[] = repoScores.map((s) => ({
    date: s.scoredAt,
    prNumber: s.prNumber,
    score: s.score.overall,
    grade: s.score.grade,
  }));

  const avgScore =
    dataPoints.length > 0
      ? dataPoints.reduce((sum, dp) => sum + dp.score, 0) / dataPoints.length
      : 0;

  let trendSlope = 0;
  let trendDir: InnovationTrend["trend"] = "stable";

  if (dataPoints.length >= 3) {
    const n = dataPoints.length;
    const indices = dataPoints.map((_, i) => i);
    const scores = dataPoints.map((dp) => dp.score);
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = scores.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * scores[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    trendSlope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    if (trendSlope > 1) trendDir = "improving";
    else if (trendSlope < -1) trendDir = "declining";
  }

  return {
    repository,
    dataPoints,
    averageScore: Math.round(avgScore * 10) / 10,
    trend: trendDir,
    trendSlope: Math.round(trendSlope * 100) / 100,
    periodStart: dataPoints[0]?.date ?? new Date().toISOString(),
    periodEnd: dataPoints[dataPoints.length - 1]?.date ?? new Date().toISOString(),
  };
}

export function getRepositoryScores(repository: string): PRScoreResult[] {
  return scoreHistory.filter((s) => s.repository === repository);
}

export function clearScoreHistory(): void {
  scoreHistory.length = 0;
}

// ---- Markdown ----

export function prScoreToMarkdown(result: PRScoreResult): string {
  const s = result.score;
  return [
    `## 💡 Innovation Score: ${s.grade} (${s.overall}/100)`,
    "",
    result.badgeMarkdown,
    "",
    `| Dimension | Score | Grade |`,
    `|-----------|-------|-------|`,
    `| Novelty | ${s.dimensions.novelty} | ${calculateGrade(s.dimensions.novelty)} |`,
    `| Impact | ${s.dimensions.impact} | ${calculateGrade(s.dimensions.impact)} |`,
    `| Feasibility | ${s.dimensions.feasibility} | ${calculateGrade(s.dimensions.feasibility)} |`,
    `| Alignment | ${s.dimensions.alignment} | ${calculateGrade(s.dimensions.alignment)} |`,
    `| Tech Debt | ${s.dimensions.techDebt} | ${calculateGrade(s.dimensions.techDebt)} |`,
    "",
    `### Summary`,
    "",
    result.summary,
    "",
    s.highlights.length ? `### Highlights\n${s.highlights.map((h) => `- ✨ ${h}`).join("\n")}` : "",
    s.concerns.length ? `\n### Concerns\n${s.concerns.map((c) => `- ⚠️ ${c}`).join("\n")}` : "",
    s.suggestions.length
      ? `\n### Suggestions\n${s.suggestions.map((sg) => `- 💡 ${sg}`).join("\n")}`
      : "",
    "",
    `---`,
    `*Scored by [Innovator CI/CD](https://github.com/josedab/innovator)*`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function trendToMarkdown(trend: InnovationTrend): string {
  const icon = trend.trend === "improving" ? "📈" : trend.trend === "declining" ? "📉" : "➡️";
  return [
    `## Innovation Trend: ${trend.repository}`,
    `**Average:** ${trend.averageScore} | **Trend:** ${icon} ${trend.trend}`,
    `**PRs Scored:** ${trend.dataPoints.length}`,
    "",
    trend.dataPoints.length > 0
      ? `| PR | Score | Grade | Date |\n|-----|-------|-------|------|\n${trend.dataPoints
          .slice(-10)
          .map((dp) => `| #${dp.prNumber} | ${dp.score} | ${dp.grade} | ${dp.date.slice(0, 10)} |`)
          .join("\n")}`
      : "No data points.",
  ].join("\n");
}
