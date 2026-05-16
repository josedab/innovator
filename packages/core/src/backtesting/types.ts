/**
 * @module backtesting
 *
 * Innovation Backtesting Engine — replays historical innovations through
 * Innovator's pipeline to calibrate scoring accuracy. Includes a case pack
 * format, 10 seed cases (iPhone, Airbnb, Slack, etc.), pipeline replay,
 * and accuracy metrics with feedback loops for calibration.
 */

import { z } from "zod";

// ---- Case Pack Format ----

export const HistoricalOutcomeSchema = z.object({
  /** Whether the innovation succeeded in the market. */
  succeeded: z.boolean(),
  /** Revenue or valuation achieved (USD). */
  revenueOrValuation: z.number().min(0).optional(),
  /** Time from launch to product-market fit. */
  timeToProductMarketFit: z.enum(["months", "1-2years", "3-5years", "5+years"]).optional(),
  /** Market share captured within 5 years (0–1). */
  marketShareCaptured: z.number().min(0).max(1).optional(),
  /** Brief narrative of what actually happened. */
  narrative: z.string().max(5000),
});

export type HistoricalOutcome = z.infer<typeof HistoricalOutcomeSchema>;

export const BacktestCaseSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  /** Year the innovation was launched or pivoted. */
  year: z.number().int().min(1900).max(2100),
  /** The subject/problem space as it would have been stated pre-launch. */
  subject: z.string().max(2000),
  /** Domain/industry. */
  domain: z.string().max(200),
  /** Key context that was available at the time. */
  historicalContext: z.string().max(5000),
  /** The actual innovation that was launched. */
  actualInnovation: z.string().max(3000),
  /** Known outcome data. */
  outcome: HistoricalOutcomeSchema,
  /** Tags for filtering. */
  tags: z.array(z.string().max(100)).max(20),
});

export type BacktestCase = z.infer<typeof BacktestCaseSchema>;

export const CasePackSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(2000),
  cases: z.array(BacktestCaseSchema).max(100),
  createdAt: z.string(),
  version: z.string().max(50),
});

export type CasePack = z.infer<typeof CasePackSchema>;

// ---- Pipeline Replay Results ----

export const ReplayScoreSchema = z.object({
  feasibility: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
});

export type ReplayScore = z.infer<typeof ReplayScoreSchema>;

export const PipelineReplayResultSchema = z.object({
  caseId: z.string().max(100),
  /** Whether the pipeline identified the actual innovation (or similar). */
  hitActualInnovation: z.boolean(),
  /** Similarity score between pipeline output and actual innovation (0–1). */
  similarityToActual: z.number().min(0).max(1),
  /** Number of ideas generated. */
  ideasGenerated: z.number().int().min(0),
  /** Best matching idea title from pipeline output. */
  bestMatchTitle: z.string().max(500).optional(),
  /** Score assigned by the pipeline to the best matching idea. */
  pipelineScore: ReplayScoreSchema.optional(),
  /** Angles that surfaced the best match. */
  matchingAngles: z.array(z.string().max(100)).max(20),
  /** Duration of pipeline replay in ms. */
  durationMs: z.number().int().min(0),
  /** Timestamp of replay. */
  replayedAt: z.string(),
});

export type PipelineReplayResult = z.infer<typeof PipelineReplayResultSchema>;

// ---- Accuracy Metrics ----

export const AccuracyMetricsSchema = z.object({
  /** Fraction of cases where pipeline found the actual innovation. */
  hitRate: z.number().min(0).max(1),
  /** Average similarity across all cases. */
  averageSimilarity: z.number().min(0).max(1),
  /** Correlation between pipeline scores and actual outcomes. */
  scoreOutcomeCorrelation: z.number().min(-1).max(1),
  /** Mean absolute error of feasibility scores vs actual outcome. */
  feasibilityMAE: z.number().min(0),
  /** Mean absolute error of impact scores vs actual outcome. */
  impactMAE: z.number().min(0),
  /** Number of cases evaluated. */
  casesEvaluated: z.number().int().min(0),
  /** Breakdown by domain. */
  byDomain: z.record(
    z.string(),
    z.object({
      hitRate: z.number().min(0).max(1),
      averageSimilarity: z.number().min(0).max(1),
      caseCount: z.number().int().min(0),
    })
  ),
});

export type AccuracyMetrics = z.infer<typeof AccuracyMetricsSchema>;

// ---- Calibration ----

export const CalibrationAdjustmentSchema = z.object({
  dimension: z.enum(["feasibility", "impact", "novelty", "confidence"]),
  /** Additive bias correction. */
  biasCorrection: z.number(),
  /** Scaling factor for score calibration. */
  scalingFactor: z.number().min(0.1).max(10),
  /** Based on how many backtest cases. */
  sampleSize: z.number().int().min(0),
  computedAt: z.string(),
});

export type CalibrationAdjustment = z.infer<typeof CalibrationAdjustmentSchema>;

export const CalibrationReportSchema = z.object({
  metrics: AccuracyMetricsSchema,
  adjustments: z.array(CalibrationAdjustmentSchema),
  recommendations: z.array(z.string().max(1000)).max(20),
  overallCalibrationScore: z.number().min(0).max(1),
  createdAt: z.string(),
});

export type CalibrationReport = z.infer<typeof CalibrationReportSchema>;

// ---- Progress ----

export interface BacktestProgress {
  stage: "loading" | "replaying" | "scoring" | "calibrating" | "complete";
  currentCase?: string;
  casesCompleted: number;
  totalCases: number;
}

export interface BacktestConfig {
  /** Case pack to use. */
  casePack?: CasePack;
  /** Filter cases by domain. */
  domains?: string[];
  /** Filter cases by tags. */
  tags?: string[];
  /** LLM model for pipeline replay. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
  /** Progress callback. */
  onProgress?: (progress: BacktestProgress) => void;
}
