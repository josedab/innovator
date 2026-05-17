/**
 * @module sentinel
 *
 * Sentinel — Always-On Innovation Agent that monitors configurable signal
 * sources (RSS, URLs), filters for relevance, and proactively generates
 * innovation opportunities. Produces daily briefs with investigation results
 * and survivability scores.
 */

import { z } from "zod";

// ---- Signal Source Types ----

export const SignalSourceTypeSchema = z.enum(["rss", "url", "manual"]);
export type SignalSourceType = z.infer<typeof SignalSourceTypeSchema>;

export const SignalSourceSchema = z.object({
  id: z.string().max(200),
  type: SignalSourceTypeSchema,
  name: z.string().max(200),
  url: z.string().max(2000).optional(),
  topics: z.array(z.string().max(200)).max(20).optional(),
  enabled: z.boolean().default(true),
});

export type SignalSource = z.infer<typeof SignalSourceSchema>;

// ---- Detected Signal ----

export const DetectedSignalSchema = z.object({
  id: z.string().max(200),
  sourceId: z.string().max(200),
  title: z.string().max(500),
  summary: z.string().max(2000),
  url: z.string().max(2000).optional(),
  detectedAt: z.string(),
  relevanceScore: z.number().min(0).max(1),
  topics: z.array(z.string().max(200)).max(10),
  processed: z.boolean().default(false),
});

export type DetectedSignal = z.infer<typeof DetectedSignalSchema>;

// ---- Opportunity ----

export const OpportunitySchema = z.object({
  id: z.string().max(200),
  signalId: z.string().max(200),
  title: z.string().max(500),
  description: z.string().max(5000),
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
        angleId: z.string().max(100),
        survivabilityIndex: z.number().min(0).max(100).optional(),
      })
    )
    .max(10),
  investigationSummary: z.string().max(5000).optional(),
  overallRelevance: z.number().min(0).max(1),
  createdAt: z.string(),
  status: z.enum(["new", "reviewed", "accepted", "dismissed"]).default("new"),
});

export type Opportunity = z.infer<typeof OpportunitySchema>;

// ---- Daily Brief ----

export const DailyBriefSchema = z.object({
  id: z.string().max(200),
  date: z.string(),
  signalsDetected: z.number().int().min(0),
  signalsProcessed: z.number().int().min(0),
  opportunities: z.array(OpportunitySchema),
  topOpportunity: OpportunitySchema.optional(),
  costEstimate: z.number().min(0).optional(),
  createdAt: z.string(),
});

export type DailyBrief = z.infer<typeof DailyBriefSchema>;

// ---- Sentinel Config ----

export interface SentinelConfig {
  /** Signal sources to monitor. */
  sources: SignalSource[];
  /** Topics/domains to filter for relevance. */
  topics: string[];
  /** Minimum relevance score to trigger processing (0–1). */
  relevanceThreshold?: number;
  /** Maximum number of signals to process per run. */
  maxSignalsPerRun?: number;
  /** Maximum daily LLM cost budget in USD. */
  dailyCostBudget?: number;
  /** LLM model to use. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
  /** Angles to use for idea generation. */
  angles?: string[];
}

// ---- Sentinel State ----

export const SentinelStateSchema = z.object({
  lastRunAt: z.string().optional(),
  totalRuns: z.number().int().min(0),
  totalSignals: z.number().int().min(0),
  totalOpportunities: z.number().int().min(0),
  processedSignalIds: z.array(z.string().max(200)).max(10000),
  estimatedCostToDate: z.number().min(0),
});

export type SentinelState = z.infer<typeof SentinelStateSchema>;

// ---- Progress ----

export interface SentinelProgress {
  stage: "collecting" | "filtering" | "investigating" | "generating" | "briefing" | "complete";
  signalsCollected: number;
  signalsFiltered: number;
  opportunitiesGenerated: number;
  currentSignal?: string;
}
