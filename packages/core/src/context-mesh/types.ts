import { z } from "zod";

// ---- Context Sources ----

/** Validates the type of ambient context source from which signals are ingested. */
export const ContextSourceTypeSchema = z.enum([
  "browser-history",
  "slack-messages",
  "calendar-events",
  "active-prs",
  "documents",
  "email",
  "notes",
  "custom",
]);

/** Ambient context source type (e.g. browser history, Slack, calendar). */
export type ContextSourceType = z.infer<typeof ContextSourceTypeSchema>;

// ---- Context Signal ----

/**
 * Validates an individual context signal captured from an ambient source.
 * Each signal carries a title, content, timestamp, and optional URL/metadata.
 * @see ContextSourceTypeSchema
 */
export const ContextSignalSchema = z.object({
  id: z.string(),
  source: ContextSourceTypeSchema,
  title: z.string().max(500),
  content: z.string().max(5000),
  timestamp: z.string(),
  url: z.string().max(2000).optional(),
  metadata: z.record(z.string().max(1000)).default({}),
  tags: z.array(z.string().max(100)).max(20).default([]),
});

/** A single ambient context signal ingested from an external source. */
export type ContextSignal = z.infer<typeof ContextSignalSchema>;

// ---- Pattern Detection ----

/**
 * Validates a pattern detected across multiple context signals.
 * Includes a confidence score and a classification of the pattern type
 * (e.g. recurring theme, emerging trend, knowledge gap).
 */
export const DetectedPatternSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(3000),
  signals: z.array(z.string()).max(20),
  confidence: z.number().min(0).max(1),
  patternType: z.enum([
    "recurring-theme",
    "unconnected-dots",
    "emerging-trend",
    "knowledge-gap",
    "opportunity-window",
    "convergence",
  ]),
  detectedAt: z.string(),
});

/** A cross-signal pattern identified by the context mesh analysis. */
export type DetectedPattern = z.infer<typeof DetectedPatternSchema>;

// ---- Innovation Suggestion ----

/**
 * Validates a proactive innovation suggestion derived from detected patterns.
 * Links back to the patterns and signals that inspired it, with urgency and confidence scores.
 */
export const ProactiveSuggestionSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(3000),
  rationale: z.string().max(2000),
  relatedPatterns: z.array(z.string()).max(10),
  relatedSignals: z.array(z.string()).max(10),
  urgency: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  suggestedAt: z.string(),
  dismissed: z.boolean().default(false),
  actionUrl: z.string().max(2000).optional(),
});

/** A proactive innovation suggestion generated from cross-signal pattern analysis. */
export type ProactiveSuggestion = z.infer<typeof ProactiveSuggestionSchema>;

// ---- Context Mesh State ----

/**
 * Validates the aggregate state of the context mesh, containing all ingested signals,
 * detected patterns, and generated suggestions.
 */
export const ContextMeshStateSchema = z.object({
  signals: z.array(ContextSignalSchema),
  patterns: z.array(DetectedPatternSchema),
  suggestions: z.array(ProactiveSuggestionSchema),
  lastAnalyzedAt: z.string().optional(),
  totalSignalsIngested: z.number().int().min(0),
});

/** The full persisted state of a context mesh instance. */
export type ContextMeshState = z.infer<typeof ContextMeshStateSchema>;

// ---- Adapter Interface ----

/** Pluggable adapter that ingests context signals from a specific external source. */
export interface ContextAdapter {
  type: ContextSourceType;
  name: string;
  ingest(): Promise<ContextSignal[]>;
}

// ---- Config ----

/** Configuration options for running the context mesh pipeline. */
export interface ContextMeshConfig {
  adapters?: ContextAdapter[];
  maxSignals?: number;
  analysisInterval?: number;
  model?: string;
  signal?: AbortSignal;
  onSuggestion?: (suggestion: ProactiveSuggestion) => void;
  onProgress?: (progress: ContextMeshProgress) => void;
}

/** Progress report emitted during context mesh ingestion and analysis. */
export interface ContextMeshProgress {
  stage: "ingesting" | "analyzing" | "suggesting" | "idle";
  signalCount: number;
  patternCount: number;
  suggestionCount: number;
}
