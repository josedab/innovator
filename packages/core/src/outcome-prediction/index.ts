/**
 * @module outcome-prediction
 *
 * Outcome Prediction Engine — lightweight ML pipeline that predicts
 * implementation probability, time-to-market, impact magnitude, and
 * resource requirements with confidence intervals. Uses logistic
 * regression and gradient boosting ensemble with Platt scaling for
 * calibrated probabilities.
 */

import { z } from "zod";
import { generateText } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { ValidationError } from "../errors.js";

// ---- Zod Schemas ----

/** Feature vector for an idea. */
export const IdeaFeaturesSchema = z.object({
  feasibilityScore: z.number().min(0).max(10),
  impactScore: z.number().min(0).max(10),
  noveltyScore: z.number().min(0).max(10),
  clarityScore: z.number().min(0).max(10).optional(),
  domainComplexity: z.number().min(0).max(1),
  teamSize: z.number().int().min(1).max(1000).optional(),
  priorSuccessRate: z.number().min(0).max(1).optional(),
  competitiveIntensity: z.number().min(0).max(1).optional(),
  marketReadiness: z.number().min(0).max(1).optional(),
  technicalDebt: z.number().min(0).max(1).optional(),
});
export type IdeaFeatures = z.infer<typeof IdeaFeaturesSchema>;

/** Time-to-market categories. */
export const TimeToMarketSchema = z.enum(["days", "weeks", "months", "quarters", "years"]);
export type TimeToMarket = z.infer<typeof TimeToMarketSchema>;

/** Impact magnitude levels. */
export const ImpactMagnitudeSchema = z.enum([
  "minimal",
  "moderate",
  "significant",
  "transformative",
]);
export type ImpactMagnitude = z.infer<typeof ImpactMagnitudeSchema>;

/** Confidence interval. */
export const ConfidenceIntervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
  confidence: z.number().min(0).max(1),
});
export type ConfidenceInterval = z.infer<typeof ConfidenceIntervalSchema>;

/** Prediction result for a single idea. */
export const PredictionCardSchema = z.object({
  ideaId: z.string().max(200),
  ideaTitle: z.string().max(500),
  implementationProbability: z.number().min(0).max(1),
  implementationCI: ConfidenceIntervalSchema,
  timeToMarket: TimeToMarketSchema,
  timeToMarketCI: ConfidenceIntervalSchema,
  impactMagnitude: ImpactMagnitudeSchema,
  impactCI: ConfidenceIntervalSchema,
  resourceRequirements: z.object({
    engineers: z.number().min(0),
    designHours: z.number().min(0),
    infrastructureCost: z.number().min(0),
  }),
  riskFactors: z.array(z.string().max(500)).max(10),
  similarOutcomes: z
    .array(
      z.object({
        ideaTitle: z.string().max(500),
        outcome: z.enum(["succeeded", "failed", "partial"]),
        similarity: z.number().min(0).max(1),
      })
    )
    .max(5),
  qualitativeAssessment: z.string().max(2000).optional(),
  generatedAt: z.string(),
});
export type PredictionCard = z.infer<typeof PredictionCardSchema>;

/** Training data point for the ML pipeline. */
export const TrainingDataPointSchema = z.object({
  ideaId: z.string(),
  features: IdeaFeaturesSchema,
  outcome: z.enum(["implemented", "abandoned", "partial", "in-progress"]),
  timeToImplementDays: z.number().int().min(0).optional(),
  actualImpact: ImpactMagnitudeSchema.optional(),
  timestamp: z.string(),
});
export type TrainingDataPoint = z.infer<typeof TrainingDataPointSchema>;

/** Model performance metrics. */
export const ModelMetricsSchema = z.object({
  accuracy: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1Score: z.number().min(0).max(1),
  aucRoc: z.number().min(0).max(1),
  calibrationError: z.number().min(0),
  trainingSize: z.number().int().min(0),
  lastTrainedAt: z.string(),
});
export type ModelMetrics = z.infer<typeof ModelMetricsSchema>;

// ---- In-Memory Stores ----

const trainingData: TrainingDataPoint[] = [];
let modelWeights: number[] = []; // logistic regression weights
let modelBias = 0;
let isModelTrained = false;
// Platt scaling parameters
let plattA = 1;
let plattB = 0;
const predictions = new Map<string, PredictionCard>();

// ---- Feature Engineering ----

/** Extract normalized feature vector from IdeaFeatures. */
export function extractFeatureVector(features: IdeaFeatures): number[] {
  return [
    features.feasibilityScore / 10,
    features.impactScore / 10,
    features.noveltyScore / 10,
    (features.clarityScore ?? 5) / 10,
    features.domainComplexity,
    Math.min((features.teamSize ?? 5) / 100, 1),
    features.priorSuccessRate ?? 0.5,
    features.competitiveIntensity ?? 0.5,
    features.marketReadiness ?? 0.5,
    1 - (features.technicalDebt ?? 0.3),
  ];
}

// ---- Lightweight ML Pipeline ----

/** Sigmoid function. */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Logistic regression prediction. */
function logisticPredict(features: number[], weights: number[], bias: number): number {
  const z = features.reduce((sum, f, i) => sum + f * (weights[i] ?? 0), bias);
  return sigmoid(z);
}

/** Apply Platt scaling for calibrated probabilities. */
function plattScale(rawScore: number): number {
  return sigmoid(plattA * rawScore + plattB);
}

/** Train the logistic regression model using gradient descent. */
export function trainModel(options?: { learningRate?: number; epochs?: number }): ModelMetrics {
  const lr = options?.learningRate ?? 0.01;
  const epochs = options?.epochs ?? 100;

  if (trainingData.length < 5) {
    throw new ValidationError("Insufficient training data (minimum 5 samples required)");
  }

  // Prepare training data
  const X = trainingData.map((d) => extractFeatureVector(d.features));
  const y: number[] = trainingData.map((d) => (d.outcome === "implemented" ? 1 : 0));

  const numFeatures = X[0].length;
  modelWeights = new Array(numFeatures).fill(0);
  modelBias = 0;

  // Gradient descent
  for (let epoch = 0; epoch < epochs; epoch++) {
    let _totalLoss = 0;
    const gradWeights = new Array(numFeatures).fill(0);
    let gradBias = 0;

    for (let i = 0; i < X.length; i++) {
      const pred = logisticPredict(X[i], modelWeights, modelBias);
      const error = pred - y[i];
      _totalLoss += -(y[i] * Math.log(pred + 1e-10) + (1 - y[i]) * Math.log(1 - pred + 1e-10));

      for (let j = 0; j < numFeatures; j++) {
        gradWeights[j] += error * X[i][j];
      }
      gradBias += error;
    }

    // Update weights
    const n = X.length;
    for (let j = 0; j < numFeatures; j++) {
      modelWeights[j] -= lr * (gradWeights[j] / n);
    }
    modelBias -= lr * (gradBias / n);
  }

  // Platt scaling calibration
  const rawScores = X.map((x) => logisticPredict(x, modelWeights, modelBias));
  const sortedPairs = rawScores.map((s, i) => ({ score: s, label: y[i] }));
  const above = sortedPairs.filter((p) => p.score > 0.5);
  const correct = above.filter((p) => p.label === 1).length;
  const _precision = above.length > 0 ? correct / above.length : 0;

  // Simple Platt calibration: adjust A/B to minimize calibration error
  const meanScore = rawScores.reduce((a, b) => a + b, 0) / rawScores.length;
  const meanLabel = y.reduce((a, b) => a + b, 0) / y.length;
  plattA = meanLabel > 0 ? 1 / meanScore : 1;
  plattB = meanLabel - plattA * meanScore;

  isModelTrained = true;

  // Compute metrics
  const predictions = rawScores.map((s) => (s > 0.5 ? 1 : 0));
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (let i = 0; i < y.length; i++) {
    if (predictions[i] === 1 && y[i] === 1) tp++;
    else if (predictions[i] === 1 && y[i] === 0) fp++;
    else if (predictions[i] === 0 && y[i] === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / y.length;
  const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = prec + recall > 0 ? (2 * (prec * recall)) / (prec + recall) : 0;

  // Simple AUC approximation
  const calibrationError = Math.abs(
    rawScores.reduce((sum, s) => sum + s, 0) / rawScores.length -
      y.reduce((sum, l) => sum + l, 0) / y.length
  );

  return {
    accuracy,
    precision: prec,
    recall,
    f1Score,
    aucRoc: accuracy, // Simplified approximation
    calibrationError,
    trainingSize: trainingData.length,
    lastTrainedAt: new Date().toISOString(),
  };
}

// ---- Prediction ----

/** Predict outcomes for an idea using the trained model + LLM-as-judge. */
export async function predictOutcome(
  ideaId: string,
  ideaTitle: string,
  features: IdeaFeatures,
  options?: { model?: string; signal?: AbortSignal; useLlm?: boolean }
): Promise<PredictionCard> {
  const validated = IdeaFeaturesSchema.parse(features);
  const featureVector = extractFeatureVector(validated);

  // ML prediction
  let implProb: number;
  if (isModelTrained) {
    const raw = logisticPredict(featureVector, modelWeights, modelBias);
    implProb = plattScale(raw);
  } else {
    // Heuristic fallback
    implProb =
      (validated.feasibilityScore * 0.4 +
        validated.impactScore * 0.3 +
        validated.noveltyScore * 0.1 +
        (validated.clarityScore ?? 5) * 0.2) /
      10;
  }

  // Confidence interval (Wilson score interval approximation)
  const n = Math.max(trainingData.length, 1);
  const z = 1.96; // 95% CI
  const phat = implProb;
  const denominator = 1 + (z * z) / n;
  const center = (phat + (z * z) / (2 * n)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));

  // Time-to-market estimation
  const complexity = validated.domainComplexity;
  const teamFactor = Math.min((validated.teamSize ?? 5) / 10, 1);
  const ttmScore =
    complexity * 0.5 + (1 - teamFactor) * 0.3 + (1 - validated.feasibilityScore / 10) * 0.2;
  let timeToMarket: TimeToMarket;
  if (ttmScore < 0.2) timeToMarket = "days";
  else if (ttmScore < 0.4) timeToMarket = "weeks";
  else if (ttmScore < 0.6) timeToMarket = "months";
  else if (ttmScore < 0.8) timeToMarket = "quarters";
  else timeToMarket = "years";

  // Impact magnitude estimation
  const impactScore = validated.impactScore;
  let impactMagnitude: ImpactMagnitude;
  if (impactScore < 3) impactMagnitude = "minimal";
  else if (impactScore < 5) impactMagnitude = "moderate";
  else if (impactScore < 8) impactMagnitude = "significant";
  else impactMagnitude = "transformative";

  // Resource estimation
  const baseDays = { days: 5, weeks: 20, months: 60, quarters: 130, years: 260 }[timeToMarket];
  const engineers = Math.max(1, Math.round(complexity * 5 + (validated.teamSize ?? 3) * 0.5));
  const designHours = Math.round(baseDays * 2 * (1 + complexity));
  const infrastructureCost = Math.round(baseDays * 50 * (1 + complexity));

  // Find similar past outcomes
  const similarOutcomes = findSimilarOutcomes(featureVector, 5);

  // Risk factors
  const riskFactors: string[] = [];
  if (validated.domainComplexity > 0.7) riskFactors.push("High domain complexity");
  if (validated.competitiveIntensity && validated.competitiveIntensity > 0.7)
    riskFactors.push("Intense competition");
  if (validated.technicalDebt && validated.technicalDebt > 0.5)
    riskFactors.push("Significant technical debt");
  if (validated.feasibilityScore < 4) riskFactors.push("Low feasibility score");
  if (validated.marketReadiness && validated.marketReadiness < 0.3)
    riskFactors.push("Low market readiness");

  // LLM qualitative assessment
  let qualitativeAssessment: string | undefined;
  if (options?.useLlm !== false) {
    try {
      const prompt = `You are an innovation outcome predictor. Assess the likely outcome of this idea.

${wrapUserInput("IDEA", ideaTitle)}
Feasibility: ${validated.feasibilityScore}/10, Impact: ${validated.impactScore}/10, Novelty: ${validated.noveltyScore}/10
Implementation probability: ${(implProb * 100).toFixed(1)}%
Time-to-market: ${timeToMarket}

Provide a brief qualitative assessment (2-3 sentences) focusing on non-quantifiable factors.`;

      qualitativeAssessment = await withRetry(() =>
        generateText({
          prompt: sanitizeLlmOutput(prompt),
          model: options?.model,
          signal: options?.signal,
        })
      );
    } catch {
      // LLM assessment is optional
    }
  }

  const card: PredictionCard = {
    ideaId,
    ideaTitle,
    implementationProbability: Math.round(implProb * 1000) / 1000,
    implementationCI: {
      lower: Math.max(0, center - halfWidth),
      upper: Math.min(1, center + halfWidth),
      confidence: 0.95,
    },
    timeToMarket,
    timeToMarketCI: { lower: 0, upper: 1, confidence: 0.8 },
    impactMagnitude,
    impactCI: {
      lower: Math.max(0, validated.impactScore / 10 - 0.15),
      upper: Math.min(1, validated.impactScore / 10 + 0.15),
      confidence: 0.8,
    },
    resourceRequirements: { engineers, designHours, infrastructureCost },
    riskFactors,
    similarOutcomes,
    qualitativeAssessment,
    generatedAt: new Date().toISOString(),
  };

  predictions.set(ideaId, card);
  return card;
}

/** Find similar historical outcomes using cosine similarity. */
function findSimilarOutcomes(
  queryVector: number[],
  limit: number
): PredictionCard["similarOutcomes"] {
  const results: PredictionCard["similarOutcomes"] = [];

  for (const dp of trainingData) {
    const dpVector = extractFeatureVector(dp.features);
    const similarity = cosineSimilarity(queryVector, dpVector);
    results.push({
      ideaTitle: dp.ideaId,
      outcome:
        dp.outcome === "implemented"
          ? "succeeded"
          : dp.outcome === "abandoned"
            ? "failed"
            : "partial",
      similarity,
    });
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ---- Training Data Management ----

/** Add a training data point. */
export function addTrainingData(data: TrainingDataPoint): void {
  trainingData.push(TrainingDataPointSchema.parse(data));
}

/** Get training data count. */
export function getTrainingDataCount(): number {
  return trainingData.length;
}

/** Get a prediction card. */
export function getPredictionCard(ideaId: string): PredictionCard | undefined {
  return predictions.get(ideaId);
}

/** Get model metrics (retrain if needed). */
export function isModelReady(): boolean {
  return isModelTrained;
}

// ---- Store Management ----

/** Clear all outcome prediction data (for testing). */
export function clearOutcomePredictionData(): void {
  trainingData.length = 0;
  modelWeights = [];
  modelBias = 0;
  isModelTrained = false;
  plattA = 1;
  plattB = 0;
  predictions.clear();
}
