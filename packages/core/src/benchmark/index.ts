/**
 * @module benchmark
 *
 * Benchmark and evaluation mode: compare innovation quality across models,
 * angle configurations, and prompt variations. Uses LLM-as-judge with
 * calibrated rubrics for diversity, specificity, actionability, and novelty.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import type { AngleId, AngleResult, Investigation } from "../types.js";

// ---- Types ----

export const EVALUATION_CRITERIA = [
  "diversity",
  "specificity",
  "actionability",
  "novelty",
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

export const IdeaEvaluationSchema = z.object({
  ideaTitle: z.string().max(500),
  diversity: z.number().min(1).max(10),
  specificity: z.number().min(1).max(10),
  actionability: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  overallScore: z.number().min(1).max(10),
  feedback: z.string().max(1000),
});

export const ModelBenchmarkSchema = z.object({
  model: z.string(),
  angleId: z.string(),
  ideaCount: z.number(),
  evaluations: z.array(IdeaEvaluationSchema),
  averageScores: z.object({
    diversity: z.number(),
    specificity: z.number(),
    actionability: z.number(),
    novelty: z.number(),
    overall: z.number(),
  }),
  durationMs: z.number(),
  error: z.string().optional(),
});

export const BenchmarkReportSchema = z.object({
  subject: z.string(),
  angleIds: z.array(z.string()),
  models: z.array(z.string()),
  results: z.array(ModelBenchmarkSchema),
  summary: z.object({
    bestOverall: z.string(),
    bestByCategory: z.record(z.string(), z.string()),
    ranking: z.array(z.object({ model: z.string(), score: z.number() })),
  }),
  createdAt: z.string(),
});

export type IdeaEvaluation = z.infer<typeof IdeaEvaluationSchema>;
export type ModelBenchmark = z.infer<typeof ModelBenchmarkSchema>;
export type BenchmarkReport = z.infer<typeof BenchmarkReportSchema>;

// ---- Evaluation Prompt ----

function buildEvaluationPrompt(
  subject: string,
  angleResult: AngleResult
): string {
  return `You are an expert innovation evaluator using a calibrated rubric. Evaluate each idea independently.

${wrapUserInput("SUBJECT", subject)}

ANGLE: ${angleResult.angleName}
IDEAS TO EVALUATE:
"""
${sanitizeLlmOutput(JSON.stringify(angleResult.ideas.map((i) => ({ title: i.title, description: i.description, potentialImpact: i.potentialImpact })), null, 2))}
"""

For each idea, score on these dimensions (1-10):
- **diversity**: How different is this from conventional thinking? (1=obvious, 10=paradigm-shifting)
- **specificity**: How concrete and detailed is the idea? (1=vague, 10=immediately implementable)
- **actionability**: How actionable are the next steps? (1=no path forward, 10=clear roadmap)
- **novelty**: How original is this idea? (1=exists already, 10=never been proposed)
- **overallScore**: Holistic assessment factoring all criteria
- **feedback**: Brief constructive feedback

You MUST respond with valid JSON only.

{
  "evaluations": [
    {
      "ideaTitle": "Exact idea title",
      "diversity": 7,
      "specificity": 8,
      "actionability": 6,
      "novelty": 9,
      "overallScore": 7,
      "feedback": "Brief feedback"
    }
  ]
}`;
}

// ---- Core Functions ----

/**
 * Evaluate ideas from a single angle result using LLM-as-judge.
 */
export async function evaluateAngleResult(
  subject: string,
  angleResult: AngleResult,
  judgeModel?: string,
  signal?: AbortSignal
): Promise<IdeaEvaluation[]> {
  if (angleResult.ideas.length === 0) return [];

  const prompt = buildEvaluationPrompt(subject, angleResult);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: judgeModel, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse evaluation response: ${jsonStr.slice(0, 200)}`);
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

  const result = z.object({ evaluations: z.array(IdeaEvaluationSchema) }).parse(parsed);
  return result.evaluations;
}

/**
 * Run a benchmark comparing innovation quality across multiple models.
 *
 * @param subject - The subject to innovate on
 * @param models - Models to compare
 * @param angleIds - Angles to test (defaults to first 3)
 * @param judgeModel - Model used for evaluation (defaults to first model)
 * @param onProgress - Optional progress callback
 * @param signal - Optional AbortSignal
 */
export async function runBenchmark(
  subject: string,
  models: string[],
  angleIds?: AngleId[],
  judgeModel?: string,
  onProgress?: (status: string) => void,
  signal?: AbortSignal
): Promise<BenchmarkReport> {
  if (models.length === 0) {
    throw new Error("At least one model is required for benchmarking");
  }

  const angles: AngleId[] = angleIds ?? ["scamper", "first-principles", "cross-domain"];
  const judge = judgeModel ?? models[0];
  const results: ModelBenchmark[] = [];

  // Investigate once with the first model
  onProgress?.("Investigating subject...");
  const investigation = await investigate(subject, models[0], signal);

  for (const model of models) {
    for (const angleId of angles) {
      if (signal?.aborted) break;
      onProgress?.(`Generating with ${model} / ${angleId}...`);

      const startTime = Date.now();
      try {
        const angleResult = await generateForAngle(
          subject,
          investigation,
          angleId,
          model,
          signal
        );

        const durationMs = Date.now() - startTime;

        onProgress?.(`Evaluating ${model} / ${angleId}...`);
        const evaluations = await evaluateAngleResult(subject, angleResult, judge, signal);

        const avgScores = computeAverageScores(evaluations);

        results.push({
          model,
          angleId,
          ideaCount: angleResult.ideas.length,
          evaluations,
          averageScores: avgScores,
          durationMs,
        });
      } catch (err) {
        results.push({
          model,
          angleId,
          ideaCount: 0,
          evaluations: [],
          averageScores: { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 },
          durationMs: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const summary = computeSummary(models, results);

  return {
    subject,
    angleIds: angles,
    models,
    results,
    summary,
    createdAt: new Date().toISOString(),
  };
}

function computeAverageScores(evaluations: IdeaEvaluation[]): ModelBenchmark["averageScores"] {
  if (evaluations.length === 0) {
    return { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 };
  }

  const sum = evaluations.reduce(
    (acc, e) => ({
      diversity: acc.diversity + e.diversity,
      specificity: acc.specificity + e.specificity,
      actionability: acc.actionability + e.actionability,
      novelty: acc.novelty + e.novelty,
      overall: acc.overall + e.overallScore,
    }),
    { diversity: 0, specificity: 0, actionability: 0, novelty: 0, overall: 0 }
  );

  const n = evaluations.length;
  return {
    diversity: +(sum.diversity / n).toFixed(2),
    specificity: +(sum.specificity / n).toFixed(2),
    actionability: +(sum.actionability / n).toFixed(2),
    novelty: +(sum.novelty / n).toFixed(2),
    overall: +(sum.overall / n).toFixed(2),
  };
}

function computeSummary(
  models: string[],
  results: ModelBenchmark[]
): BenchmarkReport["summary"] {
  // Aggregate scores per model
  const modelScores = new Map<string, { total: number; count: number; perCategory: Record<string, { total: number; count: number }> }>();

  for (const r of results) {
    if (!modelScores.has(r.model)) {
      modelScores.set(r.model, { total: 0, count: 0, perCategory: {} });
    }
    const ms = modelScores.get(r.model)!;
    ms.total += r.averageScores.overall;
    ms.count++;

    for (const criterion of EVALUATION_CRITERIA) {
      if (!ms.perCategory[criterion]) {
        ms.perCategory[criterion] = { total: 0, count: 0 };
      }
      ms.perCategory[criterion].total += r.averageScores[criterion];
      ms.perCategory[criterion].count++;
    }
  }

  const ranking = Array.from(modelScores.entries())
    .map(([model, data]) => ({
      model,
      score: data.count > 0 ? +(data.total / data.count).toFixed(2) : 0,
    }))
    .sort((a, b) => b.score - a.score);

  const bestOverall = ranking[0]?.model ?? models[0];

  const bestByCategory: Record<string, string> = {};
  for (const criterion of EVALUATION_CRITERIA) {
    let bestModel = models[0];
    let bestScore = 0;
    for (const [model, data] of modelScores) {
      const cat = data.perCategory[criterion];
      const avg = cat ? cat.total / cat.count : 0;
      if (avg > bestScore) {
        bestScore = avg;
        bestModel = model;
      }
    }
    bestByCategory[criterion] = bestModel;
  }

  return { bestOverall, bestByCategory, ranking };
}

/**
 * Export a benchmark report to Markdown.
 */
export function benchmarkToMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# Benchmark Report: ${report.subject}`);
  lines.push(`*Generated: ${report.createdAt}*\n`);
  lines.push(`## Models Compared: ${report.models.join(", ")}`);
  lines.push(`## Angles Tested: ${report.angleIds.join(", ")}\n`);

  lines.push("## Summary");
  lines.push(`**Best Overall:** ${report.summary.bestOverall}`);
  lines.push("\n### Ranking");
  for (const r of report.summary.ranking) {
    lines.push(`- ${r.model}: ${r.score}/10`);
  }

  lines.push("\n### Best by Category");
  for (const [cat, model] of Object.entries(report.summary.bestByCategory)) {
    lines.push(`- ${cat}: ${model}`);
  }

  lines.push("\n## Detailed Results");
  for (const r of report.results) {
    lines.push(`\n### ${r.model} / ${r.angleId}`);
    if (r.error) {
      lines.push(`**Error:** ${r.error}`);
      continue;
    }
    lines.push(`Ideas: ${r.ideaCount} | Duration: ${r.durationMs}ms`);
    lines.push(`Scores: D:${r.averageScores.diversity} S:${r.averageScores.specificity} A:${r.averageScores.actionability} N:${r.averageScores.novelty} O:${r.averageScores.overall}`);
  }

  return lines.join("\n");
}
