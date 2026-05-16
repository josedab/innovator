/**
 * @module seismograph
 *
 * Innovation Seismograph — monitors weak signals across patent filings,
 * academic papers, regulatory changes, and social discourse to detect
 * early indicators of disruptive shifts. Generates intelligence briefings.
 */

import { z } from "zod";

// ---- Signal Sources ----

export const SignalSourceTypeSchema = z.enum([
  "patent",
  "academic",
  "regulatory",
  "social",
  "news",
  "custom",
]);
export type SignalSourceType = z.infer<typeof SignalSourceTypeSchema>;

export const SeismographSignalSchema = z.object({
  id: z.string().max(200),
  sourceType: SignalSourceTypeSchema,
  /** Title of the signal (paper title, patent name, regulation, etc.). */
  title: z.string().max(1000),
  /** Summary of the signal content. */
  summary: z.string().max(5000),
  /** Source URL or identifier. */
  sourceUrl: z.string().max(2000).optional(),
  /** Source database (e.g., "arXiv", "USPTO", "Federal Register"). */
  sourceDatabase: z.string().max(200),
  /** Authors or filers. */
  authors: z.array(z.string().max(300)).max(50).optional(),
  /** Publication or filing date. */
  publishedAt: z.string(),
  /** Detected topics/keywords. */
  topics: z.array(z.string().max(200)).max(30),
  /** Raw relevance score (0–1). */
  relevanceScore: z.number().min(0).max(1),
  /** Novelty score (0–1, how new/different is this). */
  noveltyScore: z.number().min(0).max(1),
  collectedAt: z.string(),
});

export type SeismographSignal = z.infer<typeof SeismographSignalSchema>;

// ---- Tremor (Cluster of Signals) ----

export const TremorSeveritySchema = z.enum(["micro", "minor", "moderate", "major", "mega"]);
export type TremorSeverity = z.infer<typeof TremorSeveritySchema>;

export const TremorSchema = z.object({
  id: z.string().max(200),
  /** Name of the detected shift. */
  name: z.string().max(500),
  /** Description of the disruptive trend. */
  description: z.string().max(5000),
  /** Severity based on signal count and coherence. */
  severity: TremorSeveritySchema,
  /** Composite tremor score (0–100). */
  score: z.number().min(0).max(100),
  /** Contributing signals. */
  signalIds: z.array(z.string().max(200)).max(100),
  /** Number of signals in this cluster. */
  signalCount: z.number().int().min(1),
  /** Domains/industries affected. */
  affectedDomains: z.array(z.string().max(200)).max(20),
  /** Estimated time horizon for impact. */
  timeHorizon: z.enum(["months", "1-2years", "3-5years", "5+years"]),
  /** Confidence in the detection. */
  confidence: z.number().min(0).max(1),
  /** When this tremor was first detected. */
  firstDetectedAt: z.string(),
  /** Last signal contributing to this tremor. */
  lastSignalAt: z.string(),
});

export type Tremor = z.infer<typeof TremorSchema>;

// ---- Briefing ----

export const SeismographBriefingSchema = z.object({
  id: z.string().max(200),
  /** Briefing period. */
  periodStart: z.string(),
  periodEnd: z.string(),
  /** Type of briefing. */
  type: z.enum(["daily", "weekly", "monthly", "ad-hoc"]),
  /** Total signals collected. */
  signalsCollected: z.number().int().min(0),
  /** Active tremors. */
  tremors: z.array(TremorSchema),
  /** Top signals by relevance. */
  topSignals: z.array(SeismographSignalSchema).max(20),
  /** Executive summary. */
  executiveSummary: z.string().max(10000),
  /** Action items / watch list. */
  watchList: z
    .array(
      z.object({
        topic: z.string().max(200),
        reason: z.string().max(1000),
        priority: z.enum(["low", "medium", "high", "critical"]),
      })
    )
    .max(20),
  generatedAt: z.string(),
});

export type SeismographBriefing = z.infer<typeof SeismographBriefingSchema>;

// ---- Config ----

export interface SeismographConfig {
  /** Topics/domains to monitor. */
  topics: string[];
  /** Source types to include. */
  sourceTypes?: SignalSourceType[];
  /** Minimum relevance threshold (0–1). */
  relevanceThreshold?: number;
  /** Minimum signals to form a tremor. */
  minTremorSignals?: number;
  /** LLM model. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
  /** Progress callback. */
  onProgress?: (progress: SeismographProgress) => void;
}

export interface SeismographProgress {
  stage: "collecting" | "analyzing" | "clustering" | "briefing" | "complete";
  signalsCollected: number;
  tremorsDetected: number;
  currentSource?: string;
}
