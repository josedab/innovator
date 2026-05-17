/**
 * @module knowledge-distillation
 *
 * Innovation Knowledge Distillation: compresses expensive GPT-4/Claude
 * investigation patterns into fine-tuned smaller models (Ollama-compatible).
 * Extracts patterns from completed investigations, builds training datasets,
 * manages LoRA fine-tuning workflows, and provides cost-aware auto-routing.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import { LlmParseError, ValidationError } from "../errors.js";

// ---- Schemas ----

/** Schema for an extracted investigation pattern. */
export const InvestigationPatternSchema = z.object({
  id: z.string().max(100),
  category: z.enum(["investigation", "angle-generation", "synthesis", "scoring", "artifact"]),
  inputPattern: z.string().max(2000),
  outputPattern: z.string().max(5000),
  qualityScore: z.number().min(0).max(1),
  complexity: z.enum(["simple", "moderate", "complex"]),
  tokenCount: z.object({
    input: z.number().min(0),
    output: z.number().min(0),
  }),
  extractedAt: z.string(),
});

/** Schema for a training example. */
export const TrainingExampleSchema = z.object({
  id: z.string().max(100),
  system: z.string().max(2000),
  input: z.string().max(5000),
  output: z.string().max(10000),
  category: z.string().max(100),
  qualityScore: z.number().min(0).max(1),
});

/** Schema for a distillation dataset. */
export const DistillationDatasetSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500),
  examples: z.array(TrainingExampleSchema),
  sourceModel: z.string().max(100),
  targetModel: z.string().max(100),
  totalExamples: z.number().min(0),
  avgQuality: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Schema for a fine-tuning job configuration. */
export const FineTuneConfigSchema = z.object({
  baseModel: z.string().max(100),
  datasetId: z.string().max(100),
  loraRank: z.number().min(4).max(128).default(16),
  loraAlpha: z.number().min(1).max(256).default(32),
  learningRate: z.number().min(1e-6).max(1e-2).default(2e-4),
  epochs: z.number().min(1).max(20).default(3),
  batchSize: z.number().min(1).max(64).default(4),
  warmupSteps: z.number().min(0).default(100),
  maxSeqLength: z.number().min(256).max(8192).default(2048),
});

/** Schema for routing decision. */
export const RoutingDecisionSchema = z.object({
  selectedModel: z.string().max(100),
  reason: z.string().max(500),
  estimatedCost: z.number().min(0),
  estimatedQuality: z.number().min(0).max(1),
  complexity: z.enum(["simple", "moderate", "complex"]),
  fallbackModel: z.string().max(100).optional(),
});

/** Schema for the cost dashboard data. */
export const CostDashboardSchema = z.object({
  totalSaved: z.number().min(0),
  totalSpent: z.number().min(0),
  savingsPercent: z.number().min(0).max(100),
  routingDecisions: z.number().min(0),
  qualityParity: z.number().min(0).max(1),
  modelUsage: z.array(
    z.object({
      model: z.string().max(100),
      calls: z.number().min(0),
      cost: z.number().min(0),
      avgQuality: z.number().min(0).max(1),
    })
  ),
  periodStart: z.string(),
  periodEnd: z.string(),
});

// ---- Types ----

export type InvestigationPattern = z.infer<typeof InvestigationPatternSchema>;
export type TrainingExample = z.infer<typeof TrainingExampleSchema>;
export type DistillationDataset = z.infer<typeof DistillationDatasetSchema>;
export type FineTuneConfig = z.infer<typeof FineTuneConfigSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type CostDashboard = z.infer<typeof CostDashboardSchema>;

// ---- In-memory stores ----

const patterns: Map<string, InvestigationPattern> = new Map();
const datasets: Map<string, DistillationDataset> = new Map();
const routingLog: RoutingDecision[] = [];

// ---- Pattern extraction ----

function buildPatternExtractionPrompt(input: string, output: string, category: string): string {
  return `You are analyzing an LLM interaction to extract a reusable pattern for knowledge distillation.

Category: ${category}
Input (user prompt): ${sanitizeUserInput(input.slice(0, 2000))}
Output (LLM response): ${sanitizeUserInput(output.slice(0, 3000))}

Extract the core pattern. Respond with JSON:
{
  "inputPattern": "generalized input template with [PLACEHOLDER] markers",
  "outputPattern": "generalized output structure",
  "qualityScore": <0-1, how useful this pattern is for training>,
  "complexity": "simple|moderate|complex"
}`;
}

/** Options for pattern extraction. */
export interface ExtractPatternOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Extract a reusable pattern from a completed LLM interaction.
 */
export async function extractPattern(
  input: string,
  output: string,
  category: InvestigationPattern["category"],
  options: ExtractPatternOptions = {}
): Promise<InvestigationPattern> {
  if (!input || !output) {
    throw new ValidationError("Both input and output are required for pattern extraction");
  }

  const prompt = buildPatternExtractionPrompt(input, output, category);
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new LlmParseError(
          `Failed to parse pattern response: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal: options.signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const pattern: InvestigationPattern = {
    id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    inputPattern: (parsed.inputPattern as string) ?? input.slice(0, 2000),
    outputPattern: (parsed.outputPattern as string) ?? output.slice(0, 5000),
    qualityScore: Math.max(0, Math.min(1, (parsed.qualityScore as number) ?? 0.5)),
    complexity: (parsed.complexity as InvestigationPattern["complexity"]) ?? "moderate",
    tokenCount: {
      input: Math.ceil(input.length / 4),
      output: Math.ceil(output.length / 4),
    },
    extractedAt: new Date().toISOString(),
  };

  patterns.set(pattern.id, pattern);
  return pattern;
}

/**
 * Build a training dataset from extracted patterns.
 */
export function buildDataset(
  name: string,
  sourceModel: string,
  targetModel: string,
  patternIds?: string[]
): DistillationDataset {
  const selectedPatterns = patternIds
    ? (patternIds.map((id) => patterns.get(id)).filter(Boolean) as InvestigationPattern[])
    : Array.from(patterns.values());

  if (selectedPatterns.length === 0) {
    throw new ValidationError("No patterns available to build dataset");
  }

  const examples: TrainingExample[] = selectedPatterns.map((p) => ({
    id: `example-${p.id}`,
    system: `You are an innovation analysis assistant performing ${p.category} tasks.`,
    input: p.inputPattern,
    output: p.outputPattern,
    category: p.category,
    qualityScore: p.qualityScore,
  }));

  const avgQuality = examples.reduce((sum, e) => sum + e.qualityScore, 0) / examples.length;
  const now = new Date().toISOString();

  const dataset: DistillationDataset = {
    id: `dataset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: `Distillation dataset from ${sourceModel} to ${targetModel}`,
    examples,
    sourceModel,
    targetModel,
    totalExamples: examples.length,
    avgQuality,
    createdAt: now,
    updatedAt: now,
  };

  datasets.set(dataset.id, dataset);
  return dataset;
}

/**
 * Generate a LoRA fine-tuning configuration.
 */
export function generateFineTuneConfig(
  datasetId: string,
  baseModel: string = "llama3.2:3b",
  overrides: Partial<FineTuneConfig> = {}
): FineTuneConfig {
  const dataset = datasets.get(datasetId);
  if (!dataset) {
    throw new ValidationError(`Dataset not found: ${datasetId}`);
  }

  const exampleCount = dataset.totalExamples;
  const autoEpochs = exampleCount < 50 ? 5 : exampleCount < 200 ? 3 : 2;

  return FineTuneConfigSchema.parse({
    baseModel,
    datasetId,
    loraRank: overrides.loraRank ?? 16,
    loraAlpha: overrides.loraAlpha ?? 32,
    learningRate: overrides.learningRate ?? 2e-4,
    epochs: overrides.epochs ?? autoEpochs,
    batchSize: overrides.batchSize ?? 4,
    warmupSteps: overrides.warmupSteps ?? Math.min(100, Math.floor(exampleCount * 0.1)),
    maxSeqLength: overrides.maxSeqLength ?? 2048,
  });
}

// ---- Model pricing for routing ----

const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "claude-sonnet": { input: 0.003, output: 0.015 },
  "claude-haiku": { input: 0.00025, output: 0.00125 },
  "ollama-local": { input: 0, output: 0 },
};

/**
 * Make a routing decision: use expensive model or cheap distilled model.
 */
export function routeRequest(
  input: string,
  premiumModel: string = "gpt-4o",
  distilledModel: string = "ollama-local",
  qualityThreshold: number = 0.8
): RoutingDecision {
  const inputTokens = Math.ceil(input.length / 4);
  const estimatedOutputTokens = inputTokens * 2;

  // Heuristic complexity classification
  const complexitySignals = {
    length: input.length > 2000 ? 2 : input.length > 500 ? 1 : 0,
    questions: (input.match(/\?/g) || []).length > 3 ? 1 : 0,
    technical: /\b(architecture|algorithm|patent|regulatory|compliance)\b/i.test(input) ? 1 : 0,
    multiStep: /\b(then|next|after|finally|step)\b/i.test(input) ? 1 : 0,
  };
  const complexityScore = Object.values(complexitySignals).reduce((a, b) => a + b, 0);
  const complexity: RoutingDecision["complexity"] =
    complexityScore >= 3 ? "complex" : complexityScore >= 1 ? "moderate" : "simple";

  const premiumCosts = MODEL_COSTS_PER_1K[premiumModel] ?? { input: 0.01, output: 0.03 };
  const distilledCosts = MODEL_COSTS_PER_1K[distilledModel] ?? { input: 0, output: 0 };

  const useDistilled =
    complexity === "simple" || (complexity === "moderate" && qualityThreshold <= 0.7);

  const selectedModel = useDistilled ? distilledModel : premiumModel;
  const costs = useDistilled ? distilledCosts : premiumCosts;
  const estimatedCost = (inputTokens * costs.input + estimatedOutputTokens * costs.output) / 1000;
  const estimatedQuality = useDistilled ? 0.75 : 0.95;

  const decision: RoutingDecision = {
    selectedModel,
    reason: useDistilled
      ? `Simple/moderate request routed to distilled model for cost savings`
      : `Complex request requires premium model for quality`,
    estimatedCost,
    estimatedQuality,
    complexity,
    fallbackModel: useDistilled ? premiumModel : undefined,
  };

  routingLog.push(decision);
  return decision;
}

/**
 * Get cost dashboard data.
 */
export function getCostDashboard(): CostDashboard {
  const modelStats = new Map<string, { calls: number; cost: number; quality: number }>();

  for (const d of routingLog) {
    const existing = modelStats.get(d.selectedModel) ?? { calls: 0, cost: 0, quality: 0 };
    existing.calls++;
    existing.cost += d.estimatedCost;
    existing.quality += d.estimatedQuality;
    modelStats.set(d.selectedModel, existing);
  }

  const modelUsage = Array.from(modelStats.entries()).map(([model, stats]) => ({
    model,
    calls: stats.calls,
    cost: stats.cost,
    avgQuality: stats.calls > 0 ? stats.quality / stats.calls : 0,
  }));

  const totalSpent = modelUsage.reduce((sum, m) => sum + m.cost, 0);
  const premiumCost = routingLog.length * 0.02; // estimated if all were premium
  const totalSaved = Math.max(0, premiumCost - totalSpent);
  const avgQuality =
    routingLog.length > 0
      ? routingLog.reduce((sum, d) => sum + d.estimatedQuality, 0) / routingLog.length
      : 0;

  return {
    totalSaved,
    totalSpent,
    savingsPercent: premiumCost > 0 ? (totalSaved / premiumCost) * 100 : 0,
    routingDecisions: routingLog.length,
    qualityParity: avgQuality,
    modelUsage,
    periodStart: routingLog[0] ? new Date().toISOString() : new Date().toISOString(),
    periodEnd: new Date().toISOString(),
  };
}

/**
 * Get all extracted patterns.
 */
export function getPatterns(): InvestigationPattern[] {
  return Array.from(patterns.values());
}

/**
 * Get a dataset by ID.
 */
export function getDataset(id: string): DistillationDataset | undefined {
  return datasets.get(id);
}

/**
 * List all datasets.
 */
export function listDatasets(): Array<{ id: string; name: string; totalExamples: number }> {
  return Array.from(datasets.entries()).map(([id, d]) => ({
    id,
    name: d.name,
    totalExamples: d.totalExamples,
  }));
}

/**
 * Clear all distillation data.
 */
export function clearDistillationData(): void {
  patterns.clear();
  datasets.clear();
  routingLog.length = 0;
}

/**
 * Export a dataset in JSONL format (Ollama/OpenAI fine-tune compatible).
 */
export function exportDatasetJsonl(datasetId: string): string {
  const dataset = datasets.get(datasetId);
  if (!dataset) throw new ValidationError(`Dataset not found: ${datasetId}`);

  return dataset.examples
    .map((e) =>
      JSON.stringify({
        messages: [
          { role: "system", content: e.system },
          { role: "user", content: e.input },
          { role: "assistant", content: e.output },
        ],
      })
    )
    .join("\n");
}
