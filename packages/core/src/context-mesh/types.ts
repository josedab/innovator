import { z } from "zod";

// ---- Context Sources ----

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

export type ContextSourceType = z.infer<typeof ContextSourceTypeSchema>;

// ---- Context Signal ----

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

export type ContextSignal = z.infer<typeof ContextSignalSchema>;

// ---- Pattern Detection ----

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

export type DetectedPattern = z.infer<typeof DetectedPatternSchema>;

// ---- Innovation Suggestion ----

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

export type ProactiveSuggestion = z.infer<typeof ProactiveSuggestionSchema>;

// ---- Context Mesh State ----

export const ContextMeshStateSchema = z.object({
  signals: z.array(ContextSignalSchema),
  patterns: z.array(DetectedPatternSchema),
  suggestions: z.array(ProactiveSuggestionSchema),
  lastAnalyzedAt: z.string().optional(),
  totalSignalsIngested: z.number().int().min(0),
});

export type ContextMeshState = z.infer<typeof ContextMeshStateSchema>;

// ---- Adapter Interface ----

export interface ContextAdapter {
  type: ContextSourceType;
  name: string;
  ingest(): Promise<ContextSignal[]>;
}

// ---- Config ----

export interface ContextMeshConfig {
  adapters?: ContextAdapter[];
  maxSignals?: number;
  analysisInterval?: number;
  model?: string;
  signal?: AbortSignal;
  onSuggestion?: (suggestion: ProactiveSuggestion) => void;
  onProgress?: (progress: ContextMeshProgress) => void;
}

export interface ContextMeshProgress {
  stage: "ingesting" | "analyzing" | "suggesting" | "idle";
  signalCount: number;
  patternCount: number;
  suggestionCount: number;
}
