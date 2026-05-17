/**
 * @module innovation-monitor
 *
 * Long-running agent that monitors configured domains (codebase, market,
 * competitor, metrics, custom) and delivers innovation digests. Detects
 * opportunity signals, scores them, and compiles periodic digest reports
 * with markdown and HTML export.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { ValidationError } from "../errors.js";

// ---- Persistence ----

const MONITOR_DIR = join(homedir(), ".innovator", "innovation-monitor");
const SIGNALS_FILE = join(MONITOR_DIR, "signals.json");
const STATE_FILE = join(MONITOR_DIR, "state.json");

function ensureDir(): void {
  if (!existsSync(MONITOR_DIR)) mkdirSync(MONITOR_DIR, { recursive: true });
}

// ---- Zod Schemas ----

export const MonitorSourceSchema = z.object({
  id: z.string(),
  type: z.enum(["codebase", "market", "competitor", "metrics", "custom"]),
  name: z.string().max(300),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().default(true),
  pollIntervalMs: z.number().int().min(1000).default(60_000),
});

export const OpportunitySignalSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  type: z.enum(["pattern", "trend", "gap", "anomaly"]),
  title: z.string().max(500),
  description: z.string().max(5000),
  confidence: z.number().min(0).max(1),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  detectedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ScoredOpportunitySchema = z.object({
  signal: OpportunitySignalSchema,
  innovationScore: z.number().min(0).max(10),
  rationale: z.string().max(2000),
});

export const DigestStatsSchema = z.object({
  totalSignals: z.number().int().min(0),
  byType: z.record(z.string(), z.number()),
  byUrgency: z.record(z.string(), z.number()),
  avgConfidence: z.number().min(0).max(1),
});

export const InnovationDigestSchema = z.object({
  id: z.string(),
  period: z.enum(["daily", "weekly"]),
  generatedAt: z.string(),
  signals: z.array(OpportunitySignalSchema),
  topOpportunities: z.array(ScoredOpportunitySchema),
  trendSummary: z.string().max(5000),
  recommendedActions: z.array(z.string().max(1000)).max(20),
  stats: DigestStatsSchema,
});

export const MonitorConfigSchema = z.object({
  sources: z.array(MonitorSourceSchema),
  digestSchedule: z.enum(["daily", "weekly"]).default("daily"),
  opportunityThreshold: z.number().min(0).max(1).default(0.5),
  maxSignalsPerDigest: z.number().int().min(1).max(500).default(50),
});

export const MonitorStateSchema = z.object({
  status: z.enum(["idle", "running", "paused"]),
  lastPollAt: z.string().optional(),
  signalCount: z.number().int().min(0),
  digestCount: z.number().int().min(0),
});

export type MonitorSource = z.infer<typeof MonitorSourceSchema>;
export type OpportunitySignal = z.infer<typeof OpportunitySignalSchema>;
export type ScoredOpportunity = z.infer<typeof ScoredOpportunitySchema>;
export type DigestStats = z.infer<typeof DigestStatsSchema>;
export type InnovationDigest = z.infer<typeof InnovationDigestSchema>;
export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;
export type MonitorState = z.infer<typeof MonitorStateSchema>;

// ---- In-Memory Stores ----

const sources = new Map<string, MonitorSource>();
const signals: OpportunitySignal[] = [];
let monitorState: MonitorState = { status: "idle", signalCount: 0, digestCount: 0 };
let pollTimers = new Map<string, ReturnType<typeof setInterval>>();
let activeConfig: MonitorConfig | null = null;

// ---- Persistence Helpers ----

function loadSignals(): OpportunitySignal[] {
  ensureDir();
  if (!existsSync(SIGNALS_FILE)) return [];
  try {
    return z.array(OpportunitySignalSchema).parse(JSON.parse(readFileSync(SIGNALS_FILE, "utf-8")));
  } catch {
    return [];
  }
}

function saveSignals(): void {
  ensureDir();
  writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2), "utf-8");
}

function loadState(): MonitorState {
  ensureDir();
  if (!existsSync(STATE_FILE)) {
    return { status: "idle", signalCount: 0, digestCount: 0 };
  }
  try {
    return MonitorStateSchema.parse(JSON.parse(readFileSync(STATE_FILE, "utf-8")));
  } catch {
    return { status: "idle", signalCount: 0, digestCount: 0 };
  }
}

function saveState(): void {
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(monitorState, null, 2), "utf-8");
}

function initFromDisk(): void {
  const persisted = loadSignals();
  if (persisted.length > 0 && signals.length === 0) {
    signals.push(...persisted);
  }
  const persistedState = loadState();
  monitorState = { ...persistedState, status: monitorState.status };
}

// ---- Source Management ----

/** Register a watchable monitor source. */
export function addMonitorSource(source: MonitorSource): MonitorSource {
  const validated = MonitorSourceSchema.parse(source);
  sources.set(validated.id, validated);
  return validated;
}

/** Unregister a monitor source by ID. */
export function removeMonitorSource(id: string): void {
  if (!sources.has(id)) throw new ValidationError(`Monitor source ${id} not found`);
  sources.delete(id);
  const timer = pollTimers.get(id);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(id);
  }
}

/** List all configured monitor sources. */
export function listMonitorSources(): MonitorSource[] {
  return Array.from(sources.values());
}

/** Update a monitor source's config. */
export function updateMonitorSource(
  id: string,
  updates: Partial<Omit<MonitorSource, "id">>
): MonitorSource {
  const existing = sources.get(id);
  if (!existing) throw new ValidationError(`Monitor source ${id} not found`);
  const updated = MonitorSourceSchema.parse({ ...existing, ...updates });
  sources.set(id, updated);
  return updated;
}

// ---- Signal Detection ----

/** Poll a source and detect opportunity signals using LLM analysis. */
export async function detectOpportunities(
  sourceId: string,
  model?: string,
  signal?: AbortSignal
): Promise<OpportunitySignal[]> {
  const source = sources.get(sourceId);
  if (!source) throw new ValidationError(`Monitor source ${sourceId} not found`);
  if (!source.enabled) return [];

  const prompt = `You are an innovation opportunity detector monitoring a ${source.type} source.

${wrapUserInput("SOURCE_NAME", source.name)}
SOURCE_TYPE: ${source.type}
SOURCE_CONFIG: ${sanitizeLlmOutput(JSON.stringify(source.config))}

Analyze this source for innovation opportunities. Identify patterns, trends, gaps, and anomalies.

Respond with valid JSON only:
{
  "opportunities": [
    {
      "type": "pattern" | "trend" | "gap" | "anomaly",
      "title": "Short descriptive title",
      "description": "Detailed description of the opportunity",
      "confidence": 0.0-1.0,
      "urgency": "low" | "medium" | "high" | "critical",
      "metadata": {}
    }
  ]
}`;

  let rawOpportunities: Array<{
    type: OpportunitySignal["type"];
    title: string;
    description: string;
    confidence: number;
    urgency: OpportunitySignal["urgency"];
    metadata?: Record<string, unknown>;
  }>;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { opportunities: typeof rawOpportunities };
    rawOpportunities = parsed.opportunities ?? [];
  } catch {
    return [];
  }

  const now = new Date().toISOString();
  const threshold = activeConfig?.opportunityThreshold ?? 0.5;

  const detected: OpportunitySignal[] = rawOpportunities
    .filter((o) => o.confidence >= threshold)
    .map((o) => ({
      id: randomUUID(),
      sourceId,
      type: o.type,
      title: o.title,
      description: o.description,
      confidence: o.confidence,
      urgency: o.urgency,
      detectedAt: now,
      metadata: o.metadata,
    }));

  signals.push(...detected);
  monitorState.signalCount += detected.length;
  monitorState.lastPollAt = now;
  saveSignals();
  saveState();

  return detected;
}

/** Score a signal's innovation potential using LLM. */
export async function scoreSignal(
  signalToScore: OpportunitySignal,
  model?: string,
  signal?: AbortSignal
): Promise<ScoredOpportunity> {
  const prompt = `You are an expert innovation evaluator. Score this opportunity signal.

${wrapUserInput("TITLE", signalToScore.title)}
${wrapUserInput("DESCRIPTION", signalToScore.description)}
TYPE: ${signalToScore.type}
URGENCY: ${signalToScore.urgency}
CONFIDENCE: ${signalToScore.confidence}

Score on a 0-10 scale for innovation potential. Consider novelty, feasibility, impact, and urgency.

Respond with valid JSON only:
{
  "innovationScore": 0-10,
  "rationale": "Brief explanation of the score"
}`;

  let score = 5;
  let rationale = "Scoring unavailable — using default";

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { innovationScore: number; rationale: string };
    score = Math.max(0, Math.min(10, parsed.innovationScore ?? 5));
    rationale = parsed.rationale ?? rationale;
  } catch {
    // Use defaults
  }

  return {
    signal: signalToScore,
    innovationScore: Math.round(score * 100) / 100,
    rationale,
  };
}

/** Retrieve signals with optional filters. */
export function getRecentSignals(options?: {
  sourceId?: string;
  type?: OpportunitySignal["type"];
  urgency?: OpportunitySignal["urgency"];
  timeRange?: { from?: string; to?: string };
  limit?: number;
}): OpportunitySignal[] {
  initFromDisk();
  let result = [...signals];

  if (options?.sourceId) result = result.filter((s) => s.sourceId === options.sourceId);
  if (options?.type) result = result.filter((s) => s.type === options.type);
  if (options?.urgency) result = result.filter((s) => s.urgency === options.urgency);
  if (options?.timeRange?.from)
    result = result.filter((s) => s.detectedAt >= options.timeRange!.from!);
  if (options?.timeRange?.to) result = result.filter((s) => s.detectedAt <= options.timeRange!.to!);

  result.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  if (options?.limit) result = result.slice(0, options.limit);

  return result;
}

// ---- Digest Generation ----

/** Compile recent signals into an innovation digest using LLM summarization. */
export async function generateDigest(
  period: "daily" | "weekly",
  model?: string,
  signal?: AbortSignal
): Promise<InnovationDigest> {
  initFromDisk();

  const now = new Date();
  const cutoffMs = period === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - cutoffMs).toISOString();

  const periodSignals = signals.filter((s) => s.detectedAt >= cutoff);
  const maxSignals = activeConfig?.maxSignalsPerDigest ?? 50;
  const digestSignals = periodSignals.slice(0, maxSignals);

  // Score top signals
  const scored: ScoredOpportunity[] = [];
  for (const sig of digestSignals.slice(0, 10)) {
    try {
      const s = await scoreSignal(sig, model, signal);
      scored.push(s);
    } catch {
      scored.push({ signal: sig, innovationScore: 5, rationale: "Scoring unavailable" });
    }
  }
  scored.sort((a, b) => b.innovationScore - a.innovationScore);

  // Compute stats
  const byType: Record<string, number> = {};
  const byUrgency: Record<string, number> = {};
  let totalConfidence = 0;
  for (const s of digestSignals) {
    byType[s.type] = (byType[s.type] ?? 0) + 1;
    byUrgency[s.urgency] = (byUrgency[s.urgency] ?? 0) + 1;
    totalConfidence += s.confidence;
  }

  const stats: DigestStats = {
    totalSignals: digestSignals.length,
    byType,
    byUrgency,
    avgConfidence: digestSignals.length > 0 ? totalConfidence / digestSignals.length : 0,
  };

  // Generate trend summary and recommended actions via LLM
  let trendSummary = "No signals detected in this period.";
  let recommendedActions: string[] = [];

  if (digestSignals.length > 0) {
    const signalsSummary = digestSignals
      .map((s) => `- [${s.type}] ${s.title} (${s.urgency})`)
      .join("\n");

    const prompt = `You are an innovation analyst generating a ${period} digest.

SIGNALS DETECTED:
${sanitizeLlmOutput(signalsSummary)}

TOP SCORED OPPORTUNITIES:
${sanitizeLlmOutput(scored.map((s) => `- ${s.signal.title}: ${s.innovationScore}/10 — ${s.rationale}`).join("\n"))}

STATS:
${sanitizeLlmOutput(JSON.stringify(stats, null, 2))}

Provide:
1. A trend summary (what patterns emerge across these signals)
2. Recommended actions (concrete next steps to capitalize on opportunities)

Respond with valid JSON only:
{
  "trendSummary": "Analysis of emerging trends...",
  "recommendedActions": ["Action 1", "Action 2"]
}`;

    try {
      const raw = await withRetry(
        async () => {
          const result = await generateText({ prompt, model, serverMode: true, signal });
          return extractJson(result);
        },
        { signal }
      );
      const parsed = JSON.parse(raw) as { trendSummary: string; recommendedActions: string[] };
      trendSummary = parsed.trendSummary ?? trendSummary;
      recommendedActions = parsed.recommendedActions ?? [];
    } catch {
      trendSummary = `${digestSignals.length} signals detected across ${Object.keys(byType).length} types.`;
    }
  }

  const digest: InnovationDigest = {
    id: randomUUID(),
    period,
    generatedAt: now.toISOString(),
    signals: digestSignals,
    topOpportunities: scored,
    trendSummary,
    recommendedActions,
    stats,
  };

  monitorState.digestCount++;
  saveState();

  return digest;
}

/** Convert an innovation digest to markdown. */
export function digestToMarkdown(digest: InnovationDigest): string {
  const lines: string[] = [];
  lines.push(`# Innovation Digest — ${digest.period}`);
  lines.push(`*Generated: ${digest.generatedAt}*\n`);

  lines.push(`## Summary`);
  lines.push(digest.trendSummary);
  lines.push("");

  lines.push(`## Stats`);
  lines.push(`- **Total signals:** ${digest.stats.totalSignals}`);
  lines.push(`- **Avg confidence:** ${(digest.stats.avgConfidence * 100).toFixed(1)}%`);
  lines.push(
    `- **By type:** ${Object.entries(digest.stats.byType)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}`
  );
  lines.push(
    `- **By urgency:** ${Object.entries(digest.stats.byUrgency)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}`
  );
  lines.push("");

  if (digest.topOpportunities.length > 0) {
    lines.push(`## Top Opportunities`);
    for (const opp of digest.topOpportunities) {
      lines.push(`### ${opp.signal.title} (${opp.innovationScore}/10)`);
      lines.push(
        `- **Type:** ${opp.signal.type} | **Urgency:** ${opp.signal.urgency} | **Confidence:** ${(opp.signal.confidence * 100).toFixed(0)}%`
      );
      lines.push(`- ${opp.rationale}`);
      lines.push("");
    }
  }

  if (digest.recommendedActions.length > 0) {
    lines.push(`## Recommended Actions`);
    for (const action of digest.recommendedActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  if (digest.signals.length > 0) {
    lines.push(`## All Signals`);
    for (const sig of digest.signals) {
      lines.push(
        `- **[${sig.type}]** ${sig.title} — ${sig.urgency} (${(sig.confidence * 100).toFixed(0)}%)`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Convert an innovation digest to basic HTML for email delivery. */
export function digestToHtml(digest: InnovationDigest): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines: string[] = [];

  lines.push(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Innovation Digest</title></head><body>`
  );
  lines.push(`<h1>Innovation Digest &mdash; ${esc(digest.period)}</h1>`);
  lines.push(`<p><em>Generated: ${esc(digest.generatedAt)}</em></p>`);

  lines.push(`<h2>Summary</h2><p>${esc(digest.trendSummary)}</p>`);

  lines.push(`<h2>Stats</h2><ul>`);
  lines.push(`<li><strong>Total signals:</strong> ${digest.stats.totalSignals}</li>`);
  lines.push(
    `<li><strong>Avg confidence:</strong> ${(digest.stats.avgConfidence * 100).toFixed(1)}%</li>`
  );
  lines.push(
    `<li><strong>By type:</strong> ${esc(
      Object.entries(digest.stats.byType)
        .map(([k, v]) => `${k}(${v})`)
        .join(", ")
    )}</li>`
  );
  lines.push(
    `<li><strong>By urgency:</strong> ${esc(
      Object.entries(digest.stats.byUrgency)
        .map(([k, v]) => `${k}(${v})`)
        .join(", ")
    )}</li>`
  );
  lines.push(`</ul>`);

  if (digest.topOpportunities.length > 0) {
    lines.push(`<h2>Top Opportunities</h2>`);
    for (const opp of digest.topOpportunities) {
      lines.push(`<h3>${esc(opp.signal.title)} (${opp.innovationScore}/10)</h3>`);
      lines.push(
        `<p><strong>Type:</strong> ${esc(opp.signal.type)} | <strong>Urgency:</strong> ${esc(opp.signal.urgency)} | <strong>Confidence:</strong> ${(opp.signal.confidence * 100).toFixed(0)}%</p>`
      );
      lines.push(`<p>${esc(opp.rationale)}</p>`);
    }
  }

  if (digest.recommendedActions.length > 0) {
    lines.push(`<h2>Recommended Actions</h2><ul>`);
    for (const action of digest.recommendedActions) {
      lines.push(`<li>${esc(action)}</li>`);
    }
    lines.push(`</ul>`);
  }

  if (digest.signals.length > 0) {
    lines.push(`<h2>All Signals</h2><ul>`);
    for (const sig of digest.signals) {
      lines.push(
        `<li><strong>[${esc(sig.type)}]</strong> ${esc(sig.title)} &mdash; ${esc(sig.urgency)} (${(sig.confidence * 100).toFixed(0)}%)</li>`
      );
    }
    lines.push(`</ul>`);
  }

  lines.push(`</body></html>`);
  return lines.join("\n");
}

// ---- Monitor Lifecycle ----

/** Start the monitoring loop with setInterval-based polling. */
export function startMonitor(config: MonitorConfig): MonitorState {
  if (monitorState.status === "running") {
    throw new ValidationError("Monitor is already running");
  }

  const validated = MonitorConfigSchema.parse(config);
  activeConfig = validated;

  initFromDisk();

  // Register sources
  for (const source of validated.sources) {
    sources.set(source.id, source);
  }

  // Start poll timers for each enabled source
  for (const source of validated.sources) {
    if (!source.enabled) continue;

    const timer = setInterval(() => {
      detectOpportunities(source.id).catch(() => {
        // Silently continue on poll failures
      });
    }, source.pollIntervalMs);

    // Prevent timers from keeping the process alive
    if (timer.unref) timer.unref();

    pollTimers.set(source.id, timer);
  }

  monitorState.status = "running";
  saveState();
  return { ...monitorState };
}

/** Stop the monitoring loop. */
export function stopMonitor(): MonitorState {
  pollTimers.forEach((timer) => {
    clearInterval(timer);
  });
  pollTimers.clear();

  monitorState.status = "idle";
  activeConfig = null;
  saveState();
  return { ...monitorState };
}

/** Get the current monitor state. */
export function getMonitorState(): MonitorState {
  return { ...monitorState };
}

/** Clear all monitor data (for testing). */
export function clearMonitorData(): void {
  stopMonitor();
  sources.clear();
  signals.length = 0;
  monitorState = { status: "idle", signalCount: 0, digestCount: 0 };
  saveState();
  saveSignals();
}
