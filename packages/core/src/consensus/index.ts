/**
 * @module consensus
 *
 * Multi-model consensus engine. Runs the same angle across 2-3 LLMs
 * simultaneously, then synthesizes a consensus view highlighting
 * agreements and novel divergences.
 */

import type { Investigation, AngleResult, InnovationIdea } from "../types.js";
import type { LLMProvider, LLMGenerateOptions } from "../providers/index.js";
import { extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Types ----

/** Result from a single model's generation. */
export interface ModelResult {
  providerId: string;
  providerName: string;
  model?: string;
  angleResult: AngleResult;
  durationMs: number;
  error?: string;
}

/** Consensus analysis across multiple models. */
export interface ConsensusResult {
  angleId: string;
  angleName: string;
  modelResults: ModelResult[];
  /** Ideas that appeared across multiple models (by similarity). */
  agreements: ConsensusIdea[];
  /** Ideas unique to a single model. */
  divergences: ConsensusIdea[];
  /** Confidence-weighted final recommendations. */
  recommendations: ConsensusIdea[];
  consensusScore: number;
  generatedAt: string;
}

/** An idea with consensus metadata. */
export interface ConsensusIdea {
  title: string;
  description: string;
  potentialImpact: string;
  /** Which models produced this or similar ideas. */
  sources: string[];
  /** 0-1 confidence score based on agreement level. */
  confidence: number;
  /** Whether this is novel (only from one model). */
  isNovel: boolean;
}

/** Options for running consensus. */
export interface ConsensusOptions {
  /** Subject being investigated. */
  subject: string;
  /** Investigation context. */
  investigation: Investigation;
  /** Angle to run across models. */
  angleId: string;
  angleName: string;
  /** Providers to use (2-3 recommended). */
  providers: Array<{
    provider: LLMProvider;
    model?: string;
  }>;
  /** Timeout per model in ms. Default 60000. */
  timeoutMs?: number;
  /** Function that generates for an angle using a given provider. */
  generateFn: (
    subject: string,
    investigation: Investigation,
    angleId: string,
    provider: LLMProvider,
    model?: string
  ) => Promise<AngleResult>;
}

// ---- Engine ----

/**
 * Run the same angle across multiple LLM providers simultaneously.
 */
export async function runConsensus(options: ConsensusOptions): Promise<ConsensusResult> {
  const {
    subject,
    investigation,
    angleId,
    angleName,
    providers,
    timeoutMs = 60000,
    generateFn,
  } = options;
  const startTime = Date.now();

  // Run all providers concurrently with timeout
  const promises = providers.map(async ({ provider, model }): Promise<ModelResult> => {
    const modelStart = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const angleResult = await generateFn(subject, investigation, angleId, provider, model);
      clearTimeout(timer);

      return {
        providerId: provider.id,
        providerName: provider.name,
        model,
        angleResult,
        durationMs: Date.now() - modelStart,
      };
    } catch (err) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        model,
        angleResult: { angleId, angleName, reasoning: "", ideas: [] },
        durationMs: Date.now() - modelStart,
        error: (err as Error).message,
      };
    }
  });

  const modelResults = await Promise.allSettled(promises).then((results) =>
    results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : {
            providerId: "unknown",
            providerName: "Unknown",
            angleResult: { angleId, angleName, reasoning: "", ideas: [] },
            durationMs: 0,
            error: (r.reason as Error)?.message ?? "Unknown error",
          }
    )
  );

  // Analyze consensus
  const successfulResults = modelResults.filter((r) => !r.error && r.angleResult.ideas.length > 0);
  const allIdeas = successfulResults.flatMap((r) =>
    r.angleResult.ideas.map((idea) => ({ ...idea, source: r.providerId }))
  );

  const { agreements, divergences } = findConsensus(allIdeas, successfulResults.length);

  // Build recommendations: agreements weighted higher, plus top divergences
  const recommendations = [
    ...agreements.map((a) => ({ ...a, confidence: Math.min(1, a.confidence + 0.1) })),
    ...divergences.filter((d) => d.confidence > 0.5).slice(0, 3),
  ].sort((a, b) => b.confidence - a.confidence);

  const consensusScore =
    allIdeas.length > 0 ? +(agreements.length / allIdeas.length).toFixed(3) : 0;

  return {
    angleId,
    angleName,
    modelResults,
    agreements,
    divergences,
    recommendations,
    consensusScore,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Find agreements and divergences using simple text similarity.
 */
function findConsensus(
  ideas: Array<InnovationIdea & { source: string }>,
  modelCount: number
): { agreements: ConsensusIdea[]; divergences: ConsensusIdea[] } {
  const agreements: ConsensusIdea[] = [];
  const divergences: ConsensusIdea[] = [];
  const matched = new Set<number>();

  for (let i = 0; i < ideas.length; i++) {
    if (matched.has(i)) continue;

    const similar: number[] = [i];
    const sources = new Set([ideas[i].source]);

    for (let j = i + 1; j < ideas.length; j++) {
      if (matched.has(j)) continue;
      if (ideas[j].source === ideas[i].source) continue; // same model

      if (
        areSimilar(ideas[i].title, ideas[j].title) ||
        areSimilar(ideas[i].description, ideas[j].description)
      ) {
        similar.push(j);
        sources.add(ideas[j].source);
        matched.add(j);
      }
    }
    matched.add(i);

    const confidence = sources.size / modelCount;
    const consensusIdea: ConsensusIdea = {
      title: ideas[i].title,
      description: ideas[i].description,
      potentialImpact: ideas[i].potentialImpact,
      sources: Array.from(sources),
      confidence,
      isNovel: sources.size === 1,
    };

    if (sources.size > 1) {
      agreements.push(consensusIdea);
    } else {
      divergences.push(consensusIdea);
    }
  }

  return { agreements, divergences };
}

/**
 * Simple similarity check based on shared significant words.
 */
function areSimilar(a: string, b: string): boolean {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "and",
    "or",
    "for",
    "to",
    "of",
    "in",
    "on",
    "with",
    "by",
    "that",
    "this",
  ]);
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
  );

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared++;
  }

  const jaccardIndex = shared / (wordsA.size + wordsB.size - shared);
  return jaccardIndex > 0.3;
}

/**
 * Format consensus results as Markdown for display.
 */
export function consensusToMarkdown(result: ConsensusResult): string {
  const lines: string[] = [
    `# Multi-Model Consensus: ${result.angleName}`,
    ``,
    `**Consensus Score:** ${Math.round(result.consensusScore * 100)}%`,
    `**Models Used:** ${result.modelResults.map((r) => `${r.providerName}${r.error ? " ❌" : ""}`).join(", ")}`,
    ``,
  ];

  if (result.agreements.length > 0) {
    lines.push(`## 🤝 Agreements (${result.agreements.length})`);
    for (const idea of result.agreements) {
      lines.push(`### ${idea.title}`);
      lines.push(`${idea.description}`);
      lines.push(`- **Impact:** ${idea.potentialImpact}`);
      lines.push(
        `- **Agreed by:** ${idea.sources.join(", ")} (${Math.round(idea.confidence * 100)}% confidence)`
      );
      lines.push(``);
    }
  }

  if (result.divergences.length > 0) {
    lines.push(`## 💡 Novel Divergences (${result.divergences.length})`);
    for (const idea of result.divergences) {
      lines.push(`### ${idea.title}`);
      lines.push(`${idea.description}`);
      lines.push(`- **Impact:** ${idea.potentialImpact}`);
      lines.push(`- **Source:** ${idea.sources.join(", ")} (unique perspective)`);
      lines.push(``);
    }
  }

  if (result.recommendations.length > 0) {
    lines.push(`## ⭐ Recommendations`);
    for (const idea of result.recommendations) {
      lines.push(`1. **${idea.title}** (${Math.round(idea.confidence * 100)}% confidence)`);
    }
  }

  return lines.join("\n");
}

// ---- Jury Scoring Types ----

/** Options for running jury scoring across multiple LLMs. */
export interface JuryScoringOptions {
  /** Ideas to be scored. */
  ideas: Array<{ title: string; description: string }>;
  /** LLM providers to serve as jury members (3+ recommended). */
  providers: Array<{ provider: LLMProvider; model?: string }>;
  /** Dimensions to score each idea on. */
  dimensions: string[];
  /** Timeout per model in ms. Default 60000. */
  timeoutMs?: number;
  /** Abort signal. */
  signal?: AbortSignal;
}

/** Score result from a single model for a single idea. */
export interface JuryScore {
  modelId: string;
  ideaTitle: string;
  /** Dimension name → numeric score (1-10). */
  scores: Record<string, number>;
  reasoning: string;
}

/** Final synthesized verdict for a single idea. */
export interface JuryVerdict {
  ideaTitle: string;
  finalScores: Record<string, number>;
  confidence: number;
  outlierModels: string[];
  divergenceNotes: string;
}

/** Full jury report across all ideas. */
export interface JuryReport {
  verdicts: JuryVerdict[];
  krippendorffAlpha: number;
  modelReliability: Record<string, number>;
  overallAgreement: number;
}

// ---- Jury Scoring Pipeline ----

/**
 * Run a jury-style scoring pipeline: multiple LLMs independently score each idea
 * on the specified dimensions.
 */
export async function runJuryScoring(options: JuryScoringOptions): Promise<JuryScore[]> {
  const { ideas, providers, dimensions, timeoutMs = 60000, signal } = options;

  const tasks: Array<Promise<JuryScore[]>> = providers.map(async ({ provider, model }) => {
    const scores: JuryScore[] = [];
    for (const idea of ideas) {
      const prompt = [
        `You are a jury member evaluating innovation ideas.`,
        `Score the following idea on each dimension from 1 (lowest) to 10 (highest).`,
        `Dimensions: ${dimensions.join(", ")}`,
        ``,
        `Idea Title: ${idea.title}`,
        `Idea Description: ${idea.description}`,
        ``,
        `Respond ONLY with valid JSON in this format:`,
        `{ "scores": { ${dimensions.map((d) => `"${d}": <number>`).join(", ")} }, "reasoning": "<brief reasoning>" }`,
      ].join("\n");

      try {
        const raw = await provider.generateText({
          prompt,
          model,
          timeoutMs,
          signal,
        });

        const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw))) as {
          scores: Record<string, number>;
          reasoning: string;
        };

        scores.push({
          modelId: provider.id,
          ideaTitle: idea.title,
          scores: parsed.scores,
          reasoning: parsed.reasoning ?? "",
        });
      } catch {
        scores.push({
          modelId: provider.id,
          ideaTitle: idea.title,
          scores: Object.fromEntries(dimensions.map((d) => [d, 0])),
          reasoning: "Error: model failed to score this idea",
        });
      }
    }
    return scores;
  });

  const settled = await Promise.allSettled(tasks);
  const allScores: JuryScore[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      allScores.push(...result.value);
    }
  }
  return allScores;
}

// ---- Krippendorff's Alpha ----

/**
 * Compute Krippendorff's alpha for ordinal data.
 * `ratings` is a matrix where ratings[rater][item] = score (or NaN for missing).
 */
export function computeKrippendorffsAlpha(ratings: number[][]): number {
  const raterCount = ratings.length;
  if (raterCount < 2) return 1;

  const itemCount = ratings[0]?.length ?? 0;
  if (itemCount === 0) return 1;

  // Collect all valid values per item
  const itemValues: number[][] = [];
  for (let u = 0; u < itemCount; u++) {
    const vals: number[] = [];
    for (let r = 0; r < raterCount; r++) {
      const v = ratings[r]?.[u];
      if (v !== undefined && !Number.isNaN(v)) {
        vals.push(v);
      }
    }
    itemValues.push(vals);
  }

  // Observed disagreement (Do)
  let observedDisagreement = 0;
  let observedPairs = 0;
  for (const vals of itemValues) {
    const m = vals.length;
    if (m < 2) continue;
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        observedDisagreement += (vals[i] - vals[j]) ** 2;
        observedPairs++;
      }
    }
  }

  if (observedPairs === 0) return 1;
  const Do = observedDisagreement / observedPairs;

  // Expected disagreement (De) — across all values pooled
  const allValues: number[] = itemValues.flat();
  const n = allValues.length;
  if (n < 2) return 1;

  let expectedDisagreement = 0;
  let expectedPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      expectedDisagreement += (allValues[i] - allValues[j]) ** 2;
      expectedPairs++;
    }
  }

  const De = expectedDisagreement / expectedPairs;
  if (De === 0) return 1;

  return 1 - Do / De;
}

// ---- Weighted Aggregation ----

/**
 * Compute weighted consensus scores. Each model's contribution is weighted by
 * its reliability (agreement with other models). Outliers (z-score > 2) are flagged.
 */
export function computeWeightedConsensus(juryScores: JuryScore[]): JuryVerdict[] {
  const ideaTitles = [...new Set(juryScores.map((s) => s.ideaTitle))];
  const modelIds = [...new Set(juryScores.map((s) => s.modelId))];

  if (ideaTitles.length === 0 || modelIds.length === 0) return [];

  // Compute per-dimension means for each idea
  const ideaDimMeans: Record<string, Record<string, number>> = {};
  for (const title of ideaTitles) {
    const ideaScores = juryScores.filter((s) => s.ideaTitle === title);
    const dims = Object.keys(ideaScores[0]?.scores ?? {});
    ideaDimMeans[title] = {};
    for (const dim of dims) {
      const vals = ideaScores.map((s) => s.scores[dim] ?? 0).filter((v) => v !== undefined);
      ideaDimMeans[title][dim] =
        vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }

  // Compute model reliability: average deviation from mean across all scores
  const modelDeviations: Record<string, number[]> = {};
  for (const id of modelIds) modelDeviations[id] = [];

  for (const score of juryScores) {
    const means = ideaDimMeans[score.ideaTitle] ?? {};
    for (const [dim, val] of Object.entries(score.scores)) {
      if (means[dim] !== undefined) {
        modelDeviations[score.modelId].push(Math.abs(val - means[dim]));
      }
    }
  }

  const modelReliability: Record<string, number> = {};
  for (const [id, devs] of Object.entries(modelDeviations)) {
    const avgDev = devs.length > 0 ? devs.reduce((a, b) => a + b, 0) / devs.length : 0;
    // Reliability inversely proportional to deviation (max 10-point scale)
    modelReliability[id] = Math.max(0.1, 1 - avgDev / 10);
  }

  // Build verdicts per idea
  const verdicts: JuryVerdict[] = [];

  for (const title of ideaTitles) {
    const ideaScores = juryScores.filter((s) => s.ideaTitle === title);
    const dims = Object.keys(ideaScores[0]?.scores ?? {});
    const finalScores: Record<string, number> = {};
    const outlierModels: string[] = [];

    for (const dim of dims) {
      const vals = ideaScores.map((s) => ({ modelId: s.modelId, val: s.scores[dim] ?? 0 }));
      const numVals = vals.map((v) => v.val);
      const mean = numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) / numVals.length : 0;
      const stdDev = Math.sqrt(
        numVals.length > 1
          ? numVals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (numVals.length - 1)
          : 0
      );

      // Flag outliers (z-score > 2)
      for (const v of vals) {
        if (stdDev > 0 && Math.abs(v.val - mean) / stdDev > 2) {
          if (!outlierModels.includes(v.modelId)) outlierModels.push(v.modelId);
        }
      }

      // Weighted average using reliability
      let weightedSum = 0;
      let weightTotal = 0;
      for (const v of vals) {
        const w = modelReliability[v.modelId] ?? 0.5;
        weightedSum += v.val * w;
        weightTotal += w;
      }
      finalScores[dim] = weightTotal > 0 ? +(weightedSum / weightTotal).toFixed(2) : 0;
    }

    const dimValues = Object.values(finalScores);
    const avgScore =
      dimValues.length > 0 ? dimValues.reduce((a, b) => a + b, 0) / dimValues.length : 0;
    const confidence = Math.min(1, +(avgScore / 10).toFixed(3));

    verdicts.push({
      ideaTitle: title,
      finalScores,
      confidence,
      outlierModels,
      divergenceNotes:
        outlierModels.length > 0
          ? `Models ${outlierModels.join(", ")} scored significantly differently on some dimensions.`
          : "All models were in reasonable agreement.",
    });
  }

  return verdicts;
}

// ---- Divergence Analysis ----

/** Divergence detail for a single idea. */
export interface DivergenceDetail {
  ideaTitle: string;
  dimension: string;
  scores: Record<string, number>;
  spread: number;
  explanation: string;
}

/**
 * Analyze where models strongly disagree, grouped by dimension.
 */
export function analyzeModelDivergence(juryScores: JuryScore[]): DivergenceDetail[] {
  const ideaTitles = [...new Set(juryScores.map((s) => s.ideaTitle))];
  const details: DivergenceDetail[] = [];

  for (const title of ideaTitles) {
    const ideaScores = juryScores.filter((s) => s.ideaTitle === title);
    const dims = Object.keys(ideaScores[0]?.scores ?? {});

    for (const dim of dims) {
      const modelScores: Record<string, number> = {};
      const vals: number[] = [];
      for (const s of ideaScores) {
        const v = s.scores[dim] ?? 0;
        if (v > 0) {
          modelScores[s.modelId] = v;
          vals.push(v);
        }
      }

      if (vals.length < 2) continue;
      const spread = Math.max(...vals) - Math.min(...vals);

      // Only report significant divergence (spread > 3 on 1-10 scale)
      if (spread > 3) {
        const highModel = Object.entries(modelScores).reduce((a, b) => (b[1] > a[1] ? b : a));
        const lowModel = Object.entries(modelScores).reduce((a, b) => (b[1] < a[1] ? b : a));

        details.push({
          ideaTitle: title,
          dimension: dim,
          scores: modelScores,
          spread,
          explanation:
            `${highModel[0]} rated ${dim} at ${highModel[1]} while ` +
            `${lowModel[0]} rated it at ${lowModel[1]} (spread: ${spread}). ` +
            `This suggests fundamental disagreement on the ${dim} of "${title}".`,
        });
      }
    }
  }

  return details.sort((a, b) => b.spread - a.spread);
}

// ---- Meta-LLM Synthesis ----

/**
 * Ask a meta-LLM to synthesize all individual jury scores into a final verdict
 * with reasoning for the consensus scores.
 */
export async function synthesizeJuryVerdict(
  juryScores: JuryScore[],
  model?: { provider: LLMProvider; model?: string },
  signal?: AbortSignal
): Promise<JuryVerdict[]> {
  const ideaTitles = [...new Set(juryScores.map((s) => s.ideaTitle))];

  // If no meta-model provided, fall back to weighted consensus
  if (!model) {
    return computeWeightedConsensus(juryScores);
  }

  const scoreSummary = ideaTitles.map((title) => {
    const scores = juryScores.filter((s) => s.ideaTitle === title);
    return {
      ideaTitle: title,
      modelScores: scores.map((s) => ({
        modelId: s.modelId,
        scores: s.scores,
        reasoning: s.reasoning,
      })),
    };
  });

  const prompt = [
    `You are a meta-judge synthesizing scores from multiple AI models.`,
    `Each model independently scored ideas on various dimensions (1-10 scale).`,
    ``,
    `Here are all the individual scores:`,
    `${JSON.stringify(scoreSummary, null, 2)}`,
    ``,
    `For each idea, produce a final synthesized verdict. Consider:`,
    `- Weight models that agree with each other more heavily`,
    `- Flag outlier models whose scores deviate significantly`,
    `- Note dimensions where there is strong disagreement`,
    ``,
    `Respond ONLY with valid JSON array:`,
    `[{ "ideaTitle": "<title>", "finalScores": { "<dim>": <number> }, "confidence": <0-1>, "outlierModels": ["<id>"], "divergenceNotes": "<notes>" }]`,
  ].join("\n");

  try {
    const raw = await withRetry(
      () =>
        model.provider.generateText({
          prompt,
          model: model.model,
          timeoutMs: 60000,
          signal,
        }),
      { maxAttempts: 2, signal }
    );

    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw))) as JuryVerdict[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Fallback to weighted consensus on failure
    return computeWeightedConsensus(juryScores);
  }
}
