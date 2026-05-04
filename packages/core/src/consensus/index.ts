/**
 * @module consensus
 *
 * Multi-model consensus engine. Runs the same angle across 2-3 LLMs
 * simultaneously, then synthesizes a consensus view highlighting
 * agreements and novel divergences.
 */

import type { Investigation, AngleResult, InnovationIdea } from "../types.js";
import type { LLMProvider, LLMGenerateOptions } from "../providers/index.js";

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
