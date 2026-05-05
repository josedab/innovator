/**
 * @module context-manager
 *
 * Adaptive Context Window Manager — smart prompt compression that prioritizes
 * context based on relevance scoring. Implements context budget allocation per
 * stage, hierarchical and extractive compression, auto-detection of context
 * overflow, and quality monitoring.
 */

import { z } from "zod";

// ---- Schemas ----

/** Context budget configuration for a pipeline stage. */
export const ContextBudgetSchema = z.object({
  stage: z.string().max(100),
  maxTokens: z.number().min(100).max(1000000),
  reservedForOutput: z.number().min(100).max(500000),
  priorityWeights: z.record(z.number().min(0).max(1)).default({}),
});

/** A context segment with relevance scoring. */
export const ContextSegmentSchema = z.object({
  id: z.string().max(200),
  content: z.string(),
  source: z.enum(["investigation", "angle-result", "user-input", "system", "history"]),
  relevanceScore: z.number().min(0).max(1),
  tokenCount: z.number().min(0),
  compressible: z.boolean().default(true),
});

/** Compression result. */
export const CompressionResultSchema = z.object({
  originalTokens: z.number().min(0),
  compressedTokens: z.number().min(0),
  compressionRatio: z.number().min(0).max(1),
  segmentsDropped: z.number().min(0),
  segmentsCompressed: z.number().min(0),
  qualityEstimate: z.number().min(0).max(1),
});

/** Context window status. */
export const ContextStatusSchema = z.object({
  totalTokens: z.number().min(0),
  budgetTokens: z.number().min(0),
  utilizationPercent: z.number().min(0),
  isOverflow: z.boolean(),
  segments: z.number().min(0),
  compressionApplied: z.boolean(),
  compressionResult: CompressionResultSchema.optional(),
});

// ---- Types ----

export type ContextBudget = z.infer<typeof ContextBudgetSchema>;
export type ContextSegment = z.infer<typeof ContextSegmentSchema>;
export type CompressionResult = z.infer<typeof CompressionResultSchema>;
export type ContextStatus = z.infer<typeof ContextStatusSchema>;

// ---- Default Budgets ----

const MODEL_TOKEN_LIMITS: Record<string, number> = {
  "gpt-4.1": 128000,
  "gpt-4.1-mini": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "claude-sonnet-4-20250514": 200000,
  "claude-haiku-3.5": 200000,
  "o3-mini": 128000,
};

export const DEFAULT_BUDGETS: Record<string, ContextBudget> = {
  investigation: { stage: "investigation", maxTokens: 8000, reservedForOutput: 4000, priorityWeights: { "user-input": 1.0, system: 0.8 } },
  generation: { stage: "generation", maxTokens: 12000, reservedForOutput: 4000, priorityWeights: { investigation: 0.9, "user-input": 1.0, system: 0.7 } },
  synthesis: { stage: "synthesis", maxTokens: 16000, reservedForOutput: 6000, priorityWeights: { "angle-result": 0.9, investigation: 0.7, "user-input": 1.0 } },
  scoring: { stage: "scoring", maxTokens: 12000, reservedForOutput: 4000, priorityWeights: { "angle-result": 1.0, investigation: 0.6 } },
};

// ---- Quality Monitoring ----

interface CompressionRecord {
  timestamp: number;
  stage: string;
  compressionRatio: number;
  qualityBefore: number;
  qualityAfter: number;
}

const compressionHistory: CompressionRecord[] = [];

// ---- Core Functions ----

/**
 * Estimate token count for a string (approximation: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get the token limit for a model.
 */
export function getModelTokenLimit(model?: string): number {
  if (!model) return 128000;
  return MODEL_TOKEN_LIMITS[model] ?? 128000;
}

/**
 * Compute relevance score for a context segment relative to a query.
 */
export function computeRelevance(segment: ContextSegment, query: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const content = segment.content.toLowerCase();

  if (queryTerms.length === 0) return segment.relevanceScore;

  const matchCount = queryTerms.filter((term) => content.includes(term)).length;
  const termRelevance = matchCount / queryTerms.length;

  // Blend with source-based priority
  const sourcePriority: Record<string, number> = {
    "user-input": 1.0, system: 0.9, investigation: 0.7, "angle-result": 0.6, history: 0.4,
  };
  const sourceWeight = sourcePriority[segment.source] ?? 0.5;

  return termRelevance * 0.6 + sourceWeight * 0.3 + segment.relevanceScore * 0.1;
}

/**
 * Compress text using extractive summarization (sentence selection).
 */
export function extractiveCompress(text: string, targetRatio: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length <= 2) return text;

  const targetCount = Math.max(1, Math.ceil(sentences.length * targetRatio));

  // Score sentences by position and keyword density
  const scored = sentences.map((sentence, i) => {
    const positionScore = i < 2 || i >= sentences.length - 1 ? 1.0 : 0.5;
    const lengthScore = Math.min(sentence.length / 100, 1);
    const keywordDensity = (sentence.match(/\b[A-Z][a-z]+/g) || []).length / Math.max(sentence.split(/\s+/).length, 1);
    return { sentence, score: positionScore + lengthScore * 0.3 + keywordDensity * 0.5 };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored
    .slice(0, targetCount)
    .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));

  return selected.map((s) => s.sentence).join(" ");
}

/**
 * Compress text using hierarchical summarization (preserve headers/structure).
 */
export function hierarchicalCompress(text: string, targetRatio: number): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let currentTokens = 0;
  const targetTokens = estimateTokens(text) * targetRatio;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    // Always keep headers and key structural elements
    if (line.startsWith("#") || line.startsWith("- **") || line.startsWith("* **")) {
      result.push(line);
      currentTokens += lineTokens;
    } else if (currentTokens + lineTokens <= targetTokens) {
      result.push(line);
      currentTokens += lineTokens;
    }
  }

  return result.join("\n");
}

/**
 * Manage context for a pipeline stage, applying compression if needed.
 *
 * @param segments - Context segments to manage
 * @param stage - Pipeline stage
 * @param query - The query/subject for relevance scoring
 * @param model - Optional model for token limit lookup
 */
export function manageContext(
  segments: ContextSegment[],
  stage: string,
  query: string,
  model?: string
): { segments: ContextSegment[]; status: ContextStatus } {
  const budget = DEFAULT_BUDGETS[stage] ?? DEFAULT_BUDGETS.generation;
  const modelLimit = getModelTokenLimit(model);
  const effectiveBudget = Math.min(budget.maxTokens, modelLimit - budget.reservedForOutput);

  // Score segments by relevance
  const scored = segments.map((seg) => ({
    ...seg,
    relevanceScore: computeRelevance(seg, query),
  }));

  // Sort by relevance (highest first)
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  let totalTokens = scored.reduce((sum, s) => sum + s.tokenCount, 0);
  const isOverflow = totalTokens > effectiveBudget;

  let compressionResult: CompressionResult | undefined;

  if (isOverflow) {
    const originalTokens = totalTokens;
    let segmentsDropped = 0;
    let segmentsCompressed = 0;

    // Phase 1: Drop low-relevance segments
    while (totalTokens > effectiveBudget && scored.length > 1) {
      const lowest = scored[scored.length - 1];
      if (lowest.relevanceScore < 0.3 && lowest.compressible) {
        totalTokens -= lowest.tokenCount;
        scored.pop();
        segmentsDropped++;
      } else {
        break;
      }
    }

    // Phase 2: Compress remaining segments
    if (totalTokens > effectiveBudget) {
      const ratio = effectiveBudget / totalTokens;
      for (const seg of scored) {
        if (seg.compressible && seg.tokenCount > 200) {
          const compressed = extractiveCompress(seg.content, ratio);
          const newTokens = estimateTokens(compressed);
          totalTokens -= seg.tokenCount - newTokens;
          seg.content = compressed;
          seg.tokenCount = newTokens;
          segmentsCompressed++;
        }
      }
    }

    const compressedTokens = scored.reduce((sum, s) => sum + s.tokenCount, 0);
    compressionResult = {
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      segmentsDropped,
      segmentsCompressed,
      qualityEstimate: Math.max(0.7, 1 - (1 - compressedTokens / originalTokens) * 0.5),
    };

    compressionHistory.push({
      timestamp: Date.now(),
      stage,
      compressionRatio: compressionResult.compressionRatio,
      qualityBefore: 1.0,
      qualityAfter: compressionResult.qualityEstimate,
    });
  }

  const finalTokens = scored.reduce((sum, s) => sum + s.tokenCount, 0);

  return {
    segments: scored,
    status: {
      totalTokens: finalTokens,
      budgetTokens: effectiveBudget,
      utilizationPercent: (finalTokens / effectiveBudget) * 100,
      isOverflow,
      segments: scored.length,
      compressionApplied: isOverflow,
      compressionResult,
    },
  };
}

/**
 * Create a context segment from text.
 */
export function createSegment(
  id: string,
  content: string,
  source: ContextSegment["source"],
  relevanceScore?: number
): ContextSegment {
  return {
    id,
    content,
    source,
    relevanceScore: relevanceScore ?? 0.5,
    tokenCount: estimateTokens(content),
    compressible: source !== "system",
  };
}

/**
 * Get compression quality history.
 */
export function getCompressionHistory(): CompressionRecord[] {
  return [...compressionHistory];
}

/**
 * Clear compression history (for testing).
 */
export function clearContextManagerData(): void {
  compressionHistory.length = 0;
}
