/**
 * @module ambient-capture
 *
 * Core logic for the Ambient Innovation Capture browser extension.
 * Handles signal classification, deduplication, topic grouping,
 * and investigation draft generation. All processing is designed
 * for local-first privacy with optional API sync.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---- Captured Signal Types ----

export const CAPTURE_SOURCE_TYPES = [
  "webpage",
  "article",
  "social-post",
  "video",
  "document",
  "code-repository",
  "forum-thread",
  "research-paper",
  "news",
  "manual",
] as const;

export type CaptureSourceType = (typeof CAPTURE_SOURCE_TYPES)[number];

export const RELEVANCE_CATEGORIES = [
  "technology-trend",
  "market-opportunity",
  "competitor-move",
  "customer-pain-point",
  "regulatory-change",
  "research-breakthrough",
  "design-pattern",
  "business-model",
  "industry-shift",
  "other",
] as const;

export type RelevanceCategory = (typeof RELEVANCE_CATEGORIES)[number];

export const CapturedSignalSchema = z.object({
  id: z.string().min(1).max(200),
  url: z.string().max(2000).optional(),
  title: z.string().max(500),
  excerpt: z.string().max(5000),
  sourceType: z.enum(CAPTURE_SOURCE_TYPES),
  capturedAt: z.string(),
  relevanceScore: z.number().min(0).max(100),
  relevanceCategory: z.enum(RELEVANCE_CATEGORIES).optional(),
  tags: z.array(z.string().max(100)).max(20),
  fingerprint: z.string().max(200).describe("Content hash for deduplication"),
  metadata: z
    .object({
      author: z.string().max(200).optional(),
      publishedDate: z.string().optional(),
      domain: z.string().max(200).optional(),
      language: z.string().max(10).optional(),
      wordCount: z.number().int().min(0).optional(),
    })
    .optional(),
});

export type CapturedSignal = z.infer<typeof CapturedSignalSchema>;

// ---- Topic Grouping ----

export const TopicClusterSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  description: z.string().max(1000),
  signalIds: z.array(z.string().max(200)).max(500),
  avgRelevance: z.number().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TopicCluster = z.infer<typeof TopicClusterSchema>;

// ---- Investigation Draft ----

export const InvestigationDraftSchema = z.object({
  id: z.string().max(200),
  subject: z.string().max(500),
  rationale: z.string().max(2000),
  sourceSignalIds: z.array(z.string().max(200)).max(50),
  topicClusterId: z.string().max(200).optional(),
  suggestedAngles: z.array(z.string().max(100)).max(10),
  confidence: z.number().min(0).max(1),
  status: z.enum(["draft", "reviewed", "submitted", "dismissed"]),
  createdAt: z.string(),
});

export type InvestigationDraft = z.infer<typeof InvestigationDraftSchema>;

// ---- Extension Settings ----

export const CaptureSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  autoCapture: z.boolean().default(true),
  minRelevanceScore: z.number().min(0).max(100).default(30),
  maxSignalsPerDay: z.number().int().min(1).max(10_000).default(1000),
  excludedDomains: z.array(z.string().max(200)).max(100).optional(),
  includedDomains: z.array(z.string().max(200)).max(100).optional(),
  relevanceCategories: z.array(z.enum(RELEVANCE_CATEGORIES)).max(10).optional(),
  syncEnabled: z.boolean().default(false),
  syncApiUrl: z.string().max(1000).optional(),
  localProcessingOnly: z.boolean().default(true),
});

export type CaptureSettings = z.infer<typeof CaptureSettingsSchema>;

// ---- In-Memory Store ----

const signals = new Map<string, CapturedSignal>();
const fingerprints = new Set<string>();
const clusters = new Map<string, TopicCluster>();
const drafts = new Map<string, InvestigationDraft>();
let captureSettings: CaptureSettings = CaptureSettingsSchema.parse({});

let draftIdCounter = 0;

// ---- Deduplication ----

/** Generate a simple content fingerprint for deduplication. */
export function generateContentFingerprint(content: string): string {
  // Simple hash: normalize, take key ngrams, produce deterministic string
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").slice(0, 50);
  let hash = 0;
  const str = words.join(" ");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}

/** Check if a signal is a duplicate based on fingerprint. */
export function isDuplicate(fingerprint: string): boolean {
  return fingerprints.has(fingerprint);
}

// ---- Signal Management ----

/** Add a captured signal, rejecting duplicates. Returns true if added. */
export function addCapturedSignal(signal: CapturedSignal): boolean {
  CapturedSignalSchema.parse(signal);

  if (fingerprints.has(signal.fingerprint)) return false;
  if (signal.relevanceScore < captureSettings.minRelevanceScore) return false;

  // Check domain filters
  if (signal.metadata?.domain) {
    if (captureSettings.excludedDomains?.some((d) => signal.metadata!.domain!.includes(d))) {
      return false;
    }
    if (
      captureSettings.includedDomains?.length &&
      !captureSettings.includedDomains.some((d) => signal.metadata!.domain!.includes(d))
    ) {
      return false;
    }
  }

  signals.set(signal.id, signal);
  fingerprints.add(signal.fingerprint);

  // Bounded store: remove oldest if over daily limit
  if (signals.size > captureSettings.maxSignalsPerDay) {
    const oldest = Array.from(signals.entries())
      .sort(([, a], [, b]) => a.capturedAt.localeCompare(b.capturedAt))
      .slice(0, signals.size - captureSettings.maxSignalsPerDay);
    for (const [id, sig] of oldest) {
      signals.delete(id);
      fingerprints.delete(sig.fingerprint);
    }
  }

  return true;
}

/** Get a captured signal by ID. */
export function getCapturedSignal(id: string): CapturedSignal | undefined {
  return signals.get(id);
}

/** List all captured signals, optionally filtered. */
export function listCapturedSignals(options?: {
  sourceType?: CaptureSourceType;
  category?: RelevanceCategory;
  minRelevance?: number;
  limit?: number;
}): CapturedSignal[] {
  let results = Array.from(signals.values());
  if (options?.sourceType) results = results.filter((s) => s.sourceType === options.sourceType);
  if (options?.category) results = results.filter((s) => s.relevanceCategory === options.category);
  if (options?.minRelevance)
    results = results.filter((s) => s.relevanceScore >= options.minRelevance!);
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  if (options?.limit) results = results.slice(0, options.limit);
  return results;
}

/** Remove a captured signal. */
export function removeCapturedSignal(id: string): boolean {
  const signal = signals.get(id);
  if (signal) fingerprints.delete(signal.fingerprint);
  return signals.delete(id);
}

// ---- Topic Clustering (LLM-powered) ----

/** Group signals into topic clusters using LLM analysis. */
export async function clusterSignals(
  model?: string,
  signalOverride?: AbortSignal
): Promise<TopicCluster[]> {
  const allSignals = Array.from(signals.values());
  if (allSignals.length === 0) return [];

  const signalSummaries = allSignals
    .slice(0, 100)
    .map(
      (s) =>
        `[${s.id}] ${s.title}: ${s.excerpt.slice(0, 200)} (${s.relevanceCategory ?? "uncategorized"})`
    )
    .join("\n");

  const prompt = `Group these innovation signals into topic clusters. Each cluster should represent a coherent theme.

## Signals
${signalSummaries}

Respond in JSON:
{
  "clusters": [
    { "name": "cluster name", "description": "what this cluster is about", "signalIds": ["id1", "id2"], "avgRelevance": 0-100 }
  ]
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, model, serverMode: true, signal: signalOverride })
  );
  const parsed = JSON.parse(extractJson(raw));

  const now = new Date().toISOString();
  const result: TopicCluster[] = (parsed.clusters ?? []).map(
    (c: Record<string, unknown>, i: number) => {
      const cluster: TopicCluster = {
        id: `cluster-${Date.now()}-${i}`,
        name: String(c.name ?? `Cluster ${i + 1}`),
        description: String(c.description ?? ""),
        signalIds: Array.isArray(c.signalIds) ? c.signalIds.map(String) : [],
        avgRelevance: typeof c.avgRelevance === "number" ? c.avgRelevance : 50,
        createdAt: now,
        updatedAt: now,
      };
      return TopicClusterSchema.parse(cluster);
    }
  );

  clusters.clear();
  for (const cluster of result) {
    clusters.set(cluster.id, cluster);
  }

  return result;
}

/** Get all topic clusters. */
export function getTopicClusters(): TopicCluster[] {
  return Array.from(clusters.values());
}

// ---- Investigation Draft Generation ----

/** Generate investigation drafts from high-relevance signals using LLM. */
export async function generateInvestigationDrafts(
  options: { minRelevance?: number; maxDrafts?: number; model?: string; signal?: AbortSignal } = {}
): Promise<InvestigationDraft[]> {
  const minRelevance = options.minRelevance ?? 60;
  const maxDrafts = options.maxDrafts ?? 5;

  const highRelevance = Array.from(signals.values())
    .filter((s) => s.relevanceScore >= minRelevance)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 30);

  if (highRelevance.length === 0) return [];

  const signalSummaries = highRelevance
    .map(
      (s) =>
        `[${s.id}] ${s.title} (relevance: ${s.relevanceScore}, category: ${s.relevanceCategory ?? "unknown"}): ${s.excerpt.slice(0, 300)}`
    )
    .join("\n\n");

  const prompt = `Based on these captured innovation signals, generate up to ${maxDrafts} investigation subject drafts. Each draft should combine related signals into a compelling investigation topic.

## Signals
${signalSummaries}

Respond in JSON:
{
  "drafts": [
    {
      "subject": "investigation subject",
      "rationale": "why this is worth investigating",
      "sourceSignalIds": ["signal-id-1", "signal-id-2"],
      "suggestedAngles": ["scamper", "first-principles"],
      "confidence": 0-1
    }
  ]
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, model: options.model, serverMode: true, signal: options.signal })
  );
  const parsed = JSON.parse(extractJson(raw));

  const now = new Date().toISOString();
  const result: InvestigationDraft[] = (parsed.drafts ?? [])
    .slice(0, maxDrafts)
    .map((d: Record<string, unknown>) => {
      const draft: InvestigationDraft = {
        id: `draft-${++draftIdCounter}-${Date.now()}`,
        subject: String(d.subject ?? ""),
        rationale: String(d.rationale ?? ""),
        sourceSignalIds: Array.isArray(d.sourceSignalIds) ? d.sourceSignalIds.map(String) : [],
        suggestedAngles: Array.isArray(d.suggestedAngles) ? d.suggestedAngles.map(String) : [],
        confidence: typeof d.confidence === "number" ? d.confidence : 0.5,
        status: "draft",
        createdAt: now,
      };
      return InvestigationDraftSchema.parse(draft);
    });

  for (const draft of result) {
    drafts.set(draft.id, draft);
  }

  return result;
}

/** Get all investigation drafts. */
export function getInvestigationDrafts(
  status?: InvestigationDraft["status"]
): InvestigationDraft[] {
  const all = Array.from(drafts.values());
  return status ? all.filter((d) => d.status === status) : all;
}

/** Update a draft's status. */
export function updateDraftStatus(
  draftId: string,
  status: InvestigationDraft["status"]
): InvestigationDraft | undefined {
  const draft = drafts.get(draftId);
  if (!draft) return undefined;
  draft.status = status;
  return draft;
}

// ---- Settings ----

/** Update capture settings. */
export function updateCaptureSettings(updates: Partial<CaptureSettings>): CaptureSettings {
  captureSettings = CaptureSettingsSchema.parse({ ...captureSettings, ...updates });
  return captureSettings;
}

/** Get current capture settings. */
export function getCaptureSettings(): CaptureSettings {
  return captureSettings;
}

/** Clear all ambient capture data. */
export function clearAmbientCaptureData(): void {
  signals.clear();
  fingerprints.clear();
  clusters.clear();
  drafts.clear();
  draftIdCounter = 0;
  captureSettings = CaptureSettingsSchema.parse({});
}
