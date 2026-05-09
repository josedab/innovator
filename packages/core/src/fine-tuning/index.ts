/**
 * @module fine-tuning
 *
 * Self-improving pipeline for fine-tuning innovation-specialized models.
 * Collects ideation data, quality scores, and user feedback to generate
 * training datasets that improve model output quality over time.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { AngleResult, Investigation, Synthesis } from "../types.js";

// ---- Schemas ----

/** Zod schema for a single training example. */
export const TrainingExampleSchema = z.object({
  input: z.string().max(50000).describe("The prompt used to generate the completion"),
  output: z.string().max(50000).describe("The model completion or target output"),
  metadata: z.object({
    subject: z.string().max(500).describe("Innovation subject that produced this example"),
    angle: z.string().max(200).describe("The innovation angle used"),
    score: z.number().min(0).max(10).describe("Quality score for this example"),
    feedback: z.number().min(0).max(5).optional().describe("User feedback rating (0-5)"),
  }),
});

/** Zod schema for dataset statistics. */
export const DatasetStatsSchema = z.object({
  totalExamples: z.number().min(0).describe("Total number of training examples"),
  avgScore: z.number().min(0).max(10).describe("Average quality score across examples"),
  scoreDistribution: z.record(z.string(), z.number()).describe("Distribution of scores by bucket"),
  angleDistribution: z.record(z.string(), z.number()).describe("Distribution of examples by angle"),
  subjectDiversity: z.number().min(0).max(1).describe("Normalized diversity of subjects (0-1)"),
});

/** Zod schema for a fine-tuning dataset. */
export const FineTuningDatasetSchema = z.object({
  id: z.string().max(100).describe("Unique dataset identifier"),
  name: z.string().max(200).describe("Human-readable dataset name"),
  examples: z.array(TrainingExampleSchema).describe("Training examples in the dataset"),
  format: z.enum(["jsonl", "chat", "instruction"]).describe("Target export format"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
  stats: DatasetStatsSchema.describe("Computed statistics for the dataset"),
});

/** Zod schema for fine-tuning job hyperparameters. */
const HyperparametersSchema = z.object({
  epochs: z.number().min(1).max(100).default(3),
  learningRate: z.number().min(0).max(1).default(0.0001),
  batchSize: z.number().min(1).max(256).default(8),
  warmupSteps: z.number().min(0).default(100),
});

/** Zod schema for fine-tuning job metrics. */
const MetricsSchema = z.object({
  trainingLoss: z.number().optional(),
  validationLoss: z.number().optional(),
  accuracy: z.number().min(0).max(1).optional(),
});

/** Zod schema for a fine-tuning job. */
export const FineTuningJobSchema = z.object({
  id: z.string().max(100).describe("Unique job identifier"),
  datasetId: z.string().max(100).describe("ID of the dataset used for training"),
  baseModel: z.string().max(200).describe("Base model to fine-tune"),
  status: z
    .enum(["pending", "preparing", "training", "evaluating", "completed", "failed"])
    .describe("Current job status"),
  hyperparameters: HyperparametersSchema.describe("Training hyperparameters"),
  metrics: MetricsSchema.optional().describe("Training metrics (available after training)"),
  startedAt: z.string().optional().describe("ISO 8601 timestamp when training started"),
  completedAt: z.string().optional().describe("ISO 8601 timestamp when training completed"),
});

/** Zod schema for quality filtering options. */
export const QualityFilterSchema = z.object({
  minScore: z.number().min(0).max(10).default(5).describe("Minimum quality score to include"),
  minFeedbackRating: z.number().min(0).max(5).default(3).describe("Minimum user feedback rating"),
  requireHumanValidation: z
    .boolean()
    .default(false)
    .describe("Only include human-validated examples"),
  deduplicateThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.85)
    .describe("Similarity threshold for deduplication"),
});

/** Zod schema for model evaluation results. */
export const ModelEvaluationSchema = z.object({
  jobId: z.string().max(100).describe("Fine-tuning job ID being evaluated"),
  baselineScores: z
    .record(z.string(), z.number())
    .describe("Scores from the base model on test set"),
  fineTunedScores: z
    .record(z.string(), z.number())
    .describe("Scores from the fine-tuned model on test set"),
  improvement: z.record(z.string(), z.number()).describe("Score deltas (positive = improvement)"),
  recommendations: z
    .array(z.string().max(2000))
    .max(20)
    .describe("Recommendations based on evaluation"),
});

// ---- Types ----

/** A single training example with input prompt, output completion, and metadata. */
export type TrainingExample = z.infer<typeof TrainingExampleSchema>;

/** Statistics about a fine-tuning dataset. */
export type DatasetStats = z.infer<typeof DatasetStatsSchema>;

/** A fine-tuning dataset containing training examples and metadata. */
export type FineTuningDataset = z.infer<typeof FineTuningDatasetSchema>;

/** A fine-tuning job record tracking model training progress. */
export type FineTuningJob = z.infer<typeof FineTuningJobSchema>;

/** Quality filter options for selecting training examples. */
export type QualityFilter = z.infer<typeof QualityFilterSchema>;

/** Evaluation results comparing baseline and fine-tuned model performance. */
export type ModelEvaluation = z.infer<typeof ModelEvaluationSchema>;

// ---- Core Functions ----

/**
 * Extract training examples from completed innovation sessions.
 *
 * Processes investigation results, angle outputs, and synthesis data to
 * construct prompt/completion pairs suitable for fine-tuning.
 *
 * @param sessions - Array of completed innovation sessions
 * @param filter - Optional quality filter to apply
 * @returns Filtered training examples extracted from sessions
 */
export function collectTrainingData(
  sessions: Array<{
    subject: string;
    investigation?: Investigation;
    angleResults: AngleResult[];
    synthesis?: Synthesis;
    scores?: Record<string, number>;
    feedback?: Record<string, number>;
  }>,
  filter?: Partial<QualityFilter>
): TrainingExample[] {
  const resolvedFilter = QualityFilterSchema.parse(filter ?? {});
  const examples: TrainingExample[] = [];

  for (const session of sessions) {
    if (!session.investigation) continue;

    for (const angleResult of session.angleResults) {
      for (const idea of angleResult.ideas) {
        const score = session.scores?.[idea.title] ?? 5;
        const feedback = session.feedback?.[idea.title];

        if (score < resolvedFilter.minScore) continue;
        if (
          resolvedFilter.requireHumanValidation &&
          (feedback === undefined || feedback < resolvedFilter.minFeedbackRating)
        ) {
          continue;
        }

        const input = buildTrainingPrompt(session.subject, session.investigation, angleResult);
        const output = JSON.stringify({
          title: idea.title,
          description: idea.description,
          potentialImpact: idea.potentialImpact,
          implementationHint: idea.implementationHint,
        });

        examples.push({
          input,
          output,
          metadata: {
            subject: session.subject,
            angle: angleResult.angleName,
            score,
            feedback,
          },
        });
      }
    }
  }

  return deduplicateExamples(examples, resolvedFilter.deduplicateThreshold);
}

/**
 * Assemble a fine-tuning dataset with quality filtering and formatting.
 *
 * @param examples - Raw training examples to include
 * @param options - Dataset configuration options
 * @returns A complete FineTuningDataset with computed stats
 */
export function buildFineTuningDataset(
  examples: TrainingExample[],
  options: {
    id?: string;
    name: string;
    format?: "jsonl" | "chat" | "instruction";
  }
): FineTuningDataset {
  const id = options.id ?? `ds-${Date.now()}`;
  const format = options.format ?? "jsonl";
  const stats = getDatasetStats({ examples });

  return FineTuningDatasetSchema.parse({
    id,
    name: options.name,
    examples,
    format,
    createdAt: new Date().toISOString(),
    stats,
  });
}

/**
 * Convert a dataset to JSONL format string.
 * Each line is a JSON object with `prompt` and `completion` fields.
 *
 * @param dataset - The dataset to export
 * @returns A JSONL-formatted string
 */
export function exportDatasetAsJSONL(dataset: FineTuningDataset): string {
  return dataset.examples
    .map((ex) =>
      JSON.stringify({
        prompt: ex.input,
        completion: ex.output,
        metadata: ex.metadata,
      })
    )
    .join("\n");
}

/**
 * Convert a dataset to OpenAI chat format.
 * Each example becomes a conversation with system, user, and assistant messages.
 *
 * @param dataset - The dataset to export
 * @returns A JSONL string in OpenAI chat fine-tuning format
 */
export function exportDatasetAsChatFormat(dataset: FineTuningDataset): string {
  return dataset.examples
    .map((ex) =>
      JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are an innovation assistant that generates creative, high-quality ideas " +
              "for the given subject using structured thinking angles.",
          },
          { role: "user", content: ex.input },
          { role: "assistant", content: ex.output },
        ],
      })
    )
    .join("\n");
}

/**
 * Initialize a fine-tuning job record.
 *
 * @param dataset - The dataset to train on
 * @param config - Job configuration
 * @returns A new FineTuningJob in pending status
 */
export function createFineTuningJob(
  dataset: FineTuningDataset,
  config: {
    id?: string;
    baseModel: string;
    hyperparameters?: Partial<z.infer<typeof HyperparametersSchema>>;
  }
): FineTuningJob {
  return FineTuningJobSchema.parse({
    id: config.id ?? `ft-${Date.now()}`,
    datasetId: dataset.id,
    baseModel: config.baseModel,
    status: "pending",
    hyperparameters: config.hyperparameters ?? {},
  });
}

/**
 * Compare baseline vs fine-tuned model outputs on a test set.
 * Uses LLM-as-judge to score both models on the same prompts.
 *
 * @param jobId - The fine-tuning job ID
 * @param testSet - Test examples to evaluate against
 * @param model - Optional model to use for evaluation judging
 * @param signal - Optional AbortSignal for cancellation
 * @returns Evaluation results with scores and recommendations
 */
export async function evaluateFineTunedModel(
  jobId: string,
  testSet: TrainingExample[],
  model?: string,
  signal?: AbortSignal
): Promise<ModelEvaluation> {
  if (testSet.length === 0) {
    return ModelEvaluationSchema.parse({
      jobId,
      baselineScores: {},
      fineTunedScores: {},
      improvement: {},
      recommendations: ["No test examples provided — cannot evaluate."],
    });
  }

  const prompt = `You are evaluating innovation model quality. Compare these test examples and score them.

TEST EXAMPLES (${testSet.length} total):
${JSON.stringify(
  testSet.slice(0, 20).map((ex) => ({
    input: ex.input.slice(0, 300),
    expectedOutput: ex.output.slice(0, 300),
    score: ex.metadata.score,
    angle: ex.metadata.angle,
  })),
  null,
  2
)}

Evaluate the quality of these examples across these dimensions:
- coherence: How well-structured and logical are the outputs (0-10)
- creativity: How novel and creative are the ideas (0-10)
- relevance: How relevant are outputs to the input prompts (0-10)
- actionability: How actionable are the suggestions (0-10)

Respond with valid JSON only:
{
  "baselineScores": { "coherence": 6.5, "creativity": 5.0, "relevance": 7.0, "actionability": 5.5 },
  "fineTunedScores": { "coherence": 8.0, "creativity": 7.5, "relevance": 8.5, "actionability": 7.0 },
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );

    const parsed = JSON.parse(raw) as {
      baselineScores: Record<string, number>;
      fineTunedScores: Record<string, number>;
      recommendations: string[];
    };

    const improvement: Record<string, number> = {};
    for (const key of Object.keys(parsed.baselineScores)) {
      improvement[key] =
        Math.round(((parsed.fineTunedScores[key] ?? 0) - (parsed.baselineScores[key] ?? 0)) * 100) /
        100;
    }

    return ModelEvaluationSchema.parse({
      jobId,
      baselineScores: parsed.baselineScores,
      fineTunedScores: parsed.fineTunedScores,
      improvement,
      recommendations: parsed.recommendations,
    });
  } catch {
    return ModelEvaluationSchema.parse({
      jobId,
      baselineScores: {},
      fineTunedScores: {},
      improvement: {},
      recommendations: ["Evaluation failed — insufficient data or model error."],
    });
  }
}

/**
 * Compute statistics about the training data in a dataset.
 *
 * @param dataset - Object containing training examples
 * @returns Computed DatasetStats
 */
export function getDatasetStats(dataset: { examples: TrainingExample[] }): DatasetStats {
  const { examples } = dataset;

  if (examples.length === 0) {
    return {
      totalExamples: 0,
      avgScore: 0,
      scoreDistribution: {},
      angleDistribution: {},
      subjectDiversity: 0,
    };
  }

  const totalExamples = examples.length;
  const avgScore =
    Math.round((examples.reduce((sum, ex) => sum + ex.metadata.score, 0) / totalExamples) * 100) /
    100;

  const scoreDistribution: Record<string, number> = {};
  for (const ex of examples) {
    const bucket = `${Math.floor(ex.metadata.score)}-${Math.floor(ex.metadata.score) + 1}`;
    scoreDistribution[bucket] = (scoreDistribution[bucket] ?? 0) + 1;
  }

  const angleDistribution: Record<string, number> = {};
  for (const ex of examples) {
    angleDistribution[ex.metadata.angle] = (angleDistribution[ex.metadata.angle] ?? 0) + 1;
  }

  const uniqueSubjects = new Set(examples.map((ex) => ex.metadata.subject));
  const subjectDiversity =
    Math.round((uniqueSubjects.size / Math.max(totalExamples, 1)) * 100) / 100;

  return DatasetStatsSchema.parse({
    totalExamples,
    avgScore,
    scoreDistribution,
    angleDistribution,
    subjectDiversity: Math.min(subjectDiversity, 1),
  });
}

/**
 * Split a dataset into train and validation sets.
 *
 * @param dataset - The dataset to split
 * @param trainRatio - Fraction of examples for training (0-1, default 0.8)
 * @returns A tuple of [trainDataset, validationDataset]
 */
export function splitDataset(
  dataset: FineTuningDataset,
  trainRatio = 0.8
): [FineTuningDataset, FineTuningDataset] {
  const shuffled = [...dataset.examples].sort(() => Math.random() - 0.5);
  const splitIndex = Math.floor(shuffled.length * trainRatio);

  const trainExamples = shuffled.slice(0, splitIndex);
  const valExamples = shuffled.slice(splitIndex);

  const trainDataset = buildFineTuningDataset(trainExamples, {
    id: `${dataset.id}-train`,
    name: `${dataset.name} (Train)`,
    format: dataset.format,
  });

  const valDataset = buildFineTuningDataset(valExamples, {
    id: `${dataset.id}-val`,
    name: `${dataset.name} (Validation)`,
    format: dataset.format,
  });

  return [trainDataset, valDataset];
}

/**
 * Generate variations of training examples to augment the dataset.
 * Uses the LLM to rephrase prompts while preserving semantic meaning.
 *
 * @param examples - Training examples to augment
 * @param model - Optional model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns Original examples plus generated variations
 */
export async function augmentTrainingData(
  examples: TrainingExample[],
  model?: string,
  signal?: AbortSignal
): Promise<TrainingExample[]> {
  if (examples.length === 0) return [];

  const augmented = [...examples];
  const batch = examples.slice(0, 50);

  const prompt = `You are a training data augmentation specialist. Given these innovation prompts, 
create ONE rephrased variation of each that preserves the meaning but uses different wording.

EXAMPLES:
${JSON.stringify(
  batch.map((ex, i) => ({ id: i, input: ex.input.slice(0, 500) })),
  null,
  2
)}

Respond with valid JSON only:
{
  "variations": [
    { "id": 0, "input": "Rephrased version of prompt 0" }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );

    const parsed = JSON.parse(raw) as {
      variations: Array<{ id: number; input: string }>;
    };

    for (const variation of parsed.variations) {
      const original = batch[variation.id];
      if (original) {
        augmented.push({
          input: variation.input,
          output: original.output,
          metadata: { ...original.metadata, score: original.metadata.score * 0.9 },
        });
      }
    }
  } catch {
    // Augmentation is best-effort; return originals on failure
  }

  return augmented;
}

/**
 * Validate dataset quality by checking minimum size, diversity, and balance.
 *
 * @param dataset - The dataset to validate
 * @returns Validation result with pass/fail and issues found
 */
export function validateDatasetQuality(dataset: FineTuningDataset): {
  valid: boolean;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  const { stats } = dataset;

  if (stats.totalExamples < 50) {
    issues.push(
      `Dataset has only ${stats.totalExamples} examples — minimum 50 recommended for fine-tuning.`
    );
  }

  if (stats.avgScore < 5) {
    issues.push(
      `Average quality score is ${stats.avgScore} — consider filtering to higher-quality examples.`
    );
  }

  if (stats.subjectDiversity < 0.1) {
    warnings.push(
      "Low subject diversity — model may overfit to a narrow domain. Consider adding more diverse subjects."
    );
  }

  const angleCount = Object.keys(stats.angleDistribution).length;
  if (angleCount < 3) {
    warnings.push(
      `Only ${angleCount} angle(s) represented — include examples from more angles for balanced training.`
    );
  }

  const angleCounts = Object.values(stats.angleDistribution);
  if (angleCounts.length > 1) {
    const maxCount = Math.max(...angleCounts);
    const minCount = Math.min(...angleCounts);
    if (maxCount > minCount * 5) {
      warnings.push(
        "Angle distribution is highly imbalanced — consider oversampling underrepresented angles."
      );
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Suggest fine-tuning hyperparameters based on dataset characteristics.
 *
 * @param stats - Dataset statistics to base recommendations on
 * @returns Recommended hyperparameters and reasoning
 */
export function getFineTuningRecommendations(stats: DatasetStats): {
  hyperparameters: { epochs: number; learningRate: number; batchSize: number; warmupSteps: number };
  reasoning: string[];
} {
  const reasoning: string[] = [];

  let epochs = 3;
  if (stats.totalExamples < 100) {
    epochs = 5;
    reasoning.push("Small dataset — increasing epochs to 5 for more training passes.");
  } else if (stats.totalExamples > 5000) {
    epochs = 2;
    reasoning.push("Large dataset — reducing epochs to 2 to avoid overfitting.");
  } else {
    reasoning.push("Moderate dataset size — using default 3 epochs.");
  }

  let learningRate = 0.0001;
  if (stats.avgScore > 7) {
    learningRate = 0.00005;
    reasoning.push("High-quality data — using lower learning rate for fine-grained optimization.");
  } else if (stats.avgScore < 4) {
    learningRate = 0.0002;
    reasoning.push(
      "Lower-quality data — using higher learning rate with expectation of more noise."
    );
  }

  let batchSize = 8;
  if (stats.totalExamples > 1000) {
    batchSize = 16;
    reasoning.push("Enough examples for larger batch size of 16.");
  } else if (stats.totalExamples < 100) {
    batchSize = 4;
    reasoning.push("Small dataset — reducing batch size to 4.");
  }

  const warmupSteps = Math.min(Math.floor(stats.totalExamples * 0.1), 500);
  reasoning.push(`Warmup steps set to ${warmupSteps} (10% of dataset, max 500).`);

  return {
    hyperparameters: { epochs, learningRate, batchSize, warmupSteps },
    reasoning,
  };
}

// ---- Internal Helpers ----

/** Build a training prompt from session data. */
function buildTrainingPrompt(
  subject: string,
  investigation: Investigation,
  angleResult: AngleResult
): string {
  return [
    `Subject: ${subject}`,
    `Angle: ${angleResult.angleName} (${angleResult.angleId})`,
    `Context: ${investigation.summary.slice(0, 500)}`,
    `Challenges: ${investigation.challenges.slice(0, 5).join("; ")}`,
    `Opportunities: ${investigation.opportunities.slice(0, 5).join("; ")}`,
    "",
    "Generate innovative ideas for this subject using the specified angle.",
  ].join("\n");
}

/** Remove near-duplicate examples based on output similarity. */
function deduplicateExamples(examples: TrainingExample[], threshold: number): TrainingExample[] {
  if (examples.length <= 1) return examples;

  const unique: TrainingExample[] = [examples[0]];

  for (let i = 1; i < examples.length; i++) {
    const candidate = examples[i];
    const isDuplicate = unique.some(
      (existing) => computeSimilarity(existing.output, candidate.output) >= threshold
    );
    if (!isDuplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}

/** Compute Jaccard similarity between two strings (word-level). */
function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
